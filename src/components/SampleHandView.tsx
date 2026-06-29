/**
 * SampleHandView — 起手模拟视图
 *
 * Draws 5 random cards from the main deck (respecting card counts).
 * Displays cards in a horizontal layout with level distribution stats.
 * P2 feature for DeckBuilderPage right panel.
 */

import { useState, useMemo, useCallback } from "react";
import type { Card, DeckEntry } from "../types/card";

interface Props {
  mainDeck: DeckEntry[];
  rushDeck: DeckEntry[];
  cardMap: Map<string, Card>;
}

interface DrawnCard {
  card: Card;
  cardNo: string;
}

/** Shuffle array in place (Fisher-Yates). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function SampleHandView({ mainDeck, cardMap }: Props) {
  const [drawn, setDrawn] = useState<DrawnCard[]>([]);
  const [drawnIds, setDrawnIds] = useState<Set<string>>(new Set());

  // Expand mainDeck entries into card_no[] array (repeated by count)
  const deckPool = useMemo(() => {
    const pool: string[] = [];
    for (const entry of mainDeck) {
      const card = cardMap.get(entry.card_no);
      if (card) {
        for (let i = 0; i < entry.count; i++) {
          pool.push(entry.card_no);
        }
      }
    }
    return pool;
  }, [mainDeck, cardMap]);

  const drawCards = useCallback(() => {
    if (deckPool.length === 0) return;
    const shuffled = shuffle([...deckPool]);
    const picked: DrawnCard[] = [];
    const seen = new Set<string>();
    for (const cardNo of shuffled) {
      if (picked.length >= 5) break;
      if (seen.has(cardNo)) continue;
      const card = cardMap.get(cardNo);
      if (!card) continue;
      seen.add(cardNo);
      picked.push({ card, cardNo });
    }
    setDrawn(picked);
    setDrawnIds(seen);
  }, [deckPool, cardMap]);

  // Level distribution of drawn cards
  const levelDist = useMemo(() => {
    const dist = new Map<number, number>();
    for (const d of drawn) {
      const lv = d.card.cost;
      dist.set(lv, (dist.get(lv) || 0) + 1);
    }
    return dist;
  }, [drawn]);

  // Empty state
  if (mainDeck.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-stone-400 p-4">
        <svg className="w-10 h-10 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <p className="text-sm font-medium">请先加入卡牌</p>
        <p className="text-xs mt-1">在左侧卡池中点击卡牌加入主卡组</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* Draw / Redraw button */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={drawCards}
          className="flex-1 py-2 text-xs font-medium bg-red-600 text-white hover:bg-red-500 rounded-lg transition flex items-center justify-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
          </svg>
          {drawn.length > 0 ? "重新抽牌" : "抽牌"}
        </button>
        <span className="text-[10px] text-stone-400">
          卡池 {deckPool.length} 张
        </span>
      </div>

      {/* Drawn cards display */}
      {drawn.length > 0 ? (
        <>
          <div className="flex gap-2 overflow-x-auto scrollbar-thin flex-shrink-0 pb-1">
            {drawn.map(({ card, cardNo }) => (
              <div
                key={cardNo}
                className="flex-shrink-0 w-[80px] bg-white rounded-lg border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition"
              >
                <img
                  src={card.image_url}
                  alt={card.name}
                  className="w-full h-[110px] object-cover bg-white/90"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = "0.2";
                  }}
                />
                <div className="p-1.5 space-y-0.5">
                  <p className="text-[10px] text-stone-700 font-medium truncate leading-tight">
                    {card.name}
                  </p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span
                      className="text-[9px] px-1 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: `${card.attribute_color}20`,
                        color: card.attribute_color,
                      }}
                    >
                      {card.attribute_name}
                    </span>
                    <span className="text-[9px] text-stone-400">Lv{card.cost}</span>
                    {card.power && (
                      <span className="text-[9px] text-red-500 font-medium">{card.power}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Level distribution stats */}
          <div className="flex-shrink-0 bg-white rounded-lg border border-stone-200 p-3">
            <h4 className="text-[10px] text-stone-500 font-semibold uppercase tracking-wide mb-2">
              等级分布
            </h4>
            <div className="flex items-end gap-1.5 h-16">
              {Array.from({ length: 7 }, (_, lv) => {
                const count = levelDist.get(lv) || 0;
                const maxCount = Math.max(1, ...levelDist.values());
                const heightPct = count > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={lv} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <span className="text-[9px] font-medium text-stone-600">
                      {count || ""}
                    </span>
                    <div
                      className="w-full rounded-t transition-all"
                      style={{
                        height: `${Math.max(heightPct, count > 0 ? 6 : 0)}%`,
                        background: count > 0
                          ? "linear-gradient(180deg, #c62828 0%, #b71c1c 100%)"
                          : "transparent",
                        minHeight: count > 0 ? "6px" : "0",
                      }}
                    />
                    <span className="text-[9px] text-stone-400">Lv{lv}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[9px] text-stone-400 mt-2 text-center">
              共 {drawn.length} 张 · 来自 {deckPool.length} 张卡池
            </p>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-stone-400">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
            </svg>
            <p className="text-sm">点击「抽牌」模拟起手 5 张</p>
            <p className="text-xs mt-1 opacity-70">从主卡组随机抽取</p>
          </div>
        </div>
      )}
    </div>
  );
}
