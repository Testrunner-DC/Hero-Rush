import { useEffect, useMemo, useState } from "react";
import type { Card, CardDatabase } from "../types/card";
import { sortCardVariantsLowestFirst } from "../utils/cardVariants";
import CardImage from "./CardImage";

interface Props {
  card: Card | null;
  db: CardDatabase;
  onAddToDeck?: (card: Card) => void;
  showAddButton?: boolean;
  compact?: boolean;
  effectiveStats?: { level: number; power: number; range: number } | null;
}

export default function CardDetailSidebar({ card, db, onAddToDeck, showAddButton = true, compact = false, effectiveStats = null }: Props) {
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const variants = useMemo(() => {
    if (!card) return [];
    if (compact) return [card];
    const variantIds = db.card_groups[card.card_no] || [card.id];
    return sortCardVariantsLowestFirst(variantIds
      .map((id) => db.cards.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is Card => candidate !== undefined));
  }, [card, compact, db.card_groups, db.cards]);

  useEffect(() => {
    const requestedIndex = variants.findIndex((variant) => variant.id === card?.id);
    setSelectedVariantIdx(requestedIndex >= 0 ? requestedIndex : 0);
  }, [card?.id, variants]);

  if (!card) {
    return <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-xs leading-6 text-stone-400">选择或悬停卡牌<br />查看详细信息</div>;
  }

  const currentCard = variants[selectedVariantIdx] || card;
  const level = effectiveStats?.level ?? currentCard.cost;
  const power = effectiveStats?.power ?? Number(currentCard.power || 0);
  const range = effectiveStats?.range ?? currentCard.r ?? 1;
  const sectionClass = "rounded-lg border border-stone-200 bg-stone-50/85 p-2.5";

  return (
    <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scrollbar-thin ${compact ? "text-[11px]" : "text-[13px]"}`} data-ui-contract="hero-rush-unified-card-detail">
      <section className={sectionClass}>
        <div className="mx-auto" style={{ maxWidth: compact ? "176px" : "260px" }}>
          <div className="relative aspect-[746/1041] w-full overflow-hidden rounded-lg bg-stone-100 shadow-md ring-1 ring-stone-200">
            <CardImage cardId={currentCard.id} legacyUrl={currentCard.image_url} intent="detail" alt={currentCard.name} className="absolute inset-0 h-full w-full object-contain" />
            <span className="absolute right-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-white shadow" style={{ backgroundColor: currentCard.rarity_color }}>{currentCard.rarity_code}</span>
          </div>
          {!compact && variants.length > 1 && <div className="mt-2 flex flex-wrap justify-center gap-1" aria-label="罕贵卡图切换">{variants.map((variant, index) => <button key={variant.id} type="button" onClick={() => setSelectedVariantIdx(index)} className={`rounded border px-1.5 py-0.5 text-[9px] font-bold transition ${index === selectedVariantIdx ? "border-transparent text-white" : "border-stone-200 bg-white text-stone-500 hover:border-stone-400"}`} style={index === selectedVariantIdx ? { backgroundColor: variant.rarity_color } : undefined}>{variant.rarity_code}</button>)}</div>}
        </div>
        <div className="mt-2.5 text-center"><h3 className={`${compact ? "text-base" : "text-lg"} font-bold leading-tight text-stone-800`}>{currentCard.name}</h3><p className="mt-0.5 font-mono text-[10px] text-stone-400">{currentCard.card_no}</p></div>
      </section>

      <section className={sectionClass}>
        <h4 className="mb-2 text-[9px] font-bold uppercase tracking-[.14em] text-stone-400">卡牌信息</h4>
        <div className="grid grid-cols-3 gap-1.5 text-center font-bold">
          {currentCard.card_type === 1 ? <><span className="rounded-md bg-stone-900 px-1 py-1.5 text-white">{level}</span><span className="rounded-md bg-stone-900 px-1 py-1.5 text-white">{power}</span><span className="rounded-md bg-stone-900 px-1 py-1.5 text-white">R{range}</span></> : <span className="col-span-3 rounded-md bg-stone-200 px-2 py-1.5 text-stone-600">冲击卡</span>}
        </div>
        <dl className="mt-2 grid grid-cols-[40px_1fr] gap-x-2 gap-y-1.5 leading-4">
          <dt className="text-stone-400">颜色</dt><dd className="flex min-w-0 items-center gap-1.5 font-bold text-stone-700"><span className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: currentCard.attribute_color }} />{currentCard.attribute_name || "未标注"}</dd>
          <dt className="text-stone-400">类型</dt><dd className="font-medium text-stone-700">{currentCard.card_type_name}</dd>
          <dt className="text-stone-400">系列</dt><dd className="font-medium text-stone-700">{currentCard.package_short || currentCard.package}</dd>
          <dt className="text-stone-400">罕贵</dt><dd className="font-medium text-stone-700">{currentCard.rarity_code} · {currentCard.rarity_cn}</dd>
        </dl>
      </section>

      <section className={sectionClass}>
        <h4 className="mb-2 text-[9px] font-bold uppercase tracking-[.14em] text-stone-400">特性</h4>
        {currentCard.feature_text || currentCard.feature ? <div className="flex flex-wrap gap-1">{(currentCard.feature_text || currentCard.feature || "").split("/").filter(Boolean).map((feature, index) => <span key={`${feature}-${index}`} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[9px] font-medium text-indigo-700">{feature}</span>)}</div> : <p className="text-stone-400">无特性</p>}
      </section>

      <section className={sectionClass}>
        <h4 className="mb-2 text-[9px] font-bold uppercase tracking-[.14em] text-stone-400">效果</h4>
        <p className="whitespace-pre-wrap leading-[1.65] text-stone-600">{currentCard.effect || "无效果文字"}</p>
      </section>

      {showAddButton && onAddToDeck && currentCard.card_type === 1 && <button type="button" onClick={() => onAddToDeck(currentCard)} className="w-full rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700">＋ 加入主卡组</button>}
    </div>
  );
}
