#!/usr/bin/env node

const [siteUrl = "https://hero-v2.grand-umi.com/battle", websocketUrl = "wss://hero-v2.grand-umi.com/ws/"] = process.argv.slice(2);

if (!siteUrl.startsWith("https://") || !websocketUrl.startsWith("wss://")) {
  throw new Error("正式服冒烟地址必须分别使用 HTTPS 和 WSS");
}
if (typeof WebSocket !== "function") {
  throw new Error("正式服冒烟需要 Node.js 22 或更高版本提供 WebSocket");
}

const timeout = (milliseconds, message) => new Promise((_, reject) => {
  const timer = setTimeout(() => reject(new Error(message)), milliseconds);
  timer.unref?.();
});

async function assertHttp() {
  const page = await fetch(siteUrl, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
  if (!page.ok) throw new Error(`正式页面返回 HTTP ${page.status}`);
  const html = await page.text();
  if (!html.includes('<div id="root">')) throw new Error("正式页面不是 Hero-Rush 应用入口");

  const healthUrl = new URL("/api/health", siteUrl);
  const health = await fetch(healthUrl, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!health.ok) throw new Error(`V2 健康检查返回 HTTP ${health.status}`);
  const payload = await health.json();
  if (payload?.service !== "hero-rush-authoritative-server" || payload?.battleV2Enabled !== true) {
    throw new Error("V2 健康检查内容不符合生产契约");
  }
}

function pingClient(label) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(websocketUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${label} WSS 握手超时`));
    }, 15_000);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "PING_V2", protocolVersion: 2, timestamp: Date.now() }));
    });
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type !== "PONG_V2" || message.protocolVersion !== 2) return;
        clearTimeout(timer);
        socket.close();
        resolve();
      } catch (error) {
        clearTimeout(timer);
        socket.close();
        reject(error);
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`${label} WSS 连接失败`));
    });
  });
}

await Promise.race([
  Promise.all([assertHttp(), pingClient("客户端 A"), pingClient("客户端 B")]),
  timeout(30_000, "正式服综合冒烟超时"),
]);

console.log(`正式服冒烟通过：${siteUrl}；双客户端 ${websocketUrl}`);
