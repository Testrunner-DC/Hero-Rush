# 斗界竞技场（Hero Rush）项目状态报告

**文档版本**: v3.0  
**更新日期**: 2026-06-30  
**编制**: 齐活林（Qi）· 交付总监  
**项目代号**: 斗界竞技场 / Marvel TCG  
**GitHub**: [Testrunner-DC/Hero-Rush](https://github.com/Testrunner-DC/Hero-Rush)  
**参考**: [原始规划文档见 planning/](./planning/) | [系统设计](./system_design.md) | [对战开发指南](./BATTLE_DEV_GUIDE.md)

---

## TL;DR

**斗界竞技场是一个漫威超英击战（Marvel TCG）的纯客户端 Web 应用**，已交付**卡查、组卡器、本地对战三大核心模块**，约 10,000 行 TypeScript，零后端依赖。

---

## 一、实际交付范围 vs 原始规划

### 1.1 范围对比

| 模块 | 原始规划（2026-06-12） | 实际交付（2026-06-30） | 状态 |
|------|----------------------|----------------------|------|
| 卡牌数据库 | P0：完整卡牌数据+搜索 | 282张卡牌，多维筛选（属性/颜色/等级/稀有度/系列/DP/PP） | ✅ |
| 卡组构建器 | P0：50+9合法性检查 | 主卡组(50)+冲刺卡组(9)，筛选/排序/列控制，导入/导出 | ✅ |
| 对战引擎 | P0：9区域/6阶段/号召/战斗/时间线 | Command-Reducer-Checkpoint 引擎，SD01/SD02 全量卡效 | ✅ |
| 对战界面 | P0：实时对战UI | 本地对战界面（PlayerArea/Sidebar/CardDetailPanel） | ✅ |
| 用户系统 | P0：注册/登录 | ❌ 未开发 | 🔴 |
| 赛事系统 | P0：瑞士轮/单淘汰 | ❌ 未开发 | 🔴 |
| 对战匹配 | P0：快速匹配/私人房间 | ❌ 未开发 | 🔴 |
| WebSocket实时通信 | P0：状态同步 | ❌ 未开发 | 🔴 |
| 观战/直播 | P1 | ❌ 未开发 | 🔴 |
| 卡组导入(OCR) | P1 | 文本导入(已实现)，OCR识别未实现 | 🟡 |
| Sample Hand 起手模拟 | P2 | Fisher-Yates 抽5张，等级分布图 | ✅ |
| 闪卡效果 | P2 | CSS 伪元素 holographic 效果 | ✅ |
| 卡图缩放 | P2 | transform:scale 滚动条控制 | ✅ |
| 列控制 | P0 | 浮动工具栏，1-6列可选 | ✅ |
| 筛选收起/展开 | P1 | 默认收起+搜索框常驻+2列网格 | ✅ |

### 1.2 架构演变

```
原始规划（全栈平台）              实际交付（客户端 SPA）
┌──────────────────────┐         ┌─────────────────────┐
│  React + PixiJS      │         │  React 18 + TS      │
│  Node.js NestJS      │   →     │  Vite                │
│  Go + Lua 引擎       │         │  Tailwind CSS        │
│  PostgreSQL + Redis  │         │  MSA Light 主题       │
│  RabbitMQ + ES       │         │                       │
│  Kubernetes          │         │  纯浏览器端运行        │
│  WebSocket           │         │  零依赖后端服务        │
└──────────────────────┘         └─────────────────────┘
```

---

## 二、技术栈（实际）

| 层级 | 选用 | 版本 |
|------|------|------|
| **框架** | React | 18.x |
| **语言** | TypeScript | 5.x |
| **构建** | Vite | 5.x |
| **样式** | Tailwind CSS | 3.x |
| **主题** | MSA Light（自定义 CSS 变量） | — |
| **路由** | React Router | 6.x |
| **测试** | Vitest | — |
| **数据** | 静态 JSON（public/cards.json） | — |
| **对战引擎** | 自研 Command-Reducer-Checkpoint | — |
| **部署** | Vite build → 纯静态文件 | — |

---

## 三、项目结构（实际）

```
marvel-tcg/
├── public/
│   ├── cards.json          ← 282张卡牌数据
│   ├── cards/              ← 卡图 PNG
│   ├── logo.webp
│   └── favicon.svg
├── src/
│   ├── main.tsx            ← 入口
│   ├── App.tsx             ← 路由 + 布局
│   ├── ErrorBoundary.tsx   ← 全局错误处理
│   ├── index.css           ← Tailwind + MSA 主题 + 闪卡 CSS
│   ├── pages/
│   │   ├── WelcomePage.tsx       ← 首页（Logo/插画/统计/CTA）
│   │   ├── CardSearchPage.tsx    ← 卡牌检索（网格/详情/列控制）
│   │   ├── DeckBuilderPage.tsx   ← 组卡器（双栏/三视图/筛选/P2功能）
│   │   ├── DeckPlazaPage.tsx     ← 卡组广场
│   │   ├── BattlePage.tsx        ← 对战页面
│   │   ├── ChatPage.tsx          ← 聊天页
│   │   ├── SettingsPage.tsx      ← 设置页
│   │   ├── HelpPage.tsx          ← 帮助页
│   │   └── AboutPage.tsx         ← 关于页
│   ├── components/
│   │   ├── CardGrid.tsx            ← 卡牌网格（foli/scale支持）
│   │   ├── CardDetailModal.tsx     ← 卡牌详情弹窗
│   │   ├── CardDetailSidebar.tsx   ← 卡牌详情侧栏（组卡器用）
│   │   ├── FilterBar.tsx           ← 搜索+类型标签
│   │   ├── FilterSidebar.tsx       ← 多维度筛选面板（compact模式）
│   │   ├── ColumnSelector.tsx      ← 列数选择器（常规/compact）
│   │   ├── DeckStatsView.tsx       ← 卡组统计视图（费用曲线/类型分布）
│   │   ├── SampleHandView.tsx      ← 起手模拟（Fisher-Yates 抽5张）
│   │   ├── ImportDeckModal.tsx     ← 卡组导入弹窗
│   │   ├── GameSetup.tsx           ← 对战初始化
│   │   └── battle/                 ← 对战UI组件
│   │       ├── PlayerArea.tsx
│   │       ├── SidebarSection.tsx
│   │       ├── CardDetailPanel.tsx
│   │       ├── StatRow.tsx
│   │       ├── types.ts
│   │       └── constants.ts
│   ├── game/                    ← 对战引擎
│   │   ├── engine.ts            ← Command-Reducer-Checkpoint 核心
│   │   ├── events.ts            ← 事件系统
│   │   ├── abilities.ts         ← 能力关键词
│   │   ├── cardUtils.ts         ← 卡牌工具函数
│   │   ├── types.ts             ← 对战类型定义
│   │   └── effects/             ← 卡牌效果
│   │       ├── index.ts         ← 效果注册中心
│   │       ├── registry.ts      ← 效果注册表
│   │       ├── types.ts         ← 效果类型
│   │       ├── conditions.ts    ← 触发条件
│   │       ├── helpers.ts       ← 效果辅助
│   │       ├── sd01.ts          ← SD01 全量卡效
│   │       └── sd02.ts          ← SD02 全量卡效
│   ├── types/
│   │   ├── card.ts              ← 卡牌数据结构
│   │   └── game.ts              ← 游戏状态类型
│   ├── utils/
│   │   └── deckCode.ts          ← 卡组编解码
│   └── __tests__/
│       └── features.test.ts
├── docs/
│   ├── PROJECT_STATUS.md        ← 本文档
│   ├── system_design.md         ← 系统设计
│   ├── incremental_prd.md       ← 增量PRD
│   ├── incremental_design.md    ← 增量设计
│   ├── BATTLE_DEV_GUIDE.md      ← 对战功能开发指南
│   ├── EDITOR_GUIDE.md          ← 编辑器使用指南
│   ├── rules/                   ← 游戏规则文档
│   ├── *.mermaid                ← 架构图/时序图
│   └── planning/                ← 原始规划文档（归档）
├── scripts/
│   └── legacy/                  ← 遗留脚本
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── README.md
```

---

## 四、已交付功能清单

### 4.1 页面（8个 + 首页）

| 页面 | 路由 | 状态 | 关键特性 |
|------|------|------|---------|
| 欢迎页 | `/` | ✅ | Logo+插图+统计数据+CTA按钮，MSA Light 主题 |
| 卡牌检索 | `/cards` | ✅ | 网格视图、多维筛选、列控制、快速搜索 |
| 组卡器 | `/deck-builder` | ✅ | 对标 PA 双栏布局、画廊/统计/起手三视图、筛选收起、排序、列控制 |
| 卡组广场 | `/deck-plaza` | ✅ | 卡组浏览 |
| 对战 | `/battle` | ✅ | 本地对战 UI |
| 聊天 | `/chat` | ✅ | 基础聊天 |
| 设置 | `/settings` | ✅ | 设置页 |
| 帮助 | `/help` | ✅ | 帮助文档 |
| 关于 | `/about` | ✅ | 关于页 |

### 4.2 对战引擎

| 功能 | 状态 |
|------|------|
| Command-Reducer-Checkpoint 架构 | ✅ |
| 完整的 GameState 类型层 | ✅ |
| 事件系统 | ✅ |
| SD01 全量卡牌效果 | ✅ |
| SD02 全量卡牌效果 | ✅ |
| 效果注册中心 | ✅ |
| 对战 UI（PlayerArea/Sidebar/CardDetailPanel） | ✅ |
| 引擎单元测试 | ✅ |

### 4.3 卡牌数据

| 数据 | 数量 |
|------|------|
| 角色卡 | 282 张 |
| 卡图 | 全部 PNG |
| 属性颜色 | 5色（红/黄/蓝/绿/通用） |
| 特征标签 | 卡玛泰姬/银河护卫队/斗界 等 |
| DP/PP 数据 | OCR 验证+自动修正 |

---

## 五、未完成 / 待推进

### 5.1 对战功能（已移交）

| 功能 | 负责人 | 参考 |
|------|-------|------|
| 对战 UI 完善 | 朋友 | [BATTLE_DEV_GUIDE.md](./BATTLE_DEV_GUIDE.md) |
| 对战状态管理 | 朋友 | [class-diagram.mermaid](./class-diagram.mermaid) |
| 对战流程实现 | 朋友 | [sequence-diagram.mermaid](./sequence-diagram.mermaid) |

### 5.2 后端功能（暂缓）

| 功能 | 原始优先级 | 备注 |
|------|----------|------|
| 用户注册/登录 | P0 | 全栈架构需要，纯客户端暂不需要 |
| 实时对战匹配 | P0 | 依赖 WebSocket 和后端 |
| 赛事系统 | P0 | 依赖用户系统+服务器 |
| WebSocket 通信 | P0 | 需要后端服务 |

### 5.3 数据相关

| 事项 | 备注 |
|------|------|
| 新卡牌数据更新 | `zhanshuang-update` 技能已就绪，API 拉取脚本可用 |
| 卡图更新 | 仓库 `C:/Users/neptu/WorkBuddy/20260430022315/` 中有原始卡图 |

---

## 六、技术决策记录

| 决策 | 理由 |
|------|------|
| 纯客户端 SPA | 快速验证需求，零运维成本，独立开发者友好 |
| React（非原始规划的 Vue） | 生态更成熟，与 AI 辅助开发配合更好 |
| Tailwind CSS（非 MUI 组件库） | 更高的样式定制自由度，对标 Piltover Archive 风格 |
| Command-Reducer-Checkpoint 引擎 | 可预测、可测试、可回放的对战状态管理 |
| 静态 JSON 卡牌数据 | 无需数据库，Vite 直接导入 |
| MSA Light 主题 | 简洁、明亮、对标 Piltover Archive |

---

## 七、代码统计

| 指标 | 数值 |
|------|------|
| TypeScript 源文件 | 46 个 |
| 总代码行数 | ~10,000 行 |
| 页面组件 | 9 个 |
| 通用组件 | 15 个 |
| 对战引擎文件 | 11 个 |
| 测试文件 | 2 个 |
| GitHub 提交 | 多轮迭代 |
| TypeScript 类型错误 | 0 |

---

## 八、部署信息

```bash
# 开发
cd marvel-tcg
npm install
npm run dev        # http://localhost:3000

# 生产构建
npm run build      # 输出 dist/
npm run preview    # 预览构建产物

# 部署
# 将 dist/ 上传到任意静态站点托管服务（Vercel/Netlify/CloudStudio）
```

---

**文档结束**

> 本文档随项目推进持续更新。如需了解初始规划，请参阅 [planning/](./planning/) 目录下的归档文档。
