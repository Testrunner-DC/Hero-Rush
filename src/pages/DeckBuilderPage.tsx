import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Card, CardDatabase, Deck, DeckEntry } from "../types/card";
import CardImage from "../components/CardImage";
import CardVariantImage from "../components/CardVariantImage";
import ColumnSelector from "../components/ColumnSelector";
import FilterSidebar, { DEFAULT_FILTERS, type FilterState } from "../components/FilterSidebar";
import ImportDeckModal from "../components/ImportDeckModal";
import PaginationControls from "../components/PaginationControls";
import PublishDeckModal from "../components/PublishDeckModal";
import { useAuth } from "../hooks/useAuth";
import { useDecks } from "../hooks/useDecks";
import { decodeDeck, encodeDeck, extractDeckCode } from "../utils/deckCode";
import { downloadDeckImage } from "../utils/deckImage";
import { compareCardsByDefaultDeckOrder, countDeckCardsWithExactName } from "../utils/deckBuilding";
import { deckEligibleVariant, groupCardVariants, ORDINARY_CARD_VARIANT_ACCESS } from "../utils/cardVariants";
import { CARD_PAGE_SIZE, paginateItems } from "../utils/pagination";

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
  setDeckName: (value: string) => void;
  mainDeck: DeckEntry[];
  stats: DeckStats;
  savedDecks: Deck[];
  onAdd: (card: Card) => void;
  onRemove: (cardNo: string) => void;
  onClear: () => void;
  onSave: () => void;
  onSaveAs: (name: string) => void;
  onLoad: (deck: Deck) => void;
  onDelete: (name: string) => void;
  onShare: () => void;
}

type PickerTab = "all" | "main" | "impact";
type DeckSort = "deck_order" | "energy" | "power" | "name";
const sortLabels: Record<DeckSort, string> = { deck_order: "构筑顺序", energy: "等级", power: "战力", name: "名称" };

