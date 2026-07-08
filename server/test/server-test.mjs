/**
 * 联机服务器快速烟雾测试
 *
 * 用法：node test/server-test.mjs （从 server/ 目录运行）
 */

import WebSocket from "ws";

const s = new WebSocket("ws://localhost:8081");
const assert = (ok, msg) => { if (!ok) { console.error("FAIL:", msg); process.exit(1); } else console.log("  ✓ " + msg); };

s.on("open", () => {
  console.log("✓ CONNECTED");

  // P1 加入排队
  s.send(JSON.stringify({ type: "JOIN_QUEUE", playerName: "P1", deck: ["A", "B"], rushDeck: ["C"] }));
});

s.on("message", (raw) => {
  const m = JSON.parse(raw);
  console.log("  P1 ←", JSON.stringify(m));

  if (m.type === "QUEUE_STATUS") {
    // P2 连接并排队 → 应触发配对
    const s2 = new WebSocket("ws://localhost:8081");
    s2.on("open", () => {
      s2.send(JSON.stringify({ type: "JOIN_QUEUE", playerName: "P2", deck: ["X", "Y"], rushDeck: ["Z"] }));
    });

    let p2MatchCount = 0;
    s2.on("message", (raw2) => {
      const m2 = JSON.parse(raw2);
      console.log("  P2 ←", JSON.stringify(m2));

      if (m2.type === "MATCHED") {
        p2MatchCount++;
        assert(m2.playerIndex === 1, "P2 is playerIndex 1");
        assert(m2.opponentName === "P1", "P2's opponent is P1");

        // P1 也应收到 MATCHED + GAME_START
        s.on("message", (raw1b) => {
          const m1b = JSON.parse(raw1b);
          console.log("  P1 (matched) ←", JSON.stringify(m1b));
          if (m1b.type === "GAME_START") {
            // 发送游戏动作
            s2.send(JSON.stringify({ type: "GAME_ACTION", action: { type: "DRAW_CARDS" } }));
          }
          if (m1b.type === "GAME_ACTION" && m1b.action?.type === "DRAW_CARDS") {
            assert(m1b.seq === 1, "seq = 1");
            assert(m1b.playerIdx === 1, "playerIdx = 1 (P2)");
            assert(true, "中继成功");
            console.log("=== ALL TESTS PASSED ===");
            process.exit(0);
          }
        });
      }
    });
  }
});

setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 4000);
