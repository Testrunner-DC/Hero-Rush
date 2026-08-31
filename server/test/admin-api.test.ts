import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGameServer } from "../src/index.js";
import { InMemoryMatchStoreV2 } from "../src/store/matchStoreV2.js";
import { ATOMIC_OPERATION_CATALOG_V2 } from "@hero-rush/game-core";

describe("minimal administrator API", () => {
  let server: Awaited<ReturnType<typeof createGameServer>>;

  beforeEach(async () => {
    process.env.ADMIN_USERNAME = "TestAdmin";
    process.env.ADMIN_PASSWORD_SCRYPT = "64d8597e92f4ff2ddff8c1a57db2d005:d4cc105990ef28ce17b60fb254450ff9803c46cdb6b54cf023c411a1cd151c55";
    server = await createGameServer({
      port: 0,
      host: "127.0.0.1",
      storeV2: new InMemoryMatchStoreV2(),
      enableBattleV2: true,
    });
  });

  afterEach(async () => {
    await server.close();
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD_SCRYPT;
  });

  it("publishes health without exposing secrets", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      battleV2Enabled: true,
      rulesetVersion: "1.02",
      adminConfigured: true,
    }));
  });

  it("authenticates the configured administrator and returns only required V2 operational data", async () => {
    const denied = await fetch(`http://127.0.0.1:${server.port}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "TestAdmin", password: "wrong" }),
    });
    expect(denied.status).toBe(401);

    const login = await fetch(`http://127.0.0.1:${server.port}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "TestAdmin", password: "unit-test-password" }),
    });
    const session = await login.json() as { token: string };
    expect(login.status).toBe(200);
    expect(session.token).toBeTruthy();

    const overview = await fetch(`http://127.0.0.1:${server.port}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const body = await overview.json() as any;
    expect(overview.status).toBe(200);
    expect(body.service).toEqual(expect.objectContaining({
      battleV2Enabled: true,
      queuedPlayers: 0,
      privateRooms: 0,
      activeMatches: 0,
    }));
    expect(body.effects.atoms).toHaveLength(ATOMIC_OPERATION_CATALOG_V2.length);
    expect(body).not.toHaveProperty("password");
  });
});
