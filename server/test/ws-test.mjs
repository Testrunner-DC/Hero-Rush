import WebSocket from "ws";
const ws = new WebSocket("wss://hero.grand-umi.com/ws");
ws.on("open", () => { console.log("OPEN"); ws.send(JSON.stringify({type:"PING"})); });
ws.on("message", (d) => { console.log("MSG", d.toString()); ws.close(); process.exit(0); });
ws.on("error", (e) => { console.log("ERROR", e.message); process.exit(1); });
ws.on("close", (c) => { console.log("CLOSE", c); process.exit(1); });
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 10000);
