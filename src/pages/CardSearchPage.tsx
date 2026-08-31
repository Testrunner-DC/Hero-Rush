import { useEffect, useMemo, useState } from "react";
import type { Card, CardDatabase } from "../types/card";
import CardDetailSidebar from "../components/CardDetailSidebar";
import CardVariantImage from "../components/CardVariantImage";
import PaginationControls from "../components/PaginationControls";
import { getCostOptions, getPackageOptions } from "../components/FilterSidebar";
import { groupCardVariants } from "../utils/cardVariants";
import { CARD_PAGE_SIZE, paginateItems } from "../utils/pagination";

interface Props {
  db: CardDatabase;
  cardMap: Map<string, Card>;
}

type SortMode = "card_no" | "cost" | "power" | "name";
const selectClass = "min-w-0 rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-2.5 py-2 text-xs text-[var(--msa-text-secondary)] focus:border-red-400 focus:outline-none";

export default function CardSearchPage({ db, cardMap }: Props) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<number | "all">("all");
  const [attribute, setAttribute] = useState<number | "all">("all");
  const [cardPackage, setCardPackage] = useState<string | "all">("all");
  const [cost, setCost] = useState<number | "all">("all");
  const [rarity, setRarity] = useState<number | "all">("all");
  const [sort, setSort] = useState<SortMode>("card_no");
  const [powerMin, setPowerMin] = useState("");
  const [distance, setDistance] = useState<number | "all">("all");
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [page, setPage] = useState(1);

  const packageOptions = useMemo(() => getPackageOptions(db), [db]);
  const costOptions = useMemo(() => getCostOptions(db), [db]);
  const cardGroups = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-CN");
    const minimumPower = powerMin.trim() ? Number(powerMin) : null;
    const matched = db.cards.filter((card) => {
      if (type !== "all" && card.card_type !== type) return false;
      if (attribute !== "all" && card.attribute !== attribute) return false;
      if (cardPackage !== "all" && card.package_short !== cardPackage) return false;
      if (cost !== "all" && card.cost !== cost) return false;
      if (rarity !== "all" && card.rarity !== rarity) return false;
      if (distance !== "all" && card.r !== distance) return false;
      if (minimumPower != null && Number.isFinite(minimumPower) && Number(card.power || 0) < minimumPower) return false;
      if (keyword && ![card.name, card.card_no, card.effect, card.feature_text, card.package_short]
        .some((value) => value?.toLocaleLowerCase("zh-CN").includes(keyword))) return false;
      return true;
    });
    return groupCardVariants(matched).sort((left, right) => {
      if (sort === "name") return left.lowest.name.localeCompare(right.lowest.name, "zh-CN");
      if (sort === "cost") return left.lowest.cost - right.lowest.cost || left.cardNo.localeCompare(right.cardNo);
      if (sort === "power") return Number(right.lowest.power || 0) - Number(left.lowest.power || 0) || left.cardNo.localeCompare(right.cardNo);
      return left.cardNo.localeCompare(right.cardNo);
    });
  }, [db.cards, query, type, attribute, cardPackage, cost, rarity, distance, powerMin, sort]);

  const pagination = useMemo(() => paginateItems(cardGroups, page, CARD_PAGE_SIZE), [cardGroups, page]);
  const detailCard = selectedCard && cardGroups.some((group) => group.cardNo === selectedCard.card_no) ? selectedCard : cardGroups[0]?.lowest ?? null;
  useEffect(() => { setPage(1); }, [query, type, attribute, cardPackage, cost, rarity, distance, powerMin, sort]);

  const reset = () => {
    setQuery(""); setType("all"); setAttribute("all"); setCardPackage("all");
    setCost("all"); setRarity("all"); setDistance("all"); setPowerMin(""); setSort("card_no");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--msa-bg)]">
      <header className="flex flex-shrink-0 items-end justify-between border-b border-[var(--msa-border)] bg-[var(--msa-surface)] px-5 py-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--msa-text-muted)]">Card Archive</p><h1 className="text-xl font-bold text-[var(--msa-text-primary)]">卡查</h1></div>
        <div className="flex items-baseline gap-1 text-[var(--msa-text-muted)]"><b className="text-2xl text-red-600">{cardGroups.length}</b><span className="text-xs">/ {cardMap.size} 张</span></div>
      </header>

      <section className="grid flex-shrink-0 grid-cols-[minmax(220px,2fr)_repeat(6,minmax(90px,1fr))_auto] gap-2 border-b border-[var(--msa-border)] bg-white/80 p-3 max-[1050px]:grid-cols-4">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="卡名、编号、效果或特性" className={`${selectClass} text-sm`} />
        <select value={type} onChange={(event) => setType(event.target.value === "all" ? "all" : Number(event.target.value))} className={selectClass}><option value="all">全部类型</option><option value="1">角色卡</option><option value="2">冲击卡</option></select>
        <select value={attribute} onChange={(event) => setAttribute(event.target.value === "all" ? "all" : Number(event.target.value))} className={selectClass}><option value="all">全部颜色</option>{Object.entries(db.attributes).map(([id, value]) => <option key={id} value={id}>{value.name}</option>)}</select>
        <select value={cardPackage} onChange={(event) => setCardPackage(event.target.value)} className={selectClass}><option value="all">全部系列</option>{packageOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <select value={cost} onChange={(event) => setCost(event.target.value === "all" ? "all" : Number(event.target.value))} className={selectClass}><option value="all">全部等级</option>{costOptions.map((value) => <option key={value} value={value}>Lv{value}</option>)}</select>
        <select value={rarity} onChange={(event) => setRarity(event.target.value === "all" ? "all" : Number(event.target.value))} className={selectClass}><option value="all">全部稀有度</option>{Object.entries(db.rarities).map(([id, value]) => <option key={id} value={id}>{value.code}</option>)}</select>
        <select value={distance} onChange={(event) => setDistance(event.target.value === "all" ? "all" : Number(event.target.value))} className={selectClass}><option value="all">全部距离</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>R {value}</option>)}</select>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className={selectClass}><option value="card_no">按编号</option><option value="cost">按等级</option><option value="power">按战力</option><option value="name">按名称</option></select>
        <button onClick={reset} className="rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-surface)] px-3 py-2 text-xs font-medium text-[var(--msa-text-muted)] transition hover:border-red-300 hover:text-red-600">重置</button>
        <label className="col-span-full flex items-center gap-2 text-[10px] text-[var(--msa-text-muted)]"><span>最低战力</span><input type="number" step={500} value={powerMin} onChange={(event) => setPowerMin(event.target.value)} placeholder="不限" className="w-24 rounded border border-[var(--msa-border)] bg-white px-2 py-1 text-xs" /><span>点击卡牌后在右侧保持详情；切换筛选会自动回到第一页。</span></label>
      </section>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
          {pagination.items.length ? <><div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6" role="list" aria-label="卡牌搜索结果">
            {pagination.items.map((group) => { const card = group.lowest; return <article key={group.cardNo} role="listitem" onClick={() => setSelectedCard(card)} className={`min-w-0 cursor-pointer overflow-hidden rounded-lg border bg-[var(--msa-surface)] text-left transition ${detailCard?.card_no === group.cardNo ? "border-red-400 shadow-md" : "border-[var(--msa-border)] hover:border-red-300 hover:shadow-md"}`}>
              <div className="relative aspect-[746/1041] overflow-hidden bg-stone-100"><CardVariantImage variants={group.variants} onVariantChange={setSelectedCard} /></div><div className="p-2"><b className="block truncate text-xs text-[var(--msa-text-primary)]">{card.name}</b><span className="mt-0.5 block truncate text-[9px] text-[var(--msa-text-muted)]">{card.card_no} · {card.card_type_name}</span></div>
            </article>; })}
          </div><PaginationControls page={pagination.page} pageCount={pagination.pageCount} total={pagination.total} pageSize={CARD_PAGE_SIZE} onPageChange={setPage} /></> : <div className="py-24 text-center text-sm text-[var(--msa-text-muted)]">没有符合条件的卡牌。</div>}
        </main>
        <aside className="flex w-[320px] flex-shrink-0 flex-col overflow-hidden border-l border-[var(--msa-border)] bg-[var(--msa-surface)] max-[900px]:w-[260px] max-[650px]:hidden 2xl:w-[360px]"><div className="border-b border-[var(--msa-border)] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--msa-text-muted)]">Card Detail</p><h2 className="text-sm font-bold text-[var(--msa-text-primary)]">卡牌详情</h2></div><CardDetailSidebar card={detailCard} db={db} showAddButton={false} /></aside>
      </div>
    </div>
  );
}
