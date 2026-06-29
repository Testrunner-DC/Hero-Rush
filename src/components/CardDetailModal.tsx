import { useState } from "react";
import type { Card, CardDatabase } from "../types/card";

interface Props {
  card: Card;
  db: CardDatabase;
  onClose: () => void;
}

export default function CardDetailModal({ card, db, onClose }: Props) {
  const variantIds = db.card_groups[card.card_no] || [card.id];
  const variants = variantIds
    .map((id) => db.cards.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined);

  const [selectedVariantIdx, setSelectedVariantIdx] = useState(
    Math.max(0, variants.findIndex((v) => v.id === card.id))
  );

  const currentCard = variants[selectedVariantIdx] || card;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto scrollbar-thin animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row gap-4 p-4">
          {/* Card image */}
          <div className="flex-shrink-0 mx-auto md:mx-0">
            <div className="relative w-48 md:w-56 aspect-[746/1041] rounded-xl overflow-hidden bg-stone-100 border border-stone-200 shadow-md">
              <img
                src={currentCard.image_url}
                alt={currentCard.name}
                className="card-img w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = "0.3";
                }}
              />
            </div>
            {/* Variant selector */}
            {variants.length > 1 && (
              <div className="flex gap-1.5 mt-2 justify-center flex-wrap">
                {variants.map((v, i) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariantIdx(i)}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      i === selectedVariantIdx
                        ? "text-white shadow"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
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

          {/* Card info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h2 className="text-lg font-bold text-stone-900">{currentCard.name}</h2>
                <p className="text-sm text-stone-500">{currentCard.card_no}</p>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Stat badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-white"
                style={{ backgroundColor: currentCard.attribute_color }}
              >
                {currentCard.attribute_name}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-stone-100 text-stone-700">
                {currentCard.card_type_name}
              </span>
              {currentCard.card_type === 1 && (
                <>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700">
                    Lv {currentCard.cost}
                  </span>
                  {currentCard.pp_value != null && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 text-purple-700">
                      R {currentCard.r ?? 1}
                    </span>
                  )}
                  {currentCard.power && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-700">
                      战力 {currentCard.power}
                    </span>
                  )}
                </>
              )}
              <span
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-white"
                style={{ backgroundColor: currentCard.rarity_color }}
              >
                {currentCard.rarity_cn} ({currentCard.rarity_code})
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-stone-100 text-stone-600">
                {currentCard.package}
              </span>
            </div>

            {/* Feature (resolved text) */}
            {currentCard.feature_text && (
              <div className="mb-3">
                <h3 className="text-xs font-medium text-stone-400 mb-1">特性</h3>
                <div className="flex flex-wrap gap-1.5">
                  {currentCard.feature_text.split("/").map((f) => (
                    <span
                      key={f}
                      className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Effect */}
            {currentCard.effect && (
              <div className="mb-4">
                <h3 className="text-xs font-medium text-stone-400 mb-1">效果</h3>
                <div className="text-sm text-stone-700 bg-stone-50 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
                  {currentCard.effect}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
