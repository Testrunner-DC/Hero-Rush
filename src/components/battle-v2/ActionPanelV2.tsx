import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { BattleViewV2, Card, VisibleCardV2 } from "@hero-rush/game-core";
import type { GameCommandV2Message } from "@hero-rush/protocol";
import CardImage from "../CardImage";

interface ActionPanelV2Props {
  view: BattleViewV2;
  cardByDefinitionId: ReadonlyMap<string, Card>;
  selectedCardIds: ReadonlySet<string>;
  onToggleCard: (cardId: string) => void;
  onClear: () => void;
  onSubmit: (command: GameCommandV2Message) => void;
}

type EffectChoiceZoneV2 = "手牌" | "基地区" | "战区" | "时间线" | "撤退区" | "虚空区" | "结附区";

interface EffectChoiceCardV2 {
  card: VisibleCardV2;
  zone: EffectChoiceZoneV2;
  covered: boolean;
}

function locateEffectChoiceCards(view: BattleViewV2, choices: readonly string[]): EffectChoiceCardV2[] {
  const wanted = new Set(choices);
  const located = new Map<string, EffectChoiceCardV2>();
  const add = (cards: readonly VisibleCardV2[], zone: EffectChoiceZoneV2, covered = false) => {
    for (const card of cards) if (wanted.has(card.instanceId) && !located.has(card.instanceId)) located.set(card.instanceId, { card, zone, covered });
  };
  for (const player of view.players) {
    add(player.hand, "手牌");
    add(player.baseCards, "基地区");
    add(player.baseCovered, "基地区", true);
    add(Object.values(player.field).flat(), "战区");
    add(player.timeline, "时间线");
    add(player.retreat, "撤退区");
    add(player.void, "虚空区");
    add(player.attached, "结附区");
  }
  return choices.flatMap((id) => located.get(id) ?? []);
}

function effectPresentation(view: BattleViewV2, cardByDefinitionId: ReadonlyMap<string, Card>, sourceCardId: string) {
  const source = view.players.flatMap((player) => [
    ...player.hand,
    ...player.baseCards,
    ...player.baseCovered,
    ...Object.values(player.field).flat(),
    ...player.timeline,
    ...player.retreat,
    ...player.void,
    ...player.attached,
  ]).find((card) => card.instanceId === sourceCardId);
  const definition = source ? cardByDefinitionId.get(source.definitionId) : undefined;
  return {
    name: definition?.name ?? "未知来源卡牌",
    text: definition?.effect || "该卡效果文本尚未收录",
  };
}

function DecisionModalV2({ label, tone = "border-white/15", boardInteractive = false, children }: {
  label: string;
  tone?: string;
  boardInteractive?: boolean;
  children: React.ReactNode;
}) {
  const [minimized, setMinimized] = useState(false);
  useEffect(() => setMinimized(false), [label]);
  if (minimized) return createPortal(
    <button type="button" onClick={() => setMinimized(false)} className="fixed bottom-5 right-5 z-[120] rounded-full border border-white/20 bg-stone-950 px-4 py-2 text-xs font-bold text-white shadow-2xl" data-ui-contract="hero-rush-v2-restore-decision">恢复：{label}</button>,
    document.body,
  );
  const placementClass = boardInteractive
    ? "pointer-events-none items-center justify-end p-5"
    : "items-end justify-center bg-stone-950/[.58] py-5 pr-5 backdrop-blur-sm";
  const widthClass = boardInteractive ? "max-w-sm" : "max-w-2xl";
  return createPortal(
    <div className={`fixed inset-0 z-[104] flex ${placementClass}`} style={boardInteractive ? undefined : { paddingLeft: "calc(var(--hero-rush-v2-detail-inset, 232px) + 16px)" }} role="dialog" aria-modal={!boardInteractive} aria-label={label} data-ui-contract="hero-rush-v2-decision-modal" data-board-interactive={boardInteractive || undefined}>
      <section className={`pointer-events-auto max-h-[min(680px,86vh)] w-full ${widthClass} overflow-y-auto rounded-2xl border bg-stone-950/[.97] p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,.46)] scrollbar-thin ${tone}`}><div className="mb-3 flex items-center justify-between gap-3 border-b border-white/10 pb-2"><span className="text-[10px] font-bold tracking-[.12em] text-white/55">{label}</span><button type="button" onClick={() => setMinimized(true)} className="rounded border border-white/15 px-2.5 py-1 text-[10px] text-white/70 hover:bg-white/10">最小化</button></div>{children}</section>
    </div>,
    document.body,
  );
}

