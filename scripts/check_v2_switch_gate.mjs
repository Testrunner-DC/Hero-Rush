import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const [environment, app, server, runbook] = await Promise.all([
  readFile(resolve(root, ".env.example"), "utf8"),
  readFile(resolve(root, "src/App.tsx"), "utf8"),
  readFile(resolve(root, "server/src/index.ts"), "utf8"),
  readFile(resolve(root, "docs/V2_ROLLOUT_RUNBOOK.md"), "utf8"),
]);
const checks = [
  ["服务端 V2 默认关闭", environment.includes("BATTLE_V2_ENABLED=false")],
  ["卡池门禁默认关闭", environment.includes("BATTLE_V2_ENFORCE_CARD_POOL=false")],
  ["/battle 由 V2 大厅接管", app.includes('<Route path="/battle" element={(') && app.includes('<BattlePageV2 db={db}')],
  ["旧 /battle-v2 入口收敛到 /battle", app.includes('path="/battle-v2" element={<Navigate to="/battle" replace />}')],
  ["V1 路由和页面入口已移除", !app.includes('path="/battle-legacy"') && !app.includes('from "./pages/BattlePage"')],
  ["生产启用必须强制卡池门禁", server.includes('process.env.NODE_ENV === "production"')
    && server.includes('process.env.BATTLE_V2_ENFORCE_CARD_POOL !== "true"')],
  ["回滚手册定义指标和 V2-only 停服策略", runbook.includes("重放哈希不一致为 0")
    && runbook.includes("断线恢复成功率不低于 99%")
    && runbook.includes("暂停新对局")
    && runbook.includes("不允许切回旧权威引擎")],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length > 0) {
  console.error(`V2 switch gate failed: ${failed.join("；")}`);
  process.exitCode = 2;
} else {
  console.log(`V2 switch gate passed: ${checks.length}/${checks.length}`);
}
