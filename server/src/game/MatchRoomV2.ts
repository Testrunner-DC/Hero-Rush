import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import {
  createGameV2,
  executeAuthoritativeCommandV2,
  hashStateV2,
  projectBattleViewV2,
  type AcceptedJournalEntryV2,
  type CardDatabase,
  type CreateGameInputV2,
  type GameStateV2,
  type PlayerIndex,
} from "@hero-rush/game-core";
import {
  PROTOCOL_VERSION_V2,
  type GameCommandEnvelopeV2Message,
  type ServerMessageV2,
} from "@hero-rush/protocol";
import type { MatchStoreV2 } from "../store/matchStoreV2.js";
import type { MatchParticipant } from "../types.js";

type MatchModeV2 = "casual" | "ranked" | "private";

export class MatchRoomV2 {
  readonly id: string;
  readonly players: [MatchParticipant, MatchParticipant];
  readonly mode: MatchModeV2;
  private readonly store: MatchStoreV2;
  private readonly input: CreateGameInputV2;
  private readonly disconnectGraceMs: number;
  private readonly disconnectTimers: [ReturnType<typeof setTimeout> | null, ReturnType<typeof setTimeout> | null] = [null, null];
  private readonly onFinished?: (matchId: string) => void;
  private state: GameStateV2;
  private ended = false;
  private processing: Promise<void>;
  private initializationError: Error | null = null;
  private readonly processedCommands = new Map<string, number>();
  private readonly journal: AcceptedJournalEntryV2[] = [];

  constructor(options: {
    id: string;
    mode: MatchModeV2;
    catalog: CardDatabase;
    players: [MatchParticipant, MatchParticipant];
    store: MatchStoreV2;
    seed?: string;
    cardDataVersion?: string;
    engineVersion?: string;
    disconnectGraceMs?: number;
    onFinished?: (matchId: string) => void;
  }) {
    this.id = options.id;
    this.mode = options.mode;
    this.players = options.players;
    this.store = options.store;
    this.disconnectGraceMs = options.disconnectGraceMs ?? 90_000;
    this.onFinished = options.onFinished;
    const seed = options.seed ?? randomBytes(16).toString("hex");
    this.input = {
      matchId: this.id,
      seed,
      cardDefinitions: options.catalog.cards,
      cardDataVersion: options.cardDataVersion ?? "catalog-current",
      engineVersion: options.engineVersion ?? "2.0.0-framework-rc1",
      players: [
        { name: this.players[0].name, mainDeck: this.players[0].deck, rushDeck: this.players[0].rushDeck },
        { name: this.players[1].name, mainDeck: this.players[1].deck, rushDeck: this.players[1].rushDeck },
      ],
    };
    this.state = createGameV2(this.input);
    this.processing = this.store.createMatch({
      matchId: this.id,
      mode: this.mode,
      seed,
      players: [
        {
          userId: this.players[0].userId,
          name: this.players[0].name,
          mainDeck: [...this.players[0].deck],
          rushDeck: [...this.players[0].rushDeck],
        },
        {
          userId: this.players[1].userId,
          name: this.players[1].name,
          mainDeck: [...this.players[1].deck],
          rushDeck: [...this.players[1].rushDeck],
        },
      ],
      setup: {
        matchId: this.input.matchId,
        seed: this.input.seed,
        cardDataVersion: this.input.cardDataVersion,
        engineVersion: this.input.engineVersion,
        players: structuredClone(this.input.players),
      },
      initialState: this.state,
    }).catch((error: unknown) => {
      this.initializationError = error instanceof Error ? error : new Error("V2 对局初始化持久化失败");
    });
  }

  get currentRevision(): number {
    return this.state.revision;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get snapshot(): GameStateV2 {
    return structuredClone(this.state);
  }

  get journalSnapshot(): AcceptedJournalEntryV2[] {
    return structuredClone(this.journal);
  }

  get replayInput(): CreateGameInputV2 {
    return structuredClone(this.input);
  }

  findSeat(userId: string): PlayerIndex | null {
    const seat = this.players.findIndex((player) => player.userId === userId);
    return seat === 0 || seat === 1 ? seat : null;
  }

  async sendInitial(): Promise<void> {
    await this.whenIdle();
    if (this.initializationError) {
      for (const seat of [0, 1] as const) {
        this.sendTo(seat, {
          type: "ERROR_V2",
          protocolVersion: PROTOCOL_VERSION_V2,
          code: "PERSISTENCE_FAILED",
          message: "V2 对局初始化未能可靠保存，请重新匹配",
        });
      }
      return;
    }
    const stateHash = hashStateV2(this.state);
    for (const seat of [0, 1] as const) {
      this.sendTo(seat, {
        type: "MATCH_FOUND_V2",
        protocolVersion: PROTOCOL_VERSION_V2,
        matchId: this.id,
        seat,
        opponentName: this.players[1 - seat].name,
        revision: this.state.revision,
        stateHash,
        state: projectBattleViewV2(this.state, seat, stateHash),
      });
    }
  }

  enqueueCommand(seat: PlayerIndex, envelope: GameCommandEnvelopeV2Message): void {
    this.processing = this.processing.then(() => this.processCommand(seat, envelope));
  }

  async whenIdle(): Promise<void> {
    await this.processing;
  }

  async resume(seat: PlayerIndex, ws: WebSocket, requestId: string): Promise<void> {
    await this.whenIdle();
    const previous = this.players[seat].ws;
    if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) {
      previous.close(4001, "同一账号已在新连接恢复 V2 对局");
    }
    this.players[seat].ws = ws;
    const timer = this.disconnectTimers[seat];
    if (timer) clearTimeout(timer);
    this.disconnectTimers[seat] = null;
    const stateHash = hashStateV2(this.state);
    this.sendTo(seat, {
      type: "RESUME_OK_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId,
      matchId: this.id,
      seat,
      opponentName: this.players[1 - seat].name,
      revision: this.state.revision,
      stateHash,
      state: projectBattleViewV2(this.state, seat, stateHash),
    });
    this.sendTo(seat === 0 ? 1 : 0, {
      type: "OPPONENT_CONNECTION_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      matchId: this.id,
      connected: true,
    });
  }

