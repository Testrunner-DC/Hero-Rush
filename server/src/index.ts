import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import {
  ClientMessageV2Schema,
  PROTOCOL_VERSION_V2,
  type ServerMessageV2,
} from "@hero-rush/protocol";
import type { CardDatabase } from "@hero-rush/game-core";
import { SupabaseAuthVerifier } from "./auth/supabaseAuth.js";
import { loadCardCatalog } from "./catalog.js";
import { MatchCoordinatorV2 } from "./matchmaking/MatchCoordinatorV2.js";
import { InMemoryMatchStoreV2, type MatchStoreV2 } from "./store/matchStoreV2.js";
import { SupabaseMatchStoreV2 } from "./store/supabaseMatchStoreV2.js";
import type { ClientSession } from "./types.js";
import { createAdminRequestHandler } from "./admin/adminApi.js";
import { loadLocalEnvironment } from "./config/localEnv.js";

export interface GameServerOptions {
  port?: number;
  host?: string;
  catalog?: CardDatabase;
  storeV2?: MatchStoreV2;
  disconnectGraceMs?: number;
  enableBattleV2?: boolean;
}

export async function createGameServer(options: GameServerOptions = {}) {
  const catalog = options.catalog ?? await loadCardCatalog();
  const storeV2 = options.storeV2 ?? createStoreV2FromEnvironment();
  const coordinatorV2 = new MatchCoordinatorV2({ catalog, store: storeV2, disconnectGraceMs: options.disconnectGraceMs });
  const battleV2Enabled = options.enableBattleV2 ?? process.env.BATTLE_V2_ENABLED === "true";
  if (
    battleV2Enabled
    && process.env.NODE_ENV === "production"
    && process.env.BATTLE_V2_ENFORCE_CARD_POOL !== "true"
  ) {
    throw new Error("生产环境启用 V2 前必须设置 BATTLE_V2_ENFORCE_CARD_POOL=true");
  }
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

  const adminHandler = createAdminRequestHandler({ coordinatorV2, battleV2Enabled, allowedOrigins });
  const httpServer = createServer((request, response) => {
    void adminHandler(request, response).catch((error: unknown) => {
      console.error("[Hero-Rush API] 请求处理失败", error);
      if (!response.headersSent) response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "服务器内部错误" }));
    });
  });
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 });
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
        sendV2(ws, { type: "ERROR_V2", protocolVersion: PROTOCOL_VERSION_V2, code: "INVALID_JSON", message: "消息不是有效 JSON" });
        return;
      }
      const parsed = ClientMessageV2Schema.safeParse(json);
      if (!parsed.success) {
        sendV2(ws, { type: "ERROR_V2", protocolVersion: PROTOCOL_VERSION_V2, code: "INVALID_MESSAGE", message: parsed.error.issues[0]?.message ?? "消息格式无效" });
        return;
      }
      const message = parsed.data;
        if (!battleV2Enabled) {
          sendV2(ws, {
            type: "ERROR_V2",
            protocolVersion: PROTOCOL_VERSION_V2,
            code: "V2_DISABLED",
            message: "V2 对战入口当前未启用",
            requestId: "requestId" in message ? message.requestId : undefined,
          });
          return;
        }
        if (message.type === "PING_V2") {
          sendV2(ws, { type: "PONG_V2", protocolVersion: PROTOCOL_VERSION_V2, timestamp: message.timestamp });
          return;
        }
        if (message.type === "HELLO_V2") {
          if (session.helloComplete || authenticating) {
            sendV2(ws, {
              type: "ERROR_V2",
              protocolVersion: PROTOCOL_VERSION_V2,
              code: "HELLO_ALREADY_COMPLETED",
              message: "连接已经完成身份握手",
            });
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
            session.protocolVersion = 2;
            sendV2(ws, {
              type: "READY_V2",
              protocolVersion: PROTOCOL_VERSION_V2,
              connectionId: session.connectionId,
              userId: identity.userId,
              authenticated: identity.authenticated,
              resumeToken,
            });
          } catch (error) {
            sendV2(ws, {
              type: "ERROR_V2",
              protocolVersion: PROTOCOL_VERSION_V2,
              code: "AUTH_FAILED",
              message: error instanceof Error ? error.message : "身份校验失败",
            });
            ws.close(1008, "身份校验失败");
          } finally {
            authenticating = false;
          }
          return;
        }
        if (!session.helloComplete || !session.userId || session.protocolVersion !== 2) {
          sendV2(ws, {
            type: "ERROR_V2",
            protocolVersion: PROTOCOL_VERSION_V2,
            code: "HELLO_REQUIRED",
            message: "请先完成 HELLO_V2 身份握手",
          });
          return;
        }
        coordinatorV2.handleMessage(session, message);
        return;
    });

    ws.on("close", () => {
      alive.delete(ws);
      coordinatorV2.disconnect(session);
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
    httpServer.once("listening", resolveListening);
    httpServer.once("error", reject);
    httpServer.listen(port, host);
  });

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    wss,
    httpServer,
    coordinatorV2,
    battleV2Enabled,
    port: actualPort,
    async close(): Promise<void> {
      clearInterval(heartbeatTimer);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolveClose) => wss.close(() => resolveClose()));
      if (httpServer.listening) await new Promise<void>((resolveClose) => httpServer.close(() => resolveClose()));
    },
  };
}

function createStoreV2FromEnvironment(): MatchStoreV2 {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? new SupabaseMatchStoreV2(url, serviceRoleKey)
    : new InMemoryMatchStoreV2();
}

function sendV2(ws: WebSocket, message: ServerMessageV2): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  loadLocalEnvironment();
  const server = await createGameServer();
  console.log(`[Hero-Rush Server] 权威对战服务监听端口 ${server.port}`);
  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
