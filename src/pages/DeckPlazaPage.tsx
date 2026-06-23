import { useState, useEffect, useMemo, useCallback } from "react";
import type { CardDatabase, Card, Deck, DeckEntry } from "../types/card";
import {
  getLocalDecks,
  deleteLocalDeck,
  decodeDeck,
  extractDeckCode,
  preconToDeck,
  type PreconDeckData,
} from "../utils/deckCode";

interface DeckPlazaPageProps {
  db: CardDatabase;
  cardMap: Map<string, Card>; // card_no -> Card (first/highest rarity variant)
  onLoadDeck: (deck: Deck) => void; // Import deck into deck builder (App switches tab)
}

/** Category tag for a deck card, indicating its origin. */
type DeckCategory = "precon" | "local" | "imported";

/** A deck item enriched with display metadata. */
interface DeckDisplayItem {
  deck: Deck;
  category: DeckCategory;
  cardType: number; // 1=character, 2=impact (inferred from cards)
}

/** Computed statistics for the deck detail modal. */
interface DeckDetailStats {
  mainCount: number;
  rushCount: number;
  totalCount: number;
  attrDistribution: { attribute: number; name: string; color: string; count: number }[];
  lvDistribution: { lv: number; count: number }[];
  totalPower: number;
  sortedMainCards: { card: Card; count: number }[];
  sortedRushCards: { card: Card; count: number }[];
}

