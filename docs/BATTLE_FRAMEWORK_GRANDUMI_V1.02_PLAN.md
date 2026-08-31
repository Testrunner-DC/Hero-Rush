# Hero-Rush 对战框架重构方案

> 基线规则：《超英击战》综合规则书 1.02
> 架构基本型：GrandUMI 服务端权威对战框架
> 目标读者：项目经理、产品、服务端、前端、测试
> 状态：待实施的目标方案；完成切换后替代现有 engine.ts 主流程

## 1. 决策结论

现有框架不继续做大规模补丁，采用“旁路建设 V2、纵向切片验证、最终一次切换”的方式重构。

GrandUMI 作为结构母版，复用以下设计思想：

1. 单房间串行处理玩家命令。
2. 完整、权威、可恢复的服务端 GameState。
3. TurnEngine 与 BattleEngine 分离。
4. 所有玩家选择统一进入 Prompt/Decision 系统。
5. ActionValidator 只检查合法性，不修改状态。
6. EffectRuntime 统一处理触发、结算和状态检查。
7. 每个观看者获得独立脱敏快照。
8. 固定 seed、确定性实体 ID、有序动作日志和回放等价测试。

以下内容不从 GrandUMI 复制：

- 其卡牌游戏规则、阶段名称和卡牌效果。
- C# 代码及字符串形式的自由动作协议。
- 用 TaskCompletionSource 挂起在线调用栈的 Prompt 实现。
- 把大量单卡特例和临时字段持续堆入一个 GameState。
- 写盘失败后仅记录日志、但仍然继续推进排名对局的策略。
- 依赖“重放时重新走一遍异步调用链”才能恢复挂起选择的方式。

Hero-Rush 的 V2 必须以 1.02 规则为唯一语义来源，并把所有等待玩家的状态显式序列化。

## 2. 为什么现有框架不适合继续修补

当前实现已经具备服务器权威外壳，但规则内核仍是前端单机 reducer 演化而来，主要问题不是个别判断错误，而是模型不匹配：

| 当前结构 | 根本问题 | V2 处理 |
|---|---|---|
| 单一约 1800 行 engine.ts | 阶段、战斗、效果、选择交叉修改 | 拆成 Setup、Turn、Battle、Response、Effects |
| ADVANCE_PHASE 由客户端指定下一阶段 | 客户端能够提出不应拥有的流程控制权 | 仅允许提交游戏意图，阶段由服务端自动推进 |
| BattleState 由大量可空字段组合 | 可产生规则上不存在的状态组合 | 使用带判别字段的 FlowState 联合类型 |
| pendingSummon/pendingCounter/pendingTargetSelection 各自一套 | 选择协议重复且难以恢复 | 统一 PendingDecision + Continuation |
| 确认攻击后直接判定 | 缺少目标后触发、应对、重选和判定窗口 | 显式 BattleContext 和战斗子状态机 |
| 事件监听器返回整个 BattleState | 顺序、嵌套、置换和状态检查不可控 | 统一 EffectQueue、AtomicOp、StateBasedAction |
| 服务端 authorizeCommand 与 reducer 分别校验 | 规则容易分叉 | 核心层返回唯一 ValidationResult |
| 客户端直接接收近似 BattleState 的结构 | UI 与领域内部字段强耦合 | 独立 BattleViewV2，只下发可展示/可操作信息 |

因此，P0 不采用“再添加几个字段和 case”的方案。

## 3. 目标分层

```text
浏览器 Battle UI
  └─ @hero-rush/protocol/v2
       └─ CommandGateway
            └─ MatchRoomV2（单房间串行、幂等、版本检查）
                 └─ GameKernelV2
                      ├─ CommandValidator
                      ├─ SetupMachine
                      ├─ TurnMachine
                      ├─ BattleMachine
                      ├─ ResponseMachine
                      ├─ DecisionRuntime
                      ├─ EffectRuntime
                      ├─ StateBasedActions
                      └─ DeterministicRng
                 ├─ BattleViewProjector
                 └─ MatchJournal + SnapshotStore
```

职责边界：

- 浏览器：渲染视图、收集选择、发送意图，不预测隐藏信息和最终结算。
- Gateway：认证、限流、协议解析、补充 playerId，不写游戏规则。
- MatchRoomV2：串行化、commandId 幂等、expectedRevision、持久化、广播。
- GameKernelV2：唯一规则事实来源，输入状态和命令，输出新状态、领域事件或拒绝。
- Projector：按玩家/观战视角脱敏，不把完整领域状态直接暴露给 UI。
- Journal：记录已接受命令、规则版本、卡池版本、随机种子和状态哈希。

