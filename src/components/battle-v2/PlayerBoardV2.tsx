import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BattleBaseLocationV2, Card, CardDatabase, FieldZoneV2, OfficialKeywordV2, PlayerIndex, PlayerViewV2, VisibleCardV2 } from "@hero-rush/game-core";
import CardImage from "../CardImage";

const MAIN_CARD_BACK_URL = "/assets/battle/card-back-main.png";
const RUSH_CARD_BACK_URL = "/assets/battle/card-back-rush.png";
const BATTLE_CARD_WIDTH = 64;
const ATTACHMENT_OFFSET = 18;
const KEYWORD_LABELS: Record<OfficialKeywordV2, string> = {
  counter: "应对",
  intercept: "拦截",
  combo: "连击",
  assault: "强袭",
  airRaid: "空袭",
  unique: "唯一",
};

export type CardEmphasisV2 = "attacker" | "battle-target" | "effect-target" | "adjustable";

interface PlayerBoardV2Props {
  player: PlayerViewV2;
  db: CardDatabase;
  playerSeat: PlayerIndex;
  viewerOwnsBoard: boolean;
  perspective: "self" | "opponent";
  activeTurn: boolean;
  cardByDefinitionId: ReadonlyMap<string, Card>;
  attachments?: Readonly<Record<string, readonly string[]>>;
  selectedCardIds?: ReadonlySet<string>;
  selectableCardIds?: ReadonlySet<string>;
  cardEmphasis?: ReadonlyMap<string, CardEmphasisV2>;
  onCardClick?: (instanceId: string) => void;
  onCardFocus?: (card: VisibleCardV2) => void;
  targetableDestinations?: ReadonlySet<BattleBaseLocationV2>;
  targetableBreachZones?: ReadonlySet<FieldZoneV2>;
  onZoneClick?: (destination: BattleBaseLocationV2) => void;
  onBreachClick?: (zone: FieldZoneV2) => void;
  cardActions?: {
    cardId: string;
    canDeploy: boolean;
    canSummon: boolean;
    effectIds: readonly string[];
    effectLabel?: string;
    onDeploy: () => void;
    onSummon: () => void;
    onActivateEffect: (effectId: string) => void;
  };
  voidLeftControl?: ReactNode;
}

type CardActionsV2 = NonNullable<PlayerBoardV2Props["cardActions"]>;

interface SharedCardProps {
  cardByDefinitionId: ReadonlyMap<string, Card>;
  selectedCardIds: ReadonlySet<string>;
  selectableCardIds: ReadonlySet<string>;
  cardEmphasis: ReadonlyMap<string, CardEmphasisV2>;
  onCardClick?: (instanceId: string) => void;
  onCardFocus?: (card: VisibleCardV2) => void;
  exhaustedCardIds: ReadonlySet<string>;
  cardActions?: CardActionsV2;
}

function CardActionMenu({ cardId, actions, mirrored = false, counterRotate = 0 }: { cardId: string; actions?: CardActionsV2; mirrored?: boolean; counterRotate?: number }) {
  if (!actions || actions.cardId !== cardId) return null;
  if (!actions.canDeploy && !actions.canSummon && actions.effectIds.length === 0) return null;
  return (
    <div className={`absolute left-1/2 z-[80] flex gap-1 rounded-md border border-stone-300 bg-white/[.96] p-1 shadow-[0_5px_16px_rgba(40,25,18,.28)] ${mirrored ? "top-[calc(100%+5px)]" : "bottom-[calc(100%+5px)]"}`} style={{ transform: `translateX(-50%) rotate(${counterRotate}deg)` }} data-ui-contract="hero-rush-v2-card-actions">
      {actions.canDeploy && <button type="button" onClick={(event) => { event.stopPropagation(); actions.onDeploy(); }} className="whitespace-nowrap rounded bg-amber-300 px-2 py-1 text-[8px] font-black text-stone-950">基地部署</button>}
      {actions.canSummon && <button type="button" onClick={(event) => { event.stopPropagation(); actions.onSummon(); }} className="whitespace-nowrap rounded bg-cyan-600 px-2 py-1 text-[8px] font-black text-white">号召</button>}
      {actions.effectIds.map((effectId, index) => <button key={effectId} type="button" onClick={(event) => { event.stopPropagation(); actions.onActivateEffect(effectId); }} className="whitespace-nowrap rounded bg-emerald-600 px-2 py-1 text-[8px] font-black text-white">{actions.effectIds.length === 1 ? actions.effectLabel ?? "起动效果" : `${actions.effectLabel ?? "效果"}${index + 1}`}</button>)}
    </div>
  );
}

