import WebSocket from "ws";

const websocketUrl = process.argv[2];
const origin = process.argv[3];
const sockets = new Set();

if (!websocketUrl || !origin) {
  console.error("用法：node scripts/smoke-production-v2.mjs <wss-url> <https-origin>");
  process.exit(64);
}

function connect(label) {
  return new Promise((resolve, reject) => {
    const websocket = new WebSocket(websocketUrl, { origin });
    sockets.add(websocket);
    const timer = setTimeout(() => {
      websocket.terminate();
      reject(new Error(`${label} 等待 READY_V2 超时`));
    }, 10_000);

    websocket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    websocket.once("close", () => sockets.delete(websocket));
    websocket.on("open", () => {
      websocket.send(JSON.stringify({ type: "HELLO_V2", protocolVersion: 2 }));
    });
    websocket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== "READY_V2") return;
      clearTimeout(timer);
      resolve({ websocket, message });
    });
  });
}

let failed = false;
try {
  const clients = await Promise.all([connect("客户端 1"), connect("客户端 2")]);
  const connectionIds = new Set(clients.map(({ message }) => message.connectionId));
  if (connectionIds.size !== 2) {
    throw new Error("两个客户端没有获得独立连接标识。");
  }

  console.log(JSON.stringify({
    ok: true,
    clients: clients.length,
    messageTypes: clients.map(({ message }) => message.type),
    authenticated: clients.map(({ message }) => message.authenticated),
  }));

  clients.forEach(({ websocket }) => websocket.close());
  await new Promise((resolve) => setTimeout(resolve, 200));
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.stack : error);
} finally {
  for (const websocket of sockets) websocket.terminate();
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (failed) process.exitCode = 1;
}
