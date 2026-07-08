/**
 * 超英击战联机对战中继服务器
 *
 * 纯消息中继（Lockstep 模式）：
 * - 不跑游戏逻辑，只做有序转发
 * - 服务器给每个 GameAction 盖递增序号后广播房间内双端
 * - 两端各自跑同一 reducer 保持一致
 *
 * 已知局限：中继方案下对手可透视手牌（action 透传），防作弊需后续权威服务器升级。
 */

import { WebSocketServer, type WebSocket } from "ws";
import { joinQueue, leaveQueue, relayAction, handleDisconnect } from "./room.js";
import type { ClientMessage } from "./protocol.js";

const PORT = parseInt(process.env.PORT ?? "8081", 10);
const HEARTBEAT_INTERVAL = 30_000; // 30s ping
const HEARTBEAT_TIMEOUT = 90_000;  // 90s 无响应视为断连

const wss = new WebSocketServer({ port: PORT });
const aliveSet = new Set<WebSocket>();

console.log(`[Hero-Rush Server] Listening on port ${PORT}`);

wss.on("connection", (ws) => {
  let clientId = `unknown`;

  // ── 心跳 ──
  aliveSet.add(ws);
  ws.on("pong", () => { aliveSet.add(ws); });

  // ── 消息 ──
  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendError(ws, "无效的 JSON 消息");
      return;
    }

    switch (msg.type) {
      case "JOIN_QUEUE":
        clientId = msg.playerName;
        console.log(`[${clientId}] 加入排队 (main:${msg.deck.length} rush:${msg.rushDeck.length})`);
        joinQueue(ws, msg.playerName, msg.deck, msg.rushDeck);
        break;

      case "LEAVE_QUEUE":
        console.log(`[${clientId}] 离开排队`);
        leaveQueue(ws);
        break;

      case "GAME_ACTION":
        relayAction(ws, msg.action);
        break;

      case "PING":
        sendJson(ws, { type: "PONG" });
        break;

      default:
        sendError(ws, `未知消息类型: ${(msg as { type: string }).type}`);
    }
  });

  // ── 断连 ──
  ws.on("close", () => {
    aliveSet.delete(ws);
    console.log(`[${clientId}] 断开连接`);
    handleDisconnect(ws);
  });

  ws.on("error", (err) => {
    console.error(`[${clientId}] 错误:`, err.message);
  });
});

// ── 心跳探测（每 30s 一轮） ──
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!aliveSet.has(ws)) {
      console.log("[Heartbeat] 探测到无响应连接，断开");
      handleDisconnect(ws);
      ws.terminate();
      return;
    }
    aliveSet.delete(ws);
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on("close", () => clearInterval(heartbeatTimer));

// ── 辅助 ──

function sendJson(ws: import("ws").WebSocket, data: unknown): void {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(data));
}

function sendError(ws: import("ws").WebSocket, message: string): void {
  sendJson(ws, { type: "ERROR", message });
}