function CardTile({ card, definition, selected, selectable, emphasis, onClick, onFocus, fieldCard = false, dimmed = false, exhausted = false }: {
  card: VisibleCardV2;
  definition?: Card;
  selected?: boolean;
  selectable?: boolean;
  emphasis?: CardEmphasisV2;
  onClick?: () => void;
  onFocus?: () => void;
  fieldCard?: boolean;
  dimmed?: boolean;
  exhausted?: boolean;
}) {
  const emphasisClass = emphasis === "attacker"
    ? "ring-2 ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,.8)]"
    : emphasis === "battle-target"
      ? "ring-2 ring-rose-400 shadow-[0_0_18px_rgba(244,63,94,.75)]"
      : emphasis === "effect-target"
        ? "ring-2 ring-cyan-300 shadow-[0_0_18px_rgba(34,211,238,.75)]"
        : emphasis === "adjustable"
          ? "ring-[3px] ring-violet-400 brightness-110 shadow-[0_0_22px_rgba(167,139,250,.95)]"
        : "";
  const statTone = (effective: number, original: number) => effective > original
    ? "border-emerald-300/70 bg-emerald-800 text-white"
    : effective < original
      ? "border-red-300/70 bg-red-800 text-white"
      : "border-white/45 bg-black/90 text-white";
  const showCharacterStats = definition?.card_type !== 2;
  return (
    <button
      type="button"
      aria-disabled={!selectable}
      data-card-id={card.instanceId}
      data-emphasis={emphasis}
      onClick={selectable ? onClick : undefined}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      className={`relative ${fieldCard ? "w-[68px]" : "w-[64px]"} shrink-0 overflow-visible border-0 bg-transparent p-0 shadow-[0_5px_13px_rgba(40,25,18,.22)] transition duration-150 ${exhausted ? "rotate-[10deg] brightness-[.7]" : dimmed ? "brightness-[.7]" : ""} ${emphasisClass} ${selected ? "z-30 -translate-y-3 ring-2 ring-red-400" : selectable ? "cursor-pointer hover:z-20 hover:-translate-y-2 hover:shadow-[0_8px_18px_rgba(185,28,28,.3)]" : "cursor-default"}`}
      data-card-instance={card.instanceId}
      title={`${definition?.name ?? card.definitionId} · 战力 ${card.effectivePower} · 射程 ${card.effectiveRange}`}
    >
      <span className="relative block aspect-[746/1041] w-full rounded-[5px] bg-stone-900 shadow-[0_0_0_1px_rgba(87,74,64,.35)]">
        {definition ? <CardImage cardId={definition.id} legacyUrl={definition.image_url} intent="board" alt={definition.name} className="h-full w-full rounded-[5px] object-contain" /> : <span className="absolute inset-0 grid place-items-center rounded-[5px] px-1 text-[7px] text-white/65">{card.definitionId}</span>}
        {showCharacterStats && <><span className={`absolute left-1 top-1 grid min-h-[18px] min-w-[20px] place-items-center rounded-[2px] border px-1 font-mono text-[12px] font-black leading-none shadow ${statTone(card.effectiveLevel, card.level)}`}>{card.effectiveLevel}</span><span className={`absolute bottom-1 left-0.5 rounded-[2px] border px-1 py-0.5 font-mono text-[10px] font-black leading-none shadow ${statTone(card.effectivePower, card.power)}`}>{card.effectivePower}</span><span className={`absolute bottom-1 right-0.5 rounded-[2px] border px-1 py-0.5 font-mono text-[10px] font-black leading-none shadow ${statTone(card.effectiveRange, card.range)}`}>R{card.effectiveRange}</span></>}
        {showCharacterStats && card.gainedKeywords.length > 0 && <span className="absolute left-1 top-[24px] z-20 flex flex-col items-start gap-0.5" data-ui-contract="hero-rush-v2-gained-keywords">{card.gainedKeywords.map((keyword) => <span key={keyword} className="rounded-[2px] border border-white/65 bg-violet-800/95 px-1 py-0.5 text-[7px] font-black leading-none text-white shadow">{KEYWORD_LABELS[keyword]}</span>)}</span>}
      </span>
      {emphasis && <span className={`absolute right-0 top-0 rounded-bl px-1 py-0.5 text-[7px] font-black text-stone-950 ${emphasis === "attacker" ? "bg-amber-300" : emphasis === "battle-target" ? "bg-rose-300" : emphasis === "adjustable" ? "bg-violet-300" : "bg-cyan-300"}`}>{emphasis === "attacker" ? "攻击" : emphasis === "battle-target" ? "目标" : emphasis === "adjustable" ? "调整" : "效果"}</span>}
    </button>
  );
}

