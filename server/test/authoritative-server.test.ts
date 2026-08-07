import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { readFile } from "node:fs/promises";
import { createGameServer } from "../src/index.js";
import { loadCardCatalog } from "../src/catalog.js";
import { InMemoryMatchStore } from "../src/store/matchStore.js";

type Message = Record<string, any> & { type: string };

class TestClient {
  readonly ws: WebSocket;
  private readonly buffered: Message[] = [];
  private readonly waiters: Array<{ predicate: (message: Message) => boolean; resolve: (message: Message) => void }> = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as Message;
      const waiterIndex = this.waiters.findIndex((waiter) => waiter.predicate(message));
      if (waiterIndex >= 0) this.waiters.splice(waiterIndex, 1)[0].resolve(message);
      else this.buffered.push(message);
    });
  }

  static async connect(url: string): Promise<TestClient> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    return new TestClient(ws);
  }

  send(message: object): void {
    this.ws.send(JSON.stringify(message));
  }

  waitFor(type: string, timeoutMs = 3000): Promise<Message> {
    const bufferedIndex = this.buffered.findIndex((message) => message.type === type);
    if (bufferedIndex >= 0) return Promise.resolve(this.buffered.splice(bufferedIndex, 1)[0]);
    return new Promise<Message>((resolve, reject) => {
      const waiter = { predicate: (message: Message) => message.type === type, resolve };
      this.waiters.push(waiter);
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`等待 ${type} 超时`));
      }, timeoutMs);
      waiter.resolve = (message) => {
        clearTimeout(timer);
        resolve(message);
      };
    });
  }

  close(): void {
    this.ws.close();
  }
}

