import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import {
  applyAtomicOperationsV2,
  createGameV2,
  executeAuthoritativeCommandV2,
  hashStateV2,
  projectBattleViewV2,
  validateAtomicOperationsV2,
  validateStateInvariantsV2,
  type AtomicOperationV2,
  type CardDatabase,
  type GameEventV2,
  type GameStateV2,
  type PlayerIndex,
} from "@hero-rush/game-core";
import {
  PROTOCOL_VERSION_V2,
  type ClientMessageV2,
  type ServerMessageV2,
} from "@hero-rush/protocol";

type SandboxCommandMessage = Extract<ClientMessageV2, { type: "SANDBOX_COMMAND_V2" }>;

export interface SandboxJournalEntryV2 {
  revision: number;
  commandId: string;
  kind: SandboxCommandMessage["payload"]["kind"];
  label: string;
  accepted: boolean;
  code?: string;
  events: unknown[];
  trace?: unknown[];
  timestamp: number;
}

interface SandboxPlayerInput {
  name: string;
  deck: string[];
  rushDeck: string[];
}

/** One-owner, omniscient V2 room. All mutations happen in this server object. */
export class SandboxRoomV2 {
  readonly id = randomUUID();
  readonly ownerUserId: string;
  private ws: WebSocket | null;
  private state: GameStateV2;
  private readonly processedCommands = new Set<string>();
  private readonly journal: SandboxJournalEntryV2[] = [];
  private processing: Promise<void> = Promise.resolve();

  constructor(options: {
    ownerUserId: string;
    ws: WebSocket;
    catalog: CardDatabase;
    seed: string;
    players: [SandboxPlayerInput, SandboxPlayerInput];
  }) {
    this.ownerUserId = options.ownerUserId;
    this.ws = options.ws;
    this.state = createGameV2({
      matchId: this.id,
      seed: options.seed,
      cardDefinitions: options.catalog.cards,
      cardDataVersion: "catalog-current",
      engineVersion: "2.0.0-framework-rc1",
      players: options.players.map((player) => ({
        name: player.name,
        mainDeck: player.deck,
        rushDeck: player.rushDeck,
      })) as [{ name: string; mainDeck: string[]; rushDeck: string[] }, { name: string; mainDeck: string[]; rushDeck: string[] }],
    });
  }

  sendCreated(requestId: string, recovered = false): void {
    const stateHash = hashStateV2(this.state);
    this.send({
      type: "SANDBOX_CREATED_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId,
      matchId: this.id,
      revision: this.state.revision,
      stateHash,
      state: this.projectOmniscient(stateHash),
      invariantIssues: validateStateInvariantsV2(this.state),
      recovered,
      journal: structuredClone(this.journal),
    });
  }

  enqueue(message: SandboxCommandMessage): void {
    this.processing = this.processing.then(() => this.execute(message)).catch((error) => {
      console.error(`[SandboxV2 ${this.id}] 命令队列异常`, error);
    });
  }

  async whenIdle(): Promise<void> {
    await this.processing;
  }