function CardWithAttachments({ card, attachmentIds, attachedById, fieldCard = false, mirrored = false, ...common }: SharedCardProps & {
  card: VisibleCardV2;
  attachmentIds: readonly string[];
  attachedById: ReadonlyMap<string, VisibleCardV2>;
  fieldCard?: boolean;
  mirrored?: boolean;
}) {
  const attachedCards = attachmentIds.map((id) => attachedById.get(id)).filter((item): item is VisibleCardV2 => Boolean(item));
  return (
    <div className="relative shrink-0 overflow-visible" data-attachment-host={card.instanceId} data-ui-contract="hero-rush-v2-horizontal-attachments" style={{ width: (fieldCard ? 68 : BATTLE_CARD_WIDTH) + attachedCards.length * ATTACHMENT_OFFSET, height: fieldCard ? 96 : 92 }}>
      {attachedCards.map((attached, index) => <div key={attached.instanceId} className="absolute left-0 top-0" style={{ transform: `translateX(${(index + 1) * ATTACHMENT_OFFSET}px)`, zIndex: index + 1 }} data-attached-to={card.instanceId}><CardTile card={attached} definition={common.cardByDefinitionId.get(attached.definitionId)} selected={common.selectedCardIds.has(attached.instanceId)} selectable={common.selectableCardIds.has(attached.instanceId)} emphasis={common.cardEmphasis.get(attached.instanceId)} onClick={() => common.onCardClick?.(attached.instanceId)} onFocus={() => common.onCardFocus?.(attached)} fieldCard={fieldCard} exhausted={common.exhaustedCardIds.has(attached.instanceId)} /><CardActionMenu cardId={attached.instanceId} actions={common.cardActions} mirrored={mirrored} /></div>)}
      <div className="absolute left-0 top-0 z-40"><CardTile card={card} definition={common.cardByDefinitionId.get(card.definitionId)} selected={common.selectedCardIds.has(card.instanceId)} selectable={common.selectableCardIds.has(card.instanceId)} emphasis={common.cardEmphasis.get(card.instanceId)} onClick={() => common.onCardClick?.(card.instanceId)} onFocus={() => common.onCardFocus?.(card)} fieldCard={fieldCard} exhausted={common.exhaustedCardIds.has(card.instanceId)} /><CardActionMenu cardId={card.instanceId} actions={common.cardActions} mirrored={mirrored} /></div>
    </div>
  );
}

function Zone({ zone, label, cards, attachments, attachedById, mirrored = false, className = "", destinationTargetable = false, breachTargetable = false, onZoneClick, onBreachClick, ...common }: SharedCardProps & {
  zone: FieldZoneV2;
  label: string;
  cards: VisibleCardV2[];
  attachments: Readonly<Record<string, readonly string[]>>;
  attachedById: ReadonlyMap<string, VisibleCardV2>;
  mirrored?: boolean;
  className?: string;
  destinationTargetable?: boolean;
  breachTargetable?: boolean;
  onZoneClick?: (destination: BattleBaseLocationV2) => void;
  onBreachClick?: (zone: FieldZoneV2) => void;
}) {
  const emptyTargetable = cards.length === 0 && (destinationTargetable || breachTargetable);
  const targetable = emptyTargetable || breachTargetable;
  return (
    <section data-zone={zone} className={`relative grid min-h-0 place-items-center overflow-visible rounded-md border border-dashed bg-white/[.42] p-1 transition ${targetable ? "border-red-500 bg-red-50/75 ring-2 ring-red-300/70" : "border-stone-400/65"} ${className}`}>
      <span className={`absolute left-1.5 z-30 rounded bg-white/[.82] px-1 text-[8px] font-bold tracking-[.12em] text-stone-500 ${mirrored ? "bottom-1" : "top-1"}`}>{label}</span>
       {cards.length ? <><div className="flex max-h-full max-w-full flex-wrap items-center justify-center gap-1">{cards.map((card) => <CardWithAttachments key={card.instanceId} card={card} attachmentIds={attachments[card.instanceId] ?? []} attachedById={attachedById} fieldCard mirrored={mirrored} {...common} />)}</div>{breachTargetable && <button type="button" onClick={() => onBreachClick?.(zone)} className={`absolute right-1 z-40 rounded bg-sky-600 px-1.5 py-0.5 text-[7px] font-black text-white shadow ${mirrored ? "bottom-1" : "top-1"}`} aria-label={`${label}空袭破绽目标`}>空袭破绽</button>}</> : emptyTargetable ? <button type="button" onClick={() => breachTargetable ? onBreachClick?.(zone) : onZoneClick?.(zone)} className="absolute inset-0 z-20 text-[9px] font-bold text-red-700" aria-label={`${label}${breachTargetable ? "破绽目标" : "合法落点"}`}>{breachTargetable ? "攻击破绽" : "放置到这里"}</button> : <span className="text-[9px] text-stone-300">空</span>}
    </section>
  );
}