describe("权威 WebSocket 服务", () => {
  let server: Awaited<ReturnType<typeof createGameServer>>;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    process.env.ALLOW_GUESTS = "true";
    server = await createGameServer({
      port: 0,
      host: "127.0.0.1",
      store: new InMemoryMatchStore(),
      disconnectGraceMs: 1000,
    });
  });

  afterEach(async () => {
    clients.forEach((client) => client.close());
    await server.close();
  });

  it("隐藏双方私密信息、拒绝越权动作并支持断线恢复", async () => {
    const catalog = await loadCardCatalog();
    const precon0 = JSON.parse(await readFile(new URL("../../public/precon_sd01.json", import.meta.url), "utf8"));
    const precon1 = JSON.parse(await readFile(new URL("../../public/precon_sd02.json", import.meta.url), "utf8"));
    const rush0 = catalog.cards.find((card) => card.card_type === 2 && card.card_no.startsWith("SD01"))!;
    const rush1 = catalog.cards.find((card) => card.card_type === 2 && card.card_no.startsWith("SD02"))!;
    const url = `ws://127.0.0.1:${server.port}`;

    const p0 = await TestClient.connect(url);
    const p1 = await TestClient.connect(url);
    clients.push(p0, p1);
    p0.send({ type: "HELLO", protocolVersion: 1 });
    p1.send({ type: "HELLO", protocolVersion: 1 });
    const ready0 = await p0.waitFor("READY");
    await p1.waitFor("READY");

    p0.send({
      type: "QUEUE_JOIN",
      requestId: "queue-0",
      mode: "casual",
      playerName: "玩家零",
      deckSelection: { deck: precon0.cards, rushDeck: Array(9).fill(rush0.id) },
    });
    await p0.waitFor("QUEUE_STATUS");
    p1.send({
      type: "QUEUE_JOIN",
      requestId: "queue-1",
      mode: "casual",
      playerName: "玩家一",
      deckSelection: { deck: precon1.cards, rushDeck: Array(9).fill(rush1.id) },
    });

    const match0 = await p0.waitFor("MATCH_FOUND");
    const match1 = await p1.waitFor("MATCH_FOUND");
    expect(match0.matchId).toBe(match1.matchId);
    expect(match0.state.randomState).toBeUndefined();
    expect(match0.state.players[1].hand.every((id: string) => id.startsWith("hidden:"))).toBe(true);
    expect(match0.state.players[0].deck.every((id: string) => id.startsWith("hidden:"))).toBe(true);
    expect(Object.keys(match0.state.cardInstances)).toHaveLength(6);

    const activeSeat = match0.state.activePlayerIndex as 0 | 1;
    const active = activeSeat === 0 ? p0 : p1;
    const inactive = activeSeat === 0 ? p1 : p0;
    inactive.send({
      type: "GAME_COMMAND",
      requestId: "inactive-request",
      matchId: match0.matchId,
      commandId: "inactive-command",
      expectedSeq: 0,
      command: { type: "ADVANCE_PHASE", next: "DRAW" },
    });
    const rejected = await inactive.waitFor("COMMAND_REJECTED");
    expect(rejected.code).toBe("FORBIDDEN_COMMAND");

    active.send({
      type: "GAME_COMMAND",
      requestId: "active-request",
      matchId: match0.matchId,
      commandId: "active-command",
      expectedSeq: 0,
      command: { type: "ADVANCE_PHASE", next: "DRAW" },
    });
    const updated0 = await p0.waitFor("STATE_UPDATED");
    const updated1 = await p1.waitFor("STATE_UPDATED");
    expect(updated0.seq).toBe(1);
    expect(updated1.seq).toBe(1);

    active.send({
      type: "GAME_COMMAND",
      requestId: "draw-request",
      matchId: match0.matchId,
      commandId: "draw-command",
      expectedSeq: 1,
      command: { type: "DRAW_CARDS" },
    });
    const drawn0 = await p0.waitFor("STATE_UPDATED");
    const drawn1 = await p1.waitFor("STATE_UPDATED");
    expect(drawn0.seq).toBe(2);
    expect(drawn1.seq).toBe(2);
    const activeDrawnView = activeSeat === 0 ? drawn0 : drawn1;
    const deployCardId = activeDrawnView.state.players[activeSeat].hand[0];

    active.send({
      type: "GAME_COMMAND",
      requestId: "deploy-request",
      matchId: match0.matchId,
      commandId: "deploy-command",
      expectedSeq: 2,
      command: { type: "DEPLOY_TO_BASE", cardId: deployCardId },
    });
    const deployed0 = await p0.waitFor("STATE_UPDATED");
    const deployed1 = await p1.waitFor("STATE_UPDATED");
    const activeView = activeSeat === 0 ? deployed0 : deployed1;
    expect(deployed0.seq).toBe(3);
    expect(deployed1.seq).toBe(3);
    expect(activeView.state.players[activeSeat].baseCovered).toHaveLength(1);

    p0.ws.close();
    await p1.waitFor("OPPONENT_CONNECTION");
    const resumed = await TestClient.connect(url);
    clients.push(resumed);
    resumed.send({ type: "HELLO", protocolVersion: 1, resumeToken: ready0.resumeToken });
    await resumed.waitFor("READY");
    resumed.send({ type: "RESUME_MATCH", requestId: "resume-0", matchId: match0.matchId, lastSeq: 3 });
    const resumeOk = await resumed.waitFor("RESUME_OK");
    expect(resumeOk.seat).toBe(0);
    expect(resumeOk.seq).toBe(3);
    expect(resumeOk.state.players[1].hand.every((id: string) => id.startsWith("hidden:"))).toBe(true);
    expect((await p1.waitFor("OPPONENT_CONNECTION")).connected).toBe(true);

    resumed.send({ type: "SURRENDER", requestId: "surrender", matchId: match0.matchId });
    expect((await resumed.waitFor("MATCH_ENDED")).winner).toBe(1);

    const endedResume = await TestClient.connect(url);
    clients.push(endedResume);
    endedResume.send({ type: "HELLO", protocolVersion: 1, resumeToken: ready0.resumeToken });
    await endedResume.waitFor("READY");
    endedResume.send({ type: "RESUME_MATCH", requestId: "resume-ended", matchId: match0.matchId, lastSeq: 3 });
    const resumeDenied = await endedResume.waitFor("ERROR");
    expect(resumeDenied.code).toBe("RESUME_DENIED");
  });
});
