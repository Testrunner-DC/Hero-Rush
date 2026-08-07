# 权威联机对战架构

## 目标

联机对战采用服务器权威模型。浏览器只提交游戏意图，服务端负责身份、顺序、规则验证、随机数、状态推进、隐藏信息和结果持久化。

## 模块边界

```text
浏览器
  └─ @hero-rush/protocol：运行时协议校验
       └─ WebSocket 网关：身份、限流、心跳
            └─ MatchCoordinator：快速匹配、私人房间、恢复路由
                 └─ MatchRoom：单房间串行命令队列
                      ├─ @hero-rush/game-core：确定性规则引擎
                      ├─ projectState：席位专属隐藏视图
                      └─ MatchStore：事件与快照持久化
```

## 安全边界

- `playerIdx` 不从客户端接收，始终由连接会话补充。
- 客户端动作必须通过 Zod 协议校验和房间规则授权。
- 对手手牌、双方牌库顺序、对手盖牌、随机数状态不会下发。
- 排位模式只允许通过 Supabase JWT 验证的账号加入。
- 对局结果只允许服务端 Service Role 写入。
- `commandId` 防重复，`expectedSeq` 防止旧状态命令覆盖新状态。

## 确定性与回放

- 每张实体卡拥有对局内唯一 `CardInstanceId`，并映射到目录 `CardDefinitionId`。
- 所有随机操作使用可序列化的 xorshift32 状态，不在权威路径调用 `Math.random()`。
- 对局固定 `rulesetVersion`、`cardDataVersion`、`engineVersion`。
- `match_events` 保存已验证命令，`match_snapshots` 保存完整状态；回放从快照加后续事件恢复。

## 断线恢复

- 房间不会因 WebSocket 断开立即销毁。
- 默认保留席位 90 秒，认证用户按用户 ID 恢复；游客使用服务端签发的高熵恢复令牌。
- 恢复时服务端发送当前完整席位视图与最新 `seq`，旧连接会被替换。

## 扩展策略

当前单进程由内存协调器维护在线房间，持久数据写 PostgreSQL。横向扩展时再引入 Redis，用于匹配队列、在线状态和房间路由；PostgreSQL 仍是对局历史的长期事实来源。