export default function DeckBuilderPage({ db, cardMap, deckName, setDeckName, mainDeck, stats, savedDecks, onAdd, onRemove, onClear, onSave, onSaveAs, onLoad, onDelete, onShare }: Props) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [pickerTab, setPickerTab] = useState<PickerTab>("all");
  const [columns, setColumns] = useState(6);
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [deckSort, setDeckSort] = useState<DeckSort>("deck_order");
  const [showImport, setShowImport] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const { isAuthenticated } = useAuth();
  const { createDeck } = useDecks();
  const actionClass = "rounded border border-[var(--msa-border-strong)] bg-[var(--msa-surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--msa-text-secondary)] transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35";

  const countFor = useCallback((card: Card) => mainDeck.find((entry) => entry.card_no === card.card_no)?.count || 0, [mainDeck]);
  const nameCountFor = useCallback((card: Card) => countDeckCardsWithExactName(mainDeck, cardMap, card.name), [mainDeck, cardMap]);
  const allGroupsByNo = useMemo(() => new Map(groupCardVariants(db.cards).map((group) => [group.cardNo, group])), [db.cards]);
  const filteredGroups = useMemo(() => {
    const keyword = filters.search.trim().toLocaleLowerCase("zh-CN");
    const matched = db.cards.filter((card) => {
      if (pickerTab === "main" && card.card_type !== 1) return false;
      if (pickerTab === "impact" && card.card_type !== 2) return false;
      if (filters.selectedAttrs.length && !filters.selectedAttrs.includes(card.attribute)) return false;
      if (filters.selectedRarities.length && !filters.selectedRarities.includes(card.rarity)) return false;
      if (filters.selectedCosts.length && !filters.selectedCosts.includes(card.cost)) return false;
      if (filters.filterPackage !== "all" && card.package_short !== filters.filterPackage) return false;
      if (filters.powerMin !== "all" && Number(card.power || 0) < filters.powerMin) return false;
      if (filters.powerMax !== "all" && Number(card.power || 0) > filters.powerMax) return false;
      if (filters.distanceMin !== "all" && (card.r ?? 0) < filters.distanceMin) return false;
      if (filters.distanceMax !== "all" && (card.r ?? 0) > filters.distanceMax) return false;
      if (keyword && ![card.name, card.card_no, card.effect, card.feature_text].some((value) => value?.toLocaleLowerCase("zh-CN").includes(keyword))) return false;
      return true;
    });
    return groupCardVariants(matched).sort((left, right) => filters.sortBy === "deck_order" ? compareCardsByDefaultDeckOrder(left.lowest, right.lowest) : filters.sortBy === "name" ? left.lowest.name.localeCompare(right.lowest.name, "zh-CN") : filters.sortBy === "cost" ? left.lowest.cost - right.lowest.cost || left.cardNo.localeCompare(right.cardNo) : filters.sortBy === "power" ? Number(right.lowest.power || 0) - Number(left.lowest.power || 0) : left.cardNo.localeCompare(right.cardNo));
  }, [db.cards, pickerTab, filters]);
  const pagination = useMemo(() => paginateItems(filteredGroups, page, CARD_PAGE_SIZE), [filteredGroups, page]);

  const deckEntries = useMemo(() => [...mainDeck].sort((left, right) => {
    const a = cardMap.get(left.card_no); const b = cardMap.get(right.card_no);
    if (!a || !b) return 0;
    if (deckSort === "deck_order") return compareCardsByDefaultDeckOrder(a, b);
    if (deckSort === "name") return a.name.localeCompare(b.name, "zh-CN");
    if (deckSort === "power") return Number(b.power || 0) - Number(a.power || 0) || a.card_no.localeCompare(b.card_no);
    return a.cost - b.cost || a.card_no.localeCompare(b.card_no);
  }), [mainDeck, cardMap, deckSort]);
  const curve = useMemo(() => {
    const values = Array(9).fill(0) as number[];
    mainDeck.forEach((entry) => { const card = cardMap.get(entry.card_no); if (card) values[Math.min(8, card.cost)] += entry.count; });
    return values;
  }, [mainDeck, cardMap]);
  const maxCurve = Math.max(1, ...curve);
  const detailCard = hoveredCard ?? selectedCard ?? (deckEntries[0] ? cardMap.get(deckEntries[0].card_no) ?? null : null);
  const validation = stats.mainCount !== 50 ? `主卡组需要 50 张，当前 ${stats.mainCount} 张` : !stats.colorValid ? "卡组颜色超过 2 种" : !stats.nameValid ? `同名卡超过 3 张：${stats.overThreeNames.join("、")}` : "卡组合法，可以保存并用于对战";

  useEffect(() => { setPage(1); }, [pickerTab, filters]);
  const add = (requested: Card) => {
    const group = allGroupsByNo.get(requested.card_no);
    const card = group ? deckEligibleVariant(group, ORDINARY_CARD_VARIANT_ACCESS, requested) : requested;
    setSelectedCard(card);
    if (card.card_type === 1 && nameCountFor(card) < 3 && stats.mainCount < 50) onAdd(card);
  };
  const newDeck = () => { onClear(); setDeckName("未命名卡组"); setSelectedCard(null); };
  const saveAs = () => {
    const base = `${deckName || "未命名卡组"} 副本`; let candidate = base; let index = 2;
    while (savedDecks.some((deck) => deck.name === candidate)) candidate = `${base} ${index++}`;
    onSaveAs(candidate);
  };
  const handleImport = (input: string) => {
    const deck = decodeDeck(extractDeckCode(input)); if (!deck) return;
    onLoad(deck); setSelectedCard(null); setShowImport(false);
  };
  const copyCode = () => {
    const code = encodeDeck({ name: deckName, main_deck: mainDeck, rush_deck: [], created_at: new Date().toISOString() });
    navigator.clipboard.writeText(code).then(() => alert("卡组码已复制")).catch(() => prompt("复制以下卡组码：", code));
  };
  const publish = async (title: string, description: string) => { const created = await createDeck(title, description, JSON.stringify(mainDeck), true); if (created) setShowPublish(false); };
  const handleDeckImageDownload = async () => {
    setGeneratingImage(true);
    try { await downloadDeckImage({ name: deckName, main_deck: mainDeck, rush_deck: [], created_at: new Date().toISOString() }, cardMap); }
    finally { setGeneratingImage(false); }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--msa-bg)]">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[var(--msa-border)] bg-white/90 px-3 py-2">
        <button onClick={() => navigate("/plaza")} className="rounded border border-[var(--msa-border-strong)] bg-[var(--msa-surface)] px-2.5 py-1.5 text-xs text-[var(--msa-text-secondary)]">← 返回卡组</button>
        <div className="mr-2"><p className="text-[9px] uppercase tracking-[0.16em] text-[var(--msa-text-muted)]">Deck Editor</p><h1 className="text-sm font-bold text-[var(--msa-text-primary)]">组卡器</h1></div>
        <label className="flex items-center gap-2 text-[10px] text-[var(--msa-text-muted)]"><span>卡组名称</span><input value={deckName} maxLength={30} onChange={(event) => setDeckName(event.target.value)} className="w-44 rounded border border-[var(--msa-border-strong)] bg-[var(--msa-bg-alt)] px-2.5 py-1.5 text-sm text-[var(--msa-text-primary)]" /></label>
        <div className={`flex items-baseline gap-1 ${stats.allValid ? "text-emerald-600" : "text-amber-600"}`}><b className="text-2xl">{stats.mainCount}</b><span className="text-[10px]">/ 50</span></div>
        <div className="ml-auto flex flex-wrap gap-1"><button onClick={newDeck} className={actionClass}>新建</button><button onClick={onSave} disabled={!stats.allValid} className={actionClass}>保存</button><button onClick={saveAs} disabled={!stats.allValid} className={actionClass}>另存为</button><button onClick={() => setShowImport(true)} className={actionClass}>导入</button><button onClick={copyCode} className={actionClass}>导出码</button><button onClick={onShare} className={actionClass}>分享</button><button onClick={handleDeckImageDownload} disabled={!stats.allValid || generatingImage} className={actionClass}>{generatingImage ? "生成中…" : "生成卡组图"}</button>{isAuthenticated && <button onClick={() => setShowPublish(true)} disabled={!stats.allValid} className={actionClass}>发布</button>}<button onClick={onClear} className={`${actionClass} text-red-600`}>清空</button></div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[238px_minmax(420px,1fr)_350px] gap-2 overflow-hidden p-2 max-[1100px]:grid-cols-[210px_minmax(380px,1fr)_310px] max-[900px]:grid-cols-[180px_minmax(300px,1fr)_260px]">
        <aside className="min-h-0 overflow-y-auto rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)] p-3 scrollbar-thin">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--msa-text-muted)]">Filter</p><h2 className="mb-3 text-sm font-bold text-[var(--msa-text-primary)]">筛选</h2>
          <FilterSidebar db={db} state={filters} onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onReset={() => setFilters(DEFAULT_FILTERS)} resultCount={filteredGroups.length} multiSelect />
          <div className="my-4 border-t border-[var(--msa-border)]" />
          <div className="mb-2 flex items-center justify-between"><div><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--msa-text-muted)]">Saved Decks</p><h2 className="text-sm font-bold text-[var(--msa-text-primary)]">我的卡组</h2></div><span className="text-[10px] text-[var(--msa-text-muted)]">{savedDecks.length}</span></div>
          <div className="space-y-1.5">{savedDecks.length ? savedDecks.map((deck) => <article key={`${deck.name}-${deck.created_at}`} className={`flex items-center rounded-lg border ${deck.name === deckName ? "border-red-300 bg-red-50" : "border-[var(--msa-border)] bg-[var(--msa-bg-alt)]"}`}><button onClick={() => onLoad(deck)} className="min-w-0 flex-1 px-2 py-2 text-left"><b className="block truncate text-xs text-[var(--msa-text-primary)]">{deck.name}</b><span className="text-[9px] text-[var(--msa-text-muted)]">{deck.main_deck.reduce((sum, entry) => sum + entry.count, 0)} 张</span></button><button onClick={() => confirm(`确定删除「${deck.name}」吗？`) && onDelete(deck.name)} className="px-2 py-2 text-stone-400 hover:text-red-600">×</button></article>) : <p className="py-3 text-center text-[10px] text-[var(--msa-text-muted)]">暂无本地卡组</p>}</div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)]">
          <header className="flex items-center justify-between border-b border-[var(--msa-border)] px-3 py-2"><div><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--msa-text-muted)]">Card Pool</p><h2 className="text-sm font-bold text-[var(--msa-text-primary)]">卡池</h2></div><div className="flex items-center gap-2"><span className="text-[10px] text-[var(--msa-text-muted)]">{filteredGroups.length} 张结果</span><ColumnSelector columns={columns} onChange={setColumns} /></div></header>
          <nav className="grid grid-cols-3 gap-1 border-b border-[var(--msa-border)] bg-[var(--msa-bg-alt)] p-1.5" aria-label="组卡器卡池分类">{([{ key: "all", label: "全部卡牌" }, { key: "main", label: "角色卡" }, { key: "impact", label: "冲击参考" }] as { key: PickerTab; label: string }[]).map((tab) => <button key={tab.key} onClick={() => setPickerTab(tab.key)} className={`rounded px-3 py-1.5 text-xs font-medium transition ${pickerTab === tab.key ? "bg-red-600 text-white" : "bg-[var(--msa-surface)] text-[var(--msa-text-muted)] hover:text-[var(--msa-text-primary)]"}`}>{tab.label}</button>)}</nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{pagination.items.map((group) => { const card = group.lowest; const count = countFor(card); const nameCount = nameCountFor(card); const addDisabled = card.card_type !== 1 || nameCount >= 3 || stats.mainCount >= 50; return <article key={group.cardNo} onMouseEnter={() => setHoveredCard(card)} onMouseLeave={() => setHoveredCard(null)} onClick={() => setSelectedCard(card)} className={`min-w-0 overflow-hidden rounded-lg border bg-white transition ${selectedCard?.card_no === card.card_no ? "border-red-400 shadow-md" : count ? "border-amber-300" : "border-[var(--msa-border)] hover:border-red-300"}`}><div role="button" tabIndex={0} onDoubleClick={(event) => { event.stopPropagation(); add(card); }} className="relative block aspect-[746/1041] w-full overflow-hidden bg-stone-100"><CardVariantImage variants={group.variants} lockedToLowest onVariantChange={(variant) => { setSelectedCard(variant); setHoveredCard(variant); }} />{count > 0 && <b className="pointer-events-none absolute right-1 top-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white">×{count}</b>}<span className="pointer-events-none absolute left-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-black/75 px-1 text-[9px] font-bold text-white">{card.cost}</span></div><div className="p-1.5"><b className="block truncate text-[10px] text-[var(--msa-text-primary)]">{card.name}</b><span className="block truncate text-[8px] text-[var(--msa-text-muted)]">{card.card_no}</span></div><div className="grid grid-cols-[1fr_28px_1fr] border-t border-[var(--msa-border)]"><button aria-label={`减少 ${card.name}`} disabled={!count} onClick={(event) => { event.stopPropagation(); onRemove(card.card_no); }} className="py-1 text-sm text-[var(--msa-text-secondary)] disabled:opacity-30">−</button><strong className="grid place-items-center border-x border-[var(--msa-border)] text-[10px]">{count}</strong><button aria-label={`增加 ${card.name}`} title={nameCount >= 3 ? `${card.name} 已达到同名合计 3 张上限` : undefined} disabled={addDisabled} onClick={(event) => { event.stopPropagation(); add(card); }} className="py-1 text-sm text-[var(--msa-text-secondary)] disabled:opacity-30">＋</button></div></article>; })}</div>
            <PaginationControls page={pagination.page} pageCount={pagination.pageCount} total={pagination.total} pageSize={CARD_PAGE_SIZE} onPageChange={setPage} />
          </div>
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)]">
          <header className="flex items-end justify-between px-3 py-2"><div><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--msa-text-muted)]">Deck List</p><h2 className="text-sm font-bold text-[var(--msa-text-primary)]">当前构筑</h2></div><b className={`text-2xl ${stats.allValid ? "text-emerald-600" : "text-red-600"}`}>{stats.mainCount}</b></header>
          <div className="flex h-[92px] flex-shrink-0 items-end gap-1 border-y border-[var(--msa-border)] bg-[var(--msa-bg-alt)] px-3 py-2">{curve.map((value, index) => <div key={index} className="grid h-full flex-1 content-end justify-items-center"><span className="w-full max-w-5 rounded-t bg-red-400" style={{ height: `${Math.max(3, value / maxCurve * 54)}px` }} /><b className="text-[8px] text-[var(--msa-text-secondary)]">{index === 8 ? "8+" : index}</b><small className="text-[7px] text-[var(--msa-text-muted)]">{value}</small></div>)}</div>
          <div className="flex items-center gap-2 border-b border-[var(--msa-border)] px-3 py-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200"><div className={`h-full ${stats.allValid ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, stats.mainCount / 50 * 100)}%` }} /></div><select value={deckSort} onChange={(event) => setDeckSort(event.target.value as DeckSort)} className="rounded border border-[var(--msa-border)] bg-white px-1.5 py-0.5 text-[9px]">{(Object.keys(sortLabels) as DeckSort[]).map((key) => <option key={key} value={key}>{sortLabels[key]}</option>)}</select></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">{deckEntries.length ? deckEntries.map((entry) => {
            const card = cardMap.get(entry.card_no); if (!card) return null;
            return <article key={entry.card_no} onClick={() => setSelectedCard(card)} className={`relative isolate mb-1 flex min-h-11 items-center gap-1.5 overflow-hidden rounded-lg border p-1.5 ${selectedCard?.card_no === card.card_no ? "border-red-400 ring-1 ring-red-300" : "border-[var(--msa-border)]"}`}>
              <CardImage cardId={card.id} legacyUrl={card.image_url} intent="thumb" alt="" aria-hidden="true" className="absolute inset-0 z-0 h-full w-full object-cover object-[center_28%] opacity-45 saturate-[.9] contrast-110" />
              <span className="absolute inset-0 z-[1] bg-gradient-to-r from-white/95 via-white/55 to-white/90" />
              <span className="relative z-10 grid h-7 w-7 flex-shrink-0 place-items-center rounded bg-white/90 text-xs font-bold shadow-sm">{card.cost}</span>
              <div className="relative z-10 min-w-0 flex-1"><b className="block truncate text-[10px] text-[var(--msa-text-primary)]">{card.name}</b><small className="block text-[8px] text-[var(--msa-text-secondary)]">{card.card_no}</small></div>
              <strong className="relative z-10 text-xs text-red-700">×{entry.count}</strong>
              <button disabled={nameCountFor(card) >= 3 || stats.mainCount >= 50} title={nameCountFor(card) >= 3 ? `${card.name} 已达到同名合计 3 张上限` : undefined} onClick={(event) => { event.stopPropagation(); add(card); }} className="relative z-10 grid h-7 w-7 place-items-center rounded border border-[var(--msa-border)] bg-white/90 disabled:opacity-30">＋</button>
              <button onClick={(event) => { event.stopPropagation(); onRemove(entry.card_no); }} className="relative z-10 grid h-7 w-7 place-items-center rounded border border-[var(--msa-border)] bg-white/90">−</button>
            </article>;
          }) : <p className="py-6 text-center text-[10px] text-[var(--msa-text-muted)]">从中间卡池加入卡牌，双击卡面也可快速加入。</p>}</div>
          {detailCard && <section className="flex max-h-[150px] flex-shrink-0 gap-2 border-t border-[var(--msa-border)] bg-[var(--msa-bg-alt)] p-2"><CardImage cardId={detailCard.id} legacyUrl={detailCard.image_url} intent="detail" alt={detailCard.name} className="h-[132px] w-auto rounded object-cover" /><div className="min-w-0 overflow-y-auto"><small className="text-[8px] text-red-500">{detailCard.card_no}</small><h3 className="text-xs font-bold text-[var(--msa-text-primary)]">{detailCard.name}</h3><p className="mt-1 whitespace-pre-line text-[9px] leading-relaxed text-[var(--msa-text-muted)]">{detailCard.effect || "无效果文字"}</p></div></section>}
          <footer className={`flex-shrink-0 border-t px-3 py-2 text-[10px] ${stats.allValid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{validation}</footer>
        </aside>
      </main>

      {showImport && <ImportDeckModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showPublish && <PublishDeckModal open={showPublish} deckName={deckName} onPublish={publish} onClose={() => setShowPublish(false)} />}
    </div>
  );
}