function TimelineZone({ cards, ...common }: SharedCardProps & { cards: VisibleCardV2[] }) {
  return (
    <section className="relative h-full min-h-0 overflow-visible rounded-md border border-stone-300 bg-white/[.58] p-1.5" data-ui-contract="hero-rush-v2-timeline-stack">
      <div className="flex items-center justify-between text-[8px] font-bold tracking-[.1em] text-stone-500"><span>时间线</span><b className="font-mono text-[10px] text-stone-700">{cards.length}</b></div>
      {cards.map((card, index) => <div key={card.instanceId} className="absolute left-1/2 origin-center overflow-visible" style={{ top: 30 + index * 18, transform: "translateX(-50%) rotate(90deg)", zIndex: index + 1 }} data-timeline-index={index}><CardTile card={card} definition={common.cardByDefinitionId.get(card.definitionId)} selected={common.selectedCardIds.has(card.instanceId)} selectable={common.selectableCardIds.has(card.instanceId)} emphasis={common.cardEmphasis.get(card.instanceId)} onClick={() => common.onCardClick?.(card.instanceId)} onFocus={() => common.onCardFocus?.(card)} /></div>)}
    </section>
  );
}

function InspectableZone({ label, cards, mirrored, cardByDefinitionId, onOpen, leftControl }: { label: string; cards: VisibleCardV2[]; mirrored: boolean; cardByDefinitionId: ReadonlyMap<string, Card>; onOpen: () => void; leftControl?: ReactNode }) {
  const lastCard = cards[cards.length - 1];
  const definition = lastCard ? cardByDefinitionId.get(lastCard.definitionId) : undefined;
  return (
    <div className="relative h-full min-h-0 w-full">
    <button type="button" onClick={onOpen} className={`relative flex h-full min-h-0 w-full rounded-md border bg-white/[.58] p-1.5 text-left transition ${mirrored ? "flex-col-reverse border-blue-200 hover:border-blue-400 hover:bg-blue-50/65" : "flex-col border-red-200 hover:border-red-400 hover:bg-red-50/65"}`} aria-label={`查看${label}`}>
      <div className="relative z-10 flex w-full items-center justify-between text-[8px] font-bold tracking-[.1em] text-stone-500"><span className="rounded bg-white/[.82] px-0.5">{label}</span><b className="rounded bg-white/[.82] px-0.5 font-mono text-[10px] text-stone-700">{cards.length}</b></div>
      <span className="pointer-events-none grid min-h-0 flex-1 place-items-center self-stretch">{lastCard && definition ? <CardImage cardId={definition.id} legacyUrl={definition.image_url} intent="board" alt={`${label}最后进入的卡：${definition.name}`} className="aspect-[746/1041] w-[64px] rounded-[5px] bg-stone-900 object-contain shadow-[0_5px_13px_rgba(40,25,18,.22)]" /> : <span className="text-[8px] text-stone-400">空</span>}</span>
    </button>
    {leftControl && <div className="absolute right-[calc(100%+8px)] top-0 z-[75]" data-ui-contract="hero-rush-v2-void-left-control">{leftControl}</div>}
    </div>
  );
}

