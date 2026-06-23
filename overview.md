# 超英击战 Marvel TCG — 增量交付概述

## TL;DR

补全游戏引擎核心流程（开局调度/应对阶段/关键词能力/起动效果），逐张修正 SD01+SD02 全部 38 张卡效，创建面向非技术项目经理的编辑指南文档。构建 0 错误，31 项测试全部通过。

## 交付概览

| 维度 | 状态 |
|------|------|
| 交付状态 | ✅ 完成 |
| 构建验证 | ✅ 0 错误 (56 modules, 1.18s) |
| 测试通过率 | ✅ 31/31 (100%) |
| 已知问题数 | 0 |

## SOP 工作流执行

| 阶段 | 成员 | 产出 | 状态 |
|------|------|------|------|
| 产品经理 | 许清楚 | `docs/incremental_prd.md` — 逐张核对 38 张卡，6 类共性问题，8 个待确认问题 | ✅ |
| 架构师 | 高见远 | `docs/incremental_design.md` — 8 字段/7 Action/3 CardEffect 字段设计，6 个时序图，5 个任务分解 | ✅ |
| 工程师 | 寇豆码 | T01-T05 全部代码实现（13 文件修改 + 4 文件新建），IS_PASS: YES | ✅ |
| QA | 严过关 | 31 项测试用例，100% 通过，路由判定: NoOne | ✅ |

## 文件清单

### 新建文件
| 文件路径 | 说明 |
|---------|------|
| `docs/EDITOR_GUIDE.md` (1096行) | 面向非技术项目经理的编辑指南 |
| `docs/incremental_prd.md` | 增量 PRD |
| `docs/incremental_design.md` | 增量架构设计 |
| `docs/sequence-diagram-incremental.mermaid` | 3 个关键流程时序图 |
| `docs/class-diagram-incremental.mermaid` | 增量类图 |
| `src/game/__tests__/engine.test.ts` | 31 项引擎测试用例 |

### 修改文件
| 文件路径 | 修改内容 |
|---------|---------|
| `src/types/game.ts` | BattleState +8 可选字段, SetupPhase 扩展为 6 值 |
| `src/game/types.ts` | GameAction +7 新类型 |
| `src/game/effects/types.ts` | CardEffect +3 可选字段 (isCounterActive, isUnique, keywords) |
| `src/game/engine.ts` | +7 新 handler, 修改 5 个现有 handler |
| `src/game/cardUtils.ts` | +hasKeyword 函数 |
| `src/game/effects/helpers.ts` | +shuffleDeck, +moveHandCardsToDeckBottom, retreatCard 清除 temporaryAbilities |
| `src/game/effects/conditions.ts` | +getMyFieldCards, +hasDuplicateName |
| `src/game/effects/registry.ts` | +getActiveEffects, +getCounterActiveEffects |
| `src/game/effects/index.ts` | 导出新函数 |
| `src/game/effects/sd01.ts` | 19 张卡逐张修正 (once, isCounterActive, keywords, condition, 确定性ID) |
| `src/game/effects/sd02.ts` | 19 张卡逐张修正 (isUnique, once, faceDownAfterActive, temporaryAbilities) |
| `src/components/GameSetup.tsx` | Mulligan 选牌放回卡组底 + 洗混 + 初始化新字段 |
| `src/pages/BattlePage.tsx` | 应对窗口 UI + 起动效果按钮 + 连击/强袭提示 |
| `package.json` | 添加 vitest 测试框架 |

## 引擎补全内容

1. **开局调度**：洗混→决先后手→抽 6 张→选牌放回卡组底→抽等量→洗混→先攻先行→后攻再行
2. **应对阶段**：号召后开启应对窗口→双方轮流（触发应对/应对·起动/不行动）→连续 2 次不行动关闭窗口
3. **关键词能力**：连击(2次攻击)、强袭(战胜→破绽伤害)、空袭(跨角色攻击破绽)、拦截(变更攻击目标)、唯一(同名牌不可共存)、应对(手牌可应对号召)
4. **起动效果**：验证活跃玩家+ACTION 阶段→查注册表→检查 activeSource/once/condition/cost→执行→faceDownAfterActive→标记已使用

## 用户下一步建议

1. **阅读编辑指南**：打开 `docs/EDITOR_GUIDE.md`，从第 1 章开始了解项目结构
2. **启动开发服务器**：`cd marvel-tcg && npm run dev`，在浏览器中测试新功能
3. **运行测试**：`npm test` 验证引擎功能
4. **构建部署**：`npm run build` 生成 dist/ 目录用于部署
5. **待确认问题**：参考 PRD 第 6 节的 8 个待确认问题（Q1-Q8），与规则团队确认后可进一步优化实现