export default function DeckPlazaPage({ db, cardMap, onLoadDeck }: DeckPlazaPageProps) {
  const [preconItems, setPreconItems] = useState<DeckDisplayItem[]>([]);
  const [localItems, setLocalItems] = useState<DeckDisplayItem[]>([]);
  const [importedItem, setImportedItem] = useState<DeckDisplayItem | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [preconLoading, setPreconLoading] = useState(true);

  // ── Load precon decks from JSON files ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("./precon_sd01.json").then((r) => r.json() as Promise<PreconDeckData>),
      fetch("./precon_sd02.json").then((r) => r.json() as Promise<PreconDeckData>),
    ])
      .then(([sd01, sd02]) => {
        if (cancelled) return;
        const items: DeckDisplayItem[] = [sd01, sd02].map((precon) => ({
          deck: preconToDeck(precon, db),
          category: "precon" as const,
          cardType: precon.card_type,
        }));
        setPreconItems(items);
        setPreconLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load precon decks:", err);
        setPreconLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  // ── Load local decks from localStorage ─────────────────────────────
  const refreshLocalDecks = useCallback(() => {
    const decks = getLocalDecks();
    const items: DeckDisplayItem[] = decks.map((deck) => ({
      deck,
      category: "local" as const,
      cardType: inferCardType(deck, cardMap),
    }));
    setLocalItems(items);
  }, [cardMap]);

  useEffect(() => {
    refreshLocalDecks();
  }, [refreshLocalDecks]);

  // ── Handle deck code import ────────────────────────────────────────
  const handleImport = useCallback(() => {
    const code = extractDeckCode(codeInput);
    if (!code) {
      setImportError("请输入卡组码或分享链接");
      return;
    }
    const deck = decodeDeck(code);
    if (!deck) {
      setImportError("卡组码无效，无法解码。请检查输入是否正确。");
      setImportedItem(null);
      return;
    }
    if (deck.main_deck.length === 0 && deck.rush_deck.length === 0) {
      setImportError("解码成功，但卡组为空。");
      setImportedItem(null);
      return;
    }
    setImportError(null);
    setImportedItem({
      deck,
      category: "imported",
      cardType: inferCardType(deck, cardMap),
    });
    setSelectedDeck(deck);
  }, [codeInput, cardMap]);

  // ── Handle local deck deletion ─────────────────────────────────────
  const handleDeleteLocal = useCallback(
    (deckName: string) => {
      if (!confirm(`确定要删除卡组「${deckName}」吗？`)) return;
      deleteLocalDeck(deckName);
      refreshLocalDecks();
      setSelectedDeck(null);
    },
    [refreshLocalDecks]
  );

  // ── Handle "import to deck builder" ────────────────────────────────
  const handleLoadDeck = useCallback(
    (deck: Deck) => {
      onLoadDeck(deck);
      setSelectedDeck(null);
    },
    [onLoadDeck]
  );

  // ── Compute detail stats for the selected deck ─────────────────────
  const detailStats = useMemo<DeckDetailStats | null>(() => {
    if (!selectedDeck) return null;
    return computeDeckStats(selectedDeck, cardMap, db);
  }, [selectedDeck, cardMap, db]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-4 space-y-6 bg-[#0f1923]">
      {/* ── Section: Precon Decks ─────────────────────────────────── */}
      <section>
        <SectionHeader icon="pack" title="官方预组" subtitle="开箱即用的官方预设卡组" />
        {preconLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="bg-[#1a2535] rounded-xl border border-[#1e2d42] p-4 animate-pulse"
              >
                <div className="h-2 bg-[#2a3a50] rounded mb-3" />
                <div className="h-4 bg-[#2a3a50] rounded w-2/3 mb-2" />
                <div className="h-3 bg-[#1e2d42] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : preconItems.length === 0 ? (
          <EmptyState message="暂无预组卡组数据" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {preconItems.map((item) => (
              <DeckCard
                key={`precon-${item.deck.name}`}
                item={item}
                db={db}
                cardMap={cardMap}
                onClick={() => setSelectedDeck(item.deck)}
                onLoad={() => handleLoadDeck(item.deck)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Section: My Decks ─────────────────────────────────────── */}
      <section>
        <SectionHeader icon="bookmark" title="我的卡组" subtitle="从组卡器保存的卡组" />
        {localItems.length === 0 ? (
          <EmptyState message="还没有保存的卡组，去组卡器创建一个吧！" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {localItems.map((item) => (
              <DeckCard
                key={`local-${item.deck.name}-${item.deck.created_at}`}
                item={item}
                db={db}
                cardMap={cardMap}
                onClick={() => setSelectedDeck(item.deck)}
                onLoad={() => handleLoadDeck(item.deck)}
                onDelete={() => handleDeleteLocal(item.deck.name)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Section: Deck Code Import ─────────────────────────────── */}
      <section>
        <SectionHeader icon="link" title="卡组码导入" subtitle="粘贴分享码或链接，导入他人卡组" />
        <div className="bg-[#1a2535] rounded-xl border border-[#1e2d42] p-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleImport();
              }}
              placeholder="粘贴卡组码或分享链接（如 https://...#deck=xxx）"
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-[#0f1923] border border-[#2a3a50] text-[#c9cdd4] placeholder-[#445566] focus:outline-none focus:border-red-500 transition"
            />
            <button
              onClick={handleImport}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition whitespace-nowrap"
            >
              导入
            </button>
          </div>
          {importError && <p className="text-sm text-red-400">{importError}</p>}
          {importedItem && !selectedDeck && (
            <div className="pt-2">
              <p className="text-xs text-[#8899aa] mb-2">导入成功！点击下方卡片查看详情：</p>
              <div className="max-w-xs">
                <DeckCard
                  item={importedItem}
                  db={db}
                  cardMap={cardMap}
                  onClick={() => setSelectedDeck(importedItem.deck)}
                  onLoad={() => handleLoadDeck(importedItem.deck)}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Deck Detail Modal ─────────────────────────────────────── */}
      {selectedDeck && detailStats && (
        <DeckDetailModal
          deck={selectedDeck}
          stats={detailStats}
          onClose={() => setSelectedDeck(null)}
          onLoad={() => handleLoadDeck(selectedDeck)}
          onDelete={
            localItems.some((item) => item.deck.name === selectedDeck.name)
              ? () => handleDeleteLocal(selectedDeck.name)
              : undefined
          }
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Helper Functions
// ═════════════════════════════════════════════════════════════════════

function inferCardType(deck: Deck, cardMap: Map<string, Card>): number {
  for (const entry of deck.main_deck) {
    const card = cardMap.get(entry.card_no);
    if (card) return card.card_type;
  }
  for (const entry of deck.rush_deck) {
    const card = cardMap.get(entry.card_no);
    if (card) return card.card_type;
  }
  return 1;
}

function computeDeckStats(
  deck: Deck,
  cardMap: Map<string, Card>,
  db: CardDatabase
): DeckDetailStats {
  const mainCount = deck.main_deck.reduce((s, e) => s + e.count, 0);
  const rushCount = deck.rush_deck.reduce((s, e) => s + e.count, 0);

  const attrCounts: Record<number, number> = {};
  for (const e of deck.main_deck) {
    const card = cardMap.get(e.card_no);
    if (card) {
      attrCounts[card.attribute] = (attrCounts[card.attribute] || 0) + e.count;
    }
  }
  const attrDistribution = Object.entries(attrCounts)
    .map(([attr, count]) => {
      const attrData = db.attributes[String(attr)];
      return {
        attribute: Number(attr),
        name: attrData ? attrData.name : "未知",
        color: attrData ? attrData.color : "#ccc",
        count,
      };
    })
    .sort((a, b) => b.count - a.count);

  const lvCounts: Record<number, number> = {};
  for (const e of deck.main_deck) {
    const card = cardMap.get(e.card_no);
    if (card) {
      lvCounts[card.cost] = (lvCounts[card.cost] || 0) + e.count;
    }
  }
  const lvDistribution = Object.entries(lvCounts)
    .map(([lv, count]) => ({ lv: Number(lv), count }))
    .sort((a, b) => a.lv - b.lv);

  let totalPower = 0;
  for (const e of deck.main_deck) {
    const card = cardMap.get(e.card_no);
    if (card && card.dp_value) {
      totalPower += card.dp_value * e.count;
    }
  }

  const sortCards = (entries: DeckEntry[]): { card: Card; count: number }[] => {
    return entries
      .map((e) => {
        const card = cardMap.get(e.card_no);
        return card ? { card, count: e.count } : null;
      })
      .filter((x): x is { card: Card; count: number } => x !== null)
      .sort((a, b) => {
        if (b.card.cost !== a.card.cost) return b.card.cost - a.card.cost;
        return a.card.card_no.localeCompare(b.card.card_no);
      });
  };

  return {
    mainCount,
    rushCount,
    totalCount: mainCount + rushCount,
    attrDistribution,
    lvDistribution,
    totalPower,
    sortedMainCards: sortCards(deck.main_deck),
    sortedRushCards: sortCards(deck.rush_deck),
  };
}

// ═════════════════════════════════════════════════════════════════════
// Sub-Components
// ═════════════════════════════════════════════════════════════════════

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: "pack" | "bookmark" | "link";
  title: string;
  subtitle: string;
}) {
  const icons: Record<string, string> = {
    pack: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3",
    bookmark: "M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z",
    link: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  };

  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-8 h-8 rounded-lg bg-red-900/30 flex items-center justify-center">
        <svg
          className="w-4 h-4 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={icons[icon]} />
        </svg>
      </div>
      <div>
        <h2 className="text-sm font-bold text-[#e8eaed] leading-tight">{title}</h2>
        <p className="text-xs text-[#667788] leading-tight">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-10 text-[#667788] bg-[#131f2e] rounded-xl border border-dashed border-[#1e2d42]">
      <p className="text-sm">{message}</p>
    </div>
  );
}

function DeckCard({
  item,
  db,
  cardMap,
  onClick,
  onLoad,
  onDelete,
}: {
  item: DeckDisplayItem;
  db: CardDatabase;
  cardMap: Map<string, Card>;
  onClick: () => void;
  onLoad: () => void;
  onDelete?: () => void;
}) {
  const { deck, category, cardType } = item;
  const mainCount = deck.main_deck.reduce((s, e) => s + e.count, 0);
  const rushCount = deck.rush_deck.reduce((s, e) => s + e.count, 0);

  const attrSet = new Set<number>();
  for (const e of deck.main_deck) {
    const card = cardMap.get(e.card_no);
    if (card) attrSet.add(card.attribute);
  }

  const attrColors: { color: string; name: string }[] = [];
  for (const attr of attrSet) {
    const attrData = db.attributes[String(attr)];
    if (attrData) {
      attrColors.push({ color: attrData.color, name: attrData.name });
    }
  }

  const categoryLabel: Record<DeckCategory, string> = {
    precon: "预组",
    local: "我的",
    imported: "导入",
  };
  const categoryColor: Record<DeckCategory, string> = {
    precon: "bg-red-900/40 text-red-400",
    local: "bg-blue-900/40 text-blue-400",
    imported: "bg-amber-900/40 text-amber-400",
  };

  const typeLabel = cardType === 2 ? "冲击卡组" : "角色卡组";

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer bg-[#1a2535] rounded-xl border border-[#1e2d42] overflow-hidden hover:shadow-lg hover:border-[#2a3a50] transition animate-fadeIn"
    >
      <div
        className="h-1.5"
        style={{
          background:
            attrColors.length > 0
              ? `linear-gradient(to right, ${attrColors.map((a) => a.color).join(", ")})`
              : "#2a3a50",
        }}
      />

      <div className="p-3.5 space-y-2">
        <div className="flex items-start justify-between gap-1">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${categoryColor[category]}`}
          >
            {categoryLabel[category]}
          </span>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-[#445566] hover:text-red-400 transition opacity-0 group-hover:opacity-100"
              title="删除卡组"
            >
              <svg
                className="w-4 h-4"
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
          )}
        </div>

        <h3 className="text-sm font-bold text-[#e8eaed] group-hover:text-red-400 transition truncate">
          {deck.name}
        </h3>

        <div className="flex items-center gap-1.5 text-xs text-[#8899aa]">
          <span>{mainCount}张</span>
          <span className="text-[#445566]">·</span>
          <span>{typeLabel}</span>
          {rushCount > 0 && (
            <>
              <span className="text-[#445566]">·</span>
              <span>+{rushCount}冲刺</span>
            </>
          )}
        </div>

        {attrColors.length > 0 && (
          <div className="flex items-center gap-1">
            {attrColors.map((a, i) => (
              <span
                key={i}
                className="w-3 h-3 rounded-full border border-[#0f1923] shadow-sm"
                style={{ backgroundColor: a.color }}
                title={a.name}
              />
            ))}
          </div>
        )}

        {category === "local" && deck.created_at && (
          <p className="text-[10px] text-[#667788]">
            {new Date(deck.created_at).toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })}
          </p>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onLoad();
          }}
          className="w-full mt-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-[#131f2e] text-[#8899aa] hover:bg-red-900/30 hover:text-red-400 transition border border-[#1e2d42]"
        >
          导入到组卡器
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// DeckDetailModal
// ═════════════════════════════════════════════════════════════════════

function DeckDetailModal({
  deck,
  stats,
  onClose,
  onLoad,
  onDelete,
}: {
  deck: Deck;
  stats: DeckDetailStats;
  onClose: () => void;
  onLoad: () => void;
  onDelete?: () => void;
}) {
  const maxLvCount = Math.max(...stats.lvDistribution.map((d) => d.count), 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-[#131f2e] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border border-[#1e2d42]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d42]">
          <h2 className="text-base font-bold text-[#e8eaed] truncate">{deck.name}</h2>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-[#667788] hover:text-[#c9cdd4] transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-5">
          {/* Quick stats */}
          <div className="flex flex-wrap gap-2">
            <StatPill label="主卡组" value={`${stats.mainCount}张`} color="bg-[#1a2535] text-[#c9cdd4] border-[#2a3a50]" />
            {stats.rushCount > 0 && (
              <StatPill label="冲刺卡" value={`${stats.rushCount}张`} color="bg-amber-900/30 text-amber-400 border-amber-800/40" />
            )}
            <StatPill label="总卡数" value={`${stats.totalCount}张`} color="bg-blue-900/30 text-blue-400 border-blue-800/40" />
            {stats.totalPower > 0 && (
              <StatPill label="总战力" value={stats.totalPower.toLocaleString()} color="bg-red-900/30 text-red-400 border-red-800/40" />
            )}
          </div>

          {/* Attribute distribution */}
          {stats.attrDistribution.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[#667788] uppercase tracking-wide mb-2">属性分布</h3>
              <div className="flex flex-wrap gap-2">
                {stats.attrDistribution.map((attr) => (
                  <span
                    key={attr.attribute}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border"
                    style={{
                      backgroundColor: `${attr.color}20`,
                      borderColor: `${attr.color}50`,
                      color: attr.color,
                    }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: attr.color }} />
                    {attr.name}
                    <span className="text-[#667788]">×{attr.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Lv distribution bar chart */}
          {stats.lvDistribution.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[#667788] uppercase tracking-wide mb-2">Lv 分布</h3>
              <div className="space-y-1.5">
                {stats.lvDistribution.map((d) => (
                  <div key={d.lv} className="flex items-center gap-2">
                    <span className="text-xs text-[#8899aa] w-10 flex-shrink-0">Lv{d.lv}</span>
                    <div className="flex-1 bg-[#0a1120] rounded-full h-4 overflow-hidden border border-[#1e2d42]">
                      <div
                        className="h-full bg-gradient-to-r from-red-600 to-red-500 rounded-full transition-all duration-300"
                        style={{ width: `${(d.count / maxLvCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-[#c9cdd4] w-6 text-right flex-shrink-0">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main deck card list */}
          {stats.sortedMainCards.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[#667788] uppercase tracking-wide mb-2">
                主卡组 · {stats.mainCount}张
              </h3>
              <div className="space-y-1">
                {stats.sortedMainCards.map(({ card, count }) => (
                  <CardListRow key={card.card_no} card={card} count={count} />
                ))}
              </div>
            </div>
          )}

          {/* Rush deck card list */}
          {stats.sortedRushCards.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[#667788] uppercase tracking-wide mb-2">
                冲刺卡组 · {stats.rushCount}张
              </h3>
              <div className="space-y-1">
                {stats.sortedRushCards.map(({ card, count }) => (
                  <CardListRow key={card.card_no} card={card} count={count} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-[#1e2d42] bg-[#0f1923]">
          <button
            onClick={onLoad}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition"
          >
            导入到组卡器
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/30 transition"
            >
              删除
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-[#8899aa] hover:bg-[#1a2535] transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function CardListRow({ card, count }: { card: Card; count: number }) {
  return (
    <div className="flex items-center gap-2.5 bg-[#0f1923] rounded-lg px-3 py-1.5 hover:bg-[#1a2535] transition border border-[#1e2d42]">
      <div className="flex-shrink-0 w-7 h-10 rounded overflow-hidden bg-[#0a1120]">
        <img
          src={card.image_url}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0.2";
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#e8eaed] truncate">{card.name}</p>
        <div className="flex items-center gap-1.5 text-xs text-[#667788]">
          <span>{card.card_no}</span>
          <span>·</span>
          <span>Lv{card.cost}</span>
          {card.power && (
            <>
              <span>·</span>
              <span>{card.power}</span>
            </>
          )}
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: card.attribute_color }}
            title={card.attribute_name}
          />
        </div>
      </div>
      <div className="flex-shrink-0 text-sm font-bold text-[#c9cdd4]">×{count}</div>
    </div>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${color}`}>
      <span className="opacity-70">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}