## 4. 目标目录

建议在现有包内旁路建立 V2，不直接覆盖旧引擎：

```text
packages/game-core/src/v2/
├── model/
│   ├── gameState.ts
│   ├── flowState.ts
│   ├── playerState.ts
│   ├── cardInstance.ts
│   └── contexts.ts
├── commands/
│   ├── command.ts
│   ├── validateCommand.ts
│   └── executeCommand.ts
├── flow/
│   ├── setupMachine.ts
│   ├── turnMachine.ts
│   ├── actionMachine.ts
│   ├── battleMachine.ts
│   ├── responseMachine.ts
│   └── endMachine.ts
├── decisions/
│   ├── pendingDecision.ts
│   ├── validateAnswer.ts
│   └── resumeDecision.ts
├── effects/
│   ├── effectQueue.ts
│   ├── triggerCollector.ts
│   ├── replacementEffects.ts
│   ├── continuousEffects.ts
│   ├── stateBasedActions.ts
│   ├── atomicOps.ts
│   └── registry.ts
├── rules/
│   ├── zones.ts
│   ├── distance.ts
│   ├── summon.ts
│   ├── battle.ts
│   ├── deck.ts
│   └── victory.ts
├── projection/
│   └── battleView.ts
├── replay/
│   ├── journal.ts
│   ├── stateHash.ts
│   └── rebuild.ts
└── index.ts

packages/protocol/src/v2/
server/src/game-v2/
src/battle-v2/
```

旧引擎在 V2 验收完成前只做阻断性修复，不继续扩充卡牌效果。

## 5. 权威状态模型

### 5.1 顶层状态

```ts
interface GameStateV2 {
  match: MatchMetadata;
  revision: number;
  status: "setup" | "playing" | "finished";
  players: readonly [PlayerStateV2, PlayerStateV2];
  cards: Record<CardInstanceId, CardInstanceState>;
  flow: FlowState;
  battle: BattleContext | null;
  responseWindow: ResponseWindow | null;
  decision: PendingDecision | null;
  effects: EffectRuntimeState;
  modifiers: ModifierState[];
  usage: UsageCounters;
  rng: DeterministicRandomState;
  result: GameResult | null;
}
```

关键约束：

- 同一时刻最多只有一个需要外部输入的 PendingDecision。
- 所有卡牌实体只存在于一个权威区域；结附通过关系表表达，不复制卡。
- flow、battle、responseWindow、decision 的组合由 invariant 测试约束。
- 日志不是状态事实；状态变化输出结构化 DomainEvent。
- 不在状态中保存函数、闭包、监听器实例或 Promise。

### 5.2 FlowState

使用判别联合类型，而不是多个布尔值和可空字段：

```ts
type FlowState =
  | { kind: "SETUP_MULLIGAN"; actor: PlayerIndex }
  | { kind: "TURN_START" }
  | { kind: "DRAW" }
  | { kind: "ACTION" }
  | { kind: "BATTLE_ADJUST" }
  | { kind: "BATTLE_SELECT_ATTACKER"; zoneCursor: ZoneCursor }
  | { kind: "BATTLE_TARGET" }
  | { kind: "BATTLE_RESPONSE" }
  | { kind: "BATTLE_JUDGMENT" }
  | { kind: "BATTLE_CLEANUP" }
  | { kind: "TURN_RESPONSE" }
  | { kind: "END_TRIGGER" }
  | { kind: "END_EXPIRE" }
  | { kind: "END_DISCARD" }
  | { kind: "TURN_SWITCH" };
```

自动阶段由内核连续推进，直到：

- 到达允许当前玩家提交行动的稳定状态；
- 需要玩家选择；
- 需要双方交替应对；
- 对局结束。

客户端不再发送 DRAW_CARDS、ADVANCE_PHASE、SET_ATTACK_ZONE 或 START_ATTACK_SUBPHASE。

## 6. 1.02 流程映射

### 6.1 开局

```text
创建对局
→ 实例化与确定性洗牌
→ 决定先攻
→ 双方抽 6
→ 先攻提交调度
→ 后攻提交调度
→ TURN_START
```

要求：

