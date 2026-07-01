import { useState, useEffect, useMemo, useCallback } from "react";
import type { CardDatabase, Card, Deck, DeckEntry } from "../types/card";
import {
  getLocalDecks,
  deleteLocalDeck,
  decodeDeck,
  encodeDeck,
  extractDeckCode,
  preconToDeck,
  type PreconDeckData,
} from "../utils/deckCode";
import CardDetailSidebar from "../components/CardDetailSidebar";

interface DeckPlazaPageProps {
  db: CardDatabase;
  cardMap: Map<string, Card>;
  onLoadDeck: (deck: Deck) => void;
}

type DeckCategory = "precon" | "local" | "imported";

interface DeckDisplayItem {
  deck: Deck;
  category: DeckCategory;
  cardType: number;
}

interface DeckDetailStats {
  mainCount: number;
  totalCount: number;
  attrDistribution: { attribute: number; name: string; color: string; count: number }[];
  lvDistribution: { lv: number; count: number }[];
  totalPower: number;
  sortedMainCards: { card: Card; count: number }[];
  avgPower: number;
  avgCost: number;
  /** 费用曲线：每个 Lv 按属性分色的统计 */
  lvAttrDistribution: { lv: number; attrs: { attribute: number; name: string; color: string; count: number }[]; total: number }[];
  /** 距离曲线（距离值分布，按属性分色） */
  distanceDistribution: { pp: number; attrs: { attribute: number; name: string; color: string; count: number }[]; total: number }[];
  /** 战力曲线（战力值分布，按属性分色） */
  powerDistribution: { pw: number; attrs: { attribute: number; name: string; color: string; count: number }[]; total: number }[];
  /** 特性统计（按属性分色） */
  featureDistribution: { feature: string; attrs: { attribute: number; name: string; color: string; count: number }[]; total: number }[];
}

type DeckSortMode = "cost" | "power" | "distance" | "number";

const SORT_LABELS: Record<DeckSortMode, string> = {
  cost: "费用",
  power: "战力",
  distance: "距离",
  number: "编号",
};