  async resume(ws: WebSocket, requestId: string): Promise<void> {
    await this.whenIdle();
    const previous = this.ws;
    if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) {
      previous.close(4001, "同一账号已在新连接恢复 V2 沙盒");
    }
    this.ws = ws;
    this.sendCreated(requestId, true);
  }

  disconnect(ws: WebSocket): boolean {
    if (this.ws !== ws) return false;
    this.ws = null;
    return true;
  }

  private execute(message: SandboxCommandMessage): void {
    if (message.matchId !== this.id) {
      this.reject(message, "MATCH_MISMATCH", "命令不属于当前沙盒");
      return;
    }
    if (this.processedCommands.has(message.commandId)) {
      this.accept(message, [], []);
      return;
    }
    if (message.expectedRevision !== this.state.revision) {
      this.reject(message, "REVISION_MISMATCH", `沙盒修订已推进到 ${this.state.revision}`);
      return;
    }

    let events: GameEventV2[] = [];
    let trace: unknown[] = [];
    if (message.payload.kind === "GAME") {
      const result = executeAuthoritativeCommandV2(this.state, {
        actor: message.payload.actor,
        commandId: message.commandId,
        expectedRevision: message.expectedRevision,
        command: message.payload.command,
      });
      if (!result.ok) {
        this.reject(message, result.code, result.message);
        return;
      }
      this.state = result.state;
      events = result.events;
    } else if (message.payload.kind === "ATOMIC") {
      const operations = message.payload.operations as AtomicOperationV2[];
      const issues = validateAtomicOperationsV2(this.state, operations);
      if (issues.length > 0) {
        this.reject(message, "INVALID_ATOMIC_OPERATION", issues.join("；"));
        return;
      }
      const result = applyAtomicOperationsV2(this.state, operations);
      this.state = { ...result.state, revision: this.state.revision + 1 };
      events = result.events;
      trace = result.trace;
    } else {
      const combinedEvents: GameEventV2[] = [];
      while (this.state.decision?.kind === "MULLIGAN") {
        const actor = this.state.decision.actor;
        const result = executeAuthoritativeCommandV2(this.state, {
          actor,
          commandId: `${message.commandId}:${actor}:${this.state.revision}`,
          expectedRevision: this.state.revision,
          command: { type: "SUBMIT_MULLIGAN", cardIds: [] },
        });
        if (!result.ok) {
          this.reject(message, result.code, result.message);
          return;
        }
        this.state = result.state;
        combinedEvents.push(...result.events);
      }
      events = combinedEvents;
    }

    this.processedCommands.add(message.commandId);
    this.journal.push({
      revision: this.state.revision,
      commandId: message.commandId,
      kind: message.payload.kind,
      label: this.commandLabel(message),
      accepted: true,
      events: structuredClone(events),
      trace: trace.length ? structuredClone(trace) : undefined,
      timestamp: Date.now(),
    });
    this.accept(message, events, trace);
  }

  private commandLabel(message: SandboxCommandMessage): string {
    if (message.payload.kind === "GAME") return `规则命令 · ${message.payload.command.type}`;
    if (message.payload.kind === "ATOMIC") return `GM 原子 · ${message.payload.operations.map((item) => item.kind).join(" + ")}`;
    return "GM · 完成双方调度";
  }

  private projectOmniscient(stateHash: string) {
    const responsePriority = this.state.flow.kind === "BATTLE_RESPONSE" || this.state.flow.kind === "TURN_RESPONSE"
      ? this.state.flow.priority
      : undefined;
    const viewer = (this.state.decision?.actor ?? responsePriority ?? this.state.flow.actor ?? this.state.activePlayer) as PlayerIndex;
    const view = projectBattleViewV2(this.state, viewer, stateHash);
    return {
      ...view,
      players: [
        projectBattleViewV2(this.state, 0, stateHash).players[0],
        projectBattleViewV2(this.state, 1, stateHash).players[1],
      ] as typeof view.players,
    };
  }

  private accept(message: SandboxCommandMessage, events: GameEventV2[], trace: unknown[]): void {
    const stateHash = hashStateV2(this.state);
    this.send({
      type: "COMMAND_ACCEPTED_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: message.requestId,
      matchId: this.id,
      commandId: message.commandId,
      revision: this.state.revision,
      stateHash,
      events,
      state: this.projectOmniscient(stateHash),
      trace,
      invariantIssues: validateStateInvariantsV2(this.state),
    });
  }

  private reject(message: SandboxCommandMessage, code: string, text: string): void {
    this.journal.push({
      revision: this.state.revision,
      commandId: message.commandId,
      kind: message.payload.kind,
      label: this.commandLabel(message),
      accepted: false,
      code,
      events: [],
      timestamp: Date.now(),
    });
    this.send({
      type: "COMMAND_REJECTED_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: message.requestId,
      matchId: this.id,
      commandId: message.commandId,
      currentRevision: this.state.revision,
      stateHash: hashStateV2(this.state),
      code,
      message: text,
    });
  }

  private send(message: ServerMessageV2): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }
}