- 先攻身份是显式字段，不从座位推断。
- 调度卡回到牌库底、补等量、再洗混。
- 两个调度决策都能在断线后恢复。
- 首回合号召上限依据先攻身份判断。

### 6.2 行动阶段

允许意图：

- DEPLOY_BASE
- SUMMON_CHARACTER
- MOVE_BATTLE_BASE
- ACTIVATE_EFFECT
- END_ACTION_PHASE

高 Lv 号召通过统一决策系统选择撤退支付；支付 Lv 必须恰好相等。战基移动每卡每回合一次，并检查本回合入场限制及 1.02 翻开盖卡例外。

### 6.3 战斗阶段

```text
一次性提交战区调整布局
→ 按先锋/侧翼/后卫定位下一攻击机会
→ 选择攻击者或放弃该机会
→ 生成合法目标
→ 目标步骤触发与结算
→ 战斗应对步骤
→ 必要时返回目标步骤重选
→ 判定
→ 状态检查
→ 下一攻击机会
```

BattleContext 至少保存：

- 攻击者、原目标和当前目标。
- 攻击机会编号及所属战区。
- 合法目标快照的生成依据。
- 当前优先玩家。
- 双方连续不行动次数。
- 本次应对步骤双方各自的应对号召使用状态。
- 待处理效果与返回点。

距离使用固定战区图计算。R0 不能攻击。目标失效后必须按 1.02 判断“重选目标”或“结束本次战斗”，不能直接判定。

### 6.4 回合应对与结束

战斗阶段结束后进入独立 TURN_RESPONSE，不能复用某次战斗的响应计数。

结束阶段分为三个可观测步骤：

1. END_TRIGGER：处理回合结束触发，并执行 1.02 错过时点规则。
2. END_EXPIRE：结束本回合期限效果，新产生的本回合效果结算后立即结束。
3. END_DISCARD：手牌超过 9 时由玩家选择舍弃，卡牌进入撤退区。

## 7. 命令协议 V2

建议命令：

```ts
type GameCommandV2 =
  | { type: "SUBMIT_MULLIGAN"; cardIds: CardInstanceId[] }
  | { type: "DEPLOY_BASE"; cardId: CardInstanceId }
  | { type: "SUMMON_CHARACTER"; cardId: CardInstanceId; destination: FieldLocation }
  | { type: "MOVE_BATTLE_BASE"; cardId: CardInstanceId; destination: FieldLocation | "base" }
  | { type: "SUBMIT_BATTLE_LAYOUT"; placements: Placement[] }
  | { type: "DECLARE_ATTACK"; attackerId: CardInstanceId; target: AttackTargetRef }
  | { type: "PASS_ATTACK_OPPORTUNITY"; attackerId: CardInstanceId }
  | { type: "ACTIVATE_EFFECT"; sourceId: CardInstanceId; effectId: string }
  | { type: "PASS_PRIORITY" }
  | { type: "ANSWER_DECISION"; decisionId: string; choices: string[] }
  | { type: "END_ACTION_PHASE" }
  | { type: "SURRENDER" };
```

每个命令返回：

```ts
type CommandResult =
  | {
      ok: true;
      revision: number;
      events: DomainEvent[];
      stateHash: string;
    }
  | {
      ok: false;
      code: RuleErrorCode;
      message: string;
      currentRevision: number;
    };
```

规则错误使用稳定 code，例如 WRONG_ACTOR、WRONG_FLOW、INVALID_SOURCE、INVALID_TARGET、INVALID_COUNT、COST_MISMATCH、STALE_DECISION。中文 message 只用于展示，测试与客户端逻辑不依赖 message。

## 8. 统一决策系统

GrandUMI 的 Prompt 结构值得保留，但 Hero-Rush 不等待在线 async 调用栈。

```ts
interface PendingDecision {
  id: string;
  actor: PlayerIndex;
  kind:
    | "MULLIGAN"
    | "SUMMON_PAYMENT"
    | "CHOOSE_TARGET"
    | "ORDER_TRIGGERS"
    | "OPTIONAL_EFFECT"
    | "BATTLE_RESPONSE"
    | "DISCARD_TO_LIMIT";
  prompt: string;
  choices: DecisionChoice[];
  min: number;
  max: number;
  continuation: ContinuationDescriptor;
}
```

ContinuationDescriptor 是可序列化的判别联合类型，例如：

- RESUME_SUMMON_PAYMENT
- RESUME_EFFECT_STEP
- RESUME_TRIGGER_ORDER
- RESUME_BATTLE_TARGET
- RESUME_END_DISCARD

