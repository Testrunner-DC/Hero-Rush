# 超英击战 Marvel TCG — 对战引擎编辑手册

> **目标读者：** 项目经理、高级玩家、需要对战规则调优的决策者（需基本代码阅读能力）  
> **版本：** v1.0  
> **编写日期：** 2026-07-02  
> **配套文档：** [对战模块开发指南](./BATTLE_DEV_GUIDE.md) · [项目编辑指南](./EDITOR_GUIDE.md) · [项目经理手册](./PM_HANDBOOK.md)

---

## 目录

1. [引擎架构速览](#1-引擎架构速览)
2. [对战参数速查表](#2-对战参数速查表)
3. [参数调优指南](#3-参数调优指南)
4. [卡效系统编辑指南](#4-卡效系统编辑指南)
5. [游戏阶段配置](#5-游戏阶段配置)
6. [测试与调试](#6-测试与调试)
7. [常见调优场景](#7-常见调优场景)
8. [附录：文件速查表](#8-附录文件速查表)

---

## 1. 引擎架构速览

### 1.1 核心数据流

```
用户操作 → dispatch(GameAction) → gameReducer（纯函数）→ checkpoint（后处理）→ 新 BattleState → 渲染
```

对战引擎是一个 **纯函数状态机**。相同输入永远产生相同输出。所有状态变更通过不可变更新（返回新对象）实现。

### 1.2 文件职责一览

```
src/game/
├── engine.ts         ← [可编辑] ★ 引擎核心：所有 Action Handler + checkpoint
├── types.ts          ← [只读] GameAction 联合类型、EventContext
├── cardUtils.ts      ← [只读] 卡牌辅助：战力计算、关键词检查
├── events.ts         ← [只读] 事件系统：trigger/register/unregister
├── abilities.ts      ← [只读] 关键词能力系统
│
├── effects/          ← [可编辑] ★ 效果系统（新增卡效主要改这里）
│   ├── types.ts      ← [只读] CardEffect, EffectContext, Modifier
│   ├── registry.ts   ← [只读] 全局效果注册表
│   ├── index.ts      ← [可编辑] registerAllEffects() 入口
│   ├── helpers.ts    ← [只读] 原子操作（抽卡/撤退/裁剪/结附/修改器）
│   ├── conditions.ts ← [只读] 条件谓词（特征判定/计数/Lv筛选）
│   ├── sd01.ts       ← [可编辑] SD01 卡包卡效（19张卡）
│   └── sd02.ts       ← [可编辑] SD02 卡包卡效（19张卡）
│
└── __tests__/
    └── engine.test.ts ← [可编辑] 引擎测试（31个用例）
```

> **标记说明：** [可编辑] = 常规调优/新功能涉及的文件 | [只读] = 修改需谨慎，涉及引擎架构

### 1.3 三层架构详解

| 层 | 位置 | 职责 | 修改场景 |
|----|------|------|---------|
| **Reducer** | `engine.ts` `gameReducer` | 纯函数 `(state, action) => newState` | 新增/修改对战规则 |
| **Handler** | `engine.ts` 各 `handleXxx` 函数 | 单个 GameAction 的具体处理逻辑 | 修改某操作的行为 |
| **Checkpoint** | `engine.ts` `checkpoint()` | 后处理：胜负判定 + 事件触发 + 状态清理 | 修改判定逻辑 |

---

## 2. 对战参数速查表

### 2.1 卡组与手牌

| 参数 | 文件:行 | 当前值 | 说明 | 修改影响 |
|------|---------|:--:|------|---------|
| 主卡组大小 | `GameSetup.tsx` + 规则 | 50 张 | 角色卡数量上限/下限 | 需同步修改 GameSetup 校验 + 规则书 |
| 冲击卡组大小 | `GameSetup.tsx` + 规则 | 9 张 | 冲击卡数量上限/下限 | 需同步修改 GameSetup 校验 |
| 起始手牌数 | `GameSetup.tsx:731` | 6 张 | 开局抽牌数 | 影响先手优势 |
| 每回合抽牌数 | `engine.ts:238` | 2 张 | `Math.min(2, deck.length)` | 影响游戏节奏 |
| 手牌上限 | `engine.ts:328` | 9 张 | `hand.length > 9` 时弃至 9 | 影响资源管理策略 |
| 卡组为空判负 | `engine.ts:240-250` | draw=0 → 判负 | 抽卡阶段卡组为空则输 | 也受"因效果抽牌"影响（checkpoint） |

### 2.2 行动阶段

| 参数 | 文件:行 | 当前值 | 说明 | 修改影响 |
|------|---------|:--:|------|---------|
| 每回合号召次数 | `engine.ts:357` | 3 次 | `remainingSummons` 初始值 | 影响每回合打牌节奏 |
| 先攻首回号召次数 | `engine.ts:357` | 1 次 | `isFirstTurn ? 1 : 3` | 影响先手优势 |
| 每回合基地部署次数 | `engine.ts:401` | 1 次 | `baseDeployedThisTurn` | 影响基地战术 |
| 基地容量上限 | `engine.ts:408,492,882` | 6 张 | `baseCards + baseCovered >= 6` | 影响基地策略空间 |
| 回合内战基移动次数 | 无硬上限 | 每角色 1 次 | 逐卡追踪 `baseMovesUsed` | 影响机动性 |

### 2.3 冲突阶段

| 参数 | 文件:行 | 当前值 | 说明 | 修改影响 |
|------|---------|:--:|------|---------|
| 冲突阶段位置调整次数 | `engine.ts:781,856` | 4 次 | `conflictMovesUsed >= 4` | 影响战术部署 |
| 先攻首回跳过冲突 | `engine.ts:357` 逻辑 | ✅ 是 | 先攻首回不进入冲突 | 快速游戏规则 |
| 攻击区域顺序 | 规则约束 | 先锋→侧翼→后卫 | `Zone` 类型的硬约束 | 不可轻易修改 |

### 2.4 胜负条件

| 参数 | 文件:行 | 当前值 | 说明 | 修改影响 |
|------|---------|:--:|------|---------|
| 时间线失败阈值 | `engine.ts:53` | 9 张 | `timeline.length >= 9` → 对方胜 | 影响游戏时长 |
| 卡组抽空判负 | `engine.ts:240` | draw=0 | 抽卡阶段卡组空 → 判负 | 疲劳机制 |
| 冲击卡组耗尽判负 | checkpoint | 冲击卡组=0 | 规则 103.1.b | 影响冲击战术 |

---

## 3. 参数调优指南

### 3.1 如何修改回合号召次数

**场景：** 想把每回合号召从 3 次改为 4 次。

**修改位置：** `src/game/engine.ts` 第 357 行

```typescript
// 修改前
remainingSummons: isFirstTurn ? 1 : 3,

// 修改后
remainingSummons: isFirstTurn ? 1 : 4,
```

**影响评估：**
- ✅ 只改一行，风险极低
- ⚠️ 会让游戏节奏加快，需配合测试卡组体验
- ⚠️ 需要同步更新规则书和帮助页

### 3.2 如何修改每回合抽牌数

**场景：** 想把抽牌阶段从 2 张改为 3 张。

**修改位置：** `src/game/engine.ts` 第 238 行

```typescript
// 修改前
const drawCount = Math.min(2, deck.length);

// 修改后
const drawCount = Math.min(3, deck.length);
```

**影响评估：**
- ✅ 只改一行
- ⚠️ 大幅影响游戏节奏（手牌资源增加 50%）
- ⚠️ 建议先在测试中验证平衡性

### 3.3 如何修改手牌上限

**场景：** 想把结束阶段手牌上限从 9 改为 8。

**修改位置：** `src/game/engine.ts` 第 328 行

```typescript
// 修改前
if (hand.length > 9) {

// 修改后
if (hand.length > 8) {
```

同时修改第 330 行：

```typescript
// 修改前
hand = hand.slice(0, 9);

// 修改后
hand = hand.slice(0, 8);
```

### 3.4 如何修改基地容量

**场景：** 想把基地容量从 6 改为 5。

**修改位置：** 3 处（`src/game/engine.ts`）

| 行号 | 函数 | 代码 |
|------|------|------|
| 408 | `handleDeployToBase` | `(p.baseCards.length + p.baseCovered.length) >= 6` |
| 492 | `handleSummonToField` | `(p.baseCards.length + p.baseCovered.length) >= 6` |
| 882 | `handleMoveCard` | `(p.baseCards.length + p.baseCovered.length) >= 6` |

全部改为 `>= 5`。

### 3.5 如何修改冲突阶段调整次数

**场景：** 想把冲突调整从 4 次改为 5 次。

**修改位置：** 2 处（`src/game/engine.ts`）

| 行号 | 函数 | 代码 |
|------|------|------|
| 781 | `handleMoveCharacter` | `state.conflictMovesUsed >= 4` |
| 856 | `handleMoveCard` | `state.conflictMovesUsed >= 4` |

全部改为 `>= 5`。

### 3.6 如何修改时间线失败阈值

**场景：** 想把胜负条件从 9 张冲击卡改为 10 张。

**修改位置：** `src/game/engine.ts` 第 53 行

```typescript
// 修改前
if (p.timeline.length >= 9) {

// 修改后
if (p.timeline.length >= 10) {
```

**影响评估：**
- ✅ 只改一行
- ⚠️ 游戏时长会显著增加
- ⚠️ 冲击战术的威慑力降低

### 3.7 参数调优的影响矩阵

调优前参考此表评估连锁影响：

| 改动 | 游戏节奏 | 平衡性 | UI 需改 | 规则书需改 | 测试需求 |
|------|:--:|:--:|:--:|:--:|:--:|
| 抽牌数 ±1 | ███ | ███ | ❌ | ✅ | 中 |
| 号召次数 ±1 | ██ | ██ | ❌ | ✅ | 中 |
| 手牌上限 ±1 | ██ | █ | ❌ | ✅ | 低 |
| 基地容量 ±1 | █ | ██ | ❌ | ✅ | 低 |
| 冲突调整 ±1 | █ | █ | ❌ | ✅ | 低 |
| 时间线阈值 ±1 | ███ | ██ | ❌ | ✅ | 低 |
| 起始手牌 ±1 | ███ | ███ | ❌ | ✅ | 高 |
| 卡组大小变更 | ███ | ███ | ✅ | ✅ | 高 |

---

## 4. 卡效系统编辑指南

### 4.1 效果分类与选择

| 分类 | 代码名 | 何时使用 | 必填字段 |
|------|--------|---------|---------|
| 触发型 | `trigger` | "当某事发生时自动触发" | `trigger`, `execute` |
| 起动型 | `active` | "玩家主动选择使用" | `activeSource`, `execute` |
| 常驻型 | `static` | "只要卡在场上就一直生效" | `staticModifier` 或 `execute` |
| 应对型 | `counter` | "对手行动时可以干预" | `execute` |

### 4.2 新增卡效完整流程

假设要新增 SD03 卡包的卡效。

#### Step 1：创建效果文件

新建 `src/game/effects/sd03.ts`：

```typescript
import type { CardEffect, EffectContext } from "./types";
import { registerEffects } from "./registry";
import * as H from "./helpers";
import * as C from "./conditions";

// ==================== SD03-001 示例卡 ====================
const sd03_001: CardEffect = {
  id: "SD03-001-0",
  cardNo: "SD03-001",
  category: "trigger",         // 触发型
  trigger: "onSummon",         // 号召进场时
  once: true,                  // 回合1次
  label: "进场抽牌",

  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    // 从卡组抽2张牌
    state = H.drawCards(state, ctx.playerIdx, 2, ctx.db);
    return state;
  },
};

// 底部注册
registerEffects([sd03_001]);
```

#### Step 2：注册到入口

修改 `src/game/effects/index.ts`：

```typescript
// 在 import 区域添加
import "./sd03";

// registerAllEffects() 中会自动执行 sd03.ts 的 registerEffects()
```

#### Step 3：验证

```bash
npm run build    # 确保编译通过
npm test         # 运行所有已有测试
npm run dev      # 浏览器验证
```

### 4.3 效果对象字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|:--:|------|
| `id` | `string` | ✅ | 唯一标识，格式 `{cardNo}-{序号}` |
| `cardNo` | `string` | ✅ | 关联卡牌编号 |
| `category` | `"trigger"\|"static"\|"active"\|"counter"` | ✅ | 效果类型 |
| `trigger` | `TriggerTiming` | 触发型必填 | 触发时机（见 4.4） |
| `triggerCondition` | `(ctx) => boolean` | ❌ | 触发条件（返回 true 才执行） |
| `activeSource` | `"hand"\|"base"\|"field"` | 起动型必填 | 起动效果来源区域 |
| `cost` | `(ctx) => boolean` | ❌ | 费用检查（返回 false 不能发动） |
| `condition` | `(ctx) => boolean` | ❌ | 执行条件（返回 false 效果不结算） |
| `execute` | `(ctx) => BattleState` | 除纯 static 外必填 | 效果执行函数 |
| `staticModifier` | `(ctx) => Modifier[]` | 常驻型可能需要 | 常驻修改器 |
| `targetSpec` | `TargetSpec` | ❌ | 目标选择规格 |
| `once` | `boolean` | ❌ | 是否"回合1次" |
| `label` | `string` | ❌ | UI 显示名称 |
| `isCounterActive` | `boolean` | ❌ | 是否为应对·起动效果 |
| `isUnique` | `boolean` | ❌ | 是否拥有【唯一】关键词 |
| `keywords` | `string[]` | ❌ | 常驻关键词（combo/assault/airRaid/intercept） |
| `faceDownAfterActive` | `boolean` | ❌ | 起动后是否盖伏 |

### 4.4 可用触发时机

| 时机 | 代码 | 何时触发 |
|------|------|---------|
| 号召进场 | `onSummon` | 卡牌因号召放置进场时 |
| 撤退时 | `onRetreat` | 卡牌进入撤退区时 |
| 攻击时 | `onAttack` | 卡牌在冲突阶段发起攻击时 |
| 被结附时 | `onAttached` | 卡牌被其他卡牌结附时 |
| 战力/R变化 | `onStatChange` | 我方角色战力或 R 值增加时 |
| 友方战败 | `onAllyDefeated` | 我方角色被击败撤退时 |
| 回合开始 | `onTurnStart` | 每个回合开始时 |
| 回合结束 | `onTurnEnd` | 每个回合结束时 |

### 4.5 常用原子操作速查

所有操作返回新的 `BattleState`，遵循不可变更新。

#### 卡牌移动

| 函数 | 效果 |
|------|------|
| `H.drawCards(state, playerIdx, count, db)` | 从卡组抽 N 张牌 |
| `H.retreatCard(state, cardId, playerIdx, db)` | 将角色移至撤退区 |
| `H.trimCard(state, cardId, playerIdx, db)` | 裁剪角色（移至虚空区） |
| `H.moveCardToVoid(state, cardId, playerIdx)` | 移至虚空区 |
| `H.attachCard(state, cardId, hostId, playerIdx, db)` | 结附到宿主 |
| `H.detachCard(state, cardId, hostId)` | 解除结附 |
| `H.moveToBase(state, cardId, playerIdx, db)` | 移到基地 |
| `H.moveRushCard(state, targetPlayerIdx)` | 对方冲击卡入时间线 |

#### 修改器

| 函数 | 效果 |
|------|------|
| `H.createModifier(state, targetId, type, value, duration, sourceId, db)` | 创建修改器 |
| `H.removeModifier(state, targetId, sourceId)` | 移除指定来源的修改器 |

修改器 `type` 可选值：`"power"` | `"r"` | `"level"`

修改器 `duration` 可选值：`"turn"`（本回合） | `"permanent"`（永久）

#### 条件谓词

| 函数 | 返回值 |
|------|--------|
| `C.hasFeature(card, featureId)` | 是否拥有指定特征 |
| `C.hasAttribute(card, attributeId)` | 是否拥有指定属性 |
| `C.fieldCount(state, playerIdx)` | 我方战区角色数 |
| `C.opponentFieldCount(state, playerIdx)` | 敌方战区角色数 |
| `C.getCardLevel(db, cardId)` | 卡牌 Lv |
| `C.getCardBasePower(db, cardId)` | 卡牌基础战力 |
| `C.getCardBaseR(db, cardId)` | 卡牌基础 R 值 |
| `C.retreatCount(state, playerIdx, db, filter?)` | 撤退区角色数（可按特征/属性/等级过滤） |
| `C.baseFaceDownCount(state, playerIdx)` | 基地盖卡数 |
| `C.hasAttachment(state, cardId)` | 是否有结附卡 |
| `C.hasDuplicateName(state, playerIdx, cardId, db)` | 是否有同名牌 |
| `C.getOpponentFieldCardsWithMinLv(...)` | 敌方战区 Lv≥X 角色列表 |
| `C.getOpponentFieldCardsWithMaxLv(...)` | 敌方战区 Lv≤X 角色列表 |
| `C.getMyFieldCardsWithFeature(state, playerIdx, db, featureId)` | 我方战区指定特征角色列表 |

### 4.6 效果定义最佳实践

1. **一卡多效**：同一 cardNo 的多个效果使用不同索引（-0, -1, -2）
2. **触发型 + 常驻型分开**：如 SD01-002 既有进场效果又有战力加成，分成两个 effect 对象
3. **once 字段精确**：只有注明"回合1次"的效果才设 `once: true`
4. **cost 与 condition 区分**：
   - `cost`：检查发动费用是否可支付（如手牌够不够弃）
   - `condition`：检查效果是否可执行（如目标是否存在）
5. **不可变更新**：execute 函数中所有状态修改必须返回新对象，不可直接修改原 state
6. **日志记录**：关键效果执行应该有清晰的 log 信息

---

## 5. 游戏阶段配置

### 5.1 阶段状态机

```
TURN_START → DRAW → ACTION → CONFLICT → END_PHASE → TURN_START (切换玩家)
```

| 阶段 | 枚举值 | 触发时机 | 可用操作 |
|------|--------|---------|---------|
| 回合开始 | `TURN_START` | `onTurnStart` 效果 | 自动触发效果 |
| 抽卡阶段 | `DRAW` | 抽卡完成 | 抽 2 张牌 |
| 行动阶段 | `ACTION` | 进入时 | 基地部署+号召(≤3)+战基移动+起动效果 |
| 冲突阶段 | `CONFLICT` | 进入时（首回跳过） | 调整位置(≤4)→按区攻击 |
| 结束阶段 | `END_PHASE` | 进入时 | 弃至9张+`onTurnEnd` 效果+清理 |

### 5.2 冲突阶段子状态

```
adjust（调整位置）→ attack（攻击）→ (4区完成) → END_PHASE
   ↑                    │
   └── 最多4次调整      └── 连击角色可攻击2次
```

### 5.3 回合流程控制点

如需在特定时机插入新逻辑，参考以下代码：

```typescript
// 回合开始 — engine.ts handleAdvancePhase TURN_START 分支
// 抽卡完成 — engine.ts handleDrawCards 末尾
// 行动阶段进入 — engine.ts handleAdvancePhase ACTION 分支
// 号召前校验 — engine.ts handleSummonToField 开头
// 攻击判定 — engine.ts handleConfirmAttack
// 回合结束清理 — engine.ts handleEndTurn
```

---

## 6. 测试与调试

### 6.1 运行测试

```bash
npm test                    # 运行全部测试
npx vitest run engine.test  # 仅运行引擎测试
npm run build               # TypeScript 编译验证（零错误策略）
```

### 6.2 测试文件结构

`src/game/__tests__/engine.test.ts` — 31 个测试用例，覆盖：

| 测试类别 | 用例数 | 说明 |
|---------|:--:|------|
| 阶段流转 | 5 | TURN_START → DRAW → ACTION → END → 切换 |
| 号召系统 | 6 | Lv1-3 直接号召、Lv4+ 撤退号召、基地号召 |
| 冲突阶段 | 4 | 调整位置、区域攻击、攻击判定 |
| 卡效验证 | 10 | SD01/SD02 各卡效果触发、条件、边界 |
| 胜负判定 | 3 | 时间线满、卡组空、冲击卡组空 |
| 边界条件 | 3 | 手牌上限、基地容量、卡组耗尽 |

### 6.3 调试对战日志

对战页面右侧栏底部有实时对战日志。关键日志格式：

```
⚔️ Player1 号召「卡牌名」(Lv3) → 先锋区 [剩余2次]
⚔️ Player1 基地部署 [剩余手牌: 5张]
👊 Player1 攻击「卡牌名」(战力5000) ← Player2「目标名」(战力3000)
💥 Player1 的「卡牌名」战败撤退
💀 Player1 的卡组已空，无法抽牌！Player2 获胜！
```

调试时关注日志中状态数值（如 `[剩余2次]`、`[剩余手牌: 5张]`）验证引擎行为。

### 6.4 浏览器 DevTools 调试

1. 打开浏览器 DevTools（F12）
2. 在 Console 中可手动 dispatch action 快速测试：

```javascript
// 需要先通过 React DevTools 获取 dispatch 引用
__REACT_DEVTOOLS_GLOBAL_HOOK__...
```

3. 在 Sources 面板中对 `engine.ts` 的 handler 函数设断点
4. 使用 `npm run dev` 的 HMR 特性，修改代码后自动刷新

---

## 7. 常见调优场景

### 7.1 加快游戏节奏

**目标：** 让对局更快结束。

| 调整项 | 建议值 | 地点 |
|--------|:--:|------|
| 减少时间线阈值 | 7~8 张 | `engine.ts:53` |
| 增加每回合抽牌 | 3 张 | `engine.ts:238` |
| 减少手牌上限 | 7 张 | `engine.ts:328` |
| 增加号召次数 | 4 次 | `engine.ts:357` |

### 7.2 降低先手优势

**目标：** 让后手玩家更有竞争力。

| 调整项 | 建议值 | 地点 |
|--------|:--:|------|
| 先攻首回号召 | 增加至 2 次 | `engine.ts:357` |
| 后攻起始手牌 | 增加至 7 张 | `GameSetup.tsx` |
| 先攻首回跳过的补偿 | 给后手额外资源 | 需新增逻辑 |

### 7.3 调整某一卡包的平衡性

**目标：** 某张卡太强或太弱，需要调整效果。

**两种方式：**

1. **不改代码，改数据**（推荐）：
   - 修改 `public/cards.json` 中的 `effect` 字段（仅文本显示）
   - 修改 `power`/`cost`/`r` 等数值字段
   - 适用于数值调整

2. **改效果逻辑**：
   - 修改 `src/game/effects/sdXX.ts` 中对应卡牌的效果对象
   - 修改 `execute` 函数中的参数（如抽牌数、战力增减值）
   - 适用于效果行为变更

### 7.4 新增关键词能力

**目标：** 添加新的常驻能力（如"先制"）。

```typescript
// 1. 在 abilities.ts 中定义能力检查函数
export function hasFirstStrike(cardId: string, state: BattleState): boolean {
  const abilities = state.registeredAbilities[cardId] ?? [];
  return abilities.includes("firstStrike");
}

// 2. 在 engine.ts 的攻击判定中添加逻辑
// 在 handleConfirmAttack 中检查先制条件

// 3. 在 effects/types.ts 的 keywords 类型中添加
keywords?: string[];  // 其中添加 "firstStrike"
```

---

## 8. 附录：文件速查表

### 8.1 引擎文件一览

| 文件 | 行数 | 核心内容 | 编辑频率 |
|------|:--:|------|:--:|
| `src/game/engine.ts` | 1683 | 24 个 Action Handler + checkpoint | 低（规则变更时） |
| `src/game/types.ts` | ~80 | GameAction 联合类型、EventContext | 低（新增 Action 时） |
| `src/game/cardUtils.ts` | ~200 | 战力计算、关键词、修改器合并 | 低 |
| `src/game/events.ts` | ~100 | 事件注册/触发 | 低 |
| `src/game/abilities.ts` | ~50 | 关键词能力定义 | 低（新关键词时） |
| `src/game/effects/sd01.ts` | ~800 | SD01 19 张卡效果 | 中（卡效修正时） |
| `src/game/effects/sd02.ts` | ~500 | SD02 19 张卡效果 | 中（卡效修正时） |
| `src/game/effects/helpers.ts` | ~400 | 20+ 原子操作函数 | 低（新增操作时） |
| `src/game/effects/conditions.ts` | ~300 | 15+ 条件谓词函数 | 低（新增条件时） |
| `src/game/effects/registry.ts` | ~80 | EFFECT_REGISTRY Map | 低 |
| `src/game/effects/index.ts` | ~20 | registerAllEffects() | 低（新卡包时） |
| `src/game/effects/types.ts` | ~120 | CardEffect, EffectContext, Modifier | 低（新增字段时） |

### 8.2 关键参数快速定位

| 要修改的参数 | 搜索关键词 | 文件 |
|-------------|-----------|------|
| 号召次数 | `remainingSummons` | `engine.ts` |
| 先攻首回号召 | `isFirstTurn ? 1 : 3` | `engine.ts` |
| 基地容量 | `>= 6`(共 3 处) | `engine.ts` |
| 冲突调整次数 | `conflictMovesUsed >= 4`(共 2 处) | `engine.ts` |
| 抽牌数 | `Math.min(2, deck.length)` | `engine.ts` |
| 手牌上限 | `hand.length > 9` | `engine.ts` |
| 时间线阈值 | `timeline.length >= 9` | `engine.ts` |
| 起始手牌 | `6 张卡` 或 `SETUP_DRAW_HANDS` | `GameSetup.tsx` |

### 8.3 效果系统文件地图

```
新增卡效 →
  ├── 1. 创建 effects/sdXX.ts（参考 sd01.ts 格式）
  ├── 2. 在 effects/index.ts 中 import "./sdXX"
  ├── 3. npm run build 验证编译
  ├── 4. npm test 确保无回归
  └── 5. npm run dev 浏览器验证
```

---

> **文档维护说明：** 本文档随引擎版本更新。所有参数修改后应及时同步本文档中的速查表。如发现文档与实际代码不一致，以代码为准并提交文档修正。
