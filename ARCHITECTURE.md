# 超英击战（Hero Rush）项目架构文档

> 本文档为「超英击战」Marvel TCG 平台的完整架构说明。项目根目录 `D:\Self\CYJZ`，实现代码位于 `Hero-Rush/` 子目录。

---

## 一、项目定位

一个 **Marvel TCG（超英击战集换式卡牌游戏）的非官方 Web 平台**，对标 Piltover Archive 的设计风格。三大核心能力：**卡牌查询浏览 → 卡组构筑 → 完整对战引擎**。

- 项目名「超英击战」，网站名「斗界竞技场」，npm 包名 `marvel-tcg`
- 纯前端 SPA，无后端，数据靠静态 JSON + localStorage

## 二、技术栈

| 层级 | 选型 |
|------|------|
| 构建 | Vite 6（端口 3000，`base: "./"` 相对路径部署） |
| UI | React 18 + Tailwind CSS 3 |
| 语言 | TypeScript 5.7（零错误策略） |
| 状态 | 纯 `useState`/`useReducer`，**无 Redux/Zustand 等第三方状态库** |
| 测试 | Vitest 4（引擎 31 项 + 功能 31 项） |
| 数据 | `public/cards.json`（240 张卡 / 296 变体） |

依赖极简 —— 生产依赖仅 `react` + `react-dom`。

## 三、整体分层

```
App.tsx（顶层）
├── 全局状态：卡牌库 db、当前 Tab、卡组构筑状态（deckName/mainDeck/savedDecks）
├── Tab 路由（9 个页面，非 react-router，纯 state 切换）
└── 三大子系统：
    ① 卡牌数据层  public/cards.json + types/card.ts
    ② 卡组构筑层  utils/deckCode.ts（编解码 + localStorage）
    ③ 对战引擎层  src/engine/**（独立于 UI 的纯逻辑内核）
```

## 三点五、双人分工与所有权边界（2026-07 重构确立）

| 区域 | 所有者 | 说明 |
|------|--------|------|
| `src/engine/**` | **对战逻辑/卡效负责人** | 内部结构随时可重构，UI 不感知 |
| `src/pages/`、`src/components/`、`src/contexts/`、`src/services/`、`src/utils/`、其余 hooks | **UI 负责人** | 页面、组件、联机服务等一切非引擎代码 |
| `src/hooks/useBattle.ts` | **双方共管** | UI↔引擎契约层，改动前互相知会 |
| `src/types/card.ts` | 双方只读 | 卡牌数据结构，改动前互相知会 |

**边界铁律**：

1. UI 层只准 `import ... from "../engine"`（barrel 出口 `engine/index.ts`），**禁止深层引入** `engine/effects/registry` 之类的内部文件；唯一例外是 `engine/__tests__`。
2. UI 需要引擎新能力时，在 `engine/index.ts` 加导出（状态查询优先加进 `engine/selectors.ts`），不要在组件里直接遍历 `BattleState` 算游戏规则。
3. 引擎层（`src/engine/**`）**禁止 import React 或任何 UI 模块**，保持纯函数内核。
4. 战区/阶段中文标签唯一来源是 `engine/labels.ts`，`components/battle/constants.ts` 仅转发。
5. 对战交互一律走 `useBattle` 的 `actions`，不要在组件里手写 `dispatch({type: ...})`（GameSetup 的开局流程是历史例外）。

**关键设计**：`App.tsx`（317 行）是唯一的全局状态持有者。卡组的增删改查、校验（50 张 / ≤2 色 / 同名≤3）全在此用 `useCallback` + `useMemo` 实现，再通过 props 下发给页面。没有 Context，没有状态库，是典型的「提升状态 + props 钻取」模式。

## 四、页面模块（src/pages/，9 个）

| 页面 | 行数 | 职责 |
|------|------|------|
| WelcomePage | 255 | 欢迎页（Logo/插画/统计/快捷入口） |
| ChatPage | 244 | 聊天页 |
| CardSearchPage | — | 240 张卡多维筛选浏览（属性/颜色/等级/系列/稀有度） |
| DeckPlazaPage | 835 | 卡组广场，本地卡组管理 + 卡组码导入导出 |
| **DeckBuilderPage** | 754 | 组卡器，对标 PA 双栏布局（画廊/统计/起手三视图） |
| **BattlePage** | 1320 | 对战主界面（最大的页面组件） |
| HelpPage / SettingsPage / AboutPage | — | 规则/设置/关于 |

## 五、对战引擎（src/engine/，项目的技术核心）

采用 **Command → Reducer → Checkpoint 三层单向数据流**：

```
用户操作 → dispatch(GameAction) → gameReducer（纯函数）→ checkpoint → BattleState → 渲染
```

