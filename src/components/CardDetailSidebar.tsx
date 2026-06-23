/**
 * CardDetailSidebar — right-side resident detail panel (jinteki-style)
 *
 * Unlike CardDetailModal (which is a popup overlay), this is an inline sidebar
 * that displays the hovered card's large image + stats + effect text.
 * Updates in real-time on hover. Shows empty state when no card is hovered.
 */

import { useState, useEffect } from "react";
import type { Card, CardDatabase } from "../types/card";

interface Props {
  card: Card | null;
  db: CardDatabase;
  onAddToDeck?: (card: Card, isRush: boolean) => void;
  /** Show "add to deck" buttons (card search page). Hide in read-only contexts. */
  showAddButton?: boolean;
}

export default function CardDetailSidebar({ card, db, onAddToDeck, showAddButton = true }: Props) {
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);

  // Reset variant selection when card changes
  useEffect(() => {
    setSelectedVariantIdx(0);
  }, [card?.card_no]);

  if (!card) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 min-h-0">
        <div className="text-center space-y-3">
          <div className="text-4xl opacity-10">🃏</div>
          <p className="text-xs text-[#445566]">将鼠标悬停在卡牌上</p>
          <p className="text-xs text-[#445566]">查看详情</p>
        </div>
      </div>
    );
  }

  // Resolve variants for this card_no
  const variantIds = db.card_groups[card.card_no] || [card.id];
  const variants = variantIds
    .map((id) => db.cards.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined);

  // Use the selected variant, or fall back to the hovered card
  const currentCard = variants[selectedVariantIdx] || card;

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3 min-h-0">
      {/* ── Large card image (746:1041 ratio) ─────────────────── */}
      <div className="mx-auto" style={{ maxWidth: "260px" }}>
        <div
          className="relative w-full rounded-lg overflow-hidden border border-[#2a3a50] shadow-xl bg-[#0a1120]"
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
                    : "bg-[#1a2535] text-[#8899aa] border-[#2a3a50] hover:text-white"
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
        <h3 className="text-base font-bold text-[#e8eaed] leading-tight">{currentCard.name}</h3>
        <p className="text-xs text-[#667788] mt-0.5">{currentCard.card_no}</p>
      </div>

      {/* ── Stat badges ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        <span
          className="px-2 py-0.5 rounded text-[11px] font-medium text-white"
          style={{ backgroundColor: currentCard.attribute_color }}
        >
          {currentCard.attribute_name}
        </span>
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#1a2535] text-[#c9cdd4] border border-[#2a3a50]">
          {currentCard.card_type_name}
        </span>
        {currentCard.card_type === 1 && (
          <>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-900/40 text-blue-300 border border-blue-800/50">
              Lv {currentCard.cost}
            </span>
            {currentCard.pp_value != null && (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-900/40 text-purple-300 border border-purple-800/50">
                R {currentCard.pp_value}
              </span>
            )}
            {currentCard.power && (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-900/40 text-red-300 border border-red-800/50">
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
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#1a2535] text-[#8899aa] border border-[#2a3a50]">
          {currentCard.package_short}
        </span>
      </div>

      {/* ── Feature tags ─────────────────────────────────────── */}
      {currentCard.feature_text && (
        <div>
          <h4 className="text-[11px] text-[#667788] font-semibold mb-1">特性</h4>
          <div className="flex flex-wrap gap-1">
            {currentCard.feature_text.split("/").map((f, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-900/30 text-indigo-300 border border-indigo-800/40"
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
          <h4 className="text-[11px] text-[#667788] font-semibold mb-1">效果</h4>
          <div className="text-xs text-[#c9cdd4] bg-[#0a1120] rounded-lg p-2.5 leading-relaxed whitespace-pre-wrap border border-[#1e2d42]">
            {currentCard.effect}
          </div>
        </div>
      )}

      {/* ── Add to deck buttons ──────────────────────────────── */}
      {showAddButton && onAddToDeck && (
        <div className="pt-2 space-y-1.5">
          {currentCard.card_type === 1 && (
            <button
              onClick={() => onAddToDeck(currentCard, false)}
              className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-500 transition"
            >
              + 加入主卡组
            </button>
          )}
          {currentCard.card_type === 2 && (
            <button
              onClick={() => onAddToDeck(currentCard, true)}
              className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-500 transition"
            >
              + 加入冲击卡组
            </button>
          )}
        </div>
      )}
    </div>
  );
}
