import { readFile } from "node:fs/promises";
import type { CardDatabase } from "@hero-rush/game-core";

export async function loadCardCatalog(): Promise<CardDatabase> {
  const catalogUrl = new URL("../../public/cards.json", import.meta.url);
  const raw = await readFile(catalogUrl, "utf8");
  const parsed = JSON.parse(raw) as CardDatabase;
  if (!Array.isArray(parsed.cards) || parsed.cards.length === 0) {
    throw new Error("卡牌目录为空或格式无效");
  }
  return parsed;
}
