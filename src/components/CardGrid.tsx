/**
 * CardGrid — pure image grid (jinteki-style)
 *
 * No card name text, no extra info — just tightly-packed card images.
 * Card ratio is strictly 746:1041 (≈0.717) using padding-trick.
 * Hover triggers onHover callback for the detail sidebar.
 * Click triggers onSelect (opens modal or adds to deck).
 */

import type { Card } from "../types/card";

interface Props {
  cards: Card[];
  onSelect?: (card: Card) => void;
  onHover?: (card: Card | null) => void;
  /** Optional: render a count badge overlay (e.g. "already in deck") */
  countFor?: (card: Card) => number;
  /** Grid columns override */
  columns?: number;
}

export default function CardGrid({ cards, onSelect, onHover, countFor, columns }: Props) {
  return (
    <div
      className="grid gap-1"
      style={{
        gridTemplateColumns: `repeat(${columns ?? 7}, minmax(0, 1fr))`,
      }}
    >
      {cards.map((card) => {
        const count = countFor?.(card) ?? 0;
        return (
          <div
            key={card.id}
            className="relative cursor-pointer group animate-fadeIn"
            onMouseEnter={() => onHover?.(card)}
            onMouseLeave={() => onHover?.(null)}
            onClick={() => onSelect?.(card)}
          >
            {/* Strict 746:1041 ratio container */}
            <div
              className="relative w-full rounded-sm overflow-hidden bg-[#0a1120]"
              style={{ paddingBottom: `${(1041 / 746) * 100}%` }}
            >
              <img
                src={card.image_url}
                alt={card.name}
                loading="lazy"
                className="card-img absolute inset-0 w-full h-full object-cover transition-transform duration-150 group-hover:scale-105 group-hover:z-10 group-hover:ring-2 group-hover:ring-red-400"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = "0.2";
                }}
              />
              {/* Attribute color stripe (left edge) */}
              <div
                className="absolute bottom-0 left-0 w-1 h-full opacity-80"
                style={{ backgroundColor: card.attribute_color }}
              />
              {/* Rarity badge (top-right) */}
              <div
                className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded-sm text-[9px] font-bold text-white shadow opacity-0 group-hover:opacity-100 transition"
                style={{ backgroundColor: card.rarity_color }}
              >
                {card.rarity_code}
              </div>
              {/* In-deck count badge (top-right) */}
              {count > 0 && (
                <div className="absolute top-0.5 right-0.5 bg-green-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold shadow">
                  {count}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