- **Reducer**：纯函数，无副作用，相同输入永远相同输出
- **Effect Registry**：柯里化注入的卡效注册表，SD01/SD02 全量卡效已实现
- **Phase State Machine**：回合阶段自动机

### 目录结构与职责

```
src/engine/
├── index.ts              ★公共出口（barrel），UI 唯一允许的 import 入口
├── engine.ts (~1660行)   ★核心 Reducer，24 个 Action handler
├── state.ts (198行)      BattleState/PlayerState/Zone/TurnPhase 等状态模型
├── types.ts (175行)      GameAction 联合类型（24 种命令）+ 事件/能力系统类型
├── cardUtils.ts (303行)  卡牌工具（hasKeyword 等）
├── selectors.ts          状态查询选择器（getActivatableEffects/getKeywordCardNames）
├── setup.ts              开局准备（getRushCardIds/deckEntriesToCardIds）
├── labels.ts             战区/阶段中文标签唯一来源
├── events.ts             事件系统（12 种游戏事件监听）
├── abilities.ts          能力系统（active/trigger/static 三型）
├── effects/              ★卡效注册表（柯里化注入）
│   ├── registry.ts (280)  EFFECT_REGISTRY + getActiveEffects/getCounterActiveEffects
│   ├── sd01.ts (748)      SD01「英雄」卡组 19 张全量卡效
│   ├── sd02.ts (721)      SD02「复仇」卡组 19 张全量卡效
│   ├── conditions.ts (338) 条件判定（getMyFieldCards/hasDuplicateName 等）
│   ├── helpers.ts (694)   效果辅助（shuffleDeck/moveHandCardsToDeckBottom 等）
│   └── types.ts           CardEffect / Modifier 类型
└── __tests__/engine.test.ts (1630行)  引擎测试
```

UI 与引擎的连接点是 `src/hooks/useBattle.ts`（契约层）：封装 `useReducer(createGameReducer(db))`
和全部带预校验的 action 包装函数；`BattlePage.tsx` 只做渲染和菜单状态联动。

### 状态模型（BattleState，engine/state.ts）

- **PlayerState**：主卡组(50) / 冲击卡组(9) / 手牌 / 基地(正面+盖放) / 4 个战区（先锋·侧翼左·侧翼右·后卫）/ 时间线 / 撤退区 / 虚空区
- **阶段自动机**：
  - 开局 `SetupPhase`：洗混 → 决先后手 → 抽 6 → Mulligan 调度 → 完成
  - 回合 `TurnPhase`：TURN_START → DRAW → ACTION → CONFLICT → END_PHASE
- **关键词能力**：连击 / 强袭 / 空袭 / 拦截 / 唯一 / 应对
- **应对窗口机制**：号召后开启应对窗口，双方轮流响应，连续 2 次 pass 关闭

`BattleState` 字段分批演进（原始字段 → 引擎层扩展 → T01 增量字段 → Q7 目标选择），清晰反映增量开发的地质分层。

## 六、数据与资源（public/）

- `cards.json`：240 卡 / 296 变体，7 个系列（BP01 基础包、SD01-04 结构卡组、PB01 促销、TB01 预组）
- `cards/`：~296 张卡图 PNG（按 `系列-编号-稀有度` 命名，如 `SD01-001-MR.png`）
- `precon_sd01.json` / `precon_sd02.json`：预组卡组
- 属性色系：红/黄/蓝/绿 四色映射
- `scripts/`：Python 卡图处理脚本（`process_cards.py`、`build_precon.py`）

## 七、文档体系（docs/）

- **planning/**：PRD、技术方案、项目规划终版
- **BATTLE_DEV_GUIDE.md**：对战模块开发者指南
- **EDITOR_GUIDE.md**（1096 行）：面向非技术项目经理的编辑指南
- **incremental_prd.md / incremental_design.md**：增量交付文档
- Mermaid 类图 + 时序图（含增量版）
- **rules/**：9 页规则书扫描图 + `rulebook.md`

项目按 **产品经理 → 架构师 → 工程师 → QA** 的 SOP 角色流程推进（虚拟角色：许清楚/高见远/寇豆码/严过关），是一套规范的仿团队协作开发流。

---

## 架构点评

一个**依赖极简、逻辑分层清晰**的前端 TCG 平台。最大亮点是把**对战引擎做成了完全独立于 React 的纯函数内核**（Reducer + 柯里化卡效注册表 + 测试护航），UI 通过 `useBattle` 契约层与引擎交互。卡效通过注册表按系列（SD01/SD02）解耦 —— 扩展新卡组只需新增 `effects/sdXX.ts` 并注册，可扩展性良好。2026-07 起按「引擎（对战逻辑/卡效）/ UI（页面及其余）」双人分工划定所有权边界，见第三点五节。
