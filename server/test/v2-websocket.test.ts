import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { readFile } from "node:fs/promises";
import { PROTOCOL_VERSION_V2, ServerMessageV2Schema } from "@hero-rush/protocol";
import { createGameServer } from "../src/index.js";
import { loadCardCatalog } from "../src/catalog.js";
import { InMemoryMatchStoreV2 } from "../src/store/matchStoreV2.js";

type Message = Record<string, any> & { type: string };

class V2Client {
  readonly ws: WebSocket;
  private readonly buffered: Message[] = [];
  private readonly waiters: Array<{
    type: string;
    resolve: (message: Message) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as Message;
      ServerMessageV2Schema.parse(message);
      const index = this.waiters.findIndex((waiter) => waiter.type === message.type);
      if (index >= 0) {
        const waiter = this.waiters.splice(index, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        this.buffered.push(message);
      }
    });
  }

  static async connect(url: string): Promise<V2Client> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    return new V2Client(ws);
  }

  send(message: object): void {
    this.ws.send(JSON.stringify(message));
  }

  waitFor(type: string, timeoutMs = 3000): Promise<Message> {
    const index = this.buffered.findIndex((message) => message.type === type);
    if (index >= 0) return Promise.resolve(this.buffered.splice(index, 1)[0]);
    return new Promise<Message>((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiterIndex = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (waiterIndex >= 0) this.waiters.splice(waiterIndex, 1);
        reject(new Error(`等待 ${type} 超时`));
      }, timeoutMs);
      this.waiters.push({ type, resolve, reject, timer });
    });
  }

  close(): void {
    this.ws.close();
  }
}

