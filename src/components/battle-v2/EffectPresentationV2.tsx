import { useEffect, useRef, useState } from "react";
import { type CardDatabase, type GameEventV2 } from "@hero-rush/game-core";
import CardImage from "../CardImage";

type EffectPresentedEventV2 = Extract<GameEventV2, { type: "EFFECT_PRESENTED" }>;

const activationLabels: Record<EffectPresentedEventV2["activation"], string> = {
  action: "起动效果",
  response: "应对起动",
  trigger: "触发效果",
};

function isEffectPresentedEvent(event: unknown): event is EffectPresentedEventV2 {
  return Boolean(event && typeof event === "object" && (event as { type?: unknown }).type === "EFFECT_PRESENTED");
}

export default function EffectPresentationV2({ events, db }: { events: readonly unknown[]; db: CardDatabase }) {
  const cursorRef = useRef(events.length);
  const [queue, setQueue] = useState<EffectPresentedEventV2[]>([]);
  const [active, setActive] = useState<EffectPresentedEventV2 | null>(null);

  useEffect(() => {
    if (events.length < cursorRef.current) {
      cursorRef.current = events.length;
      setQueue([]);
      setActive(null);
      return;
    }
    const incoming = events.slice(cursorRef.current).filter(isEffectPresentedEvent);
    cursorRef.current = events.length;
    if (incoming.length > 0) setQueue((current) => [...current, ...incoming]);
  }, [events]);

  useEffect(() => {
    if (active || queue.length === 0) return;
    setActive(queue[0]);
    setQueue((current) => current.slice(1));
  }, [active, queue]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setActive(null), 3000);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) return null;
  const card = db.cards.find((item) => item.id === active.definitionId);
  const effectText = card?.effect?.trim() || "卡牌效果正在处理。";

  return (
    <div
      key={`${active.sourceCardId}:${active.effectId}`}
      className="hero-effect-presentation pointer-events-none absolute inset-x-1 top-1 z-10 overflow-hidden rounded-lg border border-amber-300/75 bg-stone-950/95 p-2 text-white shadow-[0_8px_24px_rgba(55,35,18,.35)]"
      data-ui-contract="hero-rush-v2-effect-presentation"
      aria-live="polite"
    >
      <div className="flex gap-2">
        <div className="relative h-[74px] w-[53px] shrink-0 overflow-hidden rounded-[5px] bg-stone-800 shadow-lg">
          {card ? <CardImage cardId={card.id} legacyUrl={card.image_url} intent="board" alt={card.name} className="h-full w-full object-contain" /> : <span className="grid h-full place-items-center px-1 text-center text-[7px] text-white/55">效果卡牌</span>}
          <span className="hero-effect-presentation-shine absolute inset-0" />
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <span className="text-[7px] font-black tracking-[.12em] text-amber-300">{activationLabels[active.activation]}</span>
          <strong className="mt-0.5 block truncate text-[10px] text-white">{card?.name ?? "卡牌效果"}</strong>
          <p className="mt-0.5 text-[8px] font-bold leading-3 text-amber-100">{active.effectLabel}</p>
          <p className="mt-1 text-[7px] leading-[11px] text-white/65" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{effectText}</p>
        </div>
      </div>
      <div className="hero-effect-presentation-progress absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-red-500 via-amber-300 to-blue-500" />
    </div>
  );
}
