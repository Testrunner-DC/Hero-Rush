import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import {
  createAuthoritativeGame,
  type BattleState,
  type CardDatabase,
} from "@hero-rush/game-core";
import type { ServerMessage } from "@hero-rush/protocol";
import type { GameCommand } from "@hero-rush/protocol";
import type { MatchParticipant } from "../types.js";
import type { MatchStore } from "../store/matchStore.js";
import { applyPreparedCommand, authorizeCommand, describeCommand, prepareCommand } from "./commandAdapter.js";
import { projectState } from "./projectState.js";

type MatchMode = "casual" | "ranked" | "private";

export interface CommandEnvelope {
  requestId: string;
  commandId: string;
  expectedSeq: number;
  command: GameCommand;
}

export class MatchRoom {
  readonly id: string;
  readonly players: [MatchParticipant, MatchParticipant];
  readonly mode: MatchMode;
  private readonly db: CardDatabase;
  private readonly store: MatchStore;
  private readonly disconnectGraceMs: number;
  private readonly disconnectTimers: [ReturnType<typeof setTimeout> | null, ReturnType<typeof setTimeout> | null] = [null, null];
  private state: BattleState;
  private seq = 0;
  private ended = false;
  private processing: Promise<void> = Promise.resolve();
  private persistence: Promise<void> = Promise.resolve();
  private readonly processedCommands = new Map<string, number>();
  private readonly onFinished?: (matchId: string) => void;

  constructor(options: {
    id: string;
    mode: MatchMode;
    catalog: CardDatabase;
    players: [MatchParticipant, MatchParticipant];
    store: MatchStore;
    disconnectGraceMs?: number;
    onFinished?: (matchId: string) => void;
  }) {
    this.id = options.id;
    this.mode = options.mode;
    this.players = options.players;
    this.store = options.store;
    this.disconnectGraceMs = options.disconnectGraceMs ?? 90_000;
    this.onFinished = options.onFinished;

    const seed = randomBytes(16).toString("hex");
    const game = createAuthoritativeGame(options.catalog, {
      matchId: this.id,
      seed,
      players: [
        { name: this.players[0].name, deck: this.players[0].deck, rushDeck: this.players[0].rushDeck },
        { name: this.players[1].name, deck: this.players[1].deck, rushDeck: this.players[1].rushDeck },
      ],
    });
    this.state = game.state;
    this.db = game.db;

    void this.persist(() => this.store.createMatch({
      matchId: this.id,
      mode: this.mode,
      seed,
      players: [
        { userId: this.players[0].userId, name: this.players[0].name, deck: this.players[0].deck, rushDeck: this.players[0].rushDeck },
        { userId: this.players[1].userId, name: this.players[1].name, deck: this.players[1].deck, rushDeck: this.players[1].rushDeck },
      ],
      initialState: this.state,
    }));
  }