function TriggerOrderPanel({
  decision,
  view,
  cardByDefinitionId,
  onSubmit,
}: {
  decision: Extract<NonNullable<BattleViewV2["pendingDecision"]>, { kind: "ORDER_TRIGGERS" }>;
  view: BattleViewV2;
  cardByDefinitionId: ReadonlyMap<string, Card>;
  onSubmit: ActionPanelV2Props["onSubmit"];
}) {
  const [order, setOrder] = useState<string[]>(decision.choices);
  useEffect(() => setOrder(decision.choices), [decision.id, decision.choices]);
  const move = (index: number, delta: -1 | 1) => {
    const destination = index + delta;
    if (destination < 0 || destination >= order.length) return;
    const next = [...order];
    [next[index], next[destination]] = [next[destination], next[index]];
    setOrder(next);
  };
  return (
    <DecisionModalV2 label="同时触发效果顺序" tone="border-violet-300/35">
      <strong className="text-sm text-violet-100">同时触发：决定处理顺序</strong>
      <p className="mt-1 text-xs text-white/55">从上到下处理。顺序会写入对局日志并可在重连后恢复。</p>
      <ol className="mt-3 space-y-2">
        {order.map((id, index) => {
          const queued = decision.continuation.currentEffects.find((effect) => effect.id === id);
          const presentation = effectPresentation(view, cardByDefinitionId, queued?.sourceCardId ?? "");
          return (
          <li key={id} className="flex items-start gap-2 rounded-lg border border-violet-200/15 px-3 py-2 text-xs">
            <span className="w-6 font-mono text-violet-200">{index + 1}</span>
            <span className="min-w-0 flex-1"><b className="block text-violet-100">{presentation.name}</b><span className="mt-1 block whitespace-pre-wrap text-[10px] leading-4 text-white/60">{presentation.text}</span></span>
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="rounded border border-white/15 px-2 py-1 disabled:opacity-25">上移</button>
            <button type="button" disabled={index === order.length - 1} onClick={() => move(index, 1)} className="rounded border border-white/15 px-2 py-1 disabled:opacity-25">下移</button>
          </li>
        ); })}
      </ol>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => onSubmit({ type: "ANSWER_DECISION", decisionId: decision.id, cardIds: order })} className="rounded-lg bg-violet-300 px-4 py-2 text-xs font-bold text-slate-950">确认顺序</button>
      </div>
    </DecisionModalV2>
  );
}

