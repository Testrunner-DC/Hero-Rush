import { useEffect, useMemo, useState } from "react";
import type { BattleViewV2, Card, VisibleCardV2 } from "@hero-rush/game-core";
import CardImage from "../CardImage";

interface MulliganPanelV2Props {
  view: BattleViewV2;
  cardByDefinitionId: ReadonlyMap<string, Card>;
  selectedCardIds: ReadonlySet<string>;
  submitting?: boolean;
  onToggle: (cardId: string) => void;
  onCardFocus?: (card: VisibleCardV2) => void;
  onSubmit: (cardIds: string[]) => void;
  onClear: () => void;
}

export default function MulliganPanelV2({
  view,
  cardByDefinitionId,
  selectedCardIds,
  submitting = false,
  onToggle,
  onCardFocus,
  onSubmit,
  onClear,
}: MulliganPanelV2Props) {
  const [minimized, setMinimized] = useState(false);
  const decision = view.pendingDecision?.kind === "MULLIGAN" ? view.pendingDecision : null;
  useEffect(() => setMinimized(false), [decision?.id]);
  const choiceCards = useMemo(() => {
    if (!decision) return [];
    const visibleHand = new Map(view.players.flatMap((player) => player.hand).map((card) => [card.instanceId, card]));
    return decision.choices.flatMap((cardId) => {
      const card = visibleHand.get(cardId);
      return card ? [card] : [];
    });
  }, [decision, view.players]);

  if (!decision) return null;
  if (minimized) return <button type="button" onClick={() => setMinimized(false)} className="absolute bottom-4 right-4 z-[120] rounded-full border border-red-200 bg-stone-950 px-4 py-2 text-xs font-bold text-red-100 shadow-2xl" data-ui-contract="hero-rush-v2-restore-decision">恢复起始手牌调度</button>;

  return (
    <div className="absolute inset-0 z-[110] grid place-items-center bg-stone-950/55 py-4 pr-4 backdrop-blur-[2px]" style={{ paddingLeft: "calc(var(--hero-rush-v2-detail-inset, 232px) + 16px)" }} data-ui-contract="hero-rush-v2-mulligan-modal">
      <section role="dialog" aria-modal="true" aria-labelledby="mulligan-title" className="flex max-h-[min(760px,92vh)] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl border border-red-200 bg-[#fcfaf7] text-stone-900 shadow-[0_28px_90px_rgba(28,25,23,.48)]">
        <header className="flex shrink-0 items-start justify-between gap-5 border-b border-stone-200 px-6 py-5">
          <div>
            <h2 id="mulligan-title" className="text-xl font-black tracking-tight text-red-800">起始手牌调度</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              六张起始手牌同时展示，点击选择 0–{decision.max} 张。提交后所选牌置于主卡组底，补等量牌，再由服务器洗混剩余主卡组。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-red-50 px-3 py-1.5 font-mono text-sm font-bold text-red-700">{selectedCardIds.size}/{decision.max}</span><button type="button" onClick={() => setMinimized(true)} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 hover:border-red-300">最小化</button></div>
        </header>

        <div className="relative min-h-0 flex-1 px-6 py-5">
          <div className="grid h-full min-h-[280px] grid-flow-col auto-cols-[150px] items-center gap-3 overflow-x-auto overflow-y-hidden px-1 pb-3 scrollbar-thin lg:grid-flow-row lg:auto-cols-auto lg:grid-cols-6 lg:overflow-x-visible" data-ui-contract="hero-rush-v2-mulligan-six-card-grid">
            {choiceCards.map((card) => {
              const definition = cardByDefinitionId.get(card.definitionId);
              const selected = selectedCardIds.has(card.instanceId);
              return (
                <button key={card.instanceId} type="button" aria-pressed={selected} disabled={submitting} onClick={() => onToggle(card.instanceId)} onMouseEnter={() => onCardFocus?.(card)} onFocus={() => onCardFocus?.(card)} className={`group relative w-full min-w-0 rounded-xl border-2 bg-white p-2 text-left transition disabled:opacity-50 ${selected ? "-translate-y-2 border-red-600 shadow-[0_18px_34px_rgba(185,28,28,.3)] ring-4 ring-red-100" : "border-stone-200 shadow-lg hover:-translate-y-1 hover:border-red-300"}`}>
                  <span className="relative block aspect-[746/1041] w-full overflow-hidden rounded-lg bg-stone-900">
                    {definition ? <CardImage cardId={definition.id} legacyUrl={definition.image_url} intent="detail" alt={definition.name} className="h-full w-full object-contain" /> : <span className="absolute inset-0 grid place-items-center px-3 text-center text-xs text-white/60">{card.definitionId}</span>}
                    {selected && <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-red-600 text-sm font-black text-white shadow">✓</span>}
                  </span>
                  <strong className="mt-2 block truncate text-xs text-stone-800">{definition?.name ?? card.definitionId}</strong>
                  <span className="mt-1 flex justify-between font-mono text-[10px] text-stone-500"><span>战 {card.effectivePower}</span><span>R{card.effectiveRange}</span></span>
                </button>
              );
            })}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-stone-200 bg-stone-50/80 px-6 py-4">
          <span className="text-xs text-stone-400">已选择的卡牌会以红框和勾选标记显示</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={submitting || selectedCardIds.size === 0} onClick={onClear} className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm text-stone-600 hover:bg-white disabled:opacity-40">清空选择</button>
            <button type="button" disabled={submitting} onClick={() => onSubmit([...selectedCardIds])} className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-500 disabled:opacity-40">
              {submitting ? "正在提交…" : selectedCardIds.size === 0 ? "不调度" : `调度 ${selectedCardIds.size} 张`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
