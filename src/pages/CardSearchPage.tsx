import { useCallback, useMemo, useState } from "react";
import type { Card, CardDatabase } from "../types/card";
import FilterSidebar, { DEFAULT_FILTERS, type FilterState } from "../components/FilterSidebar";
import CardGrid from "../components/CardGrid";
import CardDetailModal from "../components/CardDetailModal";
import ColumnSelector from "../components/ColumnSelector";

interface Props {
  db: CardDatabase;
  cardMap: Map<string, Card>;
}

export default function CardSearchPage({ db, cardMap }: Props) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [columns, setColumns] = useState(8);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  const onFilterChange = useCallback((patch: Partial<FilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const onReset = useCallback(() => setFilters(DEFAULT_FILTERS), []);
  const baseCards = useMemo(() => Array.from(cardMap.values()), [cardMap]);

  // Filter every rarity variant first, then deduplicate for display. Doing this
  // in the opposite order would hide cards whose matching rarity is not the
  // representative variant stored in cardMap.
  const filteredCards = useMemo(() => {
    const matched = db.cards.filter((card) => {
      const {
        search,
        filterType,
        filterAttr,
        filterRarity,
        filterCost,
        filterPackage,
        powerMin,
        powerMax,
        distanceMin,
        distanceMax,
        selectedAttrs,
        selectedRarities,
        selectedCosts,
      } = filters;

      if (filterType !== "all" && card.card_type !== filterType) return false;
      if (search) {
        const query = search.toLowerCase();
        if (
          !card.name.toLowerCase().includes(query) &&
          !card.card_no.toLowerCase().includes(query) &&
          !(card.feature_text || "").toLowerCase().includes(query)
        ) return false;
      }
      if (filterAttr !== "all" && card.attribute !== filterAttr) return false;
      if (filterRarity !== "all" && card.rarity !== filterRarity) return false;
      if (filterCost !== "all" && card.cost !== filterCost) return false;
      if (selectedAttrs.length > 0 && !selectedAttrs.includes(card.attribute)) return false;
      if (selectedRarities.length > 0 && !selectedRarities.includes(card.rarity)) return false;
      if (selectedCosts.length > 0 && !selectedCosts.includes(card.cost)) return false;
      if (filterPackage !== "all" && card.package_short !== filterPackage) return false;

      const power = card.power ? parseInt(card.power, 10) : null;
      if (powerMin !== "all" && (power == null || power < powerMin)) return false;
      if (powerMax !== "all" && (power == null || power > powerMax)) return false;
      if (distanceMin !== "all" && (card.r == null || card.r < distanceMin)) return false;
      if (distanceMax !== "all" && (card.r == null || card.r > distanceMax)) return false;
      return true;
    });

    const seen = new Set<string>();
    const result = matched.filter((card) => {
      if (seen.has(card.card_no)) return false;
      seen.add(card.card_no);
      return true;
    });

    result.sort((left, right) => {
      switch (filters.sortBy) {
        case "cost":
          return left.cost === right.cost
            ? left.card_no.localeCompare(right.card_no)
            : left.cost - right.cost;
        case "power":
          return (right.power ? parseInt(right.power, 10) : 0) -
            (left.power ? parseInt(left.power, 10) : 0);
        case "name":
          return left.name.localeCompare(right.name, "zh-CN");
        default:
          return left.card_no.localeCompare(right.card_no);
      }
    });

    return result;
  }, [db.cards, filters]);

  const handleHover = useCallback(() => undefined, []);

  return (
    <div className="flex h-full overflow-hidden bg-[#fcfaf7]">
      {showFilters && (
        <aside className="w-[264px] flex-shrink-0 overflow-y-auto border-r border-stone-200 bg-white/90 scrollbar-thin">
          <div className="p-3">
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-sm font-bold tracking-wide text-stone-800">卡查</h1>
              <span className="text-[10px] text-stone-400">共 {baseCards.length} 张卡</span>
            </div>
            <FilterSidebar
              db={db}
              state={filters}
              onChange={onFilterChange}
              onReset={onReset}
              resultCount={filteredCards.length}
            />
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-stone-200 bg-white/80 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setShowFilters((visible) => !visible)}
            className="flex items-center gap-1 rounded border border-stone-200 bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-500 transition hover:bg-stone-200 hover:text-stone-700"
            title={showFilters ? "收起筛选" : "展开筛选"}
          >
            <svg
              className={`h-3 w-3 transition-transform ${showFilters ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {showFilters ? "收起筛选" : "展开筛选"}
          </button>
          <span className="text-[11px] text-stone-500">{filteredCards.length} 张结果</span>
          <span className="hidden text-[10px] text-stone-400 md:inline">点击卡牌查看详情与其他稀有度</span>
          <div className="ml-auto">
            <ColumnSelector columns={columns} onChange={setColumns} />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-1.5 scrollbar-thin">
          {filteredCards.length === 0 ? (
            <div className="py-20 text-center text-stone-400">
              <p className="text-sm">没有匹配的卡牌</p>
              <button
                type="button"
                onClick={onReset}
                className="mt-3 rounded border border-stone-200 px-3 py-1.5 text-xs text-stone-500 transition hover:text-red-600"
              >
                清除筛选
              </button>
            </div>
          ) : (
            <CardGrid
              cards={filteredCards}
              onHover={handleHover}
              onSelect={setSelectedCard}
              columns={columns}
            />
          )}
        </main>
      </div>

      {selectedCard && (
        <CardDetailModal card={selectedCard} db={db} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );
}
