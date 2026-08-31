import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readPage = (name: string) => readFileSync(new URL(`../pages/${name}`, import.meta.url), "utf8");

describe("Legion12 reference workspace contracts", () => {
  it("keeps card search as archive toolbar, paged pool, and resident detail", () => {
    const source = readPage("CardSearchPage.tsx");
    expect(source).toContain("Card Archive");
    expect(source).toContain("全部类型");
    expect(source).toContain('aria-label="卡牌搜索结果"');
    expect(source).toContain("<CardDetailSidebar");
    expect(source).toContain("<PaginationControls");
    expect(source).toContain("var(--msa-bg)");
    expect(source).toContain("<CardVariantImage");
    expect(source).toContain("onVariantChange={setSelectedCard}");
    expect(source).not.toContain('absolute left-1 top-1 grid h-6 min-w-6');
  });

  it("keeps the deck library split between plaza and local decks", () => {
    const source = readPage("DeckPlazaPage.tsx");
    expect(source).toContain('type LibraryTab = "plaza" | "mine"');
    expect(source).toContain('useState<LibraryTab>("plaza")');
    expect(source).toContain('(["plaza", "mine"] as LibraryTab[])');
    expect(source).toContain(">卡组</h1>");
    expect(source).toContain("搜索卡组名称、作者或代表卡牌");
    expect(source).toContain("生成卡组图");
    expect(source).toContain("bannerCards");
    expect(source).toContain("<PaginationControls");
  });

  it("keeps deck building in persistent filter, pool, and deck columns", () => {
    const source = readPage("DeckBuilderPage.tsx");
    const filter = source.indexOf("Filter</p>");
    const pool = source.indexOf("Card Pool</p>");
    const deck = source.indexOf("Deck List</p>");
    expect(filter).toBeGreaterThan(-1);
    expect(pool).toBeGreaterThan(filter);
    expect(deck).toBeGreaterThan(pool);
    expect(source).toContain("onDoubleClick");
    expect(source).toContain("生成卡组图");
    expect(source).toContain("增加 ${card.name}");
    expect(source).toContain("object-[center_28%]");
    expect(source).toContain("grid-cols-[238px_minmax(420px,1fr)_350px]");
    expect(source).toContain("ORDINARY_CARD_VARIANT_ACCESS");
    expect(source).toContain("deckEligibleVariant");
    expect(source).toContain("lockedToLowest");
  });
});
