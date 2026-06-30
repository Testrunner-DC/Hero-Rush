/**
 * CardDetailSidebar — right-side resident detail panel (MSA Light Theme)
 *
 * Displays the hovered card's large image + stats + effect text.
 * Updates in real-time on hover. Shows empty state when no card is hovered.
 * Impact cards (card_type === 2) do not show an "add to deck" button.
 */

import { useState, useEffect } from "react";
import type { Card, CardDatabase } from "../types/card";

interface Props {
  card: Card | null;
  db: CardDatabase;
  onAddToDeck?: (card: Card) => void;
  showAddButton?: boolean;
}

export default function CardDetailSidebar({ card, db, onAddToDeck, showAddButton = true }: Props) {
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);

  useEffect(() => {
    setSelectedVariantIdx(0);
  }, [card?.card_no]);

  if (!card) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 min-h-0">
        <div className="text-center space-y-3">
          <div className="text-4xl opacity-10">🃏</div>
          <p className="text-xs text-stone-400">将鼠标悬停在卡牌上</p>
          <p className="text-xs text-stone-400">查看详情</p>
        </div>
      </div>
    );
  }

  const variantIds = db.card_groups[card.card_no] || [card.id];
  const variants = variantIds
    .map((id) => db.cards.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined);

  const currentCard = variants[selectedVariantIdx] || card;

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3 min-h-0">
      {/* ── Large card image ─────────────────── */}
      <div className="mx-auto" style={{ maxWidth: "260px" }}>
        <div
          className="relative w-full rounded-lg overflow-hidden border border-stone-200 shadow-md bg-stone-100"
          style={{ paddingBottom: `${(1041 / 746) * 100}%` }}
        >
          <img
            src={currentCard.image_url}
            alt={currentCard.name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.opacity = "0.2";
            }}
          />
          {/* Rarity badge */}
          <div
            className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow"
            style={{ backgroundColor: currentCard.rarity_color }}
          >
            {currentCard.rarity_code}
          </div>
        </div>

        {/* Variant selector */}
        {variants.length > 1 && (
          <div className="flex gap-1 mt-1.5 justify-center flex-wrap">
            {variants.map((v, i) => (
              <button
                key={v.id}
                onClick={() => setSelectedVariantIdx(i)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition border ${
                  i === selectedVariantIdx
                    ? "text-white border-transparent"
                    : "bg-stone-50 text-stone-500 border-stone-200 hover:text-stone-700"
                }`}
                style={i === selectedVariantIdx ? { backgroundColor: v.rarity_color } : {}}
                title={v.rarity_cn}
              >
                {v.rarity_code}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Card name ────────────────────────────────────────── */}
      <div className="text-center">
        <h3 className="text-base font-bold text-stone-800 leading-tight">{currentCard.name}</h3>
        <p className="text-xs text-stone-400 mt-0.5">{currentCard.card_no}</p>
      </div>

      {/* ── Stat badges ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        <span
          className="px-2 py-0.5 rounded text-[11px] font-medium text-white"
          style={{ backgroundColor: currentCard.attribute_color }}
        >
          {currentCard.attribute_name}
        </span>
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-600 border border-stone-200">
          {currentCard.card_type_name}
        </span>
        {currentCard.card_type === 1 && (
          <>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
              Lv {currentCard.cost}
            </span>
            {currentCard.pp_value != null && (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                R {currentCard.r ?? 1}
              </span>
            )}
            {currentCard.power && (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
                战力 {currentCard.power}
              </span>
            )}
          </>
        )}
        <span
          className="px-2 py-0.5 rounded text-[11px] font-medium text-white"
          style={{ backgroundColor: currentCard.rarity_color }}
        >
          {currentCard.rarity_code}
        </span>
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-500 border border-stone-200">
          {currentCard.package_short}
        </span>
      </div>

      {/* ── Feature tags ─────────────────────────────────────── */}
      {currentCard.feature_text && (
        <div>
          <h4 className="text-[11px] text-stone-500 font-semibold mb-1">特性</h4>
          <div className="flex flex-wrap gap-1">
            {currentCard.feature_text.split("/").map((f, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-200"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Effect text ──────────────────────────────────────── */}
      {currentCard.effect && (
        <div>
          <h4 className="text-[11px] text-stone-500 font-semibold mb-1">效果</h4>
          <div className="text-xs text-stone-600 bg-stone-50 rounded-lg p-2.5 leading-relaxed whitespace-pre-wrap border border-stone-100">
            {currentCard.effect}
          </div>
        </div>
      )}

      {/* ── Add to deck button ──────────────────────────────── */}
      {showAddButton && onAddToDeck && currentCard.card_type === 1 && (
        <div className="pt-2">
          <button
            onClick={() => onAddToDeck(currentCard)}
            className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition"
          >
            + 加入主卡组
          </button>
        </div>
      )}
    </div>
  );
}