export default function ActionPanelV2({
  view,
  cardByDefinitionId,
  selectedCardIds,
  onToggleCard,
  onClear,
  onSubmit,
}: ActionPanelV2Props) {
  const player = view.players[view.viewer];
  const decision = view.pendingDecision;
  const selected = [...selectedCardIds];
  const selectedId = selected.length === 1 ? selected[0] : null;

  if (decision?.kind === "SUMMON_PAYMENT") {
    const covered = new Set(player.baseCovered.map((card) => card.instanceId));
    const visible = [
      ...player.baseCards,
      ...player.baseCovered,
      ...Object.values(player.field).flat(),
    ];
    const byId = new Map(visible.map((card) => [card.instanceId, card]));
    const selectedLevel = selected.reduce((sum, id) => {
      if (covered.has(id)) return sum + 1;
      const card = byId.get(id);
      return sum + (card?.effectiveLevel ?? 0);
    }, 0);
    return (
      <DecisionModalV2 label="高等级号召支付" tone="border-amber-300/35" boardInteractive>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong className="text-sm text-amber-100">高等级号召：选择撤退支付</strong>
            <p className="mt-1 text-xs text-white/55">{decision.prompt}</p>
          </div>
          <div className="font-mono text-lg text-amber-200">{selectedLevel} / {decision.requiredLevel}</div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => onSubmit({ type: "CANCEL_SUMMON_PAYMENT", decisionId: decision.id })} className="rounded-lg border border-white/15 px-4 py-2 text-xs">取消号召</button>
          <button type="button" onClick={onClear} className="rounded-lg border border-white/15 px-4 py-2 text-xs">清空</button>
          <button
            type="button"
            disabled={selectedLevel !== decision.requiredLevel}
            onClick={() => onSubmit({ type: "ANSWER_DECISION", decisionId: decision.id, cardIds: selected })}
            className="rounded-lg bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-35"
          >
            确认撤退
          </button>
        </div>
      </DecisionModalV2>
    );
  }

  if (decision?.kind === "SUMMON_DESTINATION") {
    return (
      <aside className="border-t border-amber-200 bg-amber-50 px-3 py-3 text-stone-900" data-ui-contract="hero-rush-v2-summon-destination-controls">
        <strong className="text-[10px] text-amber-800">高阶号召：选择位置</strong>
        <p className="mt-1 text-[9px] leading-4 text-stone-600">撤退支付已经完成。直接点击场上亮起的基地或空战区完成号召；素材腾出的战区也会亮起。</p>
      </aside>
    );
  }

  if (decision?.kind === "DISCARD_TO_LIMIT") {
    const ready = selected.length === decision.min;
    return (
      <DecisionModalV2 label="结束阶段弃牌" tone="border-rose-300/35" boardInteractive>
        <div className="flex items-center justify-between gap-3">
          <div>
            <strong className="text-sm text-rose-100">结束阶段：弃至 9 张</strong>
            <p className="mt-1 text-xs text-white/55">{decision.prompt}</p>
          </div>
          <span className="font-mono text-rose-200">{selected.length} / {decision.min}</span>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClear} className="rounded-lg border border-white/15 px-4 py-2 text-xs">清空</button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => onSubmit({ type: "ANSWER_DECISION", decisionId: decision.id, cardIds: selected })}
            className="rounded-lg bg-rose-300 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-35"
          >确认舍弃</button>
        </div>
      </DecisionModalV2>
    );
  }

  if (decision?.kind === "EFFECT_TARGETS") {
    const sourceCardId = decision.continuation.kind === "RESUME_EFFECT_TARGETS"
      ? decision.continuation.sourceCardId
      : decision.continuation.effect.sourceCardId;
    const presentation = effectPresentation(view, cardByDefinitionId, sourceCardId);
    if (decision.choiceKind === "field_location") {
      return (
        <div className="border-t border-cyan-200/45 bg-cyan-50/65 p-3" data-ui-contract="hero-rush-v2-direct-location-choice">
          <div className="flex items-start justify-between gap-2">
            <strong className="text-[10px] text-cyan-800">直接点击高亮的基地或战区</strong>
            <button type="button" onClick={() => onSubmit({ type: "CANCEL_EFFECT_TARGETS", decisionId: decision.id })} className="shrink-0 rounded-md border border-stone-300 bg-white px-2 py-1 text-[9px] text-stone-600">取消发动</button>
          </div>
          <p className="mt-1 text-[10px] font-bold text-cyan-900">{presentation.name}</p>
          <p className="mt-1 whitespace-pre-wrap text-[8px] leading-4 text-stone-600">{presentation.text}</p>
          <p className="mt-1 text-[8px] leading-4 text-stone-500">{decision.prompt}</p>
        </div>
      );
    }
    const effectChoiceCards = locateEffectChoiceCards(view, decision.choices);
    const choicesFullyVisible = effectChoiceCards.length === decision.choices.length;
    const pickerZones = new Set<EffectChoiceZoneV2>(["撤退区", "虚空区"]);
    const useZoneCardPicker = choicesFullyVisible && effectChoiceCards.every((item) => pickerZones.has(item.zone));
    const ready = selected.length >= decision.min && selected.length <= decision.max;
    if (useZoneCardPicker) {
      const zones = [...new Set(effectChoiceCards.map((item) => item.zone))];
      const zoneLabel = zones.length === 1 ? zones[0] : "指定区域";
      return (
        <DecisionModalV2 label={`选择${zoneLabel}卡牌`} tone="border-cyan-300/35">
          <div data-ui-contract="hero-rush-v2-zone-effect-picker" data-choice-zone={zones.join(",")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="text-xs text-cyan-100">从{zoneLabel}选择效果目标</strong>
                <p className="mt-1 text-xs font-bold text-cyan-100">{presentation.name}</p>
                <p className="mt-1 whitespace-pre-wrap text-[9px] leading-4 text-white/65">{presentation.text}</p>
                <p className="mt-1 text-[9px] leading-4 text-white/55">{decision.prompt}</p>
              </div>
              <span className="shrink-0 font-mono text-xs text-cyan-200">{selected.length} / {decision.min}-{decision.max}</span>
            </div>
            <div className="mt-4 grid max-h-[390px] grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-3 overflow-y-auto p-1 scrollbar-thin">
              {effectChoiceCards.map(({ card, zone, covered }) => {
                const definition = cardByDefinitionId.get(card.definitionId);
                const chosen = selectedCardIds.has(card.instanceId);
                return (
                  <button
                    key={card.instanceId}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => onToggleCard(card.instanceId)}
                    className={`group flex min-w-0 flex-col items-center gap-1.5 rounded-lg border p-2 text-left transition ${chosen ? "border-cyan-200 bg-cyan-300/20 ring-2 ring-cyan-300" : "border-white/10 bg-white/[.04] hover:border-cyan-300/55 hover:bg-white/[.08]"}`}
                    data-effect-choice-zone={zone}
                  >
                    <span className={`relative block aspect-[746/1041] w-[72px] overflow-hidden rounded-[5px] bg-stone-900 ${covered ? "brightness-[.7]" : ""}`}>
                      {definition ? <CardImage cardId={definition.id} legacyUrl={definition.image_url} intent="board" alt={definition.name} className="h-full w-full object-contain" /> : <span className="absolute inset-0 grid place-items-center px-1 text-center text-[7px] text-white/60">{card.definitionId}</span>}
                    </span>
                    <span className="w-full truncate text-center text-[9px] font-bold text-white/80" title={definition?.name}>{definition?.name ?? card.definitionId}</span>
                    <span className="text-[8px] text-cyan-200/65">{zone}{covered ? " · 盖卡" : ""}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => onSubmit({ type: "CANCEL_EFFECT_TARGETS", decisionId: decision.id })} className="rounded-lg border border-rose-300/45 px-3 py-1.5 text-[10px] text-rose-100">取消发动</button>
              <button type="button" onClick={onClear} className="rounded-lg border border-white/15 px-3 py-1.5 text-[10px]">清空</button>
              <button type="button" disabled={!ready} onClick={() => onSubmit({ type: "ANSWER_DECISION", decisionId: decision.id, cardIds: selected })} className="rounded-lg bg-cyan-300 px-3 py-1.5 text-[10px] font-bold text-slate-950 disabled:opacity-35">确认目标</button>
            </div>
          </div>
        </DecisionModalV2>
      );
    }
    const directZones = [...new Set(effectChoiceCards.map((item) => item.zone))];
    const directZoneLabel = directZones.length === 1 ? directZones[0] : "场面";
    return (
        <div className="border-t border-cyan-200/45 bg-cyan-50/65 p-3" data-ui-contract="hero-rush-v2-effect-target-controls" data-choice-zone={directZones.join(",")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <strong className="text-[10px] text-cyan-800">直接在{directZoneLabel}点选目标</strong>
            <p className="mt-1 text-[10px] font-bold text-cyan-900">{presentation.name}</p>
            <p className="mt-1 whitespace-pre-wrap text-[8px] leading-4 text-stone-600">{presentation.text}</p>
            <p className="mt-1 text-[8px] leading-4 text-stone-500">{decision.prompt}</p>
          </div>
          <span className="shrink-0 font-mono text-[10px] text-cyan-700">{selected.length} / {decision.min}-{decision.max}</span>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={() => onSubmit({ type: "CANCEL_EFFECT_TARGETS", decisionId: decision.id })} className="rounded-md border border-rose-300 bg-white px-2 py-1 text-[9px] text-rose-700">取消发动</button>
          <button type="button" onClick={onClear} className="rounded-md border border-stone-300 bg-white px-2 py-1 text-[9px] text-stone-600">清空</button>
          <button type="button" disabled={!ready} onClick={() => onSubmit({ type: "ANSWER_DECISION", decisionId: decision.id, cardIds: selected })} className="rounded-md bg-cyan-600 px-2 py-1 text-[9px] font-bold text-white disabled:opacity-35">确认目标</button>
        </div>
        </div>
    );
  }

  if (decision?.kind === "ORDER_TRIGGERS") {
    return <TriggerOrderPanel decision={decision} view={view} cardByDefinitionId={cardByDefinitionId} onSubmit={onSubmit} />;
  }

  if (decision?.kind === "OPTIONAL_EFFECT") {
    const presentation = effectPresentation(view, cardByDefinitionId, decision.continuation.effect.sourceCardId);
    return (
      <DecisionModalV2 label="可选触发效果" tone="border-emerald-300/35">
        <strong className="text-sm text-emerald-100">{presentation.name}</strong>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/70">{presentation.text}</p>
        <p className="mt-1 text-xs text-white/55">{decision.prompt}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => onSubmit({ type: "ANSWER_DECISION", decisionId: decision.id, cardIds: ["skip"] })} className="rounded-lg border border-white/15 px-4 py-2 text-xs">否，跳过</button>
          <button type="button" onClick={() => onSubmit({ type: "ANSWER_DECISION", decisionId: decision.id, cardIds: ["resolve"] })} className="rounded-lg bg-emerald-300 px-4 py-2 text-xs font-bold text-slate-950">是，发动效果</button>
        </div>
      </DecisionModalV2>
    );
  }

  const isAction = view.flow.kind === "ACTION" && view.activePlayer === view.viewer;
  const isResponse = (view.flow.kind === "BATTLE_RESPONSE" || view.flow.kind === "TURN_RESPONSE")
    && view.flow.priority === view.viewer;
  const isAttackOpportunity = view.flow.kind === "BATTLE_ATTACK" && view.activePlayer === view.viewer;
  if ((!isAction && !isResponse && !isAttackOpportunity) || decision) return null;

  const selectedVisibleCard = selectedId
    ? [
        ...player.hand,
        ...player.baseCards,
        ...player.baseCovered,
        ...Object.values(player.field).flat(),
        ...player.timeline,
        ...player.retreat,
        ...player.attached,
      ].find((card) => card.instanceId === selectedId)
    : undefined;
  const keywordAction = (selectedId ? view.legalActions.find((action) => action.type === "ACTIVATE_KEYWORD" && action.sourceCardId === selectedId) : undefined) as Extract<BattleViewV2["legalActions"][number], { type: "ACTIVATE_KEYWORD" }> | undefined;
  const attackOpportunityId = isAttackOpportunity && view.flow.kind === "BATTLE_ATTACK" ? view.flow.attackerId : null;
  const actionSurface = (
    <aside className="border-t border-stone-200" data-ui-contract={isResponse ? "hero-rush-v2-inline-response-controls" : "hero-rush-v2-action-controls"}>
      <div className="grid gap-2 p-3 text-stone-900">
        <span className="text-[10px] font-bold leading-4 text-red-800">
          {isResponse ? "应对时机" : isAttackOpportunity ? "攻击机会" : selectedId ? "已选 1 张卡" : "选择手牌或己方场上角色"}
        </span>
        {isResponse && !selectedId && <p className="text-[9px] leading-4 text-stone-500">点击高亮的合法手牌或战区角色进行应对；选择否则跳过本次应对。</p>}
        {isResponse && selectedVisibleCard && <p className="whitespace-pre-wrap rounded bg-stone-100 px-2 py-1.5 text-[9px] leading-4 text-stone-600">{cardByDefinitionId.get(selectedVisibleCard.definitionId)?.effect || "该卡效果文本尚未收录"}</p>}
        {selectedVisibleCard && keywordAction?.keyword === "intercept" && (
          <button
            type="button"
            onClick={() => onSubmit({ type: "ACTIVATE_KEYWORD", sourceCardId: selectedVisibleCard.instanceId, keyword: "intercept" })}
            className="w-full rounded-lg bg-sky-600 px-3 py-2 text-[10px] font-bold text-white"
          >发动【拦截】</button>
        )}
        {selectedId && <button type="button" onClick={onClear} className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[10px] text-stone-600">取消选择</button>}
        {isResponse && <button type="button" onClick={() => onSubmit({ type: "PASS_PRIORITY" })} className="w-full rounded-lg bg-amber-300 px-3 py-2 text-[10px] font-bold text-stone-950">否，跳过应对</button>}
        {attackOpportunityId && <button type="button" onClick={() => onSubmit({ type: "PASS_ATTACK_OPPORTUNITY", attackerId: attackOpportunityId })} className="w-full rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-bold text-white">放弃攻击机会</button>}
        {isAction && (
          <button
            type="button"
            onClick={() => {
              onClear();
              onSubmit({ type: "END_ACTION_PHASE" });
            }}
            className="w-full rounded-lg bg-red-600 px-4 py-2 text-[10px] font-bold text-white"
          >结束行动阶段</button>
        )}
        {isAction && <p className="text-[9px] leading-4 text-stone-500">可随时结束，不要求用满号召或基地部署次数。</p>}
      </div>
    </aside>
  );
  return actionSurface;
}
