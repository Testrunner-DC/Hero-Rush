/**
 * DeckBuilderPage — Piltover Archive style two-column layout
 *
 * Top bar:    deck name + stats badges + save/import/share/clear buttons
 * Left (~60%): type tabs, collapsible filters, column selector, card grid
 * Right (~380px): view tabs (Gallery/Stats/Hand), control toolbar, content
 * Bottom:     hover card detail strip
 *
 * P0: Column selector on left panel, Stats view with cost curve + color distribution
 * P1: 战力/距离 range filters, Import/Export deck codes
 * P2: Sample hand simulator, foil effect, card scale, sort dropdowns in deck sections
 *
 * NOTE: Impact cards (card_type === 2) are display-only and not added to any deck.
 */

import { useState, useMemo, useCallback } from "react";
import type { CardDatabase, Card, Deck, DeckEntry } from "../types/card";
import FilterSidebar, { DEFAULT_FILTERS, type FilterState } from "../components/FilterSidebar";
import CardGrid from "../components/CardGrid";
import CardDetailModal from "../components/CardDetailModal";
import ColumnSelector from "../components/ColumnSelector";
import DeckStatsView from "../components/DeckStatsView";
import SampleHandView from "../components/SampleHandView";
import ImportDeckModal from "../components/ImportDeckModal";
import { encodeDeck, decodeDeck, extractDeckCode } from "../utils/deckCode";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface DeckStats {
  mainCount: number;
  colors: string[];
  overThreeNames: string[];
  mainValid: boolean;
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
  stats: DeckStats;
  savedDecks: Deck[];
  onAdd: (card: Card) => void;
  onRemove: (cardNo: string) => void;
  onClear: () => void;
  onSave: () => void;
  onLoad: (deck: Deck) => void;
  onDelete: (name: string) => void;
  onShare: () => void;
}

type PickerTab = "all" | "main";
type RightViewMode = "gallery" | "stats" | "hand";
type DeckSort = "energy" | "power" | "name";

const TAB_CONFIG: { key: PickerTab; label: string; activeClass: string }[] = [
  { key: "all", label: "全部", activeClass: "bg-stone-700 text-white" },
  { key: "main", label: "角色卡", activeClass: "bg-red-600 text-white" },
];

const SORT_LABELS: Record<DeckSort, string> = {
  energy: "等级",
  power: "战力",
  name: "名称",
};

