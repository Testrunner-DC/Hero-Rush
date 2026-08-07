import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { ClientMessageSchema, PROTOCOL_VERSION, type ServerMessage } from "@hero-rush/protocol";
import type { CardDatabase } from "@hero-rush/game-core";
import { SupabaseAuthVerifier } from "./auth/supabaseAuth.js";
import { loadCardCatalog } from "./catalog.js";
import { MatchCoordinator } from "./matchmaking/MatchCoordinator.js";
import { InMemoryMatchStore, type MatchStore } from "./store/matchStore.js";
import { SupabaseMatchStore } from "./store/supabaseMatchStore.js";
import type { ClientSession } from "./types.js";

export interface GameServerOptions {
  port?: number;
  host?: string;
  catalog?: CardDatabase;
  store?: MatchStore;
  disconnectGraceMs?: number;
}

export async function createGameServer(options: GameServerOptions = {}) {
  const catalog = options.catalog ?? await loadCardCatalog();
  const store = options.store ?? createStoreFromEnvironment();
  const coordinator = new MatchCoordinator({ catalog, store, disconnectGraceMs: options.disconnectGraceMs });
  const auth = new SupabaseAuthVerifier();
  const resumeIdentities = new Map<string, { userId: string; authenticated: boolean; expiresAt: number }>();
  const port = options.port ?? Number.parseInt(process.env.PORT ?? "8081", 10);
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  const wss = new WebSocketServer({ port, host, maxPayload: 64 * 1024 });
  const alive = new Set<WebSocket>();

  wss.on("connection", (ws, request) => {
    const origin = request.headers.origin;
    if (allowedOrigins.size > 0 && origin && !allowedOrigins.has(origin)) {
      ws.close(1008, "不允许的来源");
      return;
    }

    const session: ClientSession = {
      connectionId: randomUUID(),
      ws,
      userId: null,
      authenticated: false,
      helloComplete: false,
    };
    let authenticating = false;
    let rateWindowStartedAt = Date.now();
    let rateCount = 0;
    alive.add(ws);

    ws.on("pong", () => alive.add(ws));
    ws.on("message", async (raw) => {
      const now = Date.now();
      if (now - rateWindowStartedAt >= 10_000) {
        rateWindowStartedAt = now;
        rateCount = 0;
      }
      rateCount += 1;
      if (rateCount > 80) {
        ws.close(1008, "消息频率过高");
        return;
      }

      let json: unknown;
      try {
        json = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: "ERROR", code: "INVALID_JSON", message: "消息不是有效 JSON" });
        return;
      }
      const parsed = ClientMessageSchema.safeParse(json);
      if (!parsed.success) {
        send(ws, { type: "ERROR", code: "INVALID_MESSAGE", message: parsed.error.issues[0]?.message ?? "消息格式无效" });
        return;
      }
      const message = parsed.data;

      if (message.type === "PING") {
        send(ws, { type: "PONG", timestamp: message.timestamp });
        return;
      }

      if (message.type === "HELLO") {
        if (session.helloComplete || authenticating) {
          send(ws, { type: "ERROR", code: "HELLO_ALREADY_COMPLETED", message: "连接已经完成身份握手" });
          return;
        }
        authenticating = true;
        try {
          const resumeRecord = message.resumeToken ? resumeIdentities.get(message.resumeToken) : undefined;
          const recoveredIdentity = resumeRecord && resumeRecord.expiresAt > Date.now()
            ? { userId: resumeRecord.userId, authenticated: resumeRecord.authenticated }
            : undefined;
          const identity = recoveredIdentity ?? await auth.verify(message.accessToken, session.connectionId);
          const resumeToken = message.resumeToken && recoveredIdentity
            ? message.resumeToken
            : randomBytes(32).toString("hex");
          resumeIdentities.set(resumeToken, { ...identity, expiresAt: Date.now() + 12 * 60 * 60_000 });
          session.userId = identity.userId;
          session.authenticated = identity.authenticated;
          session.helloComplete = true;
          send(ws, {
            type: "READY",
            protocolVersion: PROTOCOL_VERSION,
            connectionId: session.connectionId,
            userId: identity.userId,
            authenticated: identity.authenticated,
            resumeToken,
          });
        } catch (error) {
          send(ws, { type: "ERROR", code: "AUTH_FAILED", message: error instanceof Error ? error.message : "身份校验失败" });
          ws.close(1008, "身份校验失败");
        } finally {
          authenticating = false;
        }
        return;
      }

      if (!session.helloComplete || !session.userId) {
        send(ws, { type: "ERROR", code: "HELLO_REQUIRED", message: "请先完成 HELLO 身份握手" });
        return;
      }
      coordinator.handleMessage(session, message);
    });

    ws.on("close", () => {
      alive.delete(ws);
      coordinator.disconnect(session);
    });
    ws.on("error", (error) => {
      console.error(`[Connection ${session.connectionId}] WebSocket 错误：${error.message}`);
    });
  });

  const heartbeatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, 30_000);

  await new Promise<void>((resolveListening, reject) => {
    wss.once("listening", resolveListening);
    wss.once("error", reject);
  });

  const address = wss.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    wss,
    coordinator,
    port: actualPort,
    async close(): Promise<void> {
      clearInterval(heartbeatTimer);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolveClose) => wss.close(() => resolveClose()));
    },
  };
}

function createStoreFromEnvironment(): MatchStore {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? new SupabaseMatchStore(url, serviceRoleKey)
    : new InMemoryMatchStore();
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const server = await createGameServer();
  console.log(`[Hero-Rush Server] 权威对战服务监听端口 ${server.port}`);
  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
