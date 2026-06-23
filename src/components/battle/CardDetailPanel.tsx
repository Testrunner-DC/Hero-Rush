/**
 * CardDetailPanel — 右侧卡牌详情面板
 *
 * 显示鼠标悬停的卡牌大图和详细信息。
 * 无悬停卡牌时显示占位提示。
 */

import type { Card } from "../../types/card";

interface CardDetailPanelProps {
  card: Card | null;
}

export default function CardDetailPanel({ card }: CardDetailPanelProps) {
  if (!card) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 min-h-0">
        <div className="text-center space-y-2">
          <div className="text-3xl opacity-10">🃏</div>
          <p className="text-xs text-white/20">将鼠标悬停在卡牌上查看详情</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
      {/* 卡牌大图 */}
      <div className="mx-auto w-[220px] h-[308px] rounded-lg overflow-hidden border-2 border-white/20 shadow-xl bg-black/40">
        <img
          src={`/cards/${card.id}.png`}
          alt={card.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.style.display = "none";
            const parent = img.parentElement;
            if (parent) {
              parent.innerHTML =
                '<div class="w-full h-full flex items-center justify-center text-white/20 text-xs">无图片</div>';
            }
          }}
        />
      </div>

      {/* 卡牌信息 */}
      <div className="space-y-1 text-center">
        <h3 className="text-sm font-bold text-white/90 leading-tight">{card.name}</h3>
        <div className="flex justify-center flex-wrap gap-1 text-[11px]">
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/70">Lv{card.cost}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/70">
            战力 {card.power || "-"}
          </span>
          <span
            className="px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: (card.attribute_color || "#666") + "30",
              color: card.attribute_color || "#999",
            }}
          >
            {card.attribute_name}
          </span>
          <span className="px-1.5 py-0.5 rounded" style={{ color: card.rarity_color || "#999" }}>
            {card.rarity_cn}
          </span>
        </div>
      </div>

      {/* 效果文本 */}
      {card.effect && (
        <div className="bg-black/30 rounded-lg p-2 border border-white/5">
          <p className="text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap">{card.effect}</p>
        </div>
      )}
    </div>
  );
}