function ZoneContentsModal({ label, cards, common, onClose }: { label: string; cards: VisibleCardV2[]; common: SharedCardProps; onClose: () => void }) {
  const [selectedCardId, setSelectedCardId] = useState(cards[cards.length - 1]?.instanceId ?? "");
  const selectedCard = cards.find((card) => card.instanceId === selectedCardId) ?? cards[cards.length - 1];
  return createPortal(
    <div className="fixed inset-0 z-[107] grid place-items-center bg-stone-950/[.58] py-5 pr-5 backdrop-blur-sm" style={{ paddingLeft: "calc(var(--hero-rush-v2-detail-inset, 232px) + 16px)" }} role="dialog" aria-modal="true" aria-label={`${label}卡牌明细`} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="max-h-[82vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/15 bg-stone-950 p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,.48)] scrollbar-thin">
        <div className="flex items-center justify-between gap-4"><div><p className="text-[9px] font-bold tracking-[.15em] text-red-300">公开区域</p><h2 className="mt-1 text-lg font-black">{label} · {cards.length} 张</h2></div><button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">关闭</button></div>
        {cards.length ? <div className="mt-5 grid content-start grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-4">{cards.map((card) => { const definition = common.cardByDefinitionId.get(card.definitionId); return <article key={card.instanceId} className="flex min-w-0 flex-col items-center gap-2"><CardTile card={card} definition={definition} selected={card.instanceId === selectedCard?.instanceId} selectable onClick={() => { setSelectedCardId(card.instanceId); common.onCardFocus?.(card); }} onFocus={() => common.onCardFocus?.(card)} /><span className="w-full truncate text-center text-[9px] text-white/65" title={definition?.name}>{definition?.name ?? card.definitionId}</span></article>; })}</div> : <p className="mt-8 text-center text-sm text-white/40">当前区域为空</p>}
      </section>
    </div>,
    document.body,
  );
}

function DeckPile({ label, count, backUrl, mirrored = false }: { label: string; count: number; backUrl: string; mirrored?: boolean }) {
  return <section className="relative grid h-full min-h-0 place-items-center overflow-visible rounded-md border border-stone-300 bg-white/[.58] p-1.5"><div className={`absolute inset-x-1.5 z-10 flex items-center justify-between text-[8px] font-bold tracking-[.1em] text-stone-500 ${mirrored ? "bottom-1" : "top-1"}`}><span className="rounded bg-white/[.82] px-0.5">{label}</span><b className="rounded bg-white/[.82] px-0.5 font-mono text-[10px] text-stone-700">{count}</b></div>{count > 0 ? <img src={backUrl} alt={`${label}卡背`} className="aspect-[746/1041] w-[64px] rounded-[5px] bg-stone-900 object-contain shadow-[3px_3px_0_rgba(87,74,64,.28)]" /> : <span className="text-[9px] text-stone-300">空</span>}</section>;
}

function KnownBaseResource({ card, ...common }: SharedCardProps & { card: VisibleCardV2 }) {
  const definition = common.cardByDefinitionId.get(card.definitionId);
  const selected = common.selectedCardIds.has(card.instanceId);
  const selectable = common.selectableCardIds.has(card.instanceId);
  return (
    <button
      type="button"
      aria-disabled={!selectable}
      aria-label={`${definition?.name ?? "已知卡牌"}，背面基地卡，号召费用 1`}
      data-card-id={card.instanceId}
      data-ui-contract="hero-rush-v2-known-base-resource"
      onClick={selectable ? () => common.onCardClick?.(card.instanceId) : undefined}
      onMouseEnter={() => common.onCardFocus?.(card)}
      onFocus={() => common.onCardFocus?.(card)}
      className={`relative aspect-[746/1041] w-[64px] shrink-0 overflow-visible rounded-[5px] border-0 bg-stone-900 p-0 brightness-[.7] transition ${selected ? "z-30 -translate-y-2 ring-2 ring-amber-400" : selectable ? "cursor-pointer hover:z-20 hover:-translate-y-1 hover:brightness-90" : "cursor-default"}`}
    >
      {definition ? <CardImage cardId={definition.id} legacyUrl={definition.image_url} intent="board" alt={definition.name} className="h-full w-full rounded-[5px] object-contain" /> : <span className="absolute inset-0 grid place-items-center rounded-[5px] px-1 text-[7px] text-white/65">{card.definitionId}</span>}
      <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded-sm bg-black/75 py-0.5 text-center text-[8px] font-black text-white">基地 · 1</span>
    </button>
  );
}