ANSWER_DECISION 必须验证：

- decisionId 与当前状态一致；
- actor 是当前决策者；
- choices 属于候选集合；
- 数量满足 min/max；
- 没有重复选择；
- 选择仍然合法。

这样可以在任意 Prompt、应对窗口和效果中断点安全重连，也可以直接从快照恢复，不依赖内存中的 Promise。

## 9. 效果系统

采用 GrandUMI 的 EffectRuntime 分层思想，但使用纯状态队列：

```text
命令产生领域事件
→ 收集触发候选
→ 回合玩家排序
→ 非回合玩家排序
→ 单个效果入队
→ AtomicOps 执行
→ StateBasedActions
→ 收集新触发
→ 直到稳定态或产生 PendingDecision
```

组成：

- TriggerCollector：发现触发，不直接执行。
- EffectQueue：保存来源、控制者、时点、是否选发和执行位置。
- ReplacementEffects：在移动/撤退/数值变化前介入。
- ContinuousEffects：按原本值、替换、增减、期限重算。
- AtomicOps：抽牌、移动、盖伏、翻开、撤退、结附、数值修改等唯一写状态入口。
- StateBasedActions：每个原子操作后检查战力 0、胜负、容量、结附宿主和牌库 0。
- EffectRegistry：简单效果数据化，复杂效果脚本化；两者必须走相同运行时。

禁止单卡脚本直接 splice 手牌、field 或 retreat。所有区域变化必须通过 AtomicOps，以保证触发、替换、日志和回放一致。

## 10. 私有视图与前端

BattleViewV2 与 GameStateV2 分离。客户端只接收：

- 当前阶段和当前可执行意图。
- 自己的手牌及盖卡信息。
- 对手隐藏区数量和稳定占位符。
- 公共区域卡牌及当前派生数值。
- 仅属于自己的 PendingDecision。
- 当前 BattleView、ResponseView 和结构化事件日志。
- revision、acceptedCommandId 和 connection 状态。

前端调整：

- useOnlineBattle 不再把服务端视图强转为 BattleState。
- BattlePage 只根据 availableActions 和 pendingDecision 展示按钮。
- 所有弹窗由统一 DecisionDialog 驱动。
- 战斗步骤条直接使用 flow.kind，不在前端推算下一阶段。
- UI 可以做乐观高亮，但不能乐观移动隐藏信息或结算战力。
- 调试模式提供“状态/命令/规则编号”侧栏，生产环境关闭。

## 11. 持久化、重连与回放

延续当前 commandId + expectedSeq 基础，升级为：

- commandId：幂等键。
- expectedRevision：并发版本。
- accepted command journal：仅记录实际接受的命令，包括 ANSWER_DECISION。
- snapshot：每 N 条命令及关键阶段保存。
- metadata：rulesetVersion=1.02、cardDataVersion、engineVersion、seed。
- stateHash：每条命令完成且到达稳定态后生成。

恢复顺序：

1. 读取最近快照。
2. 校验版本。
3. 重放快照后的命令。
4. 比对最终 stateHash。
5. 按席位重新生成 BattleViewV2。

学习 GrandUMI 的“同 seed + 同动作磁带 = 同状态”测试，但 Hero-Rush 的挂起决策直接存在状态中，因此不需要重建在线 async 续延。

排名对局的 journal 或 snapshot 写入失败时，本命令不得向客户端确认为成功；休闲模式是否允许降级必须由配置显式决定。

## 12. 保留、替换、删除

### 保留

- MatchRoom 的单房间串行队列。
- commandId 幂等、expectedSeq/Revision。
- 确定性 RNG 和卡牌实例 ID。
- MatchStore 抽象及按席位投影视图。
- WebSocket 身份绑定、重连 token 和断线宽限期。
- 现有卡牌数据库作为定义输入。

### 替换

- BattleState → GameStateV2。
- GameAction → GameCommandV2 + 内部 DomainEvent。
- createGameReducer → GameKernelV2.execute。
- authorizeCommand + reducer 双重规则 → 单一 CommandValidator。
- conflictSubPhase/pendingAttack/pendingCounter → FlowState + BattleContext + ResponseWindow。
- 多套 pending 结构 → PendingDecision。
- eventListeners + 直接状态回写 → EffectRuntime + AtomicOps。

### 删除

V2 切换后删除：

