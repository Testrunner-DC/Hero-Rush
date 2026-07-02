# 斗界竞技场 (Hero Rush) — Marvel TCG 对战网站

> 超英击战（Marvel TCG）非官方卡牌查询、组卡与对战平台。对标 Piltover Archive 设计风格，支持 240 张卡牌数据浏览、卡组构筑、起手模拟及完整对战引擎。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff)](https://vitejs.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-3-38bdf8)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

---

## ✨ 功能概览

| 页面 | 功能 |
|------|------|
| **欢迎页** | Logo、插画、统计数据、快捷入口 |
| **卡牌搜索** | 240 张卡牌浏览，多维度筛选（属性/颜色/等级/系列/稀有度），列数控制 |
| **卡组广场** | 本地卡组管理，导入导出卡组码 |
| **组卡器** | 对标 Piltover Archive 双栏布局，画廊/统计/起手三视图，闪卡效果，卡图缩放，多排序 |
| **对战** | Command → Reducer → Checkpoint 三层架构，SD01/SD02 全量卡效实现 |
| **设置** | 主题切换、本地数据管理 |
| **帮助 & 关于** | 游戏规则、项目信息 |

### P2 特性

- 🎴 **起手模拟**（Sample Hand）：Fisher-Yates 随机抽 5 张，含等级分布条形图
- ✨ **闪卡效果**（Foil Effect）：CSS 伪元素全息渐变
- 🔍 **卡图缩放**：范围滑块调节卡牌显示大小

---

## 🛠 技术栈

| 层级 | 选型 |
|------|------|
| 构建工具 | Vite 6 |
| UI 框架 | React 18 + Tailwind CSS 3 |
| 语言 | TypeScript 5.7（零错误策略） |
| 测试 | Vitest 4 |
| 状态管理 | `useReducer`（无第三方状态库） |
| 卡牌数据 | `public/cards.json`（240卡/296变体） |

## 📁 项目结构

```
marvel-tcg/
├── public/
│   ├── cards.json          # 卡牌数据（240张）
│   ├── cards/              # 卡图资源
│   ├── logo.png
│   ├── favicon.svg
│   └── illustration.webp
├── src/
│   ├── App.tsx             # 顶层路由（Tab切换）+ 全局状态
│   ├── main.tsx            # 入口
│   ├── index.css           # 全局样式 + 闪卡动画
│   ├── ErrorBoundary.tsx   # 错误边界
│   ├── types/
│   │   ├── card.ts         # Card, Deck, DeckEntry 类型
│   │   └── game.ts         # 对战类型（BattleState, GameAction, CardEffect）
│   ├── pages/              # 9 个页面组件
│   │   ├── WelcomePage.tsx
│   │   ├── CardSearchPage.tsx
│   │   ├── DeckPlazaPage.tsx
│   │   ├── DeckBuilderPage.tsx  # 组卡器（793行，最复杂的页面）
│   │   ├── BattlePage.tsx
│   │   ├── ChatPage.tsx
│   │   ├── HelpPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── AboutPage.tsx
│   ├── components/         # 可复用 UI 组件
│   │   ├── CardGrid.tsx          # 卡牌网格（闪卡+缩放）
│   │   ├── CardDetailModal.tsx   # 卡牌详情弹窗
│   │   ├── CardDetailSidebar.tsx # 卡牌详情侧栏
│   │   ├── FilterSidebar.tsx     # 筛选侧栏（2列网格）
│   │   ├── FilterBar.tsx         # 搜索+类型快速筛选
│   │   ├── ColumnSelector.tsx    # 列数选择器（紧凑模式）
│   │   ├── SampleHandView.tsx    # 起手模拟
│   │   ├── DeckStatsView.tsx     # 卡组统计
│   │   ├── ImportDeckModal.tsx   # 导入卡组弹窗
│   │   ├── GameSetup.tsx         # 对战设置
│   │   └── battle/               # 对战 UI 子组件
│   ├── game/               # 对战引擎核心
│   │   ├── engine.ts       # 核心 Reducer + Checkpoint
│   │   ├── types.ts        # 对战类型定义
│   │   ├── cardUtils.ts    # 卡牌工具函数
│   │   ├── events.ts       # 事件系统
│   │   ├── abilities.ts    # 能力系统
│   │   ├── effects/        # 卡效注册表
│   │   │   ├── index.ts
│   │   │   ├── registry.ts  # EFFECT_REGISTRY
│   │   │   ├── types.ts
│   │   │   ├── sd01.ts      # SD01 初始卡组效果
│   │   │   ├── sd02.ts      # SD02 初始卡组效果
│   │   │   ├── conditions.ts
│   │   │   └── helpers.ts
│   │   └── __tests__/
│   │       └── engine.test.ts  # 引擎核心测试
│   ├── utils/
│   │   └── deckCode.ts     # 卡组编解码 + localStorage 持久化
│   └── __tests__/
│       └── features.test.ts  # 功能测试
├── docs/
│   ├── BATTLE_DEV_GUIDE.md  # 对战模块开发者指南
│   ├── class-diagram.mermaid
│   └── sequence-diagram.mermaid
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── index.html
```

## 🚀 快速启动

```bash
cd marvel-tcg
npm install
npm run dev        # 开发服务器（默认 http://localhost:5173）
npm run build      # 生产构建
npm test           # 运行测试
```

## ⚔️ 对战引擎

对战模块采用 **Command → Reducer → Checkpoint** 三层单向数据流架构：

```
用户操作 → dispatch(GameAction) → gameReducer → checkpoint → BattleState → 渲染
```

- **Reducer**：纯函数，无副作用，相同输入永远相同输出
- **Effect Registry**：柯里化注入的卡效注册表，SD01/SD02 全量卡效已实现
- **Phase State Machine**：回合阶段自动机（准备→主要→战斗→结束）

详细架构见 [`docs/BATTLE_DEV_GUIDE.md`](./docs/BATTLE_DEV_GUIDE.md)。对战参数调优见 [`docs/BATTLE_ENGINE_EDITOR_MANUAL.md`](./docs/BATTLE_ENGINE_EDITOR_MANUAL.md)。

## 📝 最近更新

- **2026-07-02**：新增《项目经理手册》和《对战引擎编辑手册》，完善文档体系
- **2026-06-29**：组卡器筛选默认收起、搜索框常驻、筛选内容 2 列网格布局
- **2026-06-28**：组卡器右侧面板对标 PA 重构（画廊/统计/起手三视图）、P2 起手模拟+闪卡+卡图缩放、卡牌页列控制移至工具栏
- **2026-06-27**：主页 UI 重构（MSA Light 主题、Logo+插画+统计）、卡牌/组卡页面排布对标 Piltover Archive
- **2026-06-26**：对战模块 Battle Dev Guide 编写、项目分工边界划定
- **2026-06-20**：SD01/SD02 全量卡效修正（`once`/`isCounterActive` 等字段补全）

## 🤝 贡献

对战功能由另一位开发者继续推进，详见 [`docs/BATTLE_DEV_GUIDE.md`](./docs/BATTLE_DEV_GUIDE.md)。

其他模块（卡牌浏览、组卡器、UI）的维护请联系项目主理人。

## 📄 许可

MIT License
