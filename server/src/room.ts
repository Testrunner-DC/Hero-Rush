/**
 * 房间管理与匹配队列
 *
 * 匹配：FIFO 队列，凑满两人即开房。
 * 房间：持有两个 WebSocket 连接，为每个 action 盖顺序号后广播双端。
 */

import { WebSocket } from "ws";
import type { ServerMessage } from "./protocol.js";

// ============================================================
// 房间状态
// ============================================================

export interface PlayerSlot {
  ws: WebSocket;
  name: string;
  deck: string[];
  rushDeck: string[];
}

export interface Room {
  id: string;
  players: [PlayerSlot, PlayerSlot];
  /** 动作序号（每收到一个游戏动作递增，双端共享） */
  seq: number;
  /** 对局是否已结束（掉线/手动退出后标记，停止转发） */
  closed: boolean;
}

// ============================================================
// 匹配队列（单例）
// ============================================================

interface QueueEntry {
  ws: WebSocket;
  name: string;
  deck: string[];
  rushDeck: string[];
  joinedAt: number;
}

const queue: QueueEntry[] = [];
const rooms = new Map<string, Room>();
let roomCounter = 0;

// ============================================================
// 队列管理
// ============================================================

/**
 * 加入匹配队列。若已有等待中的对手，立即配对并返回房间号。
 * 否则进入等待队列，通知其当前排位。
 */
export function joinQueue(
  ws: WebSocket,
  name: string,
  deck: string[],
  rushDeck: string[]
): string | null {
  // 查找可配对的对手（跳过已断连的）
  const idx = queue.findIndex((e) => e.ws.readyState === WebSocket.OPEN);
  if (idx >= 0) {
    const opponent = queue.splice(idx, 1)[0];
    return createRoom(opponent, { ws, name, deck, rushDeck, joinedAt: Date.now() });
  }

  queue.push({ ws, name, deck, rushDeck, joinedAt: Date.now() });
  send(ws, { type: "QUEUE_STATUS", position: queue.length });
  return null;
}

/**
 * 从匹配队列中移除
 */
export function leaveQueue(ws: WebSocket): void {
  const idx = queue.findIndex((e) => e.ws === ws);
  if (idx >= 0) queue.splice(idx, 1);
}

// ============================================================
// 房间管理
// ============================================================

function createRoom(p1: QueueEntry, p2: QueueEntry): string {
  const roomId = `room-${++roomCounter}`;
  const room: Room = {
    id: roomId,
    players: [
      { ws: p1.ws, name: p1.name, deck: p1.deck, rushDeck: p1.rushDeck },
      { ws: p2.ws, name: p2.name, deck: p2.deck, rushDeck: p2.rushDeck },
    ],
    seq: 0,
    closed: false,
  };
  rooms.set(roomId, room);

  // 通知双方配对成功
  send(p1.ws, { type: "MATCHED", roomId, playerIndex: 0, opponentName: p2.name });
  send(p2.ws, { type: "MATCHED", roomId, playerIndex: 1, opponentName: p1.name });

  // 发送 GAME_START（每人拿到自己的卡组和对家信息）
  send(p1.ws, { type: "GAME_START", deck: p1.deck, rushDeck: p1.rushDeck, opponentName: p2.name });
  send(p2.ws, { type: "GAME_START", deck: p2.deck, rushDeck: p2.rushDeck, opponentName: p1.name });

  return roomId;
}

/**
 * 处理游戏动作：盖序号后广播给房间内双端
 *
 * @returns true 表示转发成功，false 表示房间已关闭
 */
export function relayAction(
  ws: WebSocket,
  action: unknown
): boolean {
  for (const room of rooms.values()) {
    if (room.closed) continue;
    const playerIdx = room.players.findIndex((p) => p.ws === ws);
    if (playerIdx < 0) continue;

    const seq = ++room.seq;
    const msg: ServerMessage = { type: "GAME_ACTION", seq, playerIdx, action };
    broadcast(room, msg);
    return true;
  }
  return false;
}

/**
 * 处理玩家断连：通知房间内对家，标记房间关闭
 */
export function handleDisconnect(ws: WebSocket): void {
  // 从队列移除
  leaveQueue(ws);

  // 从房间移除
  for (const room of rooms.values()) {
    if (room.closed) continue;
    const playerIdx = room.players.findIndex((p) => p.ws === ws);
    if (playerIdx < 0) continue;

    room.closed = true;
    const other = room.players[1 - playerIdx];
    if (other.ws.readyState === WebSocket.OPEN) {
      send(other.ws, { type: "OPPONENT_DISCONNECTED" });
    }
    rooms.delete(room.id);
    return;
  }
}

// ============================================================
// 辅助
// ============================================================

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMessage): void {
  for (const p of room.players) {
    send(p.ws, msg);
  }
}
