import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ATOMIC_OPERATION_CATALOG_V2,
  CARD_IMPLEMENTATIONS_V2,
  effectRegistrySnapshotV2,
} from "@hero-rush/game-core";
import type { MatchCoordinatorV2 } from "../matchmaking/MatchCoordinatorV2.js";
import { AdminAuthService } from "./adminAuth.js";

interface AdminApiOptions {
  coordinatorV2: MatchCoordinatorV2;
  battleV2Enabled: boolean;
  allowedOrigins: ReadonlySet<string>;
}

const attempts = new Map<string, { count: number; resetAt: number }>();

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 8 * 1024) throw new Error("请求内容过大");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
}

function allowOrigin(request: IncomingMessage, response: ServerResponse, allowedOrigins: ReadonlySet<string>): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (allowedOrigins.size > 0 && !allowedOrigins.has(origin)) return false;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return true;
}

export function createAdminRequestHandler(options: AdminApiOptions) {
  const auth = new AdminAuthService();
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!allowOrigin(request, response, options.allowedOrigins)) {
      json(response, 403, { error: "不允许的来源" });
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://hero-rush.local");
    if (request.method === "GET" && url.pathname === "/api/health") {
      json(response, 200, {
        service: "hero-rush-authoritative-server",
        battleV2Enabled: options.battleV2Enabled,
        rulesetVersion: "1.02",
        adminConfigured: auth.configured,
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      if (!auth.configured) {
        json(response, 503, { error: "管理员账号尚未配置" });
        return;
      }
      const remote = request.socket.remoteAddress ?? "unknown";
      const attempt = attempts.get(remote);
      if (attempt && attempt.resetAt > Date.now() && attempt.count >= 5) {
        json(response, 429, { error: "登录尝试过多，请稍后再试" });
        return;
      }
      try {
        const body = await readJson(request);
        const result = auth.login(String(body.username ?? ""), String(body.password ?? ""));
        if (!result) {
          const current = attempt && attempt.resetAt > Date.now() ? attempt : { count: 0, resetAt: Date.now() + 5 * 60_000 };
          attempts.set(remote, { ...current, count: current.count + 1 });
          json(response, 401, { error: "管理员名称或密码错误" });
          return;
        }
        attempts.delete(remote);
        json(response, 200, result);
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : "登录请求无效" });
      }
      return;
    }
    if (!url.pathname.startsWith("/api/admin/")) {
      json(response, 404, { error: "接口不存在" });
      return;
    }
    const session = auth.authorize(request.headers.authorization);
    if (!session) {
      json(response, 401, { error: "管理员会话无效或已过期" });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/logout") {
      auth.logout(request.headers.authorization);
      json(response, 200, { ok: true });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/overview") {
      const registry = effectRegistrySnapshotV2();
      json(response, 200, {
        username: session.username,
        service: {
          battleV2Enabled: options.battleV2Enabled,
          rulesetVersion: "1.02",
          engineVersion: "2.0.0-framework-rc1",
          ...options.coordinatorV2.getStats(),
        },
        effects: {
          atoms: ATOMIC_OPERATION_CATALOG_V2,
          registeredEffects: registry,
          implementedCards: CARD_IMPLEMENTATIONS_V2,
        },
      });
      return;
    }
    json(response, 404, { error: "管理接口不存在" });
  };
}