export default function DeckPlazaPage({ db, cardMap, onLoadDeck }: DeckPlazaPageProps) {
  const [preconItems, setPreconItems] = useState<DeckDisplayItem[]>([]);
  const [localItems, setLocalItems] = useState<DeckDisplayItem[]>([]);
  const [importedItem, setImportedItem] = useState<DeckDisplayItem | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [preconLoading, setPreconLoading] = useState(true);

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
    return () => { cancelled = true; };
  }, [db]);

  const refreshLocalDecks = useCallback(() => {
    const decks = getLocalDecks();
    const items: DeckDisplayItem[] = decks.map((deck) => ({
      deck,
      category: "local" as const,
      cardType: inferCardType(deck, cardMap),
    }));
    setLocalItems(items);
  }, [cardMap]);

  useEffect(() => { refreshLocalDecks(); }, [refreshLocalDecks]);

  const handleImport = useCallback(() => {
    const code = extractDeckCode(codeInput);
    if (!code) { setImportError("请输入卡组码或分享链接"); return; }
    const deck = decodeDeck(code);
    if (!deck) { setImportError("卡组码无效，无法解码。请检查输入是否正确。"); setImportedItem(null); return; }
    if (deck.main_deck.length === 0) { setImportError("解码成功，但卡组为空。"); setImportedItem(null); return; }
    setImportError(null);
    setImportedItem({ deck, category: "imported", cardType: inferCardType(deck, cardMap) });
    setSelectedDeck(deck);
  }, [codeInput, cardMap]);

  const handleDeleteLocal = useCallback((deckName: string) => {
    if (!confirm(`确定要删除卡组「${deckName}」吗？`)) return;
    deleteLocalDeck(deckName);
    refreshLocalDecks();
    setSelectedDeck(null);
  }, [refreshLocalDecks]);

  const handleLoadDeck = useCallback((deck: Deck) => {
    onLoadDeck(deck);
    setSelectedDeck(null);
  }, [onLoadDeck]);

  const handleCopyCode = useCallback((deck: Deck) => {
    const code = encodeDeck(deck);
    navigator.clipboard.writeText(code).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = code; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    });
  }, []);

  const detailStats = useMemo<DeckDetailStats | null>(() => {
    if (!selectedDeck) return null;
    return computeDeckStats(selectedDeck, cardMap, db);
  }, [selectedDeck, cardMap, db]);

  const isSelectedLocal = selectedDeck
    ? localItems.some((item) => item.deck.name === selectedDeck.name)
    : false;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-[var(--msa-bg)]">
      {selectedDeck && detailStats ? (
        <DeckDetailView
          deck={selectedDeck}
          stats={detailStats}
          cardMap={cardMap}
          db={db}
          onBack={() => setSelectedDeck(null)}
          onLoad={() => handleLoadDeck(selectedDeck)}
          onDelete={isSelectedLocal ? () => handleDeleteLocal(selectedDeck.name) : undefined}
          onCopyCode={() => handleCopyCode(selectedDeck)}
        />
      ) : (
        <div className="p-4 space-y-6">
          <section>
            <SectionHeader icon="pack" title="官方预组" subtitle="开箱即用的官方预设卡组" />
            {preconLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {[0, 1].map((i) => (
                  <div key={i} className="bg-[var(--msa-surface)] rounded-xl border border-[var(--msa-border)] p-4 animate-pulse">
                    <div className="h-2 bg-[var(--msa-border-strong)] rounded mb-3" />
                    <div className="h-4 bg-[var(--msa-border-strong)] rounded w-2/3 mb-2" />
                    <div className="h-3 bg-[var(--msa-border)] rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : preconItems.length === 0 ? (
              <EmptyState message="暂无预组卡组数据" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {preconItems.map((item) => (
                  <DeckCard key={`precon-${item.deck.name}`} item={item} db={db} cardMap={cardMap}
                    onClick={() => setSelectedDeck(item.deck)} onLoad={() => handleLoadDeck(item.deck)} />
                ))}
              </div>
            )}
          </section>
          <section>
            <SectionHeader icon="bookmark" title="我的卡组" subtitle="从组卡器保存的卡组" />
            {localItems.length === 0 ? (
              <EmptyState message="还没有保存的卡组，去组卡器创建一个吧！" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {localItems.map((item) => (
                  <DeckCard key={`local-${item.deck.name}-${item.deck.created_at}`} item={item} db={db} cardMap={cardMap}
                    onClick={() => setSelectedDeck(item.deck)} onLoad={() => handleLoadDeck(item.deck)}
                    onDelete={() => handleDeleteLocal(item.deck.name)} />
                ))}
              </div>
            )}
          </section>
          <section>
            <SectionHeader icon="link" title="卡组码导入" subtitle="粘贴分享码或链接，导入他人卡组" />
            <div className="bg-[var(--msa-surface)] rounded-xl border border-[var(--msa-border)] p-4 space-y-3">
              <div className="flex gap-2">
                <input type="text" value={codeInput} onChange={(e) => setCodeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
                  placeholder="粘贴卡组码或分享链接（如 https://...#deck=xxx）"
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-[var(--msa-bg)] border border-[var(--msa-border-strong)] text-[var(--msa-text-secondary)] placeholder-[var(--msa-text-placeholder)] focus:outline-none focus:border-red-500 transition" />
                <button onClick={handleImport}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition whitespace-nowrap">
                  导入
                </button>
              </div>
              {importError && <p className="text-sm text-red-500">{importError}</p>}
              {importedItem && !selectedDeck && (
                <div className="pt-2">
                  <p className="text-xs text-[var(--msa-text-muted)] mb-2">导入成功！点击下方卡片查看详情：</p>
                  <div className="max-w-xs">
                    <DeckCard item={importedItem} db={db} cardMap={cardMap}
                      onClick={() => setSelectedDeck(importedItem.deck)} onLoad={() => handleLoadDeck(importedItem.deck)} />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

function inferCardType(deck: Deck, cardMap: Map<string, Card>): number {
  for (const entry of deck.main_deck) {
    const card = cardMap.get(entry.card_no);
    if (card) return card.card_type;
  }
  return 1;
}

function computeDeckStats(deck: Deck, cardMap: Map<string, Card>, db: CardDatabase): DeckDetailStats {
  const mainCount = deck.main_deck.reduce((s, e) => s + e.count, 0);

  // --- attrDistribution ---
  const attrCounts: Record<number, number> = {};
  for (const e of deck.main_deck) {
    const card = cardMap.get(e.card_no);
    if (card) attrCounts[card.attribute] = (attrCounts[card.attribute] || 0) + e.count;
  }
  const attrDistribution = Object.entries(attrCounts)
    .map(([attr, count]) => {
      const attrData = db.attributes[String(attr)];
      return { attribute: Number(attr), name: attrData ? attrData.name : "未知", color: attrData ? attrData.color : "#ccc", count };
    })
    .sort((a, b) => b.count - a.count);

  // --- lvDistribution ---
  const lvCounts: Record<number, number> = {};
  for (const e of deck.main_deck) {
    const card = cardMap.get(e.card_no);
    if (card) lvCounts[card.cost] = (lvCounts[card.cost] || 0) + e.count;
  }
  const lvDistribution = Object.entries(lvCounts)
    .map(([lv, count]) => ({ lv: Number(lv), count }))
    .sort((a, b) => a.lv - b.lv);

  // --- totalPower, avgPower, avgCost ---
  let totalPower = 0, totalCostWeighted = 0;
  for (const e of deck.main_deck) {
    const card = cardMap.get(e.card_no);
    if (card) {
      if (card.power) totalPower += parseInt(card.power) * e.count;
      totalCostWeighted += card.cost * e.count;
    }
  }

  // --- sortedMainCards ---
  const sortCards = (entries: DeckEntry[]): { card: Card; count: number }[] =>
    entries.map((e) => { const c = cardMap.get(e.card_no); return c ? { card: c, count: e.count } : null; })
      .filter((x): x is { card: Card; count: number } => x !== null)
      .sort((a, b) => b.card.cost !== a.card.cost ? b.card.cost - a.card.cost : a.card.card_no.localeCompare(b.card.card_no));

  // --- lvAttrDistribution (stacked by attribute per Lv) ---
  const lvAttrMap: Record<number, Record<number, number>> = {};
  for (const e of deck.main_deck) {
    const card = cardMap.get(e.card_no);
    if (card) {
      const lv = card.cost;
      if (!lvAttrMap[lv]) lvAttrMap[lv] = {};
      lvAttrMap[lv][card.attribute] = (lvAttrMap[lv][card.attribute] || 0) + e.count;
    }
  }
  const lvAttrDistribution: DeckDetailStats["lvAttrDistribution"] = [1, 2, 3, 4, 5, 6].map((lv) => {
    const attrMap = lvAttrMap[lv] || {};
    const attrs = Object.entries(attrMap)
      .map(([attr, count]) => {
        const attrData = db.attributes[attr];
        return {
          attribute: Number(attr),
          name: attrData ? attrData.name : "未知",
          color: attrData ? attrData.color : "#ccc",
          count,
        };
      })
      .sort((a, b) => b.count - a.count);
    const total = attrs.reduce((s, a) => s + a.count, 0);
    return { lv, attrs, total };
  });

  // --- distanceDistribution (distance value, stacked by attribute, skip null) ---
  const rAttrMap: Record<number, Record<number, number>> = {};
  for (const e of deck.main_deck) {
    const card = cardMap.get(e.card_no);
    if (card && card.r != null) {
      const rVal = card.r;
      if (!rAttrMap[rVal]) rAttrMap[rVal] = {};
      rAttrMap[rVal][card.attribute] = (rAttrMap[rVal][card.attribute] || 0) + e.count;
    }
  }
  const distanceDistribution: DeckDetailStats["distanceDistribution"] = Object.entries(rAttrMap)
    .map(([rVal, attrMap]) => {
      const attrs = Object.entries(attrMap)
        .map(([attr, count]) => {
          const attrData = db.attributes[attr];
          return { attribute: Number(attr), name: attrData ? attrData.name : "未知", color: attrData ? attrData.color : "#ccc", count };
        })
        .sort((a, b) => b.count - a.count);
      return { pp: Number(rVal), attrs, total: attrs.reduce((s, a) => s + a.count, 0) };
    })
    .sort((a, b) => a.pp - b.pp);

  // --- powerDistribution (actual power values, stacked by attribute) ---
  const powerAttrMap: Record<number, Record<number, number>> = {};
  for (const e of deck.main_deck) {
    const card = cardMap.get(e.card_no);
    if (card && card.power) {
      const pw = parseInt(card.power);
      if (!powerAttrMap[pw]) powerAttrMap[pw] = {};
      powerAttrMap[pw][card.attribute] = (powerAttrMap[pw][card.attribute] || 0) + e.count;
    }
  }
  const powerDistribution: DeckDetailStats["powerDistribution"] = Object.entries(powerAttrMap)
    .map(([pw, attrMap]) => {
      const attrs = Object.entries(attrMap)
        .map(([attr, count]) => {
          const attrData = db.attributes[attr];
          return { attribute: Number(attr), name: attrData ? attrData.name : "未知", color: attrData ? attrData.color : "#ccc", count };
        })
        .sort((a, b) => b.count - a.count);
      return { pw: Number(pw), attrs, total: attrs.reduce((s, a) => s + a.count, 0) };
    })
    .sort((a, b) => a.pw - b.pw);

  // --- featureDistribution (by feature, stacked by attribute) ---
  const featAttrMap: Record<string, Record<number, number>> = {};
  for (const e of deck.main_deck) {
    const card = cardMap.get(e.card_no);
    if (card && card.feature_text) {
      const features = card.feature_text.split("/").map((f) => f.trim()).filter(Boolean);
      for (const feat of features) {
        if (!featAttrMap[feat]) featAttrMap[feat] = {};
        featAttrMap[feat][card.attribute] = (featAttrMap[feat][card.attribute] || 0) + e.count;
      }
    }
  }
  const featureDistribution: DeckDetailStats["featureDistribution"] = Object.entries(featAttrMap)
    .map(([feature, attrMap]) => {
      const attrs = Object.entries(attrMap)
        .map(([attr, count]) => {
          const attrData = db.attributes[attr];
          return { attribute: Number(attr), name: attrData ? attrData.name : "未知", color: attrData ? attrData.color : "#ccc", count };
        })
        .sort((a, b) => b.count - a.count);
      return { feature, attrs, total: attrs.reduce((s, a) => s + a.count, 0) };
    })
    .sort((a, b) => b.total - a.total);

  return {
    mainCount, totalCount: mainCount, attrDistribution, lvDistribution, totalPower,
    sortedMainCards: sortCards(deck.main_deck),
    avgPower: mainCount > 0 ? totalPower / mainCount : 0,
    avgCost: mainCount > 0 ? totalCostWeighted / mainCount : 0,
    lvAttrDistribution,
    distanceDistribution,
    powerDistribution,
    featureDistribution,
  };
}

// ═══════════════════════════════════════════════
// Sub-Components
// ═══════════════════════════════════════════════

function SectionHeader({ icon, title, subtitle }: { icon: "pack" | "bookmark" | "link"; title: string; subtitle: string }) {
  const icons: Record<string, string> = {
    pack: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3",
    bookmark: "M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z",
    link: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  };
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
        <svg className="w-4 h-4 text-[var(--msa-red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icons[icon]} />
        </svg>
      </div>
      <div><h2 className="text-sm font-bold text-[var(--msa-text-primary)] leading-tight">{title}</h2>
        <p className="text-xs text-[var(--msa-text-muted)] leading-tight">{subtitle}</p></div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-center py-10 text-[var(--msa-text-muted)] bg-[var(--msa-bg-alt)] rounded-xl border border-dashed border-[var(--msa-border)]"><p className="text-sm">{message}</p></div>;
}

function DeckCard({ item, db, cardMap, onClick, onLoad, onDelete }: {
  item: DeckDisplayItem; db: CardDatabase; cardMap: Map<string, Card>;
  onClick: () => void; onLoad: () => void; onDelete?: () => void;
}) {
  const { deck, category, cardType } = item;
  const mainCount = deck.main_deck.reduce((s, e) => s + e.count, 0);
  const attrSet = new Set<number>();
  for (const e of deck.main_deck) { const card = cardMap.get(e.card_no); if (card) attrSet.add(card.attribute); }
  const attrColors: { color: string; name: string }[] = [];
  for (const attr of attrSet) { const d = db.attributes[String(attr)]; if (d) attrColors.push({ color: d.color, name: d.name }); }
  const categoryLabel: Record<DeckCategory, string> = { precon: "预组", local: "我的", imported: "导入" };
  const categoryColor: Record<DeckCategory, string> = { precon: "bg-red-50 text-red-600", local: "bg-blue-50 text-blue-600", imported: "bg-amber-50 text-amber-600" };
  const typeLabel = cardType === 2 ? "冲击卡组" : "角色卡组";

  return (
    <div onClick={onClick} className="group relative cursor-pointer bg-[var(--msa-surface)] rounded-xl border border-[var(--msa-border)] overflow-hidden hover:shadow-lg hover:border-[var(--msa-border-strong)] transition animate-fadeIn">
      <div className="h-1.5" style={{ background: attrColors.length > 0 ? `linear-gradient(to right, ${attrColors.map(a => a.color).join(", ")})` : "var(--msa-border-strong)" }} />
      <div className="p-3.5 space-y-2">
        <div className="flex items-start justify-between gap-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${categoryColor[category]}`}>{categoryLabel[category]}</span>
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-gray-400 hover:text-[var(--msa-red)] transition opacity-0 group-hover:opacity-100" title="删除卡组">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
              </svg>
            </button>
          )}
        </div>
        <h3 className="text-sm font-bold text-[var(--msa-text-primary)] group-hover:text-[var(--msa-red)] transition truncate">{deck.name}</h3>
        <div className="flex items-center gap-1.5 text-xs text-[var(--msa-text-muted)]"><span>{mainCount}张</span><span className="text-gray-400">·</span><span>{typeLabel}</span></div>
        {attrColors.length > 0 && <div className="flex items-center gap-1">{attrColors.map((a, i) => <span key={i} className="w-3 h-3 rounded-full border border-[var(--msa-bg)] shadow-sm" style={{ backgroundColor: a.color }} title={a.name} />)}</div>}
        {category === "local" && deck.created_at && <p className="text-[10px] text-[var(--msa-text-muted)]">{new Date(deck.created_at).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })}</p>}
        <button onClick={(e) => { e.stopPropagation(); onLoad(); }} className="w-full mt-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-[var(--msa-bg-alt)] text-[var(--msa-text-muted)] hover:bg-red-50 hover:text-[var(--msa-red)] transition border border-[var(--msa-border)]">导入到组卡器</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// DeckDetailView — Piltover Archive style remake
// ═══════════════════════════════════════════════

function DeckDetailView({ deck, stats, cardMap, db, onBack, onLoad, onDelete, onCopyCode }: {
  deck: Deck; stats: DeckDetailStats; cardMap: Map<string, Card>; db: CardDatabase;
  onBack: () => void; onLoad: () => void; onDelete?: () => void; onCopyCode: () => void;
}) {
  const [copyLabel, setCopyLabel] = useState("复制卡组码");
  const [selectedCardDetail, setSelectedCardDetail] = useState<Card | null>(null);
  const [sortMode, setSortMode] = useState<DeckSortMode>("cost");
  const [sortAsc, setSortAsc] = useState(false);

  const handleCopy = () => { onCopyCode(); setCopyLabel("已复制!"); setTimeout(() => setCopyLabel("复制卡组码"), 2000); };

  const handleDownload = () => {
    const json = JSON.stringify(deck, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${deck.name || "卡组"}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleShare = () => {
    const code = encodeDeck(deck);
    const shareUrl = `${window.location.origin}${window.location.pathname}#deck=${code}`;
    navigator.clipboard.writeText(shareUrl).catch(() => { prompt("复制以下链接分享卡组:", shareUrl); });
    alert("分享链接已复制到剪贴板!");
  };

  const expandedCards = useMemo(() => {
    const cards: Card[] = [];
    for (const entry of deck.main_deck) {
      const card = cardMap.get(entry.card_no);
      if (card) {
        for (let i = 0; i < entry.count; i++) {
          cards.push(card);
        }
      }
    }
    return cards;
  }, [deck, cardMap]);

  const sortedCards = useMemo(() => {
    const arr = [...expandedCards];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortMode) {
        case "cost": cmp = a.cost - b.cost; break;
        case "power": cmp = (a.power ? parseInt(a.power) : 0) - (b.power ? parseInt(b.power) : 0); break;
        case "distance": cmp = (a.r || 0) - (b.r || 0); break;
        case "number": cmp = a.card_no.localeCompare(b.card_no); break;
      }
      if (cmp === 0) cmp = a.card_no.localeCompare(b.card_no);
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [expandedCards, sortMode, sortAsc]);

  // Initialize selectedCardDetail to the first card on mount / when sortedCards changes
  const displayCard = selectedCardDetail ?? sortedCards[0] ?? null;

  const isValid = stats.mainCount === 50;
  const colorLabel = stats.attrDistribution.map((a) => a.name).join("丨");

  // Determine author: try (deck as any).author, then fallback
  const author: string = ((deck as unknown) as Record<string, unknown>).author as string || "本地卡组";
  const formattedDate = deck.created_at
    ? new Date(deck.created_at).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
    : null;

  // Stats for the 5 stat cards
  const maxAttrTotal = Math.max(1, ...stats.lvAttrDistribution.map((d) => d.total));
  const maxDistance = Math.max(1, ...stats.distanceDistribution.map((d) => d.total));
  const maxPower = Math.max(1, ...stats.powerDistribution.map((d) => d.total));
  const maxFeature = Math.max(1, ...stats.featureDistribution.map((d) => d.total));
  const hasDistanceData = stats.distanceDistribution.length > 0;

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* ═══ HEADER — Three-row layout ═══ */}
      <div className="sticky top-0 z-20 mx-4 mt-3 bg-white/95 backdrop-blur rounded-xl border border-stone-200 shadow-sm px-5 py-4 flex-shrink-0 space-y-2">
        {/* Row 1: Deck name + back button */}
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-stone-400 hover:text-red-500 transition flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-stone-800 truncate">{deck.name}</h1>
        </div>

        {/* Row 2: Author · Date */}
        <div className="flex items-center gap-1.5 text-xs text-stone-400 pl-6">
          <span>{author}</span>
          {formattedDate && (
            <>
              <span>·</span>
              <span>{formattedDate}</span>
            </>
          )}
        </div>

        {/* Row 3: Colors + valid tag + capacity + action buttons */}
        <div className="flex items-center gap-4 pl-6">
          {stats.attrDistribution.length > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {stats.attrDistribution.map((attr) => (
                <span key={attr.attribute} className="w-3 h-3 rounded-full" style={{ backgroundColor: attr.color }} title={attr.name} />
              ))}
              <span className="text-xs text-stone-500 ml-1">{colorLabel}</span>
            </div>
          )}

          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 inline-flex items-center gap-1 ${isValid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
            {isValid ? "合法" : "非法"}
            <span className="font-bold">{stats.mainCount}/50</span>
          </span>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={onLoad} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-500 transition whitespace-nowrap">加入组卡器</button>
            <button onClick={handleShare} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-200 text-stone-500 hover:text-stone-700 hover:bg-stone-50 transition whitespace-nowrap">分享</button>
            <button onClick={handleCopy} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-200 text-stone-500 hover:text-stone-700 hover:bg-stone-50 transition whitespace-nowrap">{copyLabel}</button>
            <button onClick={handleDownload} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-200 text-stone-500 hover:text-stone-700 hover:bg-stone-50 transition whitespace-nowrap">下载</button>
            {onDelete && (
              <button onClick={onDelete} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-300 text-red-500 hover:bg-red-50 transition whitespace-nowrap">删除</button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ BODY — Sort controls + Three columns (left-aligned at top) ═══ */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
        {/* Sort controls — shared row above all columns */}
        <div className="flex items-center justify-end gap-2 mb-3">
          <span className="text-xs text-stone-400">排序:</span>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as DeckSortMode)}
            className="text-xs text-stone-600 bg-white border border-stone-200 rounded px-2 py-1 focus:outline-none focus:border-red-400 transition cursor-pointer">
            {(["cost", "power", "distance", "number"] as DeckSortMode[]).map((m) => <option key={m} value={m}>{SORT_LABELS[m]}</option>)}
          </select>
          <button onClick={() => setSortAsc(!sortAsc)}
            className="w-7 h-7 rounded border border-stone-200 bg-white text-stone-500 hover:text-stone-700 hover:bg-stone-50 transition flex items-center justify-center"
            title={sortAsc ? "升序" : "降序"}>
            {sortAsc ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            )}
          </button>
          <span className="text-[10px] text-stone-400 ml-2">{stats.mainCount} 张</span>
        </div>

        {/* Three columns — all start at same top (items-start) */}
        <div className="flex gap-4 items-start">

          {/* ── Left: Card Detail Panel ── */}
          <div className="flex-[25] min-w-[240px] max-w-[300px]">
            <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden sticky top-20 flex flex-col" style={{ maxHeight: "calc(100vh - 220px)" }}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-stone-200 bg-white flex-shrink-0">
                <span className="text-xs font-semibold text-stone-600">卡牌详情</span>
              </div>
              <div className="overflow-y-auto flex-1">
                {displayCard ? (
                  <CardDetailSidebar card={displayCard} db={db} showAddButton={false} />
                ) : (
                  <div className="py-20 text-center text-xs text-stone-400">暂无卡牌数据</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Middle: Card Grid ── */}
          <div className="flex-1 min-w-0">
            {/* Card grid — 10 columns */}
            {sortedCards.length === 0 ? (
              <div className="text-center py-20 text-stone-400"><p className="text-sm">暂无卡牌数据</p></div>
            ) : (
              <div className="grid grid-cols-10 gap-2">
                {sortedCards.map((card, idx) => (
                  <div key={`${card.card_no}-${idx}`} className="flex flex-col items-center cursor-pointer group"
                    onClick={() => setSelectedCardDetail(card)}>
                    <div className="w-full">
                      <div className={`w-full aspect-[3/4] rounded overflow-hidden bg-gray-100 border-2 transition ${selectedCardDetail?.card_no === card.card_no ? "border-red-500 shadow-md" : "border-stone-200 group-hover:border-red-400 group-hover:shadow-md"}`}>
                        {card.image_url ? (
                          <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.15"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">暂无</div>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-stone-700 mt-1 text-center leading-tight truncate w-full group-hover:text-red-600 transition">
                      {card.name}
                    </span>
                    <span className="text-[9px] text-stone-400">Lv{card.cost}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: "卡组数据" Deck Stats (nested card) ── */}
          <div className="flex-[20] min-w-[220px] max-w-[280px]">
            <div className="sticky top-20 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
              <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="px-3 py-2.5 border-b border-stone-100">
                  <h2 className="text-xs font-bold text-stone-700 uppercase tracking-wide">卡组数据</h2>
                </div>
                <div className="p-3 space-y-3">

                {/* Card 1: 费用曲线（按属性分色堆叠柱状图） */}
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-3">
                  <h3 className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">费用曲线</h3>
                  {stats.lvAttrDistribution.every((d) => d.total === 0) ? (
                    <p className="text-xs text-stone-400 py-3 text-center">暂无数据</p>
                  ) : (
                    <div className="flex items-end gap-1 h-28">
                      {stats.lvAttrDistribution.map((item) => {
                        const heightPct = item.total > 0 ? (item.total / maxAttrTotal) * 100 : 0;
                        return (
                          <div key={item.lv} className="flex-1 flex flex-col items-center h-full justify-end">
                            <span className="text-[9px] font-medium text-stone-600">{item.total || ""}</span>
                            <div
                              style={{ height: `${Math.max(heightPct, item.total > 0 ? 4 : 0)}%`, minHeight: item.total > 0 ? "6px" : "0" }}
                              className="w-full rounded-t flex flex-col justify-end overflow-hidden"
                            >
                              {item.attrs.map((attr) => {
                                const attrPct = item.total > 0 ? (attr.count / item.total) * 100 : 0;
                                return (
                                  <div
                                    key={attr.attribute}
                                    style={{ height: `${attrPct}%`, backgroundColor: attr.color, minHeight: attr.count > 0 ? "2px" : "0" }}
                                    title={`${attr.name}: ${attr.count}`}
                                  />
                                );
                              })}
                            </div>
                            <span className="text-[9px] text-stone-400 mt-0.5">{item.lv === 6 ? "Lv6+" : `Lv${item.lv}`}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Card 2: 距离曲线（按属性分色） */}
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-3">
                  <h3 className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">距离曲线</h3>
                  {!hasDistanceData ? (
                    <p className="text-xs text-stone-400 py-3 text-center">暂无距离数据</p>
                  ) : (
                    <div className="flex items-end gap-1 h-24">
                      {stats.distanceDistribution.map((item) => {
                        const heightPct = item.total > 0 ? (item.total / maxDistance) * 100 : 0;
                        return (
                          <div key={item.pp} className="flex-1 flex flex-col items-center h-full justify-end">
                            <span className="text-[9px] font-medium text-stone-600">{item.total || ""}</span>
                            <div
                              style={{ height: `${Math.max(heightPct, item.total > 0 ? 4 : 0)}%`, minHeight: item.total > 0 ? "6px" : "0" }}
                              className="w-full rounded-t flex flex-col justify-end overflow-hidden"
                            >
                              {item.attrs.map((attr) => {
                                const attrPct = item.total > 0 ? (attr.count / item.total) * 100 : 0;
                                return (
                                  <div
                                    key={attr.attribute}
                                    style={{ height: `${attrPct}%`, backgroundColor: attr.color, minHeight: attr.count > 0 ? "2px" : "0" }}
                                    title={`${attr.name}: ${attr.count}`}
                                  />
                                );
                              })}
                            </div>
                            <span className="text-[9px] text-stone-400 mt-0.5">{item.pp}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Card 3: 战力曲线（按属性分色） */}
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-3">
                  <h3 className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">战力曲线</h3>
                  {stats.powerDistribution.length === 0 ? (
                    <p className="text-xs text-stone-400 py-3 text-center">暂无数据</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {stats.powerDistribution.map((item) => {
                        const widthPct = maxPower > 0 ? (item.total / maxPower) * 100 : 0;
                        return (
                          <div key={item.pw} className="flex items-center gap-1.5">
                            <span className="text-[9px] text-stone-500 w-7 text-right flex-shrink-0">{item.pw}</span>
                            <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden flex">
                              {item.attrs.map((attr) => {
                                const attrW = item.total > 0 ? (attr.count / item.total) * widthPct : 0;
                                return (
                                  <div
                                    key={attr.attribute}
                                    style={{ width: `${attrW}%`, backgroundColor: attr.color, minWidth: attr.count > 0 ? "4px" : "0" }}
                                    title={`${attr.name}: ${attr.count}`}
                                  />
                                );
                              })}
                            </div>
                            <span className="text-[9px] text-stone-600 w-5 text-right flex-shrink-0">{item.total}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Card 4: 颜色分布 */}
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-3">
                  <h3 className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">颜色分布</h3>
                  {stats.attrDistribution.length === 0 ? (
                    <p className="text-xs text-stone-400 py-3 text-center">暂无数据</p>
                  ) : (
                    <div className="space-y-1.5">
                      {stats.attrDistribution.map((attr) => {
                        const pct = stats.mainCount > 0 ? (attr.count / stats.mainCount) * 100 : 0;
                        return (
                          <div key={attr.attribute} className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: attr.color }} />
                            <span className="text-[10px] text-stone-600 w-8 flex-shrink-0">{attr.name}</span>
                            <span className="text-[10px] text-stone-500 w-4 text-right flex-shrink-0">{attr.count}</span>
                            <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: attr.color }} />
                            </div>
                            <span className="text-[9px] text-stone-400 w-7 text-right flex-shrink-0">{pct.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Card 5: 特性统计（按属性分色） */}
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-3">
                  <h3 className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">特性统计</h3>
                  {stats.featureDistribution.length === 0 ? (
                    <p className="text-xs text-stone-400 py-3 text-center">暂无特性数据</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {stats.featureDistribution.map((item) => {
                        const widthPct = maxFeature > 0 ? (item.total / maxFeature) * 100 : 0;
                        return (
                          <div key={item.feature} className="flex items-center gap-1.5">
                            <span className="text-[9px] text-stone-500 w-12 text-right flex-shrink-0 truncate" title={item.feature}>
                              {item.feature.length > 4 ? item.feature.slice(0, 4) + "\u2026" : item.feature}
                            </span>
                            <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden flex">
                              {item.attrs.map((attr) => {
                                const attrW = item.total > 0 ? (attr.count / item.total) * widthPct : 0;
                                return (
                                  <div
                                    key={attr.attribute}
                                    style={{ width: `${attrW}%`, backgroundColor: attr.color, minWidth: attr.count > 0 ? "4px" : "0" }}
                                    title={`${attr.name}: ${attr.count}`}
                                  />
                                );
                              })}
                            </div>
                            <span className="text-[9px] text-stone-600 w-5 text-right flex-shrink-0">{item.total}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}