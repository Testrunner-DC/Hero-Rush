/**
 * 联机对战协议 —— 客户端↔服务端消息类型
 */

// ============================================================
// 客户端 → 服务端
// ============================================================

/** 客户端发往服务端的消息 */
export type ClientMessage =
  | { type: "JOIN_QUEUE"; playerName: string; deck: string[]; rushDeck: string[] }
  | { type: "LEAVE_QUEUE" }
  | { type: "GAME_ACTION"; action: unknown }
  | { type: "PING" };

// ============================================================
// 服务端 → 客户端
// ============================================================

/** 服务端发往客户端的消息 */
export type ServerMessage =
  | { type: "QUEUE_STATUS"; position: number }
  | { type: "MATCHED"; roomId: string; playerIndex: 0 | 1; opponentName: string }
  | { type: "GAME_START"; deck: string[]; rushDeck: string[]; opponentName: string }
  | { type: "GAME_ACTION"; seq: number; playerIdx: number; action: unknown }
  | { type: "OPPONENT_DISCONNECTED" }
  | { type: "ERROR"; message: string }
  | { type: "PONG" };