- 客户端 ADVANCE_PHASE、DRAW_CARDS 等流程控制命令。
- SET_ATTACK_ZONE、START_ATTACK_SUBPHASE 等 UI 泄漏命令。
- handIndex 作为网络卡牌定位方式。
- 用 state.log 充当领域事件。
- 旧 reducer 对联机对局的执行入口。

旧引擎可在一个版本周期内仅作为本地演示回退，之后删除，避免双规则源长期存在。

## 13. 迁移里程碑

### 实施快照（2026-08-28）

- M0 核心契约已落地：`GameStateV2`、显式 `FlowStateV2`、可序列化 `PendingDecisionV2`、稳定错误码、协议 V2、状态约束和确定性摘要。
- M1 规则核心已落地：确定性洗牌与先攻、双方 6 张起手、先攻后攻依次调度、私有视图投影、命令日志重放与等价校验。
- M1 房间骨架已落地：独立 `MatchRoomV2`、串行命令队列、幂等命令、按座位重连投影及“journal 成功后提交状态”；持久化失败不会静默推进 revision。
- M1 浏览器骨架已落地：V2 消息状态归并、一次性调度命令构造、按参考图拆分的 `PlayerBoardV2` 和调度面板，当前尚未挂载旧 `/battle` 路由。
- M1 灰度链路已落地：独立 `MatchCoordinatorV2`、`HELLO_V2`/匹配/恢复 WebSocket 入口、Supabase V2 journal，以及受双端环境变量保护的 `/battle-v2` 页面。
- **M1 已于 2026-08-28 通过 PM 本地双端验收**：页面可进入、双方匹配、隐藏信息、先后攻依次调度、断线提示、重连恢复及进入 `TURN_START` 均确认通过。
- M2 行动阶段已闭环：回合开始抽牌、基地部署、行动号召、先攻首回合限制、Lv4+ 精确撤退支付、战基移动、1.02 翻盖例外、固定数量选择及非法命令状态摘要不变。
- M3 战斗主流程已闭环：原子战区布局、六节点距离、R0、破绽、攻击机会、目标、非回合玩家优先的应对窗口，以及目标撤退/移出射程、攻击者撤退/R0 后的重选或取消分支均进入权威状态机。
- M4 效果运行时框架已闭环：TriggerCollector、EffectQueue、AtomicOps、StateBasedActions、多阶段目标选择、选发、同时时点排序、双方顺序、嵌套触发、数值替换/增减/期限、来源在场持续期以及结附宿主离场已纳入可序列化状态与重放路径。
- M5 卡池准入机制已落地：卡号级白名单、规则引用/效果 ID/测试证据结构、服务端构筑复核、覆盖报告及生产强制开关。当前生产效果卡覆盖为 **0/290**，因此 V2 生产发布仍为 No-Go；这不阻塞框架验收，但阻塞线上卡池开放。
- M6 工程门禁已落地：`gate:v2` 覆盖类型、全量测试、规则编号覆盖、切换/回滚策略、生产构建、存储预算和卡池报告；`gate:v2:release` 额外要求完整生产卡池。灰度阈值与无数据回滚流程见 `docs/V2_ROLLOUT_RUNBOOK.md`。线上路由切换、旧路径删除和部署不在本轮自动授权范围。
- 2026-08-28 自动化证据：game-core 111/111、项目全量 180/180、必需规则编号 13/13（17 条证据）、切换门禁 8/8、生产构建成功；卡图 412/412，无孤儿、缺失或重复；生成物验收后按存储策略清理。
- M0-M6 逐项退出条件、稳定点恢复范围与生产边界的最终证据见 `docs/V2_FRAMEWORK_COMPLETION_AUDIT.md`。
- `/battle-v2` 仍由前后端双功能开关保护，尚未接管旧 `MatchRoom` 或线上默认 `/battle`；现网行为不变。
- 当前状态：**2.0.0-framework-rc1 已达到统一人工验收入口；框架完成不等于生产卡池可发布。**
- 单方战场的官方布局参考已映射为 V2 页面约束，见 `docs/ui/battle-view-v2.md`；它只约束视觉结构，规则仍以 1.02 基线为准。

### M0：冻结与契约

交付：

- 冻结旧引擎新增效果。
- 建立 V2 目录、规则编号映射和 invariant 测试框架。
- 定义 GameStateV2、FlowState、CommandResult 和协议 V2。
- 选定一组 1.02 黄金对局脚本。

