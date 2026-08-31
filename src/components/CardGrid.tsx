/**
 * CardGrid — 卡牌图片网格（MSA Light Theme）
 *
 * Pure image card grid with placeholder fallback.
 * Columns dynamically set via `columns` prop.
 * P2: foilEnabled for card-foil CSS effect, cardScale for image zoom.
 */

import { useEffect, useMemo, useState } from "react";
import type { Card } from "../types/card";
import CardImage from "./CardImage";
import PaginationControls from "./PaginationControls";
import { CARD_PAGE_SIZE, paginateItems } from "../utils/pagination";

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
  /** Number of cards rendered per page. Defaults to the global card page size (30). */
  pageSize?: number;
}

export default function CardGrid({
  cards,
  onHover,
  onSelect,
  countFor,
  columns = 8,
  foilEnabled = false,
  cardScale = 1.0,
  pageSize = CARD_PAGE_SIZE,
}: Props) {
  const [page, setPage] = useState(1);
  const cardKey = useMemo(() => cards.map((card) => card.id).join("|"), [cards]);
  const pagination = useMemo(
    () => paginateItems(cards, page, pageSize),
    [cards, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [cardKey, pageSize]);

  return (
    <div>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {pagination.items.map((card) => (
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
              <CardImage
                cardId={card.id}
                legacyUrl={card.image_url}
                intent="thumb"
                alt={card.name}
                className="card-img w-full object-cover"
                style={{ transform: `scale(${cardScale})`, transformOrigin: "center" }}
                loading="lazy"
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
      <PaginationControls
        page={pagination.page}
        pageCount={pagination.pageCount}
        total={pagination.total}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
}