function BaseZone({ player, viewerOwnsBoard, mirrored, attachments, attachedById, targetable, onZoneClick, ...common }: SharedCardProps & {
  player: PlayerViewV2;
  viewerOwnsBoard: boolean;
  mirrored: boolean;
  attachments: Readonly<Record<string, readonly string[]>>;
  attachedById: ReadonlyMap<string, VisibleCardV2>;
  targetable: boolean;
  onZoneClick?: (destination: BattleBaseLocationV2) => void;
}) {
  return (
    <section data-zone="base" data-mirror-edge={mirrored ? "top" : "bottom"} className={`relative grid place-items-center overflow-visible rounded-md border p-1 transition ${mirrored ? targetable ? "border-blue-500 bg-blue-50/75 ring-2 ring-blue-300/70" : "border-blue-300/60 bg-blue-50/[.48]" : targetable ? "border-red-500 bg-red-50/75 ring-2 ring-red-300/70" : "border-red-300/60 bg-red-50/[.48]"}`}>
      <div className={`absolute inset-x-1 z-30 flex items-center justify-between text-[8px] font-bold tracking-[.1em] text-red-700/65 ${mirrored ? "bottom-1" : "top-1"}`}><span className="rounded bg-red-50/[.88] px-0.5">基地区</span><b className="rounded bg-red-50/[.88] px-0.5 font-mono">{player.baseCards.length + player.baseCoveredCount}/6</b></div>
      {targetable && <button type="button" onClick={() => onZoneClick?.("base")} className="absolute inset-0 z-40 cursor-pointer rounded-md bg-red-500/[.06] ring-2 ring-inset ring-red-400/55 transition hover:bg-red-100/35" aria-label="点击基地区作为合法落点"><span className="sr-only">选择基地区</span></button>}
      <div className="flex max-h-full max-w-full items-center justify-center gap-1 overflow-visible">
        {player.baseCards.map((card) => <CardWithAttachments key={card.instanceId} card={card} attachmentIds={attachments[card.instanceId] ?? []} attachedById={attachedById} mirrored={mirrored} {...common} />)}
        {viewerOwnsBoard ? player.baseCovered.map((card) => <KnownBaseResource key={card.instanceId} card={card} {...common} />) : Array.from({ length: player.baseCoveredCount }, (_, index) => <img key={index} src={MAIN_CARD_BACK_URL} alt="背面向上的基地卡" data-ui-contract="hero-rush-v2-hidden-base-resource" className="pointer-events-none aspect-[746/1041] w-[64px] shrink-0 select-none rounded-[5px] bg-stone-900 object-contain shadow-[0_5px_13px_rgba(40,25,18,.22)]" draggable={false} />)}
      </div>
    </section>
  );
}

function fanTransform(index: number, count: number, mirrored: boolean): { transform: string; zIndex: number; angle: number } {
  const middle = (count - 1) / 2;
  const offset = index - middle;
  const normalized = middle === 0 ? 0 : offset / middle;
  const spread = count <= 6 ? 60 : count <= 10 ? 52 : Math.max(34, 540 / Math.max(1, count - 1));
  const angle = normalized * Math.min(10, 3 + count * 0.65) * (mirrored ? -1 : 1);
  const depth = Math.pow(Math.abs(normalized), 1.55) * Math.min(9, 3 + count * 0.45);
  return { transform: `translateX(calc(-50% + ${offset * spread}px)) translateY(${mirrored ? -depth : depth}px) rotate(${angle}deg)`, zIndex: Math.round(40 - Math.abs(offset) * 2 + index * 0.01), angle };
}