  get currentSeq(): number {
    return this.seq;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get snapshot(): BattleState {
    return this.state;
  }

  findSeat(userId: string): 0 | 1 | null {
    const seat = this.players.findIndex((player) => player.userId === userId);
    return seat === 0 || seat === 1 ? seat : null;
  }

  sendInitial(): void {
    for (const seat of [0, 1] as const) {
      this.sendTo(seat, {
        type: "MATCH_FOUND",
        matchId: this.id,
        seat,
        opponentName: this.players[1 - seat].name,
        seq: this.seq,
        state: projectState(this.state, seat, this.state.log),
      });
    }
  }

  enqueueCommand(seat: 0 | 1, envelope: CommandEnvelope): void {
    this.processing = this.processing
      .then(() => this.processCommand(seat, envelope))
      .catch((error) => {
        console.error(`[Match ${this.id}] 命令处理异常`, error);
        this.reject(seat, envelope, "COMMAND_FAILED", "命令处理失败，请重试或重新连接");
      });
  }

  private async processCommand(seat: 0 | 1, envelope: CommandEnvelope): Promise<void> {
    if (this.ended) {
      this.reject(seat, envelope, "MATCH_ENDED", "对局已经结束");
      return;
    }

    const duplicateSeq = this.processedCommands.get(envelope.commandId);
    if (duplicateSeq !== undefined) {
      this.sendState(seat, [], envelope.commandId);
      return;
    }

    if (envelope.expectedSeq !== this.seq) {
      this.reject(seat, envelope, "STALE_SEQUENCE", "客户端状态已过期，请等待服务器同步");
      return;
    }

    const denial = authorizeCommand(this.state, envelope.command, seat);
    if (denial) {
      this.reject(seat, envelope, "FORBIDDEN_COMMAND", denial);
      return;
    }

    const prepared = prepareCommand(this.state, envelope.command, seat);
    const nextState = applyPreparedCommand(prepared, this.db);
    if (!nextState || nextState === prepared.state) {
      this.reject(seat, envelope, "ILLEGAL_COMMAND", "该操作不符合当前规则或阶段");
      return;
    }

    this.state = nextState;
    this.seq += 1;
    this.processedCommands.set(envelope.commandId, this.seq);
    const publicEvents = [describeCommand(envelope.command, this.players[seat].name)];

    await this.persist(() => this.store.appendEvent({
      matchId: this.id,
      seq: this.seq,
      commandId: envelope.commandId,
      actorUserId: this.players[seat].userId,
      command: envelope.command,
      publicEvents,
      state: this.state,
    }));

    for (const targetSeat of [0, 1] as const) {
      this.sendState(targetSeat, publicEvents, targetSeat === seat ? envelope.commandId : undefined);
    }

    if (this.state.isGameOver) {
      await this.finish(this.state.winner as 0 | 1 | null, "game_over");
    }
  }

  resume(seat: 0 | 1, ws: WebSocket, requestId: string): void {
    const previous = this.players[seat].ws;
    if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) {
      previous.close(4001, "同一账号已在新连接恢复对局");
    }
    this.players[seat].ws = ws;
    const timer = this.disconnectTimers[seat];
    if (timer) clearTimeout(timer);
    this.disconnectTimers[seat] = null;
    this.sendTo(seat, {
      type: "RESUME_OK",
      requestId,
      matchId: this.id,
      seat,
      opponentName: this.players[1 - seat].name,
      seq: this.seq,
      state: projectState(this.state, seat, []),
    });
    this.sendTo((1 - seat) as 0 | 1, { type: "OPPONENT_CONNECTION", matchId: this.id, connected: true });
  }

  disconnect(seat: 0 | 1, ws: WebSocket): void {
    if (this.players[seat].ws !== ws || this.ended) return;
    this.players[seat].ws = null;
    const graceDeadline = Date.now() + this.disconnectGraceMs;
    this.sendTo((1 - seat) as 0 | 1, {
      type: "OPPONENT_CONNECTION",
      matchId: this.id,
      connected: false,
      graceDeadline,
    });
    this.disconnectTimers[seat] = setTimeout(() => {
      if (!this.players[seat].ws && !this.ended) {
        void this.finish((1 - seat) as 0 | 1, "disconnect_timeout");
      }
    }, this.disconnectGraceMs);
  }

  surrender(seat: 0 | 1): void {
    if (!this.ended) void this.finish((1 - seat) as 0 | 1, "surrender");
  }

  private async finish(winner: 0 | 1 | null, reason: "game_over" | "surrender" | "disconnect_timeout"): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    for (const timer of this.disconnectTimers) if (timer) clearTimeout(timer);
    await this.persist(() => this.store.finishMatch(this.id, winner, reason, this.state));
    this.broadcast({ type: "MATCH_ENDED", matchId: this.id, winner, reason });
    this.onFinished?.(this.id);
  }

  private reject(seat: 0 | 1, envelope: CommandEnvelope, code: string, message: string): void {
    this.sendTo(seat, {
      type: "COMMAND_REJECTED",
      requestId: envelope.requestId,
      commandId: envelope.commandId,
      code,
      message,
      currentSeq: this.seq,
    });
  }

  private sendState(seat: 0 | 1, events: string[], acceptedCommandId?: string): void {
    this.sendTo(seat, {
      type: "STATE_UPDATED",
      matchId: this.id,
      seq: this.seq,
      state: projectState(this.state, seat, events),
      events,
      acceptedCommandId,
    });
  }

  private broadcast(message: ServerMessage): void {
    this.sendTo(0, message);
    this.sendTo(1, message);
  }

  private sendTo(seat: 0 | 1, message: ServerMessage): void {
    const ws = this.players[seat].ws;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }

  private persist(operation: () => Promise<void>): Promise<void> {
    this.persistence = this.persistence
      .then(operation)
      .catch((error) => console.error(`[Match ${this.id}] 持久化失败`, error));
    return this.persistence;
  }
}
