import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "docs/rules/v2-coverage.json"), "utf8"));
const rulebook = await readFile(resolve(root, "docs/rules/rulebook.md"), "utf8");
const problems = [];
const evidenceByRule = new Map();

for (const item of manifest.evidence) {
  if (!manifest.requiredRuleRefs.includes(item.ruleRef)) problems.push(`非必需规则证据：${item.ruleRef}`);
  if (!evidenceByRule.has(item.ruleRef)) evidenceByRule.set(item.ruleRef, []);
  evidenceByRule.get(item.ruleRef).push(item);
  try {
    const source = await readFile(resolve(root, item.testFile), "utf8");
    if (!source.includes(item.testTitle)) problems.push(`测试标题不存在：${item.testFile} :: ${item.testTitle}`);
  } catch {
    problems.push(`测试文件不存在：${item.testFile}`);
  }
}

for (const ruleRef of manifest.requiredRuleRefs) {
  if (!rulebook.includes(ruleRef)) problems.push(`规则书缺少编号：${ruleRef}`);
  if (!evidenceByRule.has(ruleRef)) problems.push(`规则缺少自动化证据：${ruleRef}`);
}

const coveredRuleRefs = manifest.requiredRuleRefs.filter((ruleRef) => evidenceByRule.has(ruleRef));
const report = {
  rulesetVersion: manifest.rulesetVersion,
  generatedAt: new Date().toISOString(),
  requiredRuleRefs: manifest.requiredRuleRefs,
  coveredRuleRefs,
  evidenceCount: manifest.evidence.length,
  problems,
};
const output = resolve(root, ".tmp/v2-rule-coverage.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`V2 rule coverage: ${coveredRuleRefs.length}/${manifest.requiredRuleRefs.length} (${manifest.evidence.length} evidence links)`);
console.log(`Coverage problems: ${problems.length}`);
console.log(`Report: ${output}`);
if (problems.length > 0) {
  for (const problem of problems) console.error(`- ${problem}`);
  if (process.argv.includes("--strict")) process.exitCode = 2;
}
