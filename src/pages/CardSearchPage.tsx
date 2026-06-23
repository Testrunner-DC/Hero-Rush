/**
 * CardSearchPage — three-column layout (jinteki-style)
 *
 * Left: filter sidebar (220px)
 * Center: pure image card grid (flex-1, scrollable)
 * Right: hover detail panel (280px, resident — not a popup)
 */

import { useState, useMemo, useCallback } from "react";
import type { CardDatabase, Card } from "../types/card";
import FilterSidebar, { type FilterState } from "../components/FilterSidebar";
import CardGrid from "../components/CardGrid";
import CardDetailSidebar from "../components/CardDetailSidebar";
import CardDetailModal from "../components/CardDetailModal";

interface Props {
  db: CardDatabase;
  onAddToDeck: (card: Card, isRush: boolean) => void;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  filterType: "all",
  filterAttr: "all",
  filterRarity: "all",
  filterCost: "all",
  filterPackage: "all",
  sortBy: "card_no",
};

export default function CardSearchPage({ db, onAddToDeck }: Props) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const onFilterChange = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const onReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const filtered = useMemo(() => {
    const { search, filterType, filterAttr, filterRarity, filterCost, filterPackage, sortBy } = filters;
    let result = db.cards.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !c.name.toLowerCase().includes(q) &&
          !c.card_no.toLowerCase().includes(q) &&
          !c.effect.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (filterType !== "all" && c.card_type !== filterType) return false;
      if (filterAttr !== "all" && c.attribute !== filterAttr) return false;
      if (filterRarity !== "all" && c.rarity !== filterRarity) return false;
      if (filterCost !== "all" && c.cost !== filterCost) return false;
      if (filterPackage !== "all" && c.package_short !== filterPackage) return false;
      return true;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case "cost":
          return a.cost === b.cost ? a.card_no.localeCompare(b.card_no) : a.cost - b.cost;
        case "power":
          return (b.dp_value || 0) - (a.dp_value || 0) || a.card_no.localeCompare(b.card_no);
        case "name":
          return a.name.localeCompare(b.name, "zh-CN");
        default:
          return a.card_no.localeCompare(b.card_no);
      }
    });

    return result;
  }, [db.cards, filters]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: filter sidebar ─────────────────────────────── */}
      <aside className="w-[220px] flex-shrink-0 bg-[#131f2e] border-r border-[#1e2d42] overflow-y-auto scrollbar-thin p-3">
        <FilterSidebar
          db={db}
          state={filters}
          onChange={onFilterChange}
          onReset={onReset}
          resultCount={filtered.length}
        />
      </aside>

      {/* ── Center: card grid ────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-[#445566]">
            <p className="text-lg">没有找到匹配的卡牌</p>
            <p className="text-sm mt-2">尝试调整筛选条件</p>
          </div>
        ) : (
          <CardGrid
            cards={filtered}
            onHover={setHoveredCard}
            onSelect={setSelectedCard}
          />
        )}
      </main>

      {/* ── Right: detail sidebar (resident, hover-driven) ───── */}
      <aside className="w-[280px] flex-shrink-0 bg-[#131f2e] border-l border-[#1e2d42] overflow-y-auto scrollbar-thin flex flex-col">
        <CardDetailSidebar
          card={hoveredCard}
          db={db}
          onAddToDeck={onAddToDeck}
        />
      </aside>

      {/* ── Click modal (for full detail / add to deck) ──────── */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          db={db}
          onClose={() => setSelectedCard(null)}
          onAddToDeck={onAddToDeck}
        />
      )}
    </div>
  );
}
