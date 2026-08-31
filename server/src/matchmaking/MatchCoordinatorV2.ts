import { randomBytes, randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { CardDatabase } from "@hero-rush/game-core";
import {
  PROTOCOL_VERSION_V2,
  type ClientMessageV2,
  type DeckSelection,
  type ServerMessageV2,
} from "@hero-rush/protocol";
import { MatchRoomV2 } from "../game/MatchRoomV2.js";
import { SandboxRoomV2 } from "../game/SandboxRoomV2.js";
import type { MatchStoreV2 } from "../store/matchStoreV2.js";
import type { ClientSession, MatchParticipant } from "../types.js";
import { validateDeckSelectionV2 } from "./deckValidationV2.js";

interface WaitingEntryV2 {
  session: ClientSession;
  name: string;
  deck: string[];
  rushDeck: string[];
  mode: "casual" | "ranked";
}

interface PrivateRoomEntryV2 extends Omit<WaitingEntryV2, "mode"> {
  code: string;
}

type RoutedMessageV2 = Exclude<ClientMessageV2, { type: "HELLO_V2" | "PING_V2" }>;

export class MatchCoordinatorV2 {
  private readonly catalog: CardDatabase;
  private readonly store: MatchStoreV2;
  private readonly disconnectGraceMs: number;
  private readonly queue: WaitingEntryV2[] = [];
  private readonly privateRooms = new Map<string, PrivateRoomEntryV2>();
  private readonly matches = new Map<string, MatchRoomV2>();
  private readonly matchSessions = new Map<string, Set<ClientSession>>();
  private readonly sandboxes = new Map<string, SandboxRoomV2>();
  private readonly sandboxBySession = new Map<ClientSession, string>();
  private readonly sandboxByOwner = new Map<string, string>();
  private readonly sandboxExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: {
    catalog: CardDatabase;
    store: MatchStoreV2;
    disconnectGraceMs?: number;
  }) {
    this.catalog = options.catalog;
    this.store = options.store;
    this.disconnectGraceMs = options.disconnectGraceMs ?? 90_000;
  }

  handleMessage(session: ClientSession, message: RoutedMessageV2): void {
    switch (message.type) {
      case "QUEUE_JOIN_V2":
        this.joinQueue(session, message);
        return;
      case "QUEUE_LEAVE_V2":
        this.removeWaiting(session);
        return;
      case "PRIVATE_ROOM_CREATE_V2":
        this.createPrivateRoom(session, message);
        return;
      case "PRIVATE_ROOM_JOIN_V2":
        this.joinPrivateRoom(session, message);
        return;
      case "GAME_COMMAND_V2": {
        const room = this.matches.get(message.matchId);
        if (!room || session.seat === undefined || session.matchId !== message.matchId) {
          this.error(session.ws, "MATCH_NOT_FOUND", "未找到当前 V2 对局", message.requestId);
          return;
        }
        room.enqueueCommand(session.seat, message);
        return;
      }
      case "SANDBOX_CREATE_V2":
        this.createSandbox(session, message);
        return;
      case "SANDBOX_COMMAND_V2": {
        const sandbox = this.sandboxes.get(message.matchId);
        if (!sandbox || this.sandboxBySession.get(session) !== message.matchId || sandbox.ownerUserId !== session.userId) {
          this.error(session.ws, "SANDBOX_NOT_FOUND", "未找到当前连接拥有的 V2 沙盒", message.requestId);
          return;
        }
        sandbox.enqueue(message);
        return;
      }
      case "SANDBOX_RESUME_V2":
        this.resumeSandbox(session, message.matchId, message.requestId);
        return;
      case "SANDBOX_CLOSE_V2": {
        const sandbox = this.sandboxes.get(message.matchId);
        if (!sandbox || sandbox.ownerUserId !== session.userId || this.sandboxBySession.get(session) !== message.matchId) {
          this.error(session.ws, "SANDBOX_NOT_FOUND", "未找到当前连接拥有的 V2 沙盒", message.requestId);
          return;
        }
        this.removeSandbox(message.matchId);
        return;
      }
      case "RESUME_MATCH_V2":
        this.resumeMatch(session, message.matchId, message.requestId);
        return;
      case "SURRENDER_V2": {
        const room = this.matches.get(message.matchId);
        if (!room || session.seat === undefined || session.matchId !== message.matchId) {
          this.error(session.ws, "MATCH_NOT_FOUND", "未找到当前 V2 对局", message.requestId);
          return;
        }
        room.surrender(session.seat);
        return;
      }
    }
  }

  disconnect(session: ClientSession): void {
    this.removeWaiting(session);
    const sandboxId = this.sandboxBySession.get(session);
    if (sandboxId) {
      this.sandboxBySession.delete(session);
      const sandbox = this.sandboxes.get(sandboxId);
      if (sandbox?.disconnect(session.ws)) {
        const previousTimer = this.sandboxExpiryTimers.get(sandboxId);
        if (previousTimer) clearTimeout(previousTimer);
        const expiry = setTimeout(() => this.removeSandbox(sandboxId), this.disconnectGraceMs);
        expiry.unref();
        this.sandboxExpiryTimers.set(sandboxId, expiry);
      }
    }
    if (session.matchId && session.seat !== undefined) {
      this.matches.get(session.matchId)?.disconnect(session.seat, session.ws);
    }
  }

  getMatch(matchId: string): MatchRoomV2 | undefined {
    return this.matches.get(matchId);
  }

  getStats(): { queuedPlayers: number; privateRooms: number; activeMatches: number } {
    return {
      queuedPlayers: this.queue.length,
      privateRooms: this.privateRooms.size,
      activeMatches: this.matches.size,
    };
  }

  private joinQueue(
    session: ClientSession,
    message: Extract<ClientMessageV2, { type: "QUEUE_JOIN_V2" }>,
  ): void {
    if (message.mode === "ranked" && !session.authenticated) {
      this.error(session.ws, "AUTH_REQUIRED", "排位赛需要登录", message.requestId);
      return;
    }
    if (session.matchId) {
      this.error(session.ws, "ALREADY_IN_MATCH", "你已经在一场对局中", message.requestId);
      return;
    }
    const deck = this.resolveDeck(message.deckSelection);
    if ("error" in deck) {
      this.error(session.ws, "INVALID_DECK", deck.error, message.requestId);
      return;
    }
    this.removeWaiting(session);
    const opponentIndex = this.queue.findIndex(
      (entry) => entry.mode === message.mode
        && entry.session.userId !== session.userId
        && entry.session.ws.readyState === WebSocket.OPEN,
    );
    const entry: WaitingEntryV2 = {
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
    this.send(session.ws, {
      type: "QUEUE_STATUS_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: message.requestId,
      position: this.queue.length,
      mode: message.mode,
    });
  }

  private createPrivateRoom(
    session: ClientSession,
    message: Extract<ClientMessageV2, { type: "PRIVATE_ROOM_CREATE_V2" }>,
  ): void {
    const deck = this.resolveDeck(message.deckSelection);
    if ("error" in deck) {
      this.error(session.ws, "INVALID_DECK", deck.error, message.requestId);
      return;
    }
    this.removeWaiting(session);
    let code: string;
    do code = randomBytes(3).toString("hex").toUpperCase(); while (this.privateRooms.has(code));
    this.privateRooms.set(code, {
      session,
      name: message.playerName,
      deck: deck.deck,
      rushDeck: deck.rushDeck,
      code,
    });
    this.send(session.ws, {
      type: "PRIVATE_ROOM_CREATED_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: message.requestId,
      roomCode: code,
    });
  }

  private joinPrivateRoom(
    session: ClientSession,
    message: Extract<ClientMessageV2, { type: "PRIVATE_ROOM_JOIN_V2" }>,
  ): void {
    const waiting = this.privateRooms.get(message.roomCode.toUpperCase());
    if (!waiting || waiting.session.ws.readyState !== WebSocket.OPEN) {
      this.error(session.ws, "ROOM_NOT_FOUND", "私人房间不存在或已经开始", message.requestId);
      return;
    }
    if (waiting.session.userId === session.userId) {
      this.error(session.ws, "SELF_MATCH", "不能加入自己创建的房间", message.requestId);
      return;
    }
    const deck = this.resolveDeck(message.deckSelection);
    if ("error" in deck) {
      this.error(session.ws, "INVALID_DECK", deck.error, message.requestId);
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
    first: Omit<WaitingEntryV2, "mode"> | WaitingEntryV2,
    second: Omit<WaitingEntryV2, "mode"> | WaitingEntryV2,
    mode: "casual" | "ranked" | "private",
  ): void {
    if (!first.session.userId || !second.session.userId) return;
    const players: [MatchParticipant, MatchParticipant] = [
      {
        userId: first.session.userId,
        name: first.name,
        deck: first.deck,
        rushDeck: first.rushDeck,
        ws: first.session.ws,
      },
      {
        userId: second.session.userId,
        name: second.name,
        deck: second.deck,
        rushDeck: second.rushDeck,
        ws: second.session.ws,
      },
    ];
    const room = new MatchRoomV2({
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
    void room.sendInitial();
  }

  private createSandbox(
    session: ClientSession,
    message: Extract<ClientMessageV2, { type: "SANDBOX_CREATE_V2" }>,
  ): void {
    if (!session.userId) {
      this.error(session.ws, "HELLO_REQUIRED", "需要先完成 V2 握手", message.requestId);
      return;
    }
    const first = this.resolveDeck(message.players[0].deckSelection);
    const second = this.resolveDeck(message.players[1].deckSelection);
    if ("error" in first || "error" in second) {
      this.error(
        session.ws,
        "INVALID_DECK",
        "error" in first ? first.error : (second as { error: string }).error,
        message.requestId,
      );
      return;
    }
    const previousId = this.sandboxByOwner.get(session.userId);
    if (previousId) this.removeSandbox(previousId);
    const room = new SandboxRoomV2({
      ownerUserId: session.userId,
      ws: session.ws,
      catalog: this.catalog,
      seed: message.seed,
      players: [
        { name: message.players[0].name, deck: first.deck, rushDeck: first.rushDeck },
        { name: message.players[1].name, deck: second.deck, rushDeck: second.rushDeck },
      ],
    });
    this.sandboxes.set(room.id, room);
    this.sandboxBySession.set(session, room.id);
    this.sandboxByOwner.set(session.userId, room.id);
    room.sendCreated(message.requestId);
  }

  private resumeSandbox(session: ClientSession, matchId: string, requestId: string): void {
    if (!session.userId) {
      this.error(session.ws, "HELLO_REQUIRED", "需要先完成 V2 握手", requestId);
      return;
    }
    const room = this.sandboxes.get(matchId);
    if (!room || room.ownerUserId !== session.userId || this.sandboxByOwner.get(session.userId) !== matchId) {
      this.error(session.ws, "SANDBOX_RESUME_DENIED", "没有可恢复的 V2 沙盒", requestId);
      return;
    }
    const timer = this.sandboxExpiryTimers.get(matchId);
    if (timer) clearTimeout(timer);
    this.sandboxExpiryTimers.delete(matchId);
    this.sandboxBySession.set(session, matchId);
    void room.resume(session.ws, requestId);
  }

  private removeSandbox(matchId: string): void {
    const room = this.sandboxes.get(matchId);
    if (!room) return;
    const timer = this.sandboxExpiryTimers.get(matchId);
    if (timer) clearTimeout(timer);
    this.sandboxExpiryTimers.delete(matchId);
    this.sandboxes.delete(matchId);
    if (this.sandboxByOwner.get(room.ownerUserId) === matchId) this.sandboxByOwner.delete(room.ownerUserId);
    for (const [session, sandboxId] of this.sandboxBySession) {
      if (sandboxId === matchId) this.sandboxBySession.delete(session);
    }
  }

  private resumeMatch(session: ClientSession, matchId: string, requestId: string): void {
    if (!session.userId) return;
    const room = this.matches.get(matchId);
    const seat = room?.findSeat(session.userId) ?? null;
    if (!room || seat === null || room.isEnded) {
      this.error(session.ws, "RESUME_DENIED", "没有可恢复的 V2 对局", requestId);
      return;
    }
    session.matchId = matchId;
    session.seat = seat;
    const sessions = this.matchSessions.get(matchId) ?? new Set<ClientSession>();
    sessions.add(session);
    this.matchSessions.set(matchId, sessions);
    void room.resume(seat, session.ws, requestId);
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
    return validateDeckSelectionV2(
      selection,
      this.catalog,
      process.env.BATTLE_V2_ENFORCE_CARD_POOL === "true",
    );
  }

  private removeWaiting(session: ClientSession): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (this.queue[index].session === session) this.queue.splice(index, 1);
    }
    for (const [code, entry] of this.privateRooms) {
      if (entry.session === session) this.privateRooms.delete(code);
    }
  }

  private error(ws: WebSocket, code: string, message: string, requestId?: string): void {
    this.send(ws, {
      type: "ERROR_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      code,
      message,
      requestId,
    });
  }

  private send(ws: WebSocket, message: ServerMessageV2): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }
}