const SORT_OPTIONS: DeckSort[] = ["energy", "power", "name"];

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
    stats,
    savedDecks,
    onAdd,
    onRemove,
    onClear,
    onSave,
    onLoad,
    onDelete,
  } = props;

  // ── Card search state ──
  const [pickerTab, setPickerTab] = useState<PickerTab>("all");
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // ── UI state ──
  const [columns, setColumns] = useState(6);
  const [showImport, setShowImport] = useState(false);
  const [filterCollapsed, setFilterCollapsed] = useState(true);

  // ── Right panel state ──
  const [rightViewMode, setRightViewMode] = useState<RightViewMode>("gallery");
  const [foilEnabled, setFoilEnabled] = useState(false);
  const [cardScale, setCardScale] = useState(1.0);
  const [mainSort, setMainSort] = useState<DeckSort>("energy");

  // ── Collapse state for right-column sections ──
  const [mainCollapsed, setMainCollapsed] = useState(false);
  const [savedCollapsed, setSavedCollapsed] = useState(false);

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

  // ── Share handler: copy raw deck code to clipboard ─────
  const handleShare = useCallback(() => {
    const deck: Deck = {
      name: deckName,
      main_deck: mainDeck,
      rush_deck: [],
      created_at: new Date().toISOString(),
    };
    const code = encodeDeck(deck);
    navigator.clipboard.writeText(code).then(() => {
      alert("已复制到剪贴板");
    }).catch(() => {
      prompt("复制以下卡组码:", code);
    });
  }, [deckName, mainDeck]);

  // ── Import handler: decode → clear → add all cards ────
  const handleImport = useCallback(
    (code: string) => {
      const extracted = extractDeckCode(code);
      const deck = decodeDeck(extracted);
      if (!deck) return;

      onClear();
      for (const entry of deck.main_deck) {
        const card = cardMap.get(entry.card_no);
        if (card) {
          for (let i = 0; i < entry.count; i++) {
            onAdd(card);
          }
        }
      }
      setDeckName(deck.name);
      setShowImport(false);
    },
    [onClear, onAdd, cardMap, setDeckName]
  );

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
    const { search, filterAttr, filterRarity, filterCost, filterPackage, sortBy, dpMin, dpMax, ppMin, ppMax } = filters;
    let result = pickerCards.filter((c) => {
      if (pickerTab === "main" && c.card_type !== 1) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.card_no.toLowerCase().includes(q) && !(c.feature_text || "").toLowerCase().includes(q)) return false;
      }
      if (filterAttr !== "all" && c.attribute !== filterAttr) return false;
      if (filterRarity !== "all" && c.rarity !== filterRarity) return false;
      if (filterCost !== "all" && c.cost !== filterCost) return false;
      if (filterPackage !== "all" && c.package_short !== filterPackage) return false;
      const cardPower = c.power ? parseInt(c.power) : null;
      if (dpMin !== "all" && (cardPower == null || cardPower < dpMin)) return false;
      if (dpMax !== "all" && (cardPower == null || cardPower > dpMax)) return false;
      if (ppMin !== "all" && (c.pp_value == null || c.pp_value < ppMin)) return false;
      if (ppMax !== "all" && (c.pp_value == null || c.pp_value > ppMax)) return false;
      return true;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case "cost":
          return a.cost === b.cost ? a.card_no.localeCompare(b.card_no) : a.cost - b.cost;
        case "power":
          return (b.power ? parseInt(b.power) : 0) - (a.power ? parseInt(a.power) : 0);
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
      // Impact cards (card_type === 2) are never in any deck
      if (card.card_type === 2) return 0;
      return mainDeck.find((e) => e.card_no === card.card_no)?.count || 0;
    },
    [mainDeck]
  );

  // ── Card select handler ──
  const handleCardSelect = useCallback(
    (card: Card) => {
      // Impact cards (card_type === 2) are display-only, do nothing on click
      if (card.card_type === 2) {
        setSelectedCard(card);
        return;
      }
      if (card.card_type === 1) {
        onAdd(card);
      } else {
        setSelectedCard(card);
      }
    },
    [onAdd]
  );

  // ── Sort utility for deck entries ──
  const sortEntries = useCallback(
    (entries: DeckEntry[], sort: DeckSort): DeckEntry[] => {
      const sorted = [...entries];
      sorted.sort((a, b) => {
        const ca = cardMap.get(a.card_no);
        const cb = cardMap.get(b.card_no);
        if (!ca || !cb) return 0;
        switch (sort) {
          case "energy":
            return ca.cost === cb.cost
              ? ca.name.localeCompare(cb.name, "zh-CN")
              : ca.cost - cb.cost;
          case "power":
            return (cb.power ? parseInt(cb.power) : 0) === (ca.power ? parseInt(ca.power) : 0)
              ? ca.name.localeCompare(cb.name, "zh-CN")
              : (cb.power ? parseInt(cb.power) : 0) - (ca.power ? parseInt(ca.power) : 0);
          case "name":
            return ca.name.localeCompare(cb.name, "zh-CN");
          default:
            return 0;
        }
      });
      return sorted;
    },
    [cardMap]
  );

  const sortedMainDeck = useMemo(
    () => sortEntries(mainDeck, mainSort),
    [mainDeck, mainSort, sortEntries]
  );

  // ── Render deck entry row ──
  const renderDeckEntry = (entry: DeckEntry) => {
    const card = cardMap.get(entry.card_no);
    if (!card) return null;
    return (
      <div
        key={entry.card_no}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-[var(--msa-surface-hover)] group transition"
        onMouseEnter={() => setHoveredCard(card)}
        onMouseLeave={() => setHoveredCard(null)}
      >
        <div
          className="w-0.5 h-7 rounded-full flex-shrink-0"
          style={{ backgroundColor: card.attribute_color }}
        />
        <div className="w-7 h-10 flex-shrink-0 overflow-hidden rounded-sm">
          <img
            src={card.image_url}
            alt=""
            className={`w-7 h-10 object-cover rounded-sm bg-white/90 ${foilEnabled ? "card-foil" : ""}`}
            style={{ transform: `scale(${cardScale})`, transformOrigin: "center" }}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = "0.2";
            }}
          />
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedCard(card)}>
          <p className="text-[11px] text-[var(--msa-text-secondary)] truncate group-hover:text-[var(--msa-text-primary)] transition leading-tight">
            {card.name}
          </p>
          <p className="text-[10px] text-[var(--msa-text-muted)] leading-tight">
            Lv{card.cost} · {card.attribute_name}
            {card.power && ` · ${card.power}`}
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => onRemove(entry.card_no)}
            className="w-5 h-5 rounded bg-[var(--msa-surface)] text-[var(--msa-text-muted)] hover:text-[var(--msa-red)] text-xs flex items-center justify-center transition"
          >
            −
          </button>
          <span className="text-xs text-[var(--msa-text-primary)] w-4 text-center font-medium">
            {entry.count}
          </span>
          <button
            onClick={() => onAdd(card)}
            className="w-5 h-5 rounded bg-[var(--msa-surface)] text-[var(--msa-text-muted)] hover:text-green-600 text-xs flex items-center justify-center transition"
          >
            +
          </button>
        </div>
      </div>
    );
  };

  // ── Collapse arrow ──
  const collapseArrow = (collapsed: boolean) => (
    <svg
      className={`w-3 h-3 transition-transform ${collapsed ? "" : "rotate-90"}`}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );

  // ── Sort dropdown (compact) ──
  const renderSortSelect = (value: DeckSort, onChange: (s: DeckSort) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as DeckSort)}
      className="text-[10px] text-stone-400 bg-transparent border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-red-400 transition cursor-pointer"
      title="排序方式"
    >
      {SORT_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {SORT_LABELS[s]} ▲
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ═══ TOP BAR ═══ */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/90 border-b border-[var(--msa-border)] flex-shrink-0">
        <input
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          placeholder="卡组名称"
          className="w-48 bg-[var(--msa-bg-alt)] border border-[var(--msa-border-strong)] rounded text-sm text-[var(--msa-text-primary)] px-2.5 py-1.5 focus:outline-none focus:border-red-500 transition"
        />

        <div className="flex flex-wrap gap-1">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              stats.mainValid ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
            }`}
          >
            主卡组 {stats.mainCount}/50
          </span>
          {stats.colors.length > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                stats.colorValid ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
              }`}
            >
              {stats.colors.join("/")}
            </span>
          )}
          {stats.allValid && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">
              ✓ 合规
            </span>
          )}
        </div>

        <div className="ml-auto flex gap-1">
          <button onClick={onSave} className="px-3 py-1.5 text-xs bg-[var(--msa-surface)] text-[var(--msa-text-muted)] hover:text-[var(--msa-text-primary)] rounded border border-[var(--msa-border-strong)] transition font-medium">
            保存
          </button>
          <button onClick={() => setShowImport(true)} className="px-3 py-1.5 text-xs bg-[var(--msa-surface)] text-[var(--msa-text-muted)] hover:text-[var(--msa-text-primary)] rounded border border-[var(--msa-border-strong)] transition font-medium">
            导入
          </button>
          <button onClick={handleShare} className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-500 rounded transition font-medium">
            分享
          </button>
          <button onClick={onClear} className="px-3 py-1.5 text-xs bg-[var(--msa-surface)] text-[var(--msa-text-muted)] hover:text-[var(--msa-red)] rounded border border-[var(--msa-border-strong)] transition font-medium">
            清空
          </button>
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* ── LEFT COLUMN ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Type tabs + Filter toggle */}
          <div className="flex items-center gap-1 p-1.5 bg-[var(--msa-bg-alt)] border-b border-[var(--msa-border)] flex-shrink-0">
            <button
              onClick={() => setFilterCollapsed(!filterCollapsed)}
              className="px-2 py-1 text-[11px] rounded bg-[var(--msa-surface)] text-[var(--msa-text-muted)] hover:text-[var(--msa-text-primary)] border border-[var(--msa-border-strong)] transition font-medium flex items-center gap-1"
            >
              <svg
                className={`w-3 h-3 transition-transform ${filterCollapsed ? "" : "rotate-180"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              {filterCollapsed ? "展开筛选" : "收起筛选"}
            </button>

            {/* Search input — always visible regardless of filter collapse */}
            <div className="relative flex-1 min-w-[120px] max-w-[280px]">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => onFilterChange({ search: e.target.value })}
                placeholder="搜索卡名/编号/效果..."
                className="w-full bg-white border border-stone-200 rounded text-sm text-stone-700 placeholder-stone-400 pl-8 pr-3 py-2 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition"
              />
            </div>

            {TAB_CONFIG.map((t) => (
              <button
                key={t.key}
                onClick={() => setPickerTab(t.key)}
                className={`px-3 py-1 text-[11px] rounded transition font-medium ${
                  pickerTab === t.key
                    ? t.activeClass
                    : "bg-[var(--msa-surface)] text-[var(--msa-text-muted)] hover:text-[var(--msa-text-primary)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Collapsible filter bar */}
          {!filterCollapsed && (
            <div className="flex-shrink-0 overflow-y-auto scrollbar-thin bg-white/80 border-b border-[var(--msa-border)]">
              <div className="p-2">
                <FilterSidebar
                  db={db}
                  state={filters}
                  onChange={onFilterChange}
                  onReset={onReset}
                  resultCount={filteredPicker.length}
                  compact
                  hideSearch
                />
              </div>
            </div>
          )}

          {/* Result count + Column selector */}
          <div className="px-3 py-1 text-[10px] text-[var(--msa-text-muted)] bg-white/80 flex-shrink-0 flex items-center justify-between">
            <span>{filteredPicker.length} 张结果</span>
            <ColumnSelector columns={columns} onChange={setColumns} />
          </div>

          {/* Card grid (always visible) */}
          <main className="flex-1 overflow-y-auto scrollbar-thin p-1.5 bg-[#fcfaf7]">
            {filteredPicker.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-sm">没有匹配的卡牌</p>
              </div>
            ) : (
              <CardGrid
                cards={filteredPicker}
                onHover={setHoveredCard}
                onSelect={handleCardSelect}
                countFor={countFor}
                columns={columns}
                foilEnabled={foilEnabled}
                cardScale={cardScale}
              />
            )}
          </main>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="w-[380px] flex-shrink-0 bg-white/90 border-l border-[var(--msa-border)] flex flex-col overflow-hidden">
          {/* View mode tabs */}
          <div className="flex items-center gap-0.5 p-1 bg-[var(--msa-bg-alt)] border-b border-[var(--msa-border)] flex-shrink-0">
            {(["gallery", "stats", "hand"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setRightViewMode(mode)}
                className={`px-2.5 py-1 text-[11px] rounded font-medium transition ${
                  rightViewMode === mode
                    ? "bg-msa-600 text-white shadow-sm"
                    : "bg-[var(--msa-surface)] text-[var(--msa-text-muted)] hover:text-[var(--msa-text-primary)]"
                }`}
              >
                {mode === "gallery" ? "画廊" : mode === "stats" ? "统计" : "起手"}
              </button>
            ))}
          </div>

          {/* Control toolbar */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white border-b border-[var(--msa-border)] flex-shrink-0 overflow-x-auto scrollbar-thin">
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-[10px] text-stone-400">列</span>
              <ColumnSelector columns={columns} onChange={setColumns} compact />
            </div>

            <div className="w-px h-3 bg-stone-200 flex-shrink-0" />

            <button
              onClick={() => setFoilEnabled(!foilEnabled)}
              className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border transition flex-shrink-0 ${
                foilEnabled
                  ? "bg-amber-50 border-amber-300 text-amber-700"
                  : "bg-white border-stone-200 text-stone-400 hover:text-stone-600"
              }`}
              title="闪卡光泽效果"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2l1.8 5.5H17.5l-4.6 3.3 1.8 5.5L10 13l-4.7 3.3 1.8-5.5-4.6-3.3h5.7L10 2z" />
              </svg>
              闪卡
            </button>

            <div className="w-px h-3 bg-stone-200 flex-shrink-0" />

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] text-stone-400 whitespace-nowrap">卡图</span>
              <span className="text-[10px] text-stone-400">小</span>
              <input
                type="range"
                min="0.6"
                max="1.4"
                step="0.1"
                value={cardScale}
                onChange={(e) => setCardScale(parseFloat(e.target.value))}
                className="w-14 h-1 accent-red-600 cursor-pointer flex-shrink-0"
                title="卡片缩放"
              />
              <span className="text-[10px] text-stone-400">大</span>
            </div>
          </div>

          {/* Right panel content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {rightViewMode === "stats" ? (
              <DeckStatsView
                mainDeck={mainDeck}
                rushDeck={[]}
                cardMap={cardMap}
                stats={{ ...stats, rushCount: 0, rushValid: true }}
              />
            ) : rightViewMode === "hand" ? (
              <SampleHandView
                mainDeck={mainDeck}
                rushDeck={[]}
                cardMap={cardMap}
              />
            ) : (
              <>
                {/* Main deck section */}
                <div className="border-b border-[var(--msa-border)]">
                  <button
                    onClick={() => setMainCollapsed(!mainCollapsed)}
                    className="sticky top-0 z-10 w-full flex items-center gap-1.5 bg-white/95 px-2.5 py-2 border-b border-[var(--msa-border)] hover:bg-[var(--msa-surface-hover)] transition"
                  >
                    <span className="text-[var(--msa-text-muted)] flex-shrink-0">
                      {collapseArrow(mainCollapsed)}
                    </span>
                    <span className="text-[11px] text-[var(--msa-text-muted)] font-semibold uppercase tracking-wide">
                      主卡组 · {stats.mainCount}/50
                    </span>
                    <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
                      {renderSortSelect(mainSort, setMainSort)}
                    </div>
                  </button>
                  {!mainCollapsed && (
                    <div className="p-1.5 space-y-0.5">
                      {sortedMainDeck.length === 0 ? (
                        <p className="text-center text-[11px] text-gray-400 py-4">
                          点击卡牌加入卡组
                        </p>
                      ) : (
                        sortedMainDeck.map((e) => renderDeckEntry(e))
                      )}
                    </div>
                  )}
                </div>

                {/* Saved decks section */}
                <div className="flex-1">
                  <button
                    onClick={() => setSavedCollapsed(!savedCollapsed)}
                    className="sticky top-0 z-10 w-full flex items-center gap-1.5 bg-white/95 px-2.5 py-2 border-b border-[var(--msa-border)] hover:bg-[var(--msa-surface-hover)] transition"
                  >
                    <span className="text-[var(--msa-text-muted)] flex-shrink-0">
                      {collapseArrow(savedCollapsed)}
                    </span>
                    <span className="text-[11px] text-[var(--msa-text-muted)] font-semibold uppercase tracking-wide">
                      我的卡组 ({savedDecks.length})
                    </span>
                  </button>
                  {!savedCollapsed && (
                    <div className="p-2 space-y-1.5">
                      <button
                        onClick={handleNewDeck}
                        className="w-full py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-500 rounded-lg transition flex items-center justify-center gap-1.5"
                      >
                        <span className="text-base leading-none">+</span> 新建卡组
                      </button>

                      {savedDecks.length === 0 ? (
                        <p className="text-center text-[11px] text-gray-400 py-2">
                          还没有保存的卡组
                        </p>
                      ) : (
                        savedDecks.map((deck) => (
                          <div
                            key={`${deck.name}-${deck.created_at}`}
                            className="flex items-center gap-1 rounded bg-[var(--msa-bg-alt)] hover:bg-[var(--msa-surface-hover)] transition group"
                          >
                            <button
                              onClick={() => onLoad(deck)}
                              className="flex-1 flex items-center gap-2 px-2 py-1.5 text-left min-w-0"
                            >
                              <div className="w-1 h-6 rounded-full bg-blue-500 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-[var(--msa-text-secondary)] group-hover:text-[var(--msa-text-primary)] transition truncate leading-tight">
                                  {deck.name}
                                </p>
                                <p className="text-[10px] text-[var(--msa-text-muted)] leading-tight">
                                  {deck.main_deck.reduce((s, e) => s + e.count, 0)}/50
                                </p>
                              </div>
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`确定要删除卡组「${deck.name}」吗？`)) {
                                  onDelete(deck.name);
                                }
                              }}
                              className="text-gray-400 hover:text-[var(--msa-red)] transition px-1.5 py-1 flex-shrink-0"
                              title="删除卡组"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                              </svg>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ═══ BOTTOM: hover card detail strip ═══ */}
      <div className="h-[110px] flex-shrink-0 bg-[var(--msa-bg-alt)] border-t border-[var(--msa-border)] flex items-center px-3 gap-3 overflow-hidden">
        {hoveredCard ? (
          <>
            <img
              src={hoveredCard.image_url}
              alt={hoveredCard.name}
              className="h-[95px] w-auto rounded object-cover flex-shrink-0 bg-white/90"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0.2";
              }}
            />
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[var(--msa-text-primary)]">
                  {hoveredCard.name}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor: `${hoveredCard.attribute_color}30`,
                    color: hoveredCard.attribute_color,
                  }}
                >
                  {hoveredCard.attribute_name}
                </span>
                <span className="text-[10px] text-[var(--msa-text-muted)]">
                  Lv{hoveredCard.cost}
                </span>
                {hoveredCard.power && (
                  <span className="text-[10px] text-red-500 font-medium">
                    {hoveredCard.power}
                  </span>
                )}
                <span className="text-[10px] text-gray-400">{hoveredCard.card_no}</span>
              </div>
              <p className="text-xs text-[var(--msa-text-muted)] leading-relaxed line-clamp-3 overflow-hidden">
                {hoveredCard.effect}
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 text-center text-xs text-gray-400">
            悬停卡牌查看详情
          </div>
        )}
      </div>

      {/* ── Import modal ── */}
      {showImport && (
        <ImportDeckModal onImport={handleImport} onClose={() => setShowImport(false)} />
      )}

      {/* ── Click modal ── */}
      {selectedCard && (
        <CardDetailModal card={selectedCard} db={db} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );
}
