import { randomBytes, randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { CardDatabase } from "@hero-rush/game-core";
import type { ClientMessage, DeckSelection, ServerMessage } from "@hero-rush/protocol";
import type { ClientSession, MatchParticipant } from "../types.js";
import type { MatchStore } from "../store/matchStore.js";
import { MatchRoom } from "../game/MatchRoom.js";

interface WaitingEntry {
  session: ClientSession;
  name: string;
  deck: string[];
  rushDeck: string[];
  mode: "casual" | "ranked";
}

interface PrivateRoomEntry extends Omit<WaitingEntry, "mode"> {
  code: string;
}

export class MatchCoordinator {
  private readonly catalog: CardDatabase;
  private readonly store: MatchStore;
  private readonly disconnectGraceMs: number;
  private readonly queue: WaitingEntry[] = [];
  private readonly privateRooms = new Map<string, PrivateRoomEntry>();
  private readonly matches = new Map<string, MatchRoom>();
  private readonly matchSessions = new Map<string, Set<ClientSession>>();

  constructor(options: { catalog: CardDatabase; store: MatchStore; disconnectGraceMs?: number }) {
    this.catalog = options.catalog;
    this.store = options.store;
    this.disconnectGraceMs = options.disconnectGraceMs ?? 90_000;
  }

  handleMessage(session: ClientSession, message: Exclude<ClientMessage, { type: "HELLO" | "PING" }>): void {
    switch (message.type) {
      case "QUEUE_JOIN":
        this.joinQueue(session, message);
        return;
      case "QUEUE_LEAVE":
        this.removeWaiting(session);
        return;
      case "PRIVATE_ROOM_CREATE":
        this.createPrivateRoom(session, message);
        return;
      case "PRIVATE_ROOM_JOIN":
        this.joinPrivateRoom(session, message);
        return;
      case "GAME_COMMAND": {
        const room = this.matches.get(message.matchId);
        if (!room || session.seat === undefined || session.matchId !== message.matchId) {
          this.send(session.ws, { type: "ERROR", code: "MATCH_NOT_FOUND", message: "未找到当前对局", requestId: message.requestId });
          return;
        }
        room.enqueueCommand(session.seat, message);
        return;
      }
      case "RESUME_MATCH":
        this.resumeMatch(session, message.matchId, message.requestId);
        return;
      case "SURRENDER": {
        const room = this.matches.get(message.matchId);
        if (!room || session.seat === undefined || session.matchId !== message.matchId) {
          this.send(session.ws, { type: "ERROR", code: "MATCH_NOT_FOUND", message: "未找到当前对局", requestId: message.requestId });
          return;
        }
        room.surrender(session.seat);
        return;
      }
    }
  }

  disconnect(session: ClientSession): void {
    this.removeWaiting(session);
    if (session.matchId && session.seat !== undefined) {
      this.matches.get(session.matchId)?.disconnect(session.seat, session.ws);
    }
  }

  getMatch(matchId: string): MatchRoom | undefined {
    return this.matches.get(matchId);
  }

  private joinQueue(
    session: ClientSession,
    message: Extract<ClientMessage, { type: "QUEUE_JOIN" }>,
  ): void {
    if (message.mode === "ranked" && !session.authenticated) {
      this.send(session.ws, { type: "ERROR", code: "AUTH_REQUIRED", message: "排位赛需要登录", requestId: message.requestId });
      return;
    }
    if (session.matchId) {
      this.send(session.ws, { type: "ERROR", code: "ALREADY_IN_MATCH", message: "你已经在一场对局中", requestId: message.requestId });
      return;
    }

    const deck = this.resolveDeck(message.deckSelection);
    if ("error" in deck) {
      this.send(session.ws, { type: "ERROR", code: "INVALID_DECK", message: deck.error, requestId: message.requestId });
      return;
    }

    this.removeWaiting(session);
    const opponentIndex = this.queue.findIndex(
      (entry) => entry.mode === message.mode && entry.session.userId !== session.userId && entry.session.ws.readyState === WebSocket.OPEN,
    );
    const entry: WaitingEntry = {
      session,
      name: message.playerName,
      deck: deck.deck,
      rushDeck: deck.rushDeck,
      mode: message.mode,
    };

    if (opponentIndex >= 0) {
      const opponent = this.queue.splice(opponentIndex, 1)[0];
      this.startMatch(opponent, entry, message.mode);
      return;
    }

    this.queue.push(entry);
    this.send(session.ws, { type: "QUEUE_STATUS", requestId: message.requestId, position: this.queue.length, mode: message.mode });
  }

  private createPrivateRoom(
    session: ClientSession,
    message: Extract<ClientMessage, { type: "PRIVATE_ROOM_CREATE" }>,
  ): void {
    const deck = this.resolveDeck(message.deckSelection);
    if ("error" in deck) {
      this.send(session.ws, { type: "ERROR", code: "INVALID_DECK", message: deck.error, requestId: message.requestId });
      return;
    }
    this.removeWaiting(session);
    let code: string;
    do code = randomBytes(3).toString("hex").toUpperCase(); while (this.privateRooms.has(code));
    this.privateRooms.set(code, { session, name: message.playerName, deck: deck.deck, rushDeck: deck.rushDeck, code });
    this.send(session.ws, { type: "PRIVATE_ROOM_CREATED", requestId: message.requestId, roomCode: code });
  }

  private joinPrivateRoom(
    session: ClientSession,
    message: Extract<ClientMessage, { type: "PRIVATE_ROOM_JOIN" }>,
  ): void {
    const waiting = this.privateRooms.get(message.roomCode.toUpperCase());
    if (!waiting || waiting.session.ws.readyState !== WebSocket.OPEN) {
      this.send(session.ws, { type: "ERROR", code: "ROOM_NOT_FOUND", message: "私人房间不存在或已经开始", requestId: message.requestId });
      return;
    }
    if (waiting.session.userId === session.userId) {
      this.send(session.ws, { type: "ERROR", code: "SELF_MATCH", message: "不能加入自己创建的房间", requestId: message.requestId });
      return;
    }
    const deck = this.resolveDeck(message.deckSelection);
    if ("error" in deck) {
      this.send(session.ws, { type: "ERROR", code: "INVALID_DECK", message: deck.error, requestId: message.requestId });
      return;
    }
    this.privateRooms.delete(waiting.code);
    this.startMatch(waiting, {
      session,
      name: message.playerName,
      deck: deck.deck,
      rushDeck: deck.rushDeck,
      mode: "casual",
    }, "private");
  }

  private startMatch(
    first: Omit<WaitingEntry, "mode"> | WaitingEntry,
    second: Omit<WaitingEntry, "mode"> | WaitingEntry,
    mode: "casual" | "ranked" | "private",
  ): void {
    if (!first.session.userId || !second.session.userId) return;
    const players: [MatchParticipant, MatchParticipant] = [
      { userId: first.session.userId, name: first.name, deck: first.deck, rushDeck: first.rushDeck, ws: first.session.ws },
      { userId: second.session.userId, name: second.name, deck: second.deck, rushDeck: second.rushDeck, ws: second.session.ws },
    ];
    const room = new MatchRoom({
      id: randomUUID(),
      mode,
      catalog: this.catalog,
      players,
      store: this.store,
      disconnectGraceMs: this.disconnectGraceMs,
      onFinished: (matchId) => this.handleMatchFinished(matchId),
    });
    this.matches.set(room.id, room);
    this.matchSessions.set(room.id, new Set([first.session, second.session]));
    first.session.matchId = room.id;
    first.session.seat = 0;
    second.session.matchId = room.id;
    second.session.seat = 1;
    room.sendInitial();
  }

  private resumeMatch(session: ClientSession, matchId: string, requestId: string): void {
    if (!session.userId) return;
    const room = this.matches.get(matchId);
    const seat = room?.findSeat(session.userId) ?? null;
    if (!room || seat === null || room.isEnded) {
      this.send(session.ws, { type: "ERROR", code: "RESUME_DENIED", message: "没有可恢复的对局", requestId });
      return;
    }
    session.matchId = matchId;
    session.seat = seat;
    const sessions = this.matchSessions.get(matchId) ?? new Set<ClientSession>();
    sessions.add(session);
    this.matchSessions.set(matchId, sessions);
    room.resume(seat, session.ws, requestId);
  }

  private handleMatchFinished(matchId: string): void {
    for (const session of this.matchSessions.get(matchId) ?? []) {
      if (session.matchId === matchId) {
        delete session.matchId;
        delete session.seat;
      }
    }
    setTimeout(() => {
      this.matches.delete(matchId);
      this.matchSessions.delete(matchId);
    }, 5 * 60_000).unref();
  }

  private resolveDeck(selection: DeckSelection): { deck: string[]; rushDeck: string[] } | { error: string } {
    if (!selection.deck || !selection.rushDeck) {
      return { error: "当前版本尚未迁移云端卡组格式，请从客户端提交已锁定的卡组快照" };
    }
    const cards = new Map(this.catalog.cards.map((card) => [card.id, card]));
    const mainDefinitions = selection.deck.map((id) => cards.get(id));
    const rushDefinitions = selection.rushDeck.map((id) => cards.get(id));
    if (mainDefinitions.some((card) => !card) || rushDefinitions.some((card) => !card)) {
      return { error: "卡组包含服务器目录中不存在的卡牌" };
    }
    if (mainDefinitions.some((card) => card!.card_type !== 1) || rushDefinitions.some((card) => card!.card_type !== 2)) {
      return { error: "主卡组或冲击卡组包含错误类型的卡牌" };
    }
    const counts = new Map<string, number>();
    const colors = new Set<number>();
    for (const card of mainDefinitions) {
      counts.set(card!.card_no, (counts.get(card!.card_no) ?? 0) + 1);
      colors.add(card!.attribute);
    }
    if ([...counts.values()].some((count) => count > 3)) return { error: "同编号卡牌最多投入 3 张" };
    if (colors.size > 2) return { error: "主卡组最多包含 2 种属性" };
    return { deck: [...selection.deck], rushDeck: [...selection.rushDeck] };
  }

  private removeWaiting(session: ClientSession): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].session === session) this.queue.splice(i, 1);
    }
    for (const [code, entry] of this.privateRooms) {
      if (entry.session === session) this.privateRooms.delete(code);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }
}
