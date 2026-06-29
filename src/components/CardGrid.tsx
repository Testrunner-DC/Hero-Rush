/**
 * CardGrid — 卡牌图片网格（MSA Light Theme）
 *
 * Pure image card grid with placeholder fallback.
 * Columns dynamically set via `columns` prop.
 * P2: foilEnabled for card-foil CSS effect, cardScale for image zoom.
 */

import type { Card } from "../types/card";

interface Props {
  cards: Card[];
  onHover: (card: Card | null) => void;
  onSelect: (card: Card) => void;
  countFor?: (card: Card) => number;
  columns?: number;
  /** Enable holographic foil shader overlay */
  foilEnabled?: boolean;
  /** Image scale transform (0.6 ~ 1.4, default 1.0) */
  cardScale?: number;
}

export default function CardGrid({
  cards,
  onHover,
  onSelect,
  countFor,
  columns = 8,
  foilEnabled = false,
  cardScale = 1.0,
}: Props) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {cards.map((card) => (
        <div
          key={card.id}
          className={`relative cursor-pointer rounded-lg overflow-hidden bg-stone-100 border border-stone-200 hover:shadow-card-hover hover:border-red-300 transition group ${
            foilEnabled ? "card-foil" : ""
          }`}
          onMouseEnter={() => onHover(card)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect(card)}
        >
          {/* Scale wrapper: overflow-hidden clips the scaled image */}
          <div className="overflow-hidden">
            <img
              src={card.image_url}
              alt={card.name}
              className="card-img w-full object-cover"
              style={{ transform: `scale(${cardScale})`, transformOrigin: "center" }}
              loading="lazy"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.opacity = "0.2";
              }}
            />
          </div>
          {/* Rarity color bottom bar */}
          <div
            className="absolute bottom-0 left-0 right-0 h-0.5 opacity-80"
            style={{ backgroundColor: card.rarity_color }}
          />
        </div>
      ))}
    </div>
  );
}