describe("V2 WebSocket M1 端到端", () => {
  let server: Awaited<ReturnType<typeof createGameServer>>;
  let storeV2: InMemoryMatchStoreV2;
  const clients: V2Client[] = [];

  beforeEach(async () => {
    process.env.ALLOW_GUESTS = "true";
    storeV2 = new InMemoryMatchStoreV2();
    server = await createGameServer({
      port: 0,
      host: "127.0.0.1",
      storeV2,
      enableBattleV2: true,
      disconnectGraceMs: 1000,
    });
  });

  afterEach(async () => {
    clients.forEach((client) => client.close());
    await server.close();
  });

  it("完成匹配、双方调度、私有视图、重连和自动进入 ACTION", async () => {
    const catalog = await loadCardCatalog();
    const precon0 = JSON.parse(await readFile(new URL("../../public/precon_sd01.json", import.meta.url), "utf8"));
    const precon1 = JSON.parse(await readFile(new URL("../../public/precon_sd02.json", import.meta.url), "utf8"));
    const rush0 = catalog.cards.find((card) => card.card_type === 2 && card.card_no.startsWith("SD01"))!;
    const rush1 = catalog.cards.find((card) => card.card_type === 2 && card.card_no.startsWith("SD02"))!;
    const url = `ws://127.0.0.1:${server.port}`;
    const players = [await V2Client.connect(url), await V2Client.connect(url)] as const;
    clients.push(...players);

    players[0].send({ type: "HELLO_V2", protocolVersion: PROTOCOL_VERSION_V2 });
    players[1].send({ type: "HELLO_V2", protocolVersion: PROTOCOL_VERSION_V2 });
    const ready = [await players[0].waitFor("READY_V2"), await players[1].waitFor("READY_V2")] as const;

    players[0].send({
      type: "QUEUE_JOIN_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "queue-0",
      mode: "casual",
      playerName: "玩家零",
      deckSelection: { deck: precon0.cards, rushDeck: Array(9).fill(rush0.id) },
    });
    await players[0].waitFor("QUEUE_STATUS_V2");
    players[1].send({
      type: "QUEUE_JOIN_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "queue-1",
      mode: "casual",
      playerName: "玩家一",
      deckSelection: { deck: precon1.cards, rushDeck: Array(9).fill(rush1.id) },
    });

    const found = [await players[0].waitFor("MATCH_FOUND_V2"), await players[1].waitFor("MATCH_FOUND_V2")] as const;
    expect(found[0].matchId).toBe(found[1].matchId);
    expect(found[0].state.players[1].hand).toEqual([]);
    expect(found[1].state.players[0].hand).toEqual([]);
    const firstSeat = found[0].state.firstPlayer as 0 | 1;
    const secondSeat = (firstSeat === 0 ? 1 : 0) as 0 | 1;
    expect(found[firstSeat].state.pendingDecision.actor).toBe(firstSeat);
    expect(found[secondSeat].state.pendingDecision).toBeNull();

    players[secondSeat].send({
      type: "GAME_COMMAND_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "wrong-turn",
      matchId: found[0].matchId,
      commandId: "wrong-turn-command",
      expectedRevision: 0,
      command: { type: "SUBMIT_MULLIGAN", cardIds: [] },
    });
    expect((await players[secondSeat].waitFor("COMMAND_REJECTED_V2")).code).toBe("NOT_DECISION_ACTOR");

    const selected = found[firstSeat].state.players[firstSeat].hand.slice(0, 2).map((card: any) => card.instanceId);
    players[firstSeat].send({
      type: "GAME_COMMAND_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "first-mulligan",
      matchId: found[0].matchId,
      commandId: "first-mulligan-command",
      expectedRevision: 0,
      command: { type: "SUBMIT_MULLIGAN", cardIds: selected },
    });
    const firstUpdates = [
      await players[0].waitFor("STATE_UPDATED_V2"),
      await players[1].waitFor("STATE_UPDATED_V2"),
    ] as const;
    expect(firstUpdates[0].revision).toBe(1);
    expect(firstUpdates[secondSeat].state.pendingDecision.actor).toBe(secondSeat);
    expect(storeV2.events.get(found[0].matchId)).toHaveLength(1);

    players[secondSeat].close();
    await players[firstSeat].waitFor("OPPONENT_CONNECTION_V2");
    const resumed = await V2Client.connect(url);
    clients.push(resumed);
    resumed.send({
      type: "HELLO_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      resumeToken: ready[secondSeat].resumeToken,
    });
    await resumed.waitFor("READY_V2");
    resumed.send({
      type: "RESUME_MATCH_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "resume-second",
      matchId: found[0].matchId,
      lastRevision: 1,
    });
    const resumeOk = await resumed.waitFor("RESUME_OK_V2");
    expect(resumeOk.seat).toBe(secondSeat);
    expect(resumeOk.revision).toBe(1);
    expect(resumeOk.state.pendingDecision.actor).toBe(secondSeat);
    await players[firstSeat].waitFor("OPPONENT_CONNECTION_V2");

    resumed.send({
      type: "GAME_COMMAND_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "second-mulligan",
      matchId: found[0].matchId,
      commandId: "second-mulligan-command",
      expectedRevision: 1,
      command: { type: "SUBMIT_MULLIGAN", cardIds: [] },
    });
    const finalFirst = await players[firstSeat].waitFor("STATE_UPDATED_V2");
    const finalSecond = await resumed.waitFor("STATE_UPDATED_V2");
    expect(finalFirst.revision).toBe(3);
    expect(finalSecond.revision).toBe(3);
    expect(finalFirst.state.status).toBe("playing");
    expect(finalFirst.state.flow).toEqual({ kind: "ACTION", actor: firstSeat });
    expect(storeV2.events.get(found[0].matchId)).toHaveLength(2);

    resumed.send({
      type: "SURRENDER_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "surrender",
      matchId: found[0].matchId,
    });
    expect((await resumed.waitFor("MATCH_ENDED_V2")).winner).toBe(firstSeat);
    expect((await players[firstSeat].waitFor("MATCH_ENDED_V2")).winner).toBe(firstSeat);
    expect(storeV2.finished.has(found[0].matchId)).toBe(true);
  });

  it("由服务端建立全公开沙盒并权威执行规则命令与 GM 原子", async () => {
    const catalog = await loadCardCatalog();
    const precon0 = JSON.parse(await readFile(new URL("../../public/precon_sd01.json", import.meta.url), "utf8"));
    const precon1 = JSON.parse(await readFile(new URL("../../public/precon_sd02.json", import.meta.url), "utf8"));
    const rush0 = catalog.cards.find((card) => card.card_type === 2 && card.card_no.startsWith("SD01"))!;
    const rush1 = catalog.cards.find((card) => card.card_type === 2 && card.card_no.startsWith("SD02"))!;
    const client = await V2Client.connect(`ws://127.0.0.1:${server.port}`);
    clients.push(client);
    client.send({ type: "HELLO_V2", protocolVersion: PROTOCOL_VERSION_V2 });
    const sandboxReady = await client.waitFor("READY_V2");

    client.send({
      type: "SANDBOX_CREATE_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "sandbox-create",
      seed: "server-authoritative-sandbox",
      players: [
        { name: "玩家一", deckSelection: { deck: precon0.cards, rushDeck: Array(9).fill(rush0.id) } },
        { name: "玩家二", deckSelection: { deck: precon1.cards, rushDeck: Array(9).fill(rush1.id) } },
      ],
    });
    const created = await client.waitFor("SANDBOX_CREATED_V2");
    expect(created.revision).toBe(0);
    expect(created.state.players[0].hand).toHaveLength(6);
    expect(created.state.players[1].hand).toHaveLength(6);
    expect(created.invariantIssues).toEqual([]);

    client.send({
      type: "SANDBOX_COMMAND_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "sandbox-mulligan-request",
      matchId: created.matchId,
      commandId: "sandbox-mulligan-command",
      expectedRevision: created.revision,
      payload: { kind: "FINISH_MULLIGAN" },
    });
    const action = await client.waitFor("COMMAND_ACCEPTED_V2");
    expect(action.state.flow.kind).toBe("ACTION");
    expect(action.revision).toBeGreaterThan(created.revision);
    const handBefore = action.state.players[0].handCount;

    client.send({
      type: "SANDBOX_COMMAND_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "sandbox-draw-request",
      matchId: created.matchId,
      commandId: "sandbox-draw-command",
      expectedRevision: action.revision,
      payload: { kind: "ATOMIC", operations: [{ kind: "DRAW", actor: 0, count: 1 }] },
    });
    const drawn = await client.waitFor("COMMAND_ACCEPTED_V2");
    expect(drawn.revision).toBe(action.revision + 1);
    expect(drawn.state.players[0].handCount).toBe(handBefore + 1);
    expect(drawn.trace).toHaveLength(1);
    expect(drawn.invariantIssues).toEqual([]);

    client.close();
    const resumedSandbox = await V2Client.connect(`ws://127.0.0.1:${server.port}`);
    clients.push(resumedSandbox);
    resumedSandbox.send({
      type: "HELLO_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      resumeToken: sandboxReady.resumeToken,
    });
    await resumedSandbox.waitFor("READY_V2");
    resumedSandbox.send({
      type: "SANDBOX_RESUME_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "sandbox-resume",
      matchId: created.matchId,
      lastRevision: drawn.revision,
    });
    const recovered = await resumedSandbox.waitFor("SANDBOX_CREATED_V2");
    expect(recovered.recovered).toBe(true);
    expect(recovered.revision).toBe(drawn.revision);
    expect(recovered.state.players[0].handCount).toBe(drawn.state.players[0].handCount);
    expect(recovered.journal).toHaveLength(2);

    resumedSandbox.send({
      type: "SANDBOX_COMMAND_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "sandbox-stale-request",
      matchId: created.matchId,
      commandId: "sandbox-stale-command",
      expectedRevision: action.revision,
      payload: { kind: "ATOMIC", operations: [{ kind: "DRAW", actor: 0, count: 1 }] },
    });
    expect((await resumedSandbox.waitFor("COMMAND_REJECTED_V2")).code).toBe("REVISION_MISMATCH");

    resumedSandbox.send({
      type: "SANDBOX_CLOSE_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "sandbox-close",
      matchId: created.matchId,
    });
    resumedSandbox.send({
      type: "SANDBOX_RESUME_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "resume-after-close",
      matchId: created.matchId,
      lastRevision: drawn.revision,
    });
    const closed = await resumedSandbox.waitFor("ERROR_V2");
    expect(closed.code).toBe("SANDBOX_RESUME_DENIED");
  });
});
