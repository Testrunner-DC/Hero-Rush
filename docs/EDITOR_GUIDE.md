# 超英击战 Marvel TCG — 项目编辑指南

> **目标读者：** 完全不懂代码的项目经理  
> **编写日期：** 2026-06-22  
> **项目路径：** `D:/WorkBuddyData/2026-06-12-03-21-19/marvel-tcg/`

---

## 目录

1. [项目整体结构说明](#第1章项目整体结构说明)
2. [如何新增/修改卡牌数据](#第2章如何新增修改卡牌数据)
3. [如何撰写新卡效](#第3章如何撰写新卡效)
4. [各功能板块编辑入口](#第4章各功能板块编辑入口)
5. [常见操作 FAQ](#第5章常见操作-faq)
6. [附录](#附录)

---

## 第1章：项目整体结构说明

### 1.1 这是什么项目？

这是一个**超英击战（Marvel TCG）卡牌对战网站**。玩家可以在网站上：

- 浏览卡牌图鉴（查卡）
- 组建自己的卡组（组卡器）
- 使用预组或自组卡组进行对战
- 查看游戏帮助和规则

网站使用的技术叫做 **React**（一种网页界面框架），用 **TypeScript**（一种带类型检查的编程语言，是 JavaScript 的升级版）编写代码，用 **Tailwind CSS**（一种快速排版工具）做样式。

### 1.2 目录树概览

下面是项目的目录结构。标注 **[可编辑]** 的文件是项目经理日常需要修改的，标注 **[不要动]** 的文件涉及核心逻辑，建议交给开发处理。

```
marvel-tcg/                          ← 项目根目录
├── public/                          ← 静态资源目录（直接被网站读取的文件）
│   ├── cards.json                   [可编辑] ★ 卡牌数据库（最重要的文件！）
│   ├── precon_sd01.json             [可编辑] ★ SD01 预组卡组配置
│   ├── precon_sd02.json             [可编辑] ★ SD02 预组卡组配置
│   └── cards/                       [可编辑] ★ 卡牌图片文件夹
│       ├── BP01-001-MR.png
│       ├── BP01-001-SEC.png
│       └── ...（所有卡牌图片）
│
├── src/                             ← 源代码目录（网站功能的代码）
│   ├── main.tsx                     [不要动] 网站入口文件
│   ├── App.tsx                      [可编辑] ★ 导航栏配置（Tab 标签名称等）
│   ├── index.css                    [不要动] 全局样式
│   │
│   ├── types/                       ← 类型定义目录
│   │   ├── card.ts                  [不要动] 卡牌数据结构定义
│   │   └── game.ts                  [不要动] 游戏状态结构定义
│   │
│   ├── game/                        ← 游戏引擎目录（对战逻辑核心）
│   │   ├── engine.ts                [不要动] 游戏引擎核心
│   │   ├── cardUtils.ts             [不要动] 卡牌辅助函数
│   │   ├── events.ts                [不要动] 事件系统
│   │   ├── abilities.ts             [不要动] 能力系统
│   │   ├── types.ts                 [不要动] 游戏动作类型定义
│   │   │
│   │   └── effects/                 ← 卡牌效果系统目录
│   │       ├── types.ts             [不要动] 效果类型定义
│   │       ├── helpers.ts           [不要动] 效果辅助函数
│   │       ├── conditions.ts        [不要动] 效果条件函数
│   │       ├── registry.ts          [不要动] 效果注册表
│   │       ├── index.ts             [不要动] 效果系统入口
│   │       ├── sd01.ts              [交给开发] SD01 卡效定义（需开发编写代码）
│   │       └── sd02.ts              [交给开发] SD02 卡效定义（需开发编写代码）
│   │
│   ├── pages/                       ← 页面组件目录（每个 Tab 对应一个文件）
│   │   ├── WelcomePage.tsx          [可编辑] ★ 欢迎页（首页内容）
│   │   ├── CardSearchPage.tsx       [可编辑] 卡牌图鉴页
│   │   ├── DeckPlazaPage.tsx        [可编辑] 卡组广场页
│   │   ├── DeckBuilderPage.tsx      [可编辑] 组卡器页
│   │   ├── BattlePage.tsx           [交给开发] 对战页（逻辑复杂）
│   │   ├── HelpPage.tsx             [可编辑] ★ 帮助页（游戏规则 Q&A）
│   │   ├── SettingsPage.tsx         [可编辑] ★ 设置页
│   │   ├── AboutPage.tsx            [可编辑] ★ 关于页
│   │   └── ChatPage.tsx             [可编辑] 聊天页
│   │
│   ├── components/                  ← 通用组件目录
│   │   ├── GameSetup.tsx            [交给开发] 开局调度组件
│   │   ├── CardDetailModal.tsx      [不要动] 卡牌详情弹窗
│   │   ├── CardGrid.tsx             [不要动] 卡牌网格
│   │   ├── FilterBar.tsx            [不要动] 筛选栏
│   │   ├── FilterSidebar.tsx        [不要动] 筛选侧边栏
│   │   ├── CardDetailSidebar.tsx    [不要动] 卡牌详情侧边栏
│   │   └── battle/                  [不要动] 对战子组件目录
│   │
│   └── utils/                       ← 工具函数目录
│       └── deckCode.ts              [不要动] 卡组码编解码
│
├── docs/                            ← 文档目录
│   ├── EDITOR_GUIDE.md              [本文档]
│   ├── incremental_prd.md           增量需求文档
│   ├── incremental_design.md        增量架构设计
│   ├── sequence-diagram-incremental.mermaid  增量时序图
│   └── class-diagram-incremental.mermaid     增量类图
│
├── package.json                     [不要动] 项目依赖配置
├── vite.config.ts                   [不要动] 构建工具配置
├── tsconfig.json                    [不要动] TypeScript 配置
├── tailwind.config.ts               [不要动] Tailwind 配置
└── index.html                       [不要动] 网页入口 HTML
```

### 1.3 各目录/文件用途说明

| 文件/目录 | 用途 | 谁来编辑 |
|-----------|------|---------|
| `public/cards.json` | **卡牌数据库**，包含所有卡牌的数据（名称、战力、效果文本等） | 项目经理 |
| `public/precon_sd01.json` | SD01 预组卡组列表 | 项目经理 |
| `public/precon_sd02.json` | SD02 预组卡组列表 | 项目经理 |
| `public/cards/` | 卡牌图片文件夹（PNG 格式） | 项目经理 |
| `src/App.tsx` | 导航栏配置（Tab 标签的名称和顺序） | 项目经理 |
| `src/pages/HelpPage.tsx` | 帮助页的内容（规则 Q&A） | 项目经理 |
| `src/pages/SettingsPage.tsx` | 设置页的内容 | 项目经理 |
| `src/pages/AboutPage.tsx` | 关于页的内容 | 项目经理 |
| `src/pages/WelcomePage.tsx` | 欢迎首页的内容 | 项目经理 |
| `src/game/effects/sd01.ts` | SD01 卡牌效果逻辑代码 | 开发 |
| `src/game/effects/sd02.ts` | SD02 卡牌效果逻辑代码 | 开发 |
| `src/game/engine.ts` | 游戏对战引擎核心逻辑 | 开发 |
| `src/pages/BattlePage.tsx` | 对战页面界面和交互 | 开发 |

### 1.4 "你只需要关心这些文件"快速指南

**日常编辑清单（项目经理需要维护的文件）：**

| 序号 | 文件 | 用途 | 编辑频率 |
|------|------|------|---------|
| 1 | `public/cards.json` | 添加新卡、修改卡牌数据 | 新卡包发布时 |
| 2 | `public/cards/` | 放置卡牌图片 | 新卡包发布时 |
| 3 | `public/precon_sd01.json` | 修改 SD01 预组 | 预组调整时 |
| 4 | `public/precon_sd02.json` | 修改 SD02 预组 | 预组调整时 |
| 5 | `src/App.tsx` | 修改导航栏标签名称 | 很少 |
| 6 | `src/pages/HelpPage.tsx` | 修改帮助内容 | 规则更新时 |
| 7 | `src/pages/AboutPage.tsx` | 修改关于页内容 | 版本更新时 |
| 8 | `src/pages/WelcomePage.tsx` | 修改首页内容 | 很少 |

**需要交给开发的操作（项目经理只需填写描述模板）：**
- 新增卡效逻辑 → 填写第3章的"新卡效描述模板"，交给开发在 `sd01.ts` / `sd02.ts` 中实现
- 修改对战规则 → 提交需求给开发在 `engine.ts` 中修改

---

## 第2章：如何新增/修改卡牌数据

### 2.1 cards.json 文件说明

**文件位置：** `public/cards.json`

**什么是 JSON？** JSON（JavaScript Object Notation，一种轻量级数据格式）是一种用花括号 `{}` 和方括号 `[]` 组织数据的文本格式。你可以用任何文本编辑器（如记事本、VS Code）打开它。

**文件结构：** `cards.json` 的整体结构如下：

```json
{
  "total_cards": 226,
  "total_variants": 282,
  "packages": ["BP01 基础包", "SD01 英雄", ...],
  "attributes": { ... },
  "rarities": { ... },
  "feature_map": { ... },
  "cards": [
    { 卡牌1的数据 },
    { 卡牌2的数据 },
    ...
  ]
}
```

你主要编辑的是 `"cards"` 数组（数组就是用 `[]` 包起来的列表），每张卡牌是数组中的一个对象（用 `{}` 包起来）。

### 2.2 卡牌字段逐项说明

每张卡牌的数据结构如下（以 SD01-001 为例）：

| 字段名 | 类型 | 说明 | 示例值 | 可选值 |
|--------|------|------|--------|--------|
| `id` | 字符串 | 唯一标识，格式为 `{卡号}-{稀有度代码}`。同一张卡的不同稀有度版本有不同的 id | `"SD01-001-SEC"` | — |
| `card_no` | 字符串 | 卡牌编号（游戏逻辑用），同一张卡的不同稀有度版本共用同一个 card_no | `"SD01-001"` | — |
| `name` | 字符串 | 卡牌名称 | `"「自毁程式」钢铁侠"` | — |
| `card_type` | 数字 | 卡牌类型 | `1` | `1` = 角色卡, `2` = 冲击卡 |
| `card_type_name` | 字符串 | 卡牌类型中文名 | `"角色卡"` | `"角色卡"`, `"冲击卡"` |
| `cost` | 数字 | Lv 等级（即费用） | `6` | `1` ~ `6` |
| `cost_name` | 字符串 | Lv 等级文本 | `"Lv6"` | `"Lv1"` ~ `"Lv6"` |
| `attribute` | 数字 | 属性编号 | `1` | 见下方属性对照表 |
| `attribute_name` | 字符串 | 属性中文名 | `"科技"` | — |
| `attribute_color` | 字符串 | 属性颜色（十六进制色值） | `"#E24B4A"` | — |
| `pp_value` | 数字 | PP 值 | `4` | — |
| `dp_value` | 数字 | DP 值（防御力） | `6` | — |
| `power` | 字符串或null | 战力值 | `"3000"` | 数字字符串或 `null`（冲击卡为 null） |
| `signal_color` | 数字或null | 信号色编号 | `1` | `1` = 有信号色, `null` = 无 |
| `signal_color_text` | 字符串或null | 信号色说明 | `"有信号色（与属性同色宝石）"` | — |
| `feature` | 字符串或null | 特征 ID（多个用逗号分隔） | `"1,2"` | 见下方特征对照表 |
| `feature_text` | 字符串或null | 特征中文名（多个用斜杠分隔） | `"人类/复仇者联盟"` | — |
| `effect` | 字符串 | 效果文本（卡牌上印刷的原文） | `"触发【战区/回合1次】：..."` | 无效果卡填空字符串 `""` |
| `package` | 字符串 | 所属卡包全名 | `"SD01 英雄"` | — |
| `package_short` | 字符串 | 卡包简称 | `"SD01"` | — |
| `rarity` | 数字 | 稀有度数值 | `11` | 见下方稀有度对照表 |
| `rarity_code` | 字符串 | 稀有度代码 | `"SEC"` | — |
| `rarity_cn` | 字符串 | 稀有度中文 | `"秘稀"` | — |
| `rarity_color` | 字符串 | 稀有度颜色 | `"#A32D2D"` | — |
| `image_url` | 字符串 | 图片路径 | `"/cards/SD01-001-SEC.png"` | — |
| `r` | 数字（可选） | 基础 R 值（默认为 1） | `1` | 不填则默认为 `1` |

#### 属性（attribute）值对照表

| 数值 | 中文名 | 英文名 | 颜色 |
|------|--------|--------|------|
| `1` | 科技（红色） | Tech | `#E24B4A` |
| `2` | 正义（蓝色） | Justice | `#378ADD` |
| `3` | 自然（紫色） | Nature | `#7F77DD` |
| `4` | 敏捷（绿色） | Agility | `#639922` |
| `7` | 通用（灰色） | Neutral | `#888780` |

> **注意：** 原始数据中 attribute=2 的英文为 "Justice"（正义），对应的颜色代码为 `#378ADD`（蓝色）。虽然规则书中描述为"黄色"，但数据中的颜色代码为蓝色。

#### 特征（feature）值对照表

| 数值 | 中文名 |
|------|--------|
| `1` | 人类 |
| `2` | 复仇者联盟 |
| `3` | 机械 |
| `4` | 阿斯加德 |
| `5` | 瓦坎达 |
| `6` | 费恩拉 |
| `7` | 神盾局 |
| `8` | 变种人 |
| `9` | 九头蛇 |
| `10` | 时间犯 |
| `11` | 神奇四侠 |
| `12` | 捍卫者联盟 |
| `13` | 亚特兰蒂斯 |

> 一张卡可以有多个特征，用逗号分隔，如 `"1,2"` 表示同时拥有"人类"和"复仇者联盟"两个特征。

#### 稀有度（rarity）值对照表

| 数值 | 代码 | 中文 | 颜色 |
|------|------|------|------|
| `4` | U | 优通 | `#7B8FA0` |
| `5` | R | 普通 | `#B4B2A9` |
| `7` | SR | 罕通 | `#378ADD` |
| `8` | GR | 金稀 | `#D4A017` |
| `9` | UR | 超稀 | `#9D4EDD` |
| `10` | MR | 特秀 | `#D4537E` |
| `11` | SEC | 秘稀 | `#A32D2D` |

#### 卡牌类型（card_type）值对照表

| 数值 | 中文名 |
|------|--------|
| `1` | 角色卡 |
| `2` | 冲击卡 |

### 2.3 新增卡牌 Step-by-Step 操作步骤

**场景：** 你要往卡牌数据库中添加一张新卡（例如 SD03-001）。

**前提准备：** 你需要一个文本编辑器。推荐使用 **VS Code**（免费下载：https://code.visualstudio.com/），因为它能高亮显示 JSON 格式，还能检查语法错误。

**操作步骤：**

1. **准备卡牌图片**
   - 将卡牌图片（PNG 格式）放入 `public/cards/` 目录
   - 图片命名规则：`{卡号}-{稀有度代码}.png`
   - 例如：`SD03-001-MR.png`

2. **打开 cards.json 文件**
   - 用 VS Code 打开 `public/cards.json`

3. **找到 cards 数组的末尾**
   - 在文件中搜索 `"cards"` 关键词，找到 `"cards": [`
   - 滚动到数组最后的 `]` 之前（即最后一张卡牌的 `}` 之后）

4. **添加新卡牌条目**
   - 在最后一张卡牌的 `}` 后面加一个逗号 `,`
   - 在逗号后换行，添加新的卡牌对象：

```json
{
  "id": "SD03-001-MR",
  "card_no": "SD03-001",
  "name": "「示例」角色名",
  "card_type": 1,
  "card_type_name": "角色卡",
  "cost": 3,
  "cost_name": "Lv3",
  "attribute": 1,
  "attribute_name": "科技",
  "attribute_color": "#E24B4A",
  "pp_value": 2,
  "dp_value": 4,
  "power": "2500",
  "signal_color": 1,
  "signal_color_text": "有信号色（与属性同色宝石）",
  "feature": "1,2",
  "feature_text": "人类/复仇者联盟",
  "effect": "触发【场上】：此卡号召进场时，抽1张牌。",
  "package": "SD03 集结",
  "package_short": "SD03",
  "rarity": 10,
  "rarity_code": "MR",
  "rarity_cn": "特秀",
  "rarity_color": "#D4537E",
  "image_url": "/cards/SD03-001-MR.png",
  "r": 1
}
```

5. **如果有多个稀有度版本，重复添加**
   - 同一张卡可能有多个稀有度版本（如 MR、UR、SEC）
   - 每个版本有独立的 `id` 和 `image_url`，但 `card_no` 相同
   - `rarity`、`rarity_code`、`rarity_cn`、`rarity_color` 对应不同稀有度

6. **更新 total_cards 和 total_variants**
   - `total_cards` = 不同 card_no 的数量（每张逻辑卡算1）
   - `total_variants` = cards 数组中的总条目数（每个稀有度版本算1）
   - 在文件开头修改这两个数字

7. **保存文件**
   - 按 `Ctrl + S` 保存
   - VS Code 底部如果显示红色错误标记，说明 JSON 格式有问题，需要修复

8. **验证**
   - 运行 `npm run dev`（在命令行中输入，详见第5章 FAQ Q12）
   - 打开浏览器访问 `http://localhost:5173`
   - 进入"卡牌"页面，搜索新卡牌名称，确认能找到

### 2.4 修改已有卡牌的注意事项

1. **只改不改结构：** 修改已有卡牌时，只改字段值（如 `power`、`effect`），不要增删字段
2. **保持 JSON 格式正确：** 字符串值必须用双引号 `""` 包裹，数字值不要加引号
3. **逗号规则：** JSON 对象的最后一个字段后面不要加逗号
4. **effect 字段修改不影响游戏逻辑：** `effect` 字段只是显示用的文本，实际游戏效果逻辑在 `sd01.ts` / `sd02.ts` 中实现。修改 `effect` 文本只是改变了玩家看到的描述，不会改变实际效果
5. **同名牌的所有版本都要改：** 如果修改某个 `card_no` 的属性（如 `power`），所有稀有度版本都要同步修改

### 2.5 图片资源放置规范

| 规则 | 说明 |
|------|------|
| **目录位置** | `public/cards/` |
| **格式** | PNG |
| **命名规则** | `{card_no}-{rarity_code}.png` |
| **命名示例** | `SD01-001-SEC.png`、`BP01-001-MR.png`、`SD02-019-R.png` |
| **image_url 字段** | 对应填 `/cards/SD01-001-SEC.png`（注意有前导斜杠 `/`） |

> **提示：** 如果图片文件不存在，网站会显示一个占位符（"图片缺失"）。确认图片文件名与 `image_url` 字段完全一致（区分大小写）。

---

## 第3章：如何撰写新卡效

### 3.1 卡效分类说明

卡牌效果分为 4 种类型。以下是通俗解释：

| 类型 | 中文名 | 通俗解释 | 例子 |
|------|--------|---------|------|
| **触发型** (trigger) | 自动触发 | 卡牌满足特定条件时**自动触发**，玩家不需要主动操作。比如"号召进场时抽1张牌" | SD01-005：号召进场时可撤退基地2张卡 |
| **起动型** (active) | 主动使用 | 玩家在行动阶段**主动选择使用**，就像按一个按钮来发动。可能有使用次数限制 | SD01-006：舍弃此卡，撤退多个目标 |
| **常驻型** (static) | 持续生效 | 只要卡牌在场上，效果就**一直生效**，不需要玩家操作 | SD01-004：敌方战斗阶段战力+X000 |
| **应对型** (counter) | 对方行动时可应对 | 当对方做出特定行动（如号召）时，你**可以选择应对**来干扰对方 | SD01-011：可应对对方号召 |

### 3.2 效果文本书写规范

撰写效果文本（即 `cards.json` 中的 `effect` 字段）时，请参考以下规范：

**格式模板：**
```
[效果类型]【[区域限制]/[次数限制]】：[触发条件描述]，[执行效果描述]。[追加效果描述（如有）]。
```

**书写规则：**

1. **效果类型** 用方括号标注：`触发`、`起动`、`常驻`、`应对`
2. **区域限制** 用方括号标注：`手牌`、`基地`、`场上`、`战区`、`先锋`、`后卫`
3. **次数限制** 用方括号标注：`回合1次`
4. **"可"字表示选发**：如果效果中包含"可"字，表示玩家可以选择是否执行该效果
5. **"如此做后"**：表示前一个动作完成后才能执行后续效果

**示例文本：**

```
触发【战区/回合1次】：此卡被结附时，若敌方战区存在Lv5或以上的角色，则可以
撤退此卡的所有结附卡。如此做后，裁剪敌方场上1张LvX或以下的角色，X为因此
效果撤退的结附卡Lv合计数。
```

```
起动【手牌】：舍弃此卡，撤退我方战区1张角色卡和我方基地1张盖卡。如此做后，
裁剪敌方战区1张Lv5或以下的角色。
```

```
常驻【手牌】：若双方场上均不存在Lv4或以上的角色，此卡Lv-2。
```

### 3.3 新卡效描述模板

当你需要为一张新卡设计效果时，请**填写以下模板**后交给开发人员实现：

---

#### 新卡效描述模板

**基本信息**
- 卡号：SD03-001
- 卡名：「XXX」角色名
- Lv：X
- 属性：X（科技/正义/自然/敏捷/通用）
- 特征：X（人类/复仇者联盟/...）
- 战力：XXXX
- R值：X

**效果文本（印刷用）**
```
触发【战区/回合1次】：XXXXX
```

**效果分类**（勾选一项）
- [ ] 触发型 (trigger) — 卡牌进场/撤退/攻击等时机自动触发
- [ ] 起动型 (active) — 玩家主动使用，来源区域：手牌 / 基地 / 场上
- [ ] 常驻型 (static) — 持续生效
- [ ] 应对型 (counter) — 对方行动时可应对，目标：号召 / 攻击

**触发时机**（触发型填写，勾选一项或多项）
- [ ] 号召进场 (onSummon) — 此卡因号召放置进场时
- [ ] 撤退时 (onRetreat) — 此卡进入撤退区时
- [ ] 攻击时 (onAttack) — 此卡在冲突阶段发起攻击时
- [ ] 被结附时 (onAttached) — 此卡被其他卡牌结附时
- [ ] 战力/R变化时 (onStatChange) — 我方角色战力或R值增加时
- [ ] 友方战败时 (onAllyDefeated) — 我方角色被击败撤退时
- [ ] 回合开始时 (onTurnStart) — 每个回合开始时
- [ ] 回合结束时 (onTurnEnd) — 每个回合结束时

**效果描述（给开发参考）**
1. **触发条件：** XXXXX（如"敌方战区存在Lv5或以上角色"）
2. **费用/代价：** XXXXX（如"舍弃1张手牌"；无费用则填"无"）
3. **执行效果：** XXXXX（如"敌方1张角色本回合战力-2000"）
4. **目标选择：** XXXXX（如"敌方战区1张Lv5以下角色"；无目标则填"无"）
5. **限制：** 回合1次 / 一次性 / 无限制
6. **是否选发：** 是（玩家可选择是否执行）/ 否（自动执行）
7. **执行后是否盖伏：** 是 / 否（仅起动型填写）

**关键词能力**（如有，勾选一项或多项）
- [ ] 连击 (combo) — 拥有第2次攻击机会
- [ ] 强袭 (assault) — 攻击战胜则追加破绽
- [ ] 空袭 (airRaid) — 可跨角色攻击破绽
- [ ] 拦截 (intercept) — 可变更攻击目标
- [ ] 唯一 (unique) — 同名牌不能共存
- [ ] 应对 (counter) — 可应对号召
- [ ] 无

**备注**
XXXXX（任何补充说明，如"此效果与 SD01-005 类似，但目标是基地而非战区"）

---

### 3.4 效果定义代码结构说明

> **注意：** 这部分仅供理解，项目经理不需要写代码。代码由开发在 `src/game/effects/sd01.ts` 或 `sd02.ts` 中实现。

一张卡的效果在代码中用一个**对象**（类似一个数据包）来定义。以下是每个字段的通俗解释：

| 字段名 | 通俗解释 | 是否必填 |
|--------|---------|---------|
| `id` | 效果的唯一编号，格式为 `{卡号}-{序号}`（如 `SD01-001-0`） | 是 |
| `cardNo` | 关联的卡牌编号（如 `SD01-001`） | 是 |
| `category` | 效果类型：`trigger`（触发）、`active`（起动）、`static`（常驻）、`counter`（应对） | 是 |
| `trigger` | 触发时机（仅触发型填写）：`onSummon`、`onRetreat`、`onAttack` 等 | 触发型必填 |
| `triggerCondition` | 触发条件函数：满足什么条件才会触发 | 否 |
| `activeSource` | 起动效果来源区域：`hand`（手牌）、`base`（基地）、`field`（场上） | 起动型必填 |
| `cost` | 费用检查函数：返回 true 表示可支付费用 | 否 |
| `condition` | 执行条件函数：返回 true 表示效果可以执行 | 否 |
| `execute` | 效果执行函数：实际做的事（如抽牌、撤退、修改战力等） | 是 |
| `staticModifier` | 常驻修改器函数：计算战力/R值的修改（仅常驻型） | 常驻型可能需要 |
| `targetSpec` | 目标选择规格：需要选几个目标、在什么区域选 | 否 |
| `once` | 是否回合1次：`true` 表示每回合只能用1次 | 否 |
| `label` | 显示名称（如"战力削弱"） | 否 |
| `isCounterActive` | 是否为应对·起动效果：`true` 表示这是在应对阶段使用的起动效果 | 否 |
| `isUnique` | 是否拥有【唯一】关键词：`true` 表示同名牌不能共存 | 否 |
| `keywords` | 常驻关键词能力列表（如 `["combo"]` 表示拥有连击） | 否 |
| `faceDownAfterActive` | 起动后是否盖伏此卡：`true` 表示执行后盖伏 | 否 |

### 3.5 常用辅助函数速查表

开发人员在实现卡效时会使用以下辅助函数。项目经理了解这些函数的用途有助于撰写更精确的效果描述。

#### helpers.ts — 效果辅助函数

| 函数名 | 通俗说明 |
|--------|---------|
| `drawCards` | 从卡组抽 N 张牌到手牌 |
| `retreatCard` | 将场上角色或基地卡移到撤退区 |
| `trimCard` | 裁剪（将场上角色直接移到撤退区，不经过战斗判定） |
| `attachCard` | 将手牌中的卡结附到场上角色身上 |
| `detachCard` | 解除结附（将结附卡从宿主移到基地） |
| `createModifier` | 创建修改器（临时改变某张卡的战力/R值/Lv） |
| `removeModifier` | 移除某张卡提供的所有修改器 |
| `moveToBase` | 将卡牌移到基地 |
| `summonFromRetreat` | 从撤退区号召卡牌到场上 |
| `discardFromHand` | 从手牌弃到虚空区（永久移除） |
| `discardFromHandToRetreat` | 从手牌弃到撤退区 |
| `deckTopToBase` | 将卡组顶1张盖放进基地 |
| `moveToDeckBottom` | 将卡牌放回卡组底 |
| `millDeck` | 舍弃卡组顶 N 张牌 |
| `shuffleDeck` | 洗混卡组 |
| `moveHandCardsToDeckBottom` | 将指定手牌放回卡组底 |

#### conditions.ts — 条件判断函数

| 函数名 | 通俗说明 |
|--------|---------|
| `hasFeature` | 检查卡牌是否拥有指定特征（如"人类"） |
| `hasAttribute` | 检查卡牌是否拥有指定属性（如"科技"） |
| `fieldCount` | 获取我方战区角色数量 |
| `opponentFieldCount` | 获取敌方战区角色数量 |
| `zoneCount` | 获取我方某区域角色数量 |
| `opponentZoneCount` | 获取敌方某区域角色数量 |
| `retreatCount` | 获取撤退区卡数（可按特征/属性/等级过滤） |
| `baseFaceDownCount` | 获取基地盖卡数量 |
| `getCardLevel` | 获取卡牌 Lv 等级 |
| `getCardBasePower` | 获取卡牌基础战力 |
| `getCardBaseR` | 获取卡牌基础 R 值 |
| `hasAttachment` | 检查卡牌是否有结附卡 |
| `getAttachmentIds` | 获取卡牌的结附卡列表 |
| `getOpponentFieldCardsWithMinLv` | 获取敌方战区所有 Lv ≥ N 的角色 |
| `getOpponentFieldCardsWithMaxLv` | 获取敌方战区所有 Lv ≤ N 的角色 |
| `getMyFieldCardsWithFeature` | 获取我方战区所有拥有指定特征的角色 |
| `getMyFieldCards` | 获取我方战区所有角色（不限特征） |
| `hasDuplicateName` | 检查我方场上是否已存在同名牌 |

### 3.6 完整示例

#### 示例1：简单的触发型效果

**场景：** 设计一张新卡「号召支援」，号召进场时抽1张牌。

**步骤1：填写效果描述模板**

```
卡号：SD03-001
卡名：「号召支援」美国队长
Lv：2
属性：2（正义）
特征：1,2（人类/复仇者联盟）
战力：2000
R值：1

效果文本（印刷用）：
触发【场上】：此卡因号召放置进场时，抽1张牌。

效果分类：触发型 (trigger)
触发时机：号召进场 (onSummon)
触发条件：无（总是触发）
费用/代价：无
执行效果：从卡组抽1张牌
目标选择：无
限制：无限制
是否选发：否（自动执行）
```

**步骤2：在 cards.json 中添加卡牌数据**（参见第2章操作步骤）

**步骤3：交给开发实现效果逻辑**

开发会在 `sd01.ts`（或新建 `sd03.ts`）中添加如下效果定义：

```typescript
const sd03_001: CardEffect = {
  id: "SD03-001-0",
  cardNo: "SD03-001",
  category: "trigger",
  trigger: "onSummon",
  label: "进场抽牌",
  execute: (ctx: EffectContext) => {
    // 调用辅助函数 drawCards 抽1张牌
    return H.drawCards(ctx.state, ctx.playerIdx, 1, ctx.db);
  },
};
```

#### 示例2：复杂的起动型效果

**场景：** 设计一张新卡「战术干扰」，舍弃1张手牌，敌方1张角色本回合战力-2000。

**步骤1：填写效果描述模板**

```
卡号：SD03-005
卡名：「战术干扰」黑寡妇
Lv：3
属性：1（科技）
特征：1,2（人类/复仇者联盟）
战力：2500
R值：1

效果文本（印刷用）：
起动【手牌/回合1次】：舍弃1张手牌，敌方战区1张角色本回合战力-2000。

效果分类：起动型 (active)
起动来源区域：手牌 (hand)
触发时机：不适用（起动型无触发时机）
费用/代价：舍弃1张手牌
执行效果：敌方1张角色本回合战力-2000
目标选择：敌方战区1张角色（不限等级）
限制：回合1次 (once: true)
是否选发：不适用（起动型由玩家主动选择是否使用）
执行后是否盖伏：否
```

**步骤2：在 cards.json 中添加卡牌数据**

**步骤3：交给开发实现效果逻辑**

```typescript
const sd03_005: CardEffect = {
  id: "SD03-005-0",
  cardNo: "SD03-005",
  category: "active",
  activeSource: "hand",
  once: true,                    // 回合1次
  label: "战力削弱",
  cost: (ctx: EffectContext): boolean => {
    // 费用检查：手牌中至少有2张牌（此卡 + 舍弃的1张）
    return ctx.state.players[ctx.playerIdx].hand.length >= 2;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    // 1. 舍弃1张手牌（自动选第一张非此卡的牌）
    const p = state.players[ctx.playerIdx];
    const discardTarget = p.hand.find((id) => id !== ctx.cardId);
    if (!discardTarget) return state;
    state = H.discardFromHandToRetreat(state, discardTarget, ctx.playerIdx);

    // 2. 降低敌方1张角色本回合战力-2000（自动选第一个目标）
    const targets = C.getOpponentFieldCardsWithMaxLv(state, ctx.playerIdx, ctx.db, 99);
    if (targets.length > 0) {
      state = H.createModifier(state, targets[0].id, "power", -2000, "turn", ctx.cardId);
    }
    return state;
  },
};
```

### 3.7 效果测试方法

新增卡效后，需要验证效果是否正常工作：

1. **构建验证：** 在命令行中运行 `npm run build`，确认 0 错误
2. **启动开发服务器：** 运行 `npm run dev`，在浏览器中打开 `http://localhost:5173`
3. **功能测试：**
   - 进入"对战"页面
   - 选择包含新卡的预组或自组卡组
   - 开始对战，在合适的时机触发新卡效果
   - 观察对战日志（页面右侧的日志区域）确认效果执行
4. **边界测试：**
   - 如果效果有条件限制，测试条件不满足时是否正确不触发
   - 如果效果有"回合1次"限制，测试同一回合是否能重复使用
   - 如果效果需要目标，测试没有合法目标时的表现

---

## 第4章：各功能板块编辑入口

### 4.1 导航栏配置

**文件位置：** `src/App.tsx`

**需要修改的位置：**

1. **Tab 标签名称**（约第16-26行）：
   ```typescript
   const TAB_LABELS: Record<Tab, string> = {
     welcome: "欢迎",     ← 修改引号内的文字即可改导航栏显示名称
     chat: "聊天",
     search: "卡牌",
     plaza: "卡组广场",
     deck: "组卡器",
     battle: "对战",
     help: "帮助",
     settings: "设置",
     about: "关于",
   };
   ```

2. **Tab 显示顺序**（约第28行）：
   ```typescript
   const TAB_ORDER: Tab[] = ["welcome", "chat", "search", "plaza", "deck", "battle", "help", "settings", "about"];
   ```
   调整数组中的顺序即可改变导航栏的标签排列顺序。

3. **网站标题**（约第253行）：
   ```tsx
   <span className="text-red-500">⚡</span>
   超英击战    ← 修改这里的文字即可改网站标题
   ```

### 4.2 帮助页内容编辑

**文件位置：** `src/pages/HelpPage.tsx`

**需要修改的位置：**

帮助页的内容定义在 `SECTIONS` 数组中（约第30行开始）。每个 section 是一个分区，包含多条 Q&A。

**修改现有 Q&A：** 找到对应的 `q`（问题）和 `a`（回答）字段，修改引号内的文字。

**新增 Q&A：** 在对应 section 的 `items` 数组中添加：
```typescript
{
  q: "新问题？",
  a: "新回答。",
},
```

**新增分区：** 在 `SECTIONS` 数组中添加新的 section 对象：
```typescript
{
  id: "newsection",
  title: "新分区标题",
  icon: "M...",  // SVG 路径图标（可从现有 section 复制）
  items: [
    { q: "问题1？", a: "回答1。" },
    { q: "问题2？", a: "回答2。" },
  ],
},
```

### 4.3 设置项编辑

**文件位置：** `src/pages/SettingsPage.tsx`

**需要修改的位置：**

1. **设置项定义**（约第14-27行）：`AppSettings` 接口定义了可用的设置项
2. **默认值**（约第29-36行）：`DEFAULT_SETTINGS` 对象定义了各设置项的默认值
3. **设置界面**（约第122行起）：各 `SettingsSection` 和 `ToggleRow` / `SelectRow` 组件构成设置界面

**修改设置项的标签文字：** 找到对应的 `ToggleRow` 或 `SelectRow` 组件，修改 `label` 和 `desc` 属性。

### 4.4 关于页内容编辑

**文件位置：** `src/pages/AboutPage.tsx`

**需要修改的位置：**

1. **版本号**（约第52行）：
   ```tsx
   <span className="text-xs text-[#8899aa]">Version 1.0.0</span>
   ```
   修改 `Version 1.0.0` 为新版本号。

2. **核心功能列表**（约第26-33行）：`FEATURES` 数组定义了功能列表
3. **技术栈信息**（约第13-19行）：`TECH_STACK` 数组定义了技术栈
4. **免责声明**（约第103-109行）：修改 `<p>` 标签内的文字
5. **页脚信息**（约第119-121行）：
   ```tsx
   <p>Made with ⚡ by 超英击战 TCG · 2025</p>
   ```

### 4.5 欢迎页内容编辑

**文件位置：** `src/pages/WelcomePage.tsx`

**需要修改的位置：**

1. **功能卡片列表**（约第23行起）：`FEATURES` 数组定义了首页展示的功能入口
2. **页面标题和描述**：在 JSX 中搜索相关文字直接修改

### 4.6 卡牌图片资源管理

**目录位置：** `public/cards/`

**操作方法：**
- 添加新图片：将 PNG 文件复制到 `public/cards/` 目录
- 替换图片：用新文件覆盖同名旧文件
- 删除图片：直接删除文件（确认对应的 `cards.json` 条目也删除了 `image_url`）

**命名规则：** `{card_no}-{rarity_code}.png`（如 `SD01-001-SEC.png`）

### 4.7 预组卡组配置

**文件位置：** `public/precon_sd01.json`、`public/precon_sd02.json`

**文件格式说明：**

```json
{
  "name": "SD01 英雄 预组",       ← 预组名称
  "card_type": 1,                 ← 卡组类型（1=主卡组，2=冲击卡组）
  "format": "standard",           ← 格式
  "cards": [                      ← 卡牌 ID 列表（50张角色卡）
    "SD01-001-SEC",
    "SD01-001-SEC",
    "SD01-001-SEC",
    ...
  ],
  "source": "预组 SD01"           ← 来源说明
}
```

**编辑方法：**
- `cards` 数组中的每个条目是卡牌的 `id`（即 `{卡号}-{稀有度代码}`）
- 同一张卡放3份就重复3次
- 主卡组必须有 50 张角色卡
- 冲击卡组需要单独的文件（如有需要，创建 `precon_sd01_rush.json`）

**新增预组卡组：**
1. 复制 `precon_sd01.json`，重命名为 `precon_sd03.json`
2. 修改 `name` 和 `source`
3. 修改 `cards` 数组为新预组的卡牌列表
4. 在 `BattlePage.tsx` 中注册新预组（需开发协助，约在文件搜索 `precon_sd01` 找到注册位置）

### 4.8 对战规则参数

部分对战规则参数硬编码在引擎代码中。如果需要调整，请提交需求给开发修改以下文件：

| 规则参数 | 代码位置 | 当前值 |
|---------|---------|--------|
| 起始手牌数 | `src/components/GameSetup.tsx` | 6 张 |
| 每回合抽牌数 | `src/game/engine.ts` 中 `handleDrawPhase` | 2 张 |
| 每回合号召上限 | `src/game/engine.ts` 中 `handleAdvancePhase` | 3 次（首回先攻 1 次） |
| 基地部署上限 | `src/game/engine.ts` | 每回合 1 次 |
| 基地容量上限 | `src/game/effects/helpers.ts` 中 `moveToBase` | 6 张 |
| 手牌上限 | `src/game/engine.ts` 中 `handleEndPhase` | 9 张 |
| 时间线满败北 | `src/game/engine.ts` 中 `checkGameOver` | 9 张 |
| 冲突阶段位置调整上限 | `src/game/engine.ts` | 4 次 |

---

## 第5章：常见操作 FAQ

### Q1：如何添加新卡包（如 SD03）？

**操作步骤：**

1. **准备卡牌数据：** 收集新卡包所有卡牌的信息（名称、战力、效果文本等）
2. **准备卡牌图片：** 将所有 PNG 图片放入 `public/cards/` 目录
3. **编辑 cards.json：**
   - 在 `"cards"` 数组末尾添加新卡牌条目（参见第2章）
   - 在 `"packages"` 数组中添加新卡包名称（如 `"SD03 集结"`）
   - 更新 `"total_cards"` 和 `"total_variants"` 数值
4. **创建预组文件：** 如果新卡包含预组，创建 `public/precon_sd03.json`
5. **交给开发实现卡效：** 填写第3章的"新卡效描述模板"，交给开发在新建的 `sd03.ts` 文件中实现效果逻辑
6. **构建验证：** 运行 `npm run build` 确认 0 错误
7. **测试：** 运行 `npm run dev`，在卡牌图鉴中搜索新卡，确认显示正确

### Q2：如何修改卡牌图片？

**操作步骤：**

1. 准备新的 PNG 图片文件
2. 用新文件覆盖 `public/cards/` 目录中的同名旧文件
3. 无需修改 `cards.json`（`image_url` 字段不变）
4. 刷新浏览器（或重新运行 `npm run dev`）即可看到新图片

> **注意：** 文件名必须与 `cards.json` 中的 `image_url` 字段一致。`image_url` 为 `/cards/SD01-001-SEC.png`，则文件名为 `SD01-001-SEC.png`。

### Q3：如何调整对战规则参数？

对战规则参数硬编码在引擎代码中（`src/game/engine.ts`），建议提交需求给开发修改。

**常见可调整参数：**
- 起始手牌数 → 修改 `GameSetup.tsx` 中的抽牌数量
- 每回合号召上限 → 修改 `engine.ts` 中 `remainingSummons` 的初始值
- 基地容量 → 修改 `helpers.ts` 中 `moveToBase` 的 `>= 6` 判断
- 时间线满败北 → 修改 `engine.ts` 中 `checkGameOver` 的 `>= 9` 判断

### Q4：如何修改导航栏标签名称？

**操作步骤：**

1. 用 VS Code 打开 `src/App.tsx`
2. 找到约第16行的 `TAB_LABELS` 配置
3. 修改对应键值对的值（引号内的文字）：
   ```typescript
   const TAB_LABELS: Record<Tab, string> = {
     welcome: "首页",      ← 将"欢迎"改为"首页"
     ...
   };
   ```
4. 保存文件，刷新浏览器

### Q5：如何添加新的页面/功能板块？

添加新页面需要开发协助。基本步骤：

1. 在 `src/pages/` 目录下新建页面组件文件（如 `NewPage.tsx`）
2. 在 `src/App.tsx` 中：
   - 导入新页面组件
   - 在 `Tab` 类型中添加新 Tab
   - 在 `TAB_LABELS` 中添加标签名称
   - 在 `TAB_ORDER` 中添加到排序数组
   - 在 `main` 区域的条件渲染中添加新页面分支
3. 构建验证

### Q6：卡牌数据修改后不生效怎么办？

**排查步骤：**

1. **确认保存了文件：** 检查 `cards.json` 是否已保存（VS Code 标题栏不应显示圆点）
2. **确认 JSON 格式正确：** VS Code 底部不应有红色错误标记
3. **清除浏览器缓存：** 按 `Ctrl + Shift + R` 强制刷新（硬刷新）
4. **确认修改了正确的文件：** 项目可能有多个 `cards.json` 副本，确认修改的是 `public/cards.json`
5. **重启开发服务器：** 在命令行中按 `Ctrl + C` 停止 `npm run dev`，然后重新运行

### Q7：如何修改帮助页的内容？

**操作步骤：**

1. 用 VS Code 打开 `src/pages/HelpPage.tsx`
2. 找到约第30行的 `SECTIONS` 数组
3. 修改 `q`（问题）和 `a`（回答）字段中的文字
4. 保存文件，刷新浏览器

详细操作参见第4章 4.2 节。

### Q8：如何添加新的预组卡组？

**操作步骤：**

1. 复制 `public/precon_sd01.json`，重命名为 `precon_sd03.json`
2. 修改 `name` 为新预组名称
3. 修改 `cards` 数组为新预组的 50 张卡牌 ID 列表
4. 交给开发在 `BattlePage.tsx` 中注册新预组文件

详细操作参见第4章 4.7 节。

### Q9：新增卡效后如何测试？

**操作步骤：**

1. 确保开发已完成卡效代码实现
2. 运行 `npm run build` 确认 0 错误
3. 运行 `npm run dev` 启动开发服务器
4. 进入"对战"页面
5. 选择包含新卡的卡组
6. 开始对战，在合适的时机触发新卡效果
7. 观察对战日志确认效果执行正确
8. 测试边界情况（条件不满足、重复使用等）

详细操作参见第3章 3.7 节。

### Q10：构建报错了怎么办？

**操作步骤：**

1. **查看报错信息：** 在命令行中仔细阅读报错信息，通常会指出哪个文件、哪一行有问题
2. **常见错误类型：**
   - **JSON 格式错误：** 多了/少了逗号、引号不匹配 → 检查 `cards.json`
   - **TypeScript 类型错误：** 通常是代码问题 → 交给开发处理
   - **找不到文件：** 检查文件路径是否正确
3. **如果不确定原因：** 将报错信息截图发给开发

> **注意：** 如果是修改 `cards.json` 后报错，99% 是 JSON 格式问题。可以用在线 JSON 校验工具（如 https://jsonlint.com/）检查格式。

### Q11：如何发布更新（部署到服务器）？

**操作步骤：**

1. **构建生产版本：** 在命令行中运行 `npm run build`
2. **确认构建成功：** 命令行显示构建完成，`dist/` 目录生成
3. **部署：** 将 `dist/` 目录中的所有文件上传到 Web 服务器
4. **验证：** 访问网站确认更新生效

> **注意：** 具体部署方式取决于服务器环境。建议交给开发或运维人员操作。

### Q12：JSON 格式错误怎么排查？

**常见 JSON 格式错误：**

| 错误 | 说明 | 修复方法 |
|------|------|---------|
| 多了逗号 | 最后一个字段后面多了逗号 | 删除多余的逗号 |
| 少了逗号 | 字段之间缺少逗号 | 添加逗号 |
| 引号不匹配 | 字符串值只用了一个引号或用了单引号 | 确保用双引号 `""` 包裹 |
| 括号不匹配 | `{}` 或 `[]` 不配对 | 检查括号配对 |
| 多余字符 | 不该有的字符混入 | 删除多余字符 |

**排查方法：**

1. **用 VS Code 打开：** VS Code 会自动高亮 JSON 格式错误
2. **用在线工具校验：** 将 JSON 内容粘贴到 https://jsonlint.com/，点击校验
3. **二分法排查：** 如果文件很大，删除一半内容看是否报错，逐步缩小范围

---

## 附录

### 附录A：规则书关键词对照表

| 中文名 | 英文名 | 代码中的关键词名 | 说明 |
|--------|--------|-----------------|------|
| 连击 | Combo | `combo` | 拥有第2次攻击机会 |
| 强袭 | Assault | `assault` | 攻击战胜则追加破绽 |
| 空袭 | Air Raid | `airRaid` | 可跨角色攻击破绽 |
| 拦截 | Intercept | `intercept` | 可变更攻击目标 |
| 唯一 | Unique | `unique` | 同名牌不能共存 |
| 应对 | Counter | `counter` | 可应对号召 |
| 不因相杀撤退 | Anti Mutual Kill | `antiMutualKill` | 平局时不撤退 |

### 附录B：效果触发时机一览表

| 触发时机 | 代码名 | 说明 | 典型场景 |
|---------|--------|------|---------|
| 号召进场 | `onSummon` | 此卡因号召放置进场时 | 进场触发的效果 |
| 撤退时 | `onRetreat` | 此卡进入撤退区时 | 撤退时的回收效果 |
| 攻击时 | `onAttack` | 此卡在冲突阶段发起攻击时 | 攻击时的增益效果 |
| 被结附时 | `onAttached` | 此卡被其他卡牌结附时 | 结附触发的效果 |
| 战力/R变化时 | `onStatChange` | 我方角色战力或R值增加时 | 属性变化触发的连锁效果 |
| 友方战败时 | `onAllyDefeated` | 我方角色被击败撤退时 | 友方战败时的触发效果 |
| 回合开始时 | `onTurnStart` | 每个回合开始时 | 回合开始时的效果 |
| 回合结束时 | `onTurnEnd` | 每个回合结束时 | 回合结束时的效果 |

### 附录C：属性/特征/卡牌类型速查表

#### 属性速查表

| 数值 | 中文名 | 英文名 | 颜色代码 | 颜色描述 |
|------|--------|--------|---------|---------|
| 1 | 科技 | Tech | `#E24B4A` | 红色 |
| 2 | 正义 | Justice | `#378ADD` | 蓝色 |
| 3 | 自然 | Nature | `#7F77DD` | 紫色 |
| 4 | 敏捷 | Agility | `#639922` | 绿色 |
| 7 | 通用 | Neutral | `#888780` | 灰色 |

#### 特征速查表

| 数值 | 中文名 |
|------|--------|
| 1 | 人类 |
| 2 | 复仇者联盟 |
| 3 | 机械 |
| 4 | 阿斯加德 |
| 5 | 瓦坎达 |
| 6 | 费恩拉 |
| 7 | 神盾局 |
| 8 | 变种人 |
| 9 | 九头蛇 |
| 10 | 时间犯 |
| 11 | 神奇四侠 |
| 12 | 捍卫者联盟 |
| 13 | 亚特兰蒂斯 |

#### 卡牌类型速查表

| 数值 | 中文名 | 说明 |
|------|--------|------|
| 1 | 角色卡 | 放入主卡组（50张），有战力值 |
| 2 | 冲击卡 | 放入冲击卡组（9张），通常无战力值 |

#### 稀有度速查表

| 数值 | 代码 | 中文名 |
|------|------|--------|
| 4 | U | 优通 |
| 5 | R | 普通 |
| 7 | SR | 罕通 |
| 8 | GR | 金稀 |
| 9 | UR | 超稀 |
| 10 | MR | 特秀 |
| 11 | SEC | 秘稀 |

### 附录D：项目文件索引

| 文件 | 路径 | 用途 |
|------|------|------|
| 卡牌数据库 | `public/cards.json` | 所有卡牌的数据 |
| SD01 预组 | `public/precon_sd01.json` | SD01 预组卡组 |
| SD02 预组 | `public/precon_sd02.json` | SD02 预组卡组 |
| 卡牌图片 | `public/cards/` | 卡牌图片文件夹 |
| 导航配置 | `src/App.tsx` | 导航栏标签和顺序 |
| 欢迎页 | `src/pages/WelcomePage.tsx` | 首页内容 |
| 帮助页 | `src/pages/HelpPage.tsx` | 帮助 Q&A |
| 设置页 | `src/pages/SettingsPage.tsx` | 设置项 |
| 关于页 | `src/pages/AboutPage.tsx` | 关于页内容 |
| SD01 卡效 | `src/game/effects/sd01.ts` | SD01 效果逻辑（开发维护） |
| SD02 卡效 | `src/game/effects/sd02.ts` | SD02 效果逻辑（开发维护） |
| 游戏引擎 | `src/game/engine.ts` | 对战核心逻辑（开发维护） |
| 效果辅助函数 | `src/game/effects/helpers.ts` | 效果原子操作函数 |
| 条件判断函数 | `src/game/effects/conditions.ts` | 效果条件判断函数 |
| 效果注册表 | `src/game/effects/registry.ts` | 效果注册和查询 |
| 卡牌类型定义 | `src/types/card.ts` | Card 接口定义 |
| 游戏状态定义 | `src/types/game.ts` | BattleState 接口定义 |
| 效果类型定义 | `src/game/effects/types.ts` | CardEffect 接口定义 |

---

> **文档维护说明：** 本文档随项目版本更新。如有疑问或发现文档与实际代码不一致，请联系开发人员更新。
