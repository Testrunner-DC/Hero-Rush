/**
 * 共享协议类型 —— 客户端与服务端共用的 WebSocket 消息定义
 *
 * 服务端：server/src/protocol.ts（本地副本，与本文件保持同步）
 * 客户端：从此文件 import
 */

// ============================================================
// 客户端 → 服务端
// ============================================================

export type ClientMessage =
  | { type: "JOIN_QUEUE"; playerName: string; deck: string[]; rushDeck: string[] }
  | { type: "LEAVE_QUEUE" }
  | { type: "GAME_ACTION"; action: unknown }
  | { type: "PING" };

// ============================================================
// 服务端 → 客户端
// ============================================================

export type ServerMessage =
  | { type: "QUEUE_STATUS"; position: number }
  | { type: "MATCHED"; roomId: string; playerIndex: 0 | 1; opponentName: string }
  | { type: "GAME_START"; deck: string[]; rushDeck: string[]; opponentName: string }
  | { type: "GAME_ACTION"; seq: number; playerIdx: number; action: unknown }
  | { type: "OPPONENT_DISCONNECTED" }
  | { type: "ERROR"; message: string }
  | { type: "PONG" };