  disconnect(seat: PlayerIndex, ws: WebSocket): void {
    if (this.players[seat].ws !== ws || this.ended) return;
    this.players[seat].ws = null;
    const graceDeadline = Date.now() + this.disconnectGraceMs;
    this.sendTo(seat === 0 ? 1 : 0, {
      type: "OPPONENT_CONNECTION_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      matchId: this.id,
      connected: false,
      graceDeadline,
    });
    this.disconnectTimers[seat] = setTimeout(() => {
      if (!this.players[seat].ws && !this.ended) {
        void this.finish(seat === 0 ? 1 : 0, "disconnect_timeout");
      }
    }, this.disconnectGraceMs);
  }

  surrender(seat: PlayerIndex): void {
    if (!this.ended) void this.finish(seat === 0 ? 1 : 0, "surrender");
  }

  private async processCommand(
    seat: PlayerIndex,
    envelope: GameCommandEnvelopeV2Message,
  ): Promise<void> {
    if (this.ended) {
      this.reject(seat, envelope, "MATCH_ENDED", "对局已经结束");
      return;
    }
    if (this.initializationError) {
      this.reject(seat, envelope, "PERSISTENCE_FAILED", "对局尚未可靠保存，不能接受命令");
      return;
    }
    if (envelope.matchId !== this.id) {
      this.reject(seat, envelope, "MATCH_MISMATCH", "命令不属于当前对局");
      return;
    }
    if (this.processedCommands.has(envelope.commandId)) {
      this.acceptDuplicate(seat, envelope);
      return;
    }

    const result = executeAuthoritativeCommandV2(this.state, {
      actor: seat,
      commandId: envelope.commandId,
      expectedRevision: envelope.expectedRevision,
      command: envelope.command,
    });
    if (!result.ok) {
      this.reject(seat, envelope, result.code, result.message);
      return;
    }

    const journalEntry: AcceptedJournalEntryV2 = {
      actor: seat,
      commandId: envelope.commandId,
      expectedRevision: envelope.expectedRevision,
      command: envelope.command,
      stateHash: result.stateHash,
    };
    try {
      await this.store.appendEvent({
        ...journalEntry,
        matchId: this.id,
        actorUserId: this.players[seat].userId,
        revision: result.state.revision,
        events: result.events,
        state: result.state,
      });
    } catch (error) {
      console.error(`[MatchV2 ${this.id}] journal 持久化失败`, error);
      this.reject(seat, envelope, "PERSISTENCE_FAILED", "命令未保存，状态没有推进，请重试");
      return;
    }

    this.state = result.state;
    this.journal.push(journalEntry);
    this.processedCommands.set(envelope.commandId, this.state.revision);
    for (const targetSeat of [0, 1] as const) {
      this.sendState(
        targetSeat,
        result.events,
        targetSeat === seat ? envelope.commandId : undefined,
      );
    }
  }

  private acceptDuplicate(
    seat: PlayerIndex,
    envelope: GameCommandEnvelopeV2Message,
  ): void {
    const stateHash = hashStateV2(this.state);
    this.sendTo(seat, {
      type: "COMMAND_ACCEPTED_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: envelope.requestId,
      matchId: this.id,
      commandId: envelope.commandId,
      revision: this.state.revision,
      stateHash,
      events: [],
      state: projectBattleViewV2(this.state, seat, stateHash),
    });
  }

  private reject(
    seat: PlayerIndex,
    envelope: GameCommandEnvelopeV2Message,
    code: string,
    message: string,
  ): void {
    this.sendTo(seat, {
      type: "COMMAND_REJECTED_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: envelope.requestId,
      matchId: this.id,
      commandId: envelope.commandId,
      currentRevision: this.state.revision,
      stateHash: hashStateV2(this.state),
      code,
      message,
    });
  }

  private sendState(
    seat: PlayerIndex,
    events: unknown[],
    acceptedCommandId?: string,
  ): void {
    const stateHash = hashStateV2(this.state);
    this.sendTo(seat, {
      type: "STATE_UPDATED_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      matchId: this.id,
      revision: this.state.revision,
      stateHash,
      events,
      state: projectBattleViewV2(this.state, seat, stateHash),
      acceptedCommandId,
    });
  }

  private sendTo(seat: PlayerIndex, message: ServerMessageV2): void {
    const ws = this.players[seat].ws;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }

  private async finish(
    winner: PlayerIndex | null,
    reason: "surrender" | "disconnect_timeout",
  ): Promise<void> {
    if (this.ended) return;
    try {
      await this.store.finishMatch(this.id, winner, reason, this.state);
    } catch (error) {
      console.error(`[MatchV2 ${this.id}] 结束状态持久化失败`, error);
      return;
    }
    this.ended = true;
    for (const timer of this.disconnectTimers) if (timer) clearTimeout(timer);
    for (const seat of [0, 1] as const) {
      this.sendTo(seat, {
        type: "MATCH_ENDED_V2",
        protocolVersion: PROTOCOL_VERSION_V2,
        matchId: this.id,
        winner,
        reason,
      });
    }
    this.onFinished?.(this.id);
  }
}