function HandArea({ player, hidden, edge, ...common }: SharedCardProps & { player: PlayerViewV2; hidden: boolean; edge: "top" | "bottom" }) {
  const cardCount = hidden ? Math.min(player.handCount, 14) : player.hand.length;
  const mirrored = edge === "top";
  return (
    <section className="relative z-50 h-[80px] shrink-0 overflow-visible" data-ui-contract="hero-rush-v2-hand-fan" data-hand-edge={edge}>
      <div className={`pointer-events-none absolute left-2 z-50 text-[8px] font-bold tracking-[.12em] text-stone-500 ${mirrored ? "bottom-1" : "top-1"}`}>手牌 <b className="ml-1 font-mono text-stone-700">{player.handCount}</b></div>
      <div className={`absolute inset-x-0 h-[92px] overflow-visible ${mirrored ? "top-1" : "bottom-1"}`}>
        {hidden ? Array.from({ length: cardCount }, (_, index) => { const placement = fanTransform(index, cardCount, mirrored); return <div key={index} className={`absolute left-1/2 overflow-visible transition ${mirrored ? "top-0 origin-top" : "bottom-0 origin-bottom"}`} style={{ transform: placement.transform, zIndex: placement.zIndex }}><img src={MAIN_CARD_BACK_URL} alt="隐藏手牌" className="aspect-[746/1041] w-[64px] shrink-0 rounded-[5px] bg-stone-900 object-contain shadow-[0_5px_13px_rgba(40,25,18,.22)]" /></div>; }) : player.hand.map((card, index) => { const placement = fanTransform(index, cardCount, mirrored); const selectable = common.selectableCardIds.has(card.instanceId); return <div key={card.instanceId} className={`absolute left-1/2 overflow-visible transition ${mirrored ? "top-0 origin-top" : "bottom-0 origin-bottom"}`} style={{ transform: placement.transform, zIndex: placement.zIndex }}><CardTile card={card} definition={common.cardByDefinitionId.get(card.definitionId)} selected={common.selectedCardIds.has(card.instanceId)} selectable={selectable} dimmed={!selectable} emphasis={common.cardEmphasis.get(card.instanceId)} onClick={() => common.onCardClick?.(card.instanceId)} onFocus={() => common.onCardFocus?.(card)} /><CardActionMenu cardId={card.instanceId} actions={common.cardActions} mirrored={mirrored} counterRotate={-placement.angle} /></div>; })}
      </div>
    </section>
  );
}

