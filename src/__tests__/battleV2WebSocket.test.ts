import { describe, expect, it } from "vitest";
import { battleV2WebSocketUrl } from "../lib/battleV2WebSocket";

describe("V2 WebSocket 地址", () => {
  it("生产 HTTPS 域名统一使用同源 WSS 入口", () => {
    expect(battleV2WebSocketUrl({
      protocol: "https:",
      hostname: "hero-v2.grand-umi.com",
      host: "hero-v2.grand-umi.com",
    }, undefined)).toBe("wss://hero-v2.grand-umi.com/ws/");
  });

  it("本地开发仍连接独立的 8081 端口", () => {
    expect(battleV2WebSocketUrl({
      protocol: "http:",
      hostname: "127.0.0.1",
      host: "127.0.0.1:3000",
    }, undefined)).toBe("ws://127.0.0.1:8081");
  });

  it("显式配置优先于同源推导", () => {
    expect(battleV2WebSocketUrl({
      protocol: "https:",
      hostname: "hero-v2.grand-umi.com",
      host: "hero-v2.grand-umi.com",
    }, " wss://relay.example/ws ")).toBe("wss://relay.example/ws");
  });
});