退出条件：

- 类型构建通过。
- 旧线上不受影响。
- 每个 V2 状态都有允许命令表。

### M1：开局纵向切片

交付：

- 确定性初始化、先攻、6 张起手、依次调度。
- MatchRoomV2、私有视图、journal、重连。
- SUBMIT_MULLIGAN 完整前后端链路。

退出条件：

- 两个座位分别先攻。
- 调度 0 至 6 张。
- 调度中断线恢复。
- 同 seed 同命令 stateHash 一致。

### M2：行动阶段

交付：

- 基地部署、抽 1、号召、精确 Lv 支付、战基移动、结束行动。
- PendingDecision 统一选择。
- 服务器构筑复核按角色名称合计。

退出条件：

- 正反向命令矩阵通过。
- 非法命令不改变 stateHash。
- 号召和移动均覆盖 1.02 边界。

### M3：战斗主流程

交付：

- 原子布局调整。
- 战区顺序、攻击机会、距离、R0、破绽。
- 目标、战斗应对、重选、判定、战斗清理。
- 独立回合应对阶段。

退出条件：

- 六节点距离矩阵通过。
- 所有目标失效分支通过。
- 每个战斗稳定点可断线恢复。
- 非回合玩家优先及连续放弃通过。

### M4：效果运行时

交付：

- TriggerCollector、EffectQueue、AtomicOps、StateBasedActions。
- 选发、同时时点排序、嵌套触发、置换和持续效果。
- 结束阶段三步骤和弃至 9 张。

退出条件：

- 301.41、304.1、304.2 的黄金测试通过。
- 战力归零、同时撤退、结附宿主离场通过。
- 带多阶段选择的回放等价。

### M5：卡池准入

交付：

- 迁移已实现卡牌。
- 建立可用卡白名单和覆盖率报告。
- 未实现效果卡不能进入线上构筑。

退出条件：

- 每张可用卡都有规则编号、实现和自动化测试。
- CI 输出总数、已实现数、缺失列表。
- 不存在“有文本但静默无效果”的线上卡。

### M6：切换与清理

交付：

- 私人房间灰度到 V2。
- 休闲模式灰度。
- 排名模式切换。
- 删除联机旧执行路径和无用协议。

退出条件：

- 双客户端端到端、重连、回放、部署冒烟全部通过。
- 线上错误率和命令拒绝率在门限内。
- 回滚只切换路由/版本，不回滚已产生的 V2 数据。

## 14. 人力与排期基准

以 1 名服务端、1 名前端、1 名兼职测试为基准：

| 里程碑 | 预估 |
|---|---:|
| M0 | 3 至 5 个工作日 |
| M1 | 5 至 7 个工作日 |
| M2 | 5 至 8 个工作日 |
| M3 | 8 至 12 个工作日 |
| M4 | 10 至 15 个工作日 |
| M5 | 按卡池批次持续进行 |
| M6 | 3 至 5 个工作日 |

规则正确的框架闭环约 5 至 7 周，不包含全部卡牌效果补齐。单人连续开发建议按 8 至 12 周管理。不得用压缩测试或跳过 M1/M3 的断线恢复来换进度。

## 15. 发布门禁

V2 上线必须同时满足：

- 1.02 开局、行动、战斗、回合应对、结束流程端到端通过。
- 客户端无法指定下一阶段或伪造玩家身份。
- 每个外部等待点均有可序列化 PendingDecision/ResponseWindow。
- 任意稳定点重连后视图和可操作集合一致。
- 同 seed、同版本、同命令日志得到相同 stateHash。
- 所有非法命令返回稳定错误码且不改变状态。
- 玩家视图不泄露对手手牌、牌库顺序、盖卡和随机状态。
- 可用卡池不存在未实现效果。
- 私人房、休闲、排名按顺序灰度，不直接全量切换。
- 规则覆盖报告按规则编号统计，而不是只报告测试数量。

## 16. 首个实施批次

批准方案后，第一批只做 M0 + M1：

1. 新建 V2 模块和协议，不改旧线上入口。
2. 完成权威开局与调度。
3. 完成 BattleViewV2、journal 和 stateHash。
4. 完成调度中的断线恢复及回放等价测试。
5. 在私人测试房增加 engineVersion=v2 开关。

第一批完成后再评审 M2。若 M1 无法做到中途重连和确定性回放，则停止继续堆叠行动与战斗规则。
