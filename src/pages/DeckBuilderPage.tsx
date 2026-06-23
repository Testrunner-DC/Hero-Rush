/**
 * DeckBuilderPage — jinteki 式组卡器布局
 *
 * 左侧栏（~260px）：新建卡组、我的卡组
 * 中间编辑区（flex-1）：
 *   顶部 — 卡组名 + 统计 badge + 操作按钮
 *   中部 — 左=卡牌搜索(FilterSidebar+CardGrid) | 右=卡组条目(main+rush)
 *   底部 — hover 卡牌详情
 *
 * 原有 deck 操作 props 全部保留。预组/导入功能在卡组广场(DeckPlazaPage)中。
 */

import { useState, useMemo, useCallback } from "react";
import type { CardDatabase, Card, Deck, DeckEntry } from "../types/card";
import FilterSidebar, { type FilterState } from "../components/FilterSidebar";
import CardGrid from "../components/CardGrid";
import CardDetailModal from "../components/CardDetailModal";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface DeckStats {
  mainCount: number;
  rushCount: number;
  colors: string[];
  overThreeNames: string[];
  mainValid: boolean;
  rushValid: boolean;
  colorValid: boolean;
  nameValid: boolean;
  allValid: boolean;
}

interface Props {
  db: CardDatabase;
  cardMap: Map<string, Card>;
  deckName: string;
  setDeckName: (v: string) => void;
  mainDeck: DeckEntry[];
  rushDeck: DeckEntry[];
  stats: DeckStats;
  savedDecks: Deck[];
  onAdd: (card: Card, isRush: boolean) => void;
  onRemove: (cardNo: string, isRush: boolean) => void;
  onClear: () => void;
  onSave: () => void;
  onLoad: (deck: Deck) => void;
  onDelete: (name: string) => void;
  onShare: () => void;
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

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export default function DeckBuilderPage(props: Props) {
  const {
    db,
    cardMap,
    deckName,
    setDeckName,
    mainDeck,
    rushDeck,
    stats,
    savedDecks,
    onAdd,
    onRemove,
    onClear,
    onSave,
    onLoad,
    onDelete,
    onShare,
  } = props;

  // ── Card search state ──
  const [pickerTab, setPickerTab] = useState<"main" | "rush">("main");
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // ── Filter handlers ──
  const onFilterChange = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const onReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // ── New deck handler ──
  const handleNewDeck = useCallback(() => {
    onClear();
    setDeckName("未命名卡组");
  }, [onClear, setDeckName]);

  // ── Card picker (unique card_nos, highest rarity) ──
  const pickerCards = useMemo(() => {
    const seen = new Set<string>();
    const result: Card[] = [];
    for (const card of db.cards) {
      if (seen.has(card.card_no)) continue;
      seen.add(card.card_no);
      result.push(card);
    }
    return result;
  }, [db.cards]);

  const filteredPicker = useMemo(() => {
    const { search, filterAttr, filterRarity, filterCost, filterPackage, sortBy } = filters;
    let result = pickerCards.filter((c) => {
      if (pickerTab === "main" && c.card_type !== 1) return false;
      if (pickerTab === "rush" && c.card_type !== 2) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.card_no.toLowerCase().includes(q)) return false;
      }
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
          return (b.dp_value || 0) - (a.dp_value || 0);
        case "name":
          return a.name.localeCompare(b.name, "zh-CN");
        default:
          return a.card_no.localeCompare(b.card_no);
      }
    });
    return result;
  }, [pickerCards, pickerTab, filters]);

  // ── Count for a card in the current deck ──
  const countFor = useCallback(
    (card: Card): number => {
      const deck = pickerTab === "main" ? mainDeck : rushDeck;
      return deck.find((e) => e.card_no === card.card_no)?.count || 0;
    },
    [pickerTab, mainDeck, rushDeck]
  );

  // ── Render deck entry row ──
  const renderDeckEntry = (entry: DeckEntry, isRush: boolean) => {
    const card = cardMap.get(entry.card_no);
    if (!card) return null;
    return (
      <div
        key={entry.card_no}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-[#1a2535] group transition"
        onMouseEnter={() => setHoveredCard(card)}
        onMouseLeave={() => setHoveredCard(null)}
      >
        {/* Attribute color bar */}
        <div
          className="w-0.5 h-7 rounded-full flex-shrink-0"
          style={{ backgroundColor: card.attribute_color }}
        />
        {/* Mini card image */}
        <img
          src={card.image_url}
          alt=""
          className="w-7 h-10 object-cover rounded-sm flex-shrink-0 bg-[#0a1120]"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0.2";
          }}
        />
        {/* Name + stats */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedCard(card)}>
          <p className="text-[11px] text-[#c9cdd4] truncate group-hover:text-white transition leading-tight">
            {card.name}
          </p>
          <p className="text-[10px] text-[#667788] leading-tight">
            Lv{card.cost} · {card.attribute_name}
            {card.power && ` · ${card.power}`}
          </p>
        </div>
        {/* Count controls */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => onRemove(entry.card_no, isRush)}
            className="w-5 h-5 rounded bg-[#1a2535] text-[#8899aa] hover:text-red-400 text-xs flex items-center justify-center transition"
          >
            −
          </button>
          <span className="text-xs text-white w-4 text-center font-medium">{entry.count}</span>
          <button
            onClick={() => onAdd(card, isRush)}
            className="w-5 h-5 rounded bg-[#1a2535] text-[#8899aa] hover:text-green-400 text-xs flex items-center justify-center transition"
          >
            +
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ═══ LEFT SIDEBAR: deck collection (260px) ═══ */}
      <aside className="w-[260px] flex-shrink-0 bg-[#0a1120] border-r border-[#1e2d42] overflow-y-auto scrollbar-thin flex flex-col">
        {/* New deck button */}
        <div className="p-2.5 border-b border-[#1e2d42]">
          <button
            onClick={handleNewDeck}
            className="w-full py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-500 rounded-lg transition flex items-center justify-center gap-1.5"
          >
            <span className="text-base leading-none">+</span> 新建卡组
          </button>
        </div>

        {/* Saved decks */}
        <div className="flex-1 p-2.5">
          <p className="text-[11px] text-[#667788] font-semibold uppercase tracking-wide mb-1.5">
            我的卡组 ({savedDecks.length})
          </p>
          {savedDecks.length === 0 ? (
            <p className="text-[11px] text-[#445566] py-2 text-center">
              还没有保存的卡组
            </p>
          ) : (
            <div className="space-y-1">
              {savedDecks.map((deck) => (
                <div
                  key={`${deck.name}-${deck.created_at}`}
                  className="flex items-center gap-1 rounded bg-[#131f2e] hover:bg-[#1a2535] transition group"
                >
                  <button
                    onClick={() => onLoad(deck)}
                    className="flex-1 flex items-center gap-2 px-2 py-1.5 text-left min-w-0"
                  >
                    <div className="w-1 h-6 rounded-full bg-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#c9cdd4] group-hover:text-white transition truncate leading-tight">
                        {deck.name}
                      </p>
                      <p className="text-[10px] text-[#667788] leading-tight">
                        {deck.main_deck.reduce((s, e) => s + e.count, 0)}/50
                        {deck.rush_deck.length > 0 &&
                          ` · ${deck.rush_deck.reduce((s, e) => s + e.count, 0)}R`}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`确定要删除卡组「${deck.name}」吗？`)) {
                        onDelete(deck.name);
                      }
                    }}
                    className="text-[#445566] hover:text-red-400 transition px-1.5 py-1 flex-shrink-0"
                    title="删除卡组"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ═══ CENTER: editor area ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Top bar: deck name + stats + actions ── */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#0a1120] border-b border-[#1e2d42] flex-shrink-0">
          <input
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="卡组名称"
            className="w-48 bg-[#131f2e] border border-[#2a3a50] rounded text-sm text-white px-2.5 py-1.5 focus:outline-none focus:border-red-500 transition"
          />

          {/* Stats badges */}
          <div className="flex flex-wrap gap-1">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                stats.mainValid ? "bg-green-900/40 text-green-400" : "bg-amber-900/40 text-amber-400"
              }`}
            >
              主卡组 {stats.mainCount}/50
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                stats.rushValid ? "bg-green-900/40 text-green-400" : "bg-amber-900/40 text-amber-400"
              }`}
            >
              冲击 {stats.rushCount}/9
            </span>
            {stats.colors.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  stats.colorValid ? "bg-green-900/40 text-green-400" : "bg-amber-900/40 text-amber-400"
                }`}
              >
                {stats.colors.join("/")}
              </span>
            )}
            {stats.allValid && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-400 font-medium">
                ✓ 合规
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="ml-auto flex gap-1">
            <button
              onClick={onSave}
              className="px-3 py-1.5 text-xs bg-[#1a2535] text-[#8899aa] hover:text-white rounded border border-[#2a3a50] transition font-medium"
            >
              保存
            </button>
            <button
              onClick={onShare}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-500 rounded transition font-medium"
            >
              分享
            </button>
            <button
              onClick={onClear}
              className="px-3 py-1.5 text-xs bg-[#1a2535] text-[#8899aa] hover:text-red-400 rounded border border-[#2a3a50] transition font-medium"
            >
              清空
            </button>
          </div>
        </div>

        {/* ── Middle: card search | deck entries ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Card search area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Filter sidebar with tab toggle */}
            <div className="w-[170px] flex-shrink-0 flex flex-col bg-[#131f2e] border-r border-[#1e2d42]">
              {/* Main / Rush tab */}
              <div className="flex gap-1 p-1.5 border-b border-[#1e2d42]">
                <button
                  onClick={() => setPickerTab("main")}
                  className={`flex-1 py-1 text-[11px] rounded transition font-medium ${
                    pickerTab === "main"
                      ? "bg-red-600 text-white"
                      : "bg-[#1a2535] text-[#8899aa] hover:text-white"
                  }`}
                >
                  角色卡
                </button>
                <button
                  onClick={() => setPickerTab("rush")}
                  className={`flex-1 py-1 text-[11px] rounded transition font-medium ${
                    pickerTab === "rush"
                      ? "bg-amber-600 text-white"
                      : "bg-[#1a2535] text-[#8899aa] hover:text-white"
                  }`}
                >
                  冲击卡
                </button>
              </div>
              {/* Filter */}
              <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
                <FilterSidebar
                  db={db}
                  state={filters}
                  onChange={onFilterChange}
                  onReset={onReset}
                  resultCount={filteredPicker.length}
                  compact
                />
              </div>
            </div>

            {/* Card grid */}
            <main className="flex-1 overflow-y-auto scrollbar-thin p-1.5">
              {filteredPicker.length === 0 ? (
                <div className="text-center py-20 text-[#445566]">
                  <p className="text-sm">没有匹配的卡牌</p>
                </div>
              ) : (
                <CardGrid
                  cards={filteredPicker}
                  onHover={setHoveredCard}
                  onSelect={(card) => onAdd(card, pickerTab === "rush")}
                  countFor={countFor}
                  columns={6}
                />
              )}
            </main>
          </div>

          {/* Deck entries area */}
          <div className="w-[270px] flex-shrink-0 bg-[#0f1923] border-l border-[#1e2d42] overflow-y-auto scrollbar-thin flex flex-col">
            {/* Main deck */}
            <div className="sticky top-0 bg-[#0a1120] border-b border-[#1e2d42] px-2 py-1.5 z-10">
              <span className="text-[11px] text-[#667788] font-semibold uppercase tracking-wide">
                主卡组 · {stats.mainCount}/50
              </span>
            </div>
            <div className="p-1.5 space-y-0.5">
              {mainDeck.length === 0 ? (
                <p className="text-center text-[11px] text-[#445566] py-4">
                  点击卡牌加入卡组
                </p>
              ) : (
                mainDeck.map((e) => renderDeckEntry(e, false))
              )}
            </div>

            {/* Rush deck */}
            <div className="sticky top-0 bg-[#0a1120] border-y border-[#1e2d42] px-2 py-1.5 z-10 mt-2">
              <span className="text-[11px] text-[#667788] font-semibold uppercase tracking-wide">
                冲击卡组 · {stats.rushCount}/9
              </span>
            </div>
            <div className="p-1.5 space-y-0.5">
              {rushDeck.length === 0 ? (
                <p className="text-center text-[11px] text-[#445566] py-4">
                  切换冲击卡 tab 后加入
                </p>
              ) : (
                rushDeck.map((e) => renderDeckEntry(e, true))
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom: hover detail ── */}
        <div className="h-[110px] flex-shrink-0 bg-[#131f2e] border-t border-[#1e2d42] flex items-center px-3 gap-3 overflow-hidden">
          {hoveredCard ? (
            <>
              <img
                src={hoveredCard.image_url}
                alt={hoveredCard.name}
                className="h-[95px] w-auto rounded object-cover flex-shrink-0 bg-[#0a1120]"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = "0.2";
                }}
              />
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#e8eaed]">{hoveredCard.name}</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{
                      backgroundColor: `${hoveredCard.attribute_color}30`,
                      color: hoveredCard.attribute_color,
                    }}
                  >
                    {hoveredCard.attribute_name}
                  </span>
                  <span className="text-[10px] text-[#667788]">Lv{hoveredCard.cost}</span>
                  {hoveredCard.power && (
                    <span className="text-[10px] text-red-400 font-medium">{hoveredCard.power}</span>
                  )}
                  <span className="text-[10px] text-[#445566]">{hoveredCard.card_no}</span>
                </div>
                <p className="text-xs text-[#8899aa] leading-relaxed line-clamp-3 overflow-hidden">
                  {hoveredCard.effect}
                </p>
              </div>
              <button
                onClick={() => setSelectedCard(hoveredCard)}
                className="flex-shrink-0 px-2 py-1 text-[11px] text-[#8899aa] hover:text-white bg-[#1a2535] rounded transition"
              >
                详情
              </button>
            </>
          ) : (
            <div className="flex-1 text-center text-xs text-[#445566]">
              悬停卡牌查看详情
            </div>
          )}
        </div>
      </div>

      {/* Click modal for full detail */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          db={db}
          onClose={() => setSelectedCard(null)}
          onAddToDeck={onAdd}
        />
      )}
    </div>
  );
}
