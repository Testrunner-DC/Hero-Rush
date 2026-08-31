import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const database = JSON.parse(await readFile(resolve(root, "public/cards.json"), "utf8"));
const implementationRecords = JSON.parse(await readFile(
  resolve(root, "packages/game-core/src/v2/cards/implementations.v2.json"),
  "utf8",
));
const isNonEmptyArray = (value) => Array.isArray(value) && value.length > 0
  && value.every((item) => typeof item === "string" && item.trim().length > 0);
const isComplete = (record) => record && typeof record.cardNo === "string" && record.cardNo.trim().length > 0
  && isNonEmptyArray(record.ruleRefs) && isNonEmptyArray(record.effectIds) && isNonEmptyArray(record.tests);
const invalidImplementations = implementationRecords.filter((record) => !isComplete(record));
const implemented = implementationRecords.filter(isComplete).map((record) => record.cardNo);
const allCardNos = [...new Set(database.cards.filter((card) => card.card_type === 1).map((card) => card.card_no))].sort();
const effectCardNos = [...new Set(database.cards
  .filter((card) => card.card_type === 1 && String(card.effect ?? "").trim().length > 0)
  .map((card) => card.card_no))].sort();
const implementedSet = new Set(implemented);
const report = {
  rulesetVersion: "1.02",
  generatedAt: new Date().toISOString(),
  totalCharacterCardNos: allCardNos.length,
  effectCardNos: effectCardNos.length,
  implementedEffectCardNos: effectCardNos.filter((cardNo) => implementedSet.has(cardNo)).length,
  admittedCardNos: allCardNos.filter((cardNo) => !effectCardNos.includes(cardNo) || implementedSet.has(cardNo)).length,
  missingEffectCardNos: effectCardNos.filter((cardNo) => !implementedSet.has(cardNo)),
  invalidImplementations,
};
const output = resolve(root, ".tmp/v2-card-coverage.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`V2 effect-card coverage: ${report.implementedEffectCardNos}/${report.effectCardNos}`);
console.log(`V2 admitted card numbers: ${report.admittedCardNos}/${report.totalCharacterCardNos}`);
console.log(`Missing effect card numbers: ${report.missingEffectCardNos.length}`);
console.log(`Invalid implementation records: ${report.invalidImplementations.length}`);
console.log(`Report: ${output}`);
if (process.argv.includes("--strict")
  && (report.missingEffectCardNos.length > 0 || report.invalidImplementations.length > 0)) process.exitCode = 2;
