import { useEffect, useState } from "react";
import type { Card } from "../types/card";
import CardImage from "./CardImage";

interface Props {
  variants: readonly Card[];
  intent?: "thumb" | "detail";
  className?: string;
  onVariantChange?: (card: Card) => void;
  lockedToLowest?: boolean;
}

export default function CardVariantImage({ variants, intent = "thumb", className = "h-full w-full object-cover", onVariantChange, lockedToLowest = false }: Props) {
  const [index, setIndex] = useState(0);
  const key = variants.map((card) => card.id).join("|");
  useEffect(() => setIndex(0), [key]);
  const card = variants[index] ?? variants[0];
  if (!card) return null;
  const change = (next: number) => {
    const normalized = (next + variants.length) % variants.length;
    setIndex(normalized);
    onVariantChange?.(variants[normalized]);
  };
  return (
    <div className="relative h-full w-full" data-ui-contract="hero-rush-card-variant-switcher" data-variant-index={index}>
      <CardImage cardId={card.id} legacyUrl={card.image_url} intent={intent} alt={card.name} className={className} loading={intent === "thumb" ? "lazy" : undefined} />
      {variants.length > 1 && <>
        <button type="button" aria-label="上一种罕贵卡图" onClick={(event) => { event.stopPropagation(); change(index - 1); }} className="absolute left-0 top-1/2 z-20 grid h-12 w-8 -translate-y-1/2 place-items-center bg-black/20 text-xl text-white/75 transition hover:bg-black/40 hover:text-white" style={{ clipPath: "polygon(0 50%,100% 0,100% 100%)" }}>‹</button>
        <button type="button" aria-label="下一种罕贵卡图" onClick={(event) => { event.stopPropagation(); change(index + 1); }} className="absolute right-0 top-1/2 z-20 grid h-12 w-8 -translate-y-1/2 place-items-center bg-black/20 text-xl text-white/75 transition hover:bg-black/40 hover:text-white" style={{ clipPath: "polygon(100% 50%,0 0,0 100%)" }}>›</button>
        <span className="pointer-events-none absolute bottom-1 left-1/2 z-20 -translate-x-1/2 rounded bg-black/55 px-1.5 py-0.5 text-[8px] font-bold text-white">{card.rarity_code} · {index + 1}/{variants.length}{lockedToLowest && index > 0 ? " · 仅预览" : ""}</span>
      </>}
    </div>
  );
}