export default function PlayerBoardV2({ player, playerSeat, viewerOwnsBoard, perspective, activeTurn, cardByDefinitionId, attachments = {}, selectedCardIds = new Set(), selectableCardIds = new Set(), cardEmphasis = new Map(), onCardClick, onCardFocus, targetableDestinations = new Set(), targetableBreachZones = new Set(), onZoneClick, onBreachClick, cardActions, voidLeftControl }: PlayerBoardV2Props) {
  const common = { cardByDefinitionId, selectedCardIds, selectableCardIds, cardEmphasis, onCardClick, onCardFocus, exhaustedCardIds: new Set(player.exhaustedCardIds), cardActions };
  const [inspectedZone, setInspectedZone] = useState<"retreat" | "void" | null>(null);
  const attachedById = new Map(player.attached.map((card) => [card.instanceId, card]));
  const mirrored = perspective === "opponent";
  const hand = <HandArea player={player} hidden={!viewerOwnsBoard} edge={mirrored ? "top" : "bottom"} {...common} />;
  const fieldZones = (
    <div className="grid min-h-0 grid-cols-[repeat(3,minmax(0,137px))] grid-rows-4 justify-center gap-1.5" data-ui-contract="hero-rush-v2-mirrored-field">
      <Zone zone="flankLeft" label="侧翼区" cards={player.field.flankLeft} attachments={attachments} attachedById={attachedById} mirrored={mirrored} className="col-start-1 row-start-2 row-span-2" destinationTargetable={targetableDestinations.has("flankLeft")} breachTargetable={targetableBreachZones.has("flankLeft")} onZoneClick={onZoneClick} onBreachClick={onBreachClick} {...common} />
      <Zone zone={mirrored ? "rear" : "vanguard"} label={mirrored ? "后卫区" : "先锋区"} cards={mirrored ? player.field.rear : player.field.vanguard} attachments={attachments} attachedById={attachedById} mirrored={mirrored} className="col-start-2 row-start-1 row-span-2" destinationTargetable={targetableDestinations.has(mirrored ? "rear" : "vanguard")} breachTargetable={targetableBreachZones.has(mirrored ? "rear" : "vanguard")} onZoneClick={onZoneClick} onBreachClick={onBreachClick} {...common} />
      <Zone zone="flankRight" label="侧翼区" cards={player.field.flankRight} attachments={attachments} attachedById={attachedById} mirrored={mirrored} className="col-start-3 row-start-2 row-span-2" destinationTargetable={targetableDestinations.has("flankRight")} breachTargetable={targetableBreachZones.has("flankRight")} onZoneClick={onZoneClick} onBreachClick={onBreachClick} {...common} />
      <Zone zone={mirrored ? "vanguard" : "rear"} label={mirrored ? "先锋区" : "后卫区"} cards={mirrored ? player.field.vanguard : player.field.rear} attachments={attachments} attachedById={attachedById} mirrored={mirrored} className="col-start-2 row-start-3 row-span-2" destinationTargetable={targetableDestinations.has(mirrored ? "vanguard" : "rear")} breachTargetable={targetableBreachZones.has(mirrored ? "vanguard" : "rear")} onZoneClick={onZoneClick} onBreachClick={onBreachClick} {...common} />
    </div>
  );
  const baseZone = <BaseZone player={player} viewerOwnsBoard={viewerOwnsBoard} mirrored={mirrored} attachments={attachments} attachedById={attachedById} targetable={targetableDestinations.has("base")} onZoneClick={onZoneClick} {...common} />;
  const inspectedCards = inspectedZone === "retreat" ? player.retreat : inspectedZone === "void" ? player.void : [];
  const inspectedLabel = inspectedZone === "retreat" ? "撤退区" : "虚空区";
  return (
    <>
    <article aria-label={`${player.name}${perspective === "self" ? "我方战场" : "对手战场"}`} data-perspective={perspective} data-seat={playerSeat} data-active-turn={activeTurn || undefined} data-board-layout={mirrored ? "mirrored-top" : "bottom"} className={`relative h-full min-h-0 overflow-visible rounded-lg border shadow-[0_7px_18px_rgba(50,35,28,.16)] transition-[filter] duration-200 ${activeTurn ? "brightness-100" : "brightness-[.85]"} ${perspective === "self" ? "border-red-400/70 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.86),rgba(254,226,226,.72)_85%)]" : "border-blue-400/70 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.86),rgba(219,234,254,.72)_85%)]"}`}>
      <div className="grid h-full min-h-0 grid-cols-[118px_minmax(0,1fr)_118px] gap-1.5 p-1.5">
        <div className="grid min-h-0 grid-rows-3 gap-1.5" data-layout-column="timeline-rush">
          {mirrored ? <><DeckPile label="冲击卡组" count={player.rushDeckCount} backUrl={RUSH_CARD_BACK_URL} mirrored /><div className="row-span-2 min-h-0"><TimelineZone cards={player.timeline} {...common} /></div></> : <><div className="row-span-2 min-h-0"><TimelineZone cards={player.timeline} {...common} /></div><DeckPile label="冲击卡组" count={player.rushDeckCount} backUrl={RUSH_CARD_BACK_URL} /></>}
        </div>
        <div className={`grid min-h-0 gap-1.5 ${mirrored ? "grid-rows-[80px_98px_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)_98px_80px]"}`} data-layout-column="hand-field-base">
          {mirrored ? <>{hand}{baseZone}{fieldZones}</> : <>{fieldZones}{baseZone}{hand}</>}
        </div>
        <div className="grid min-h-0 grid-rows-3 gap-1.5" data-layout-column="void-retreat-deck">
          {mirrored ? <><DeckPile label="主卡组" count={player.deckCount} backUrl={MAIN_CARD_BACK_URL} mirrored /><InspectableZone label="撤退区" cards={player.retreat} mirrored cardByDefinitionId={cardByDefinitionId} onOpen={() => setInspectedZone("retreat")} /><InspectableZone label="虚空区" cards={player.void} mirrored cardByDefinitionId={cardByDefinitionId} onOpen={() => setInspectedZone("void")} leftControl={voidLeftControl} /></> : <><InspectableZone label="虚空区" cards={player.void} mirrored={false} cardByDefinitionId={cardByDefinitionId} onOpen={() => setInspectedZone("void")} leftControl={voidLeftControl} /><InspectableZone label="撤退区" cards={player.retreat} mirrored={false} cardByDefinitionId={cardByDefinitionId} onOpen={() => setInspectedZone("retreat")} /><DeckPile label="主卡组" count={player.deckCount} backUrl={MAIN_CARD_BACK_URL} /></>}
        </div>
      </div>
    </article>
    {inspectedZone && <ZoneContentsModal label={inspectedLabel} cards={inspectedCards} common={common} onClose={() => setInspectedZone(null)} />}
    </>
  );
}
