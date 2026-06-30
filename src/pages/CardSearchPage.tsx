/**
 * CardSearchPage — Piltover Archive style card gallery
 *
 * Left: filter sidebar (220px)
 * Center: full-width image card grid (flex-1, scrollable)
 * No resident detail sidebar — click card opens modal
 *
 * Supports column count control and 战力/距离 range filters (P0+P1).
 * ColumnSelector moved to floating toolbar above card grid.
 */

import { useState, useMemo, useCallback } from "react";
import type { CardDatabase, Card } from "../types/card";
import FilterSidebar, { DEFAULT_FILTERS, type FilterState } from "../components/FilterSidebar";
import CardGrid from "../components/CardGrid";
import CardDetailModal from "../components/CardDetailModal";
import ColumnSelector from "../components/ColumnSelector";

interface Props {
  db: CardDatabase;
}

export default function CardSearchPage({ db }: Props) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [columns, setColumns] = useState(8);

  const onFilterChange = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const onReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const filtered = useMemo(() => {
    const { search, filterType, filterAttr, filterRarity, filterCost, filterPackage, sortBy, powerMin, powerMax, distanceMin, distanceMax } = filters;
    let result = db.cards.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !c.name.toLowerCase().includes(q) &&
          !c.card_no.toLowerCase().includes(q) &&
          !c.effect.toLowerCase().includes(q) &&
          !(c.feature_text || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (filterType !== "all" && c.card_type !== filterType) return false;
      if (filterAttr !== "all" && c.attribute !== filterAttr) return false;
      if (filterRarity !== "all" && c.rarity !== filterRarity) return false;
      if (filterCost !== "all" && c.cost !== filterCost) return false;
      if (filterPackage !== "all" && c.package_short !== filterPackage) return false;
      // 战力 range filter
      const cardPower = c.power ? parseInt(c.power) : null;
      if (powerMin !== "all" && (cardPower == null || cardPower < powerMin)) return false;
      if (powerMax !== "all" && (cardPower == null || cardPower > powerMax)) return false;
      // 距离 range filter（匹配卡片显示的 R 值，即 c.r）
      if (distanceMin !== "all" && (c.r == null || c.r < distanceMin)) return false;
      if (distanceMax !== "all" && (c.r == null || c.r > distanceMax)) return false;
      return true;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case "cost":
          return a.cost === b.cost ? a.card_no.localeCompare(b.card_no) : a.cost - b.cost;
        case "power":
          return (b.power ? parseInt(b.power) : 0) - (a.power ? parseInt(a.power) : 0) || a.card_no.localeCompare(b.card_no);
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
      <aside className="w-[220px] flex-shrink-0 bg-white border-r border-stone-200 overflow-y-auto scrollbar-thin p-3">
        <FilterSidebar
          db={db}
          state={filters}
          onChange={onFilterChange}
          onReset={onReset}
          resultCount={filtered.length}
        />
      </aside>

      {/* ── Center: card grid (full width) ──────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#fcfaf7]">
        {/* Floating toolbar above the grid */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-white/90 border-b border-stone-200 flex-shrink-0">
          <span className="text-[11px] text-stone-500 font-medium">
            {filtered.length} 张结果
          </span>
          <ColumnSelector columns={columns} onChange={setColumns} />
        </div>

        {/* Scrollable card grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-stone-400">
              <p className="text-lg">没有找到匹配的卡牌</p>
              <p className="text-sm mt-2">尝试调整筛选条件</p>
            </div>
          ) : (
            <CardGrid
              cards={filtered}
              onHover={setHoveredCard}
              onSelect={setSelectedCard}
              columns={columns}
            />
          )}
        </div>
      </main>

      {/* ── Click modal (detail view, no add-to-deck) ────────── */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          db={db}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}
