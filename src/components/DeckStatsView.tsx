/**
 * DeckStatsView — stats charts for the deck builder
 *
 * Two sections:
 * 1. Cost curve — pure CSS horizontal bar chart (Lv0 ~ Lv6+)
 * 2. Color distribution — horizontal progress bars with color dots
 *
 * MSA Light Theme, no external chart library.
 */

import type { Card, DeckEntry } from "../types/card";

interface Props {
  mainDeck: DeckEntry[];
  rushDeck?: DeckEntry[];
  cardMap: Map<string, Card>;
  stats: DeckStats;
}

interface DeckStats {
  mainCount: number;
  rushCount: number;
  colors: string[];
  overThreeNames: string[];
  mainValid: boolean;
  rushValid: boolean;
  colorValid: boolean;
  nameValid: boolean;
  allValid: boolean;
}

/** Build a cost histogram from deck entries. */
function buildCostCurve(
  mainDeck: DeckEntry[],
  rushDeck: DeckEntry[],
  cardMap: Map<string, Card>
): Map<number, number> {
  const hist = new Map<number, number>();
  const all = [...mainDeck, ...(rushDeck || [])];
  for (const entry of all) {
    const card = cardMap.get(entry.card_no);
    if (!card) continue;
    const lv = card.cost >= 6 ? 6 : card.cost;
    hist.set(lv, (hist.get(lv) || 0) + entry.count);
  }
  return hist;
}

/** Build an attribute → count histogram. */
function buildColorDist(
  mainDeck: DeckEntry[],
  rushDeck: DeckEntry[],
  cardMap: Map<string, Card>
): Map<string, { name: string; color: string; count: number }> {
  const dist = new Map<string, { name: string; color: string; count: number }>();
  const all = [...mainDeck, ...(rushDeck || [])];
  for (const entry of all) {
    const card = cardMap.get(entry.card_no);
    if (!card) continue;
    const key = String(card.attribute);
    const existing = dist.get(key);
    if (existing) {
      existing.count += entry.count;
    } else {
      dist.set(key, {
        name: card.attribute_name,
        color: card.attribute_color,
        count: entry.count,
      });
    }
  }
  return dist;
}

export default function DeckStatsView({ mainDeck, rushDeck, cardMap, stats }: Props) {
  // ── Cost curve ──────────────────────────────────────────
  const costHist = buildCostCurve(mainDeck, rushDeck || [], cardMap);
  const maxCostCount = Math.max(1, ...costHist.values());
  const costLabels = ["Lv0", "Lv1", "Lv2", "Lv3", "Lv4", "Lv5", "Lv6+"];

  // ── Color distribution ──────────────────────────────────
  const colorDist = buildColorDist(mainDeck, rushDeck || [], cardMap);
  const totalCards = stats.mainCount + stats.rushCount;
  const colorEntries = [...colorDist.values()].sort((a, b) => b.count - a.count);

  // ── MSA gradient stops (from msa-500 to msa-600) ────────
  const barGradient =
    "linear-gradient(180deg, #c62828 0%, #b71c1c 100%)";

  return (
    <div className="space-y-5 overflow-y-auto p-4">
      {/* ── Summary row ───────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 text-xs text-stone-500">
        <span className="font-medium text-stone-700">
          总卡牌: {totalCards}
        </span>
        <span>·</span>
        <span>主卡组: {stats.mainCount}/50</span>
        <span>·</span>
        <span>冲击: {stats.rushCount}/9</span>
        {stats.colors.length > 0 && (
          <>
            <span>·</span>
            <span>颜色: {stats.colors.join("/")}</span>
          </>
        )}
      </div>

      {/* ── Cost curve ────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-3">
          费用曲线
        </h3>
        {totalCards === 0 ? (
          <p className="text-xs text-stone-400 py-4 text-center">暂无卡牌数据</p>
        ) : (
          <div className="flex items-end gap-2 h-36">
            {costLabels.map((label, i) => {
              const count = costHist.get(i) || 0;
              const heightPct = count > 0 ? (count / maxCostCount) * 100 : 0;
              return (
                <div key={label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  {/* Count label above bar */}
                  <span className="text-[10px] font-medium text-stone-600">
                    {count || ""}
                  </span>
                  {/* Bar */}
                  <div
                    className="w-full rounded-t transition-all duration-300"
                    style={{
                      height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%`,
                      background: count > 0 ? barGradient : "transparent",
                      minHeight: count > 0 ? "8px" : "0",
                    }}
                  />
                  {/* X-axis label */}
                  <span className="text-[10px] text-stone-400 mt-1">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Color distribution ────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-3">
          颜色分布
        </h3>
        {colorEntries.length === 0 ? (
          <p className="text-xs text-stone-400 py-4 text-center">暂无卡牌数据</p>
        ) : (
          <div className="space-y-2">
            {colorEntries.map((entry, i) => {
              const pct = totalCards > 0 ? (entry.count / totalCards) * 100 : 0;
              const barColors = [
                "bg-red-500",
                "bg-blue-500",
                "bg-green-500",
                "bg-yellow-500",
                "bg-purple-500",
                "bg-black",
                "bg-stone-400",
              ];
              const barColor = barColors[i % barColors.length];

              return (
                <div key={entry.name} className="flex items-center gap-2">
                  {/* Color dot */}
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  {/* Name */}
                  <span className="text-[11px] text-stone-600 w-12 flex-shrink-0">
                    {entry.name}
                  </span>
                  {/* Count */}
                  <span className="text-[11px] text-stone-500 w-6 text-right flex-shrink-0">
                    {entry.count}
                  </span>
                  {/* Progress bar */}
                  <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {/* Percentage */}
                  <span className="text-[10px] text-stone-400 w-10 text-right flex-shrink-0">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
