# Hero-Rush V2 对战框架完成性审计

审计日期：2026-08-28
规则基线：《超英击战》1.02
结构基线：GrandUMI 服务端权威状态机
审计范围：M0-M6 框架能力、自动化证据和切换门禁；不把 290 张效果卡迁移或生产灰度执行计入“框架完成”。

## 审计结论

V2 框架要求已闭环。生产发布仍被完整卡池门禁阻断，属于预期 No-Go；不得据此启用线上 V2、替换 `/battle` 或删除旧联机路径。

## 逐项证据

| 里程碑 | 必需结果 | 权威证据 | 判定 |
|---|---|---|---|
| M0 | 全状态单一允许命令表；非法流程不改状态 | `commandPolicy.ts` 同时供 kernel 与 projection 使用；`m2-action.test.ts` 覆盖交互状态、自动状态和反向命令 | 通过 |
| M1 | 确定性开局、两座位先攻、0-6 调度、私有视图、重连、同日志同哈希 | `m1.test.ts`、`match-room-v2.test.ts`、`v2-websocket.test.ts` | 通过 |
| M2 | 行动、精确 Lv 支付、战基移动及 1.02 边界；服务器构筑复核 | `m2-action.test.ts`、`deck-validation-v2.test.ts` | 通过 |
| M3 | 六节点距离；目标撤退/移出射程、攻击者撤退/R0 和重选；优先权；所有外部战斗稳定点可恢复 | `m3-battle.test.ts` 覆盖全部目标失效分支及 BATTLE_TARGET JSON 恢复；`match-room-v2.test.ts` 实测 BATTLE_ADJUST、BATTLE_ATTACK、BATTLE_RESPONSE、TURN_RESPONSE 恢复后的私有视图与 availableActions | 通过 |
| M4 | 301.41、304.1、304.2；原子操作、状态检查、排序/选发/嵌套、持续期、结附和多阶段回放 | `m4-effects.test.ts`；所有决策状态 JSON 往返保持 stateHash，目标决策、排序和选发仅向决策者投影 | 通过 |
| M5 | 只有规则引用、效果 ID、测试证据齐全的卡号可用；服务端拒绝未完成效果卡 | `implementations.v2.json`、`coverage.ts`、`report_v2_card_coverage.mjs`、服务端卡组准入测试 | 机制通过；内容 0/290，生产 No-Go |
| M6 | 双客户端、重连、回放、构建/浏览器冒烟、切换与无数据回滚门禁 | 全量测试、生产构建、浏览器私人房冒烟、`check_v2_switch_gate.mjs`、`V2_ROLLOUT_RUNBOOK.md` | 框架门禁通过；生产灰度未授权 |

## 跨里程碑发布不变量

- 客户端不能指定流程推进或伪造 actor；服务端按连接座位补充身份。
- 权威状态及所有 PendingDecision/ResponseWindow 可 JSON 持久化；往返后 stateHash 不变。
- 对手手牌、牌库顺序、盖卡内容、随机状态和非本人决策候选不进入私有投影。
- journal 成功后才提交内存状态；失败返回稳定错误且允许重试。
- 生产 V2 开启必须同时启用完整卡池门禁；当前 0/290，因此 release gate 必须失败。
- 仓库默认关闭前后端 V2 开关；回滚只切换路由/版本并保留 V2 journal。

## 复核命令

```powershell
npm run gate:v2
npm run gate:v2:release
```

第一条必须通过；第二条在卡池 0/290 时必须只因完整卡池缺失而失败。
