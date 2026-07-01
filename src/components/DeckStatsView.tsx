/**
 * DeckStatsView — stats charts for the deck builder
 *
 * Four chart cards aligning with DeckPlazaPage detail stats:
 * 1. Cost curve (Lv1-Lv6+) — stacked by attribute
 * 2. Distance curve — stacked by attribute
 * 3. Power curve — stacked by attribute
 * 4. Feature statistics — stacked by attribute
 *
 * MSA Light Theme, no external chart library.
 */

import { useMemo } from "react";
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

interface AttrItem {
  attribute: number;
  name: string;
  color: string;
  count: number;
}

interface ChartItem {
  xLabel: string;
  total: number;
  attrs: AttrItem[];
}

/** Convert an attribute→count map into sorted AttrItem[] using metadata. */
function attrsFromMap(
  attrMap: Record<number, number>,
  attrMeta: Record<number, { name: string; color: string }>,
): AttrItem[] {
  return Object.entries(attrMap)
    .map(([attr, count]) => {
      const meta = attrMeta[Number(attr)] ?? { name: "未知", color: "#ccc" };
      return { attribute: Number(attr), name: meta.name, color: meta.color, count };
    })
    .sort((a, b) => b.count - a.count);
}

export default function DeckStatsView({ mainDeck, rushDeck, cardMap, stats }: Props) {
  const totalCards = stats.mainCount + stats.rushCount;

  // ── Attribute metadata (name + color) from deck cards ────
  const attrMeta = useMemo(() => {
    const meta: Record<number, { name: string; color: string }> = {};
    for (const entry of mainDeck) {
      const card = cardMap.get(entry.card_no);
      if (card && !meta[card.attribute]) {
        meta[card.attribute] = { name: card.attribute_name, color: card.attribute_color };
      }
    }
    return meta;
  }, [mainDeck, cardMap]);

  // ── Chart 1: Cost Curve (Lv1-Lv6+, cost≥6→Lv6+) ────────
  const lvData = useMemo((): ChartItem[] => {
    const lvAttrMap: Record<number, Record<number, number>> = {};
    for (const entry of mainDeck) {
      const card = cardMap.get(entry.card_no);
      if (!card) continue;
      const lv = card.cost >= 6 ? 6 : card.cost;
      if (!lvAttrMap[lv]) lvAttrMap[lv] = {};
      lvAttrMap[lv][card.attribute] = (lvAttrMap[lv][card.attribute] || 0) + entry.count;
    }
    return [1, 2, 3, 4, 5, 6].map((lv) => {
      const attrMap = lvAttrMap[lv] || {};
      const attrs = attrsFromMap(attrMap, attrMeta);
      return {
        xLabel: lv === 6 ? "Lv6+" : `Lv${lv}`,
        total: attrs.reduce((s, a) => s + a.count, 0),
        attrs,
      };
    });
  }, [mainDeck, cardMap, attrMeta]);

  // ── Chart 2: Distance Curve (exclude r == null) ──────────
  const distanceData = useMemo((): ChartItem[] => {
    const rAttrMap: Record<number, Record<number, number>> = {};
    for (const entry of mainDeck) {
      const card = cardMap.get(entry.card_no);
      if (!card || card.r == null) continue;
      if (!rAttrMap[card.r]) rAttrMap[card.r] = {};
      rAttrMap[card.r][card.attribute] = (rAttrMap[card.r][card.attribute] || 0) + entry.count;
    }
    return Object.entries(rAttrMap)
      .map(([rVal, attrMap]) => {
        const attrs = attrsFromMap(attrMap, attrMeta);
        return { xLabel: rVal, total: attrs.reduce((s, a) => s + a.count, 0), attrs };
      })
      .sort((a, b) => Number(a.xLabel) - Number(b.xLabel));
  }, [mainDeck, cardMap, attrMeta]);

  // ── Chart 3: Power Curve (exclude cards without power) ───
  const powerData = useMemo((): ChartItem[] => {
    const powerAttrMap: Record<number, Record<number, number>> = {};
    for (const entry of mainDeck) {
      const card = cardMap.get(entry.card_no);
      if (!card || !card.power) continue;
      const pw = parseInt(card.power);
      if (isNaN(pw)) continue;
      if (!powerAttrMap[pw]) powerAttrMap[pw] = {};
      powerAttrMap[pw][card.attribute] = (powerAttrMap[pw][card.attribute] || 0) + entry.count;
    }
    return Object.entries(powerAttrMap)
      .map(([pw, attrMap]) => {
        const attrs = attrsFromMap(attrMap, attrMeta);
        return { xLabel: pw, total: attrs.reduce((s, a) => s + a.count, 0), attrs };
      })
      .sort((a, b) => Number(a.xLabel) - Number(b.xLabel));
  }, [mainDeck, cardMap, attrMeta]);

  // ── Chart 4: Feature Statistics (split by "/") ───────────
  const featureData = useMemo((): ChartItem[] => {
    const featAttrMap: Record<string, Record<number, number>> = {};
    for (const entry of mainDeck) {
      const card = cardMap.get(entry.card_no);
      if (!card || !card.feature_text) continue;
      const features = card.feature_text
        .split("/")
        .map((f) => f.trim())
        .filter(Boolean);
      for (const feat of features) {
        if (!featAttrMap[feat]) featAttrMap[feat] = {};
        featAttrMap[feat][card.attribute] = (featAttrMap[feat][card.attribute] || 0) + entry.count;
      }
    }
    return Object.entries(featAttrMap)
      .map(([feature, attrMap]) => {
        const attrs = attrsFromMap(attrMap, attrMeta);
        return { xLabel: feature, total: attrs.reduce((s, a) => s + a.count, 0), attrs };
      })
      .sort((a, b) => b.total - a.total);
  }, [mainDeck, cardMap, attrMeta]);

  // ── Color distribution (from mainDeck) ──────────────────
  const attrDistribution = useMemo(() => {
    const attrCountMap: Record<number, number> = {};
    for (const entry of mainDeck) {
      const card = cardMap.get(entry.card_no);
      if (!card) continue;
      attrCountMap[card.attribute] = (attrCountMap[card.attribute] || 0) + entry.count;
    }
    return Object.entries(attrCountMap)
      .map(([attr, count]) => {
        const meta = attrMeta[Number(attr)] ?? { name: "未知", color: "#ccc" };
        return { attribute: Number(attr), name: meta.name, color: meta.color, count };
      })
      .sort((a, b) => b.count - a.count);
  }, [mainDeck, cardMap, attrMeta]);

  // ── Max values for bar scaling ───────────────────────────
  const maxLv = Math.max(1, ...lvData.map((d) => d.total));
  const maxDistance = Math.max(1, ...distanceData.map((d) => d.total));
  const maxPower = Math.max(1, ...powerData.map((d) => d.total));
  const maxFeature = Math.max(1, ...featureData.map((d) => d.total));

  const allEmpty = lvData.every((d) => d.total === 0);

  return (
    <div className="space-y-5 overflow-y-auto p-4">
      {/* ── Summary row ───────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 text-xs text-stone-500">
        <span className="font-medium text-stone-700">总卡牌: {totalCards}</span>
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

      {allEmpty ? (
        <p className="text-xs text-stone-400 py-8 text-center">暂无卡牌数据</p>
      ) : (
        <>
          <ChartCard title="费用曲线" data={lvData} maxTotal={maxLv} height="h-28" emptyLabel="暂无数据" />
          <ChartCard title="距离曲线" data={distanceData} maxTotal={maxDistance} height="h-24" emptyLabel="暂无距离数据" />
          <ChartCard title="战力曲线" data={powerData} maxTotal={maxPower} height="h-24" emptyLabel="暂无数据" horizontal />
          <ChartCard title="特性统计" data={featureData} maxTotal={maxFeature} height="h-24" emptyLabel="暂无数据" horizontal truncateLabels />

          {/* ── Color Distribution ──────────────────────────── */}
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-3">
            <h3 className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">颜色分布</h3>
            {attrDistribution.length === 0 ? (
              <p className="text-xs text-stone-400 py-3 text-center">暂无数据</p>
            ) : (
              <div className="space-y-1.5">
                {attrDistribution.map((attr) => {
                  const pct = stats.mainCount > 0 ? (attr.count / stats.mainCount) * 100 : 0;
                  return (
                    <div key={attr.attribute} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: attr.color }} />
                      <span className="text-[10px] text-stone-600 w-8 flex-shrink-0">{attr.name}</span>
                      <span className="text-[10px] text-stone-500 w-4 text-right flex-shrink-0">{attr.count}</span>
                      <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: attr.color }} />
                      </div>
                      <span className="text-[9px] text-stone-400 w-7 text-right flex-shrink-0">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Shared chart card component ────────────────────────────

interface ChartCardProps {
  title: string;
  data: ChartItem[];
  maxTotal: number;
  height: string;
  emptyLabel: string;
  horizontal?: boolean;
  truncateLabels?: boolean;
}

function ChartCard({ title, data, maxTotal, height, emptyLabel, horizontal, truncateLabels }: ChartCardProps) {
  if (data.length === 0 || data.every((d) => d.total === 0)) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-3">
        <h3 className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">{title}</h3>
        <p className="text-xs text-stone-400 py-3 text-center">{emptyLabel}</p>
      </div>
    );
  }

  // ── Horizontal variant ──────────────────────────────────
  if (horizontal) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-3">
        <h3 className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">{title}</h3>
        <div className="flex flex-col gap-1">
          {data.map((item) => {
            const widthPct = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0;
            return (
              <div key={item.xLabel} className="flex items-center gap-1.5">
                <span
                  className={`text-[9px] text-stone-500 ${truncateLabels ? "w-12" : "w-7"} text-right flex-shrink-0 ${truncateLabels ? "truncate" : ""}`}
                  title={truncateLabels ? item.xLabel : undefined}
                >
                  {truncateLabels && item.xLabel.length > 4 ? item.xLabel.slice(0, 4) + "\u2026" : item.xLabel}
                </span>
                <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden flex">
                  {item.attrs.map((attr) => {
                    const attrW = item.total > 0 ? (attr.count / item.total) * widthPct : 0;
                    return (
                      <div
                        key={attr.attribute}
                        style={{ width: `${attrW}%`, backgroundColor: attr.color, minWidth: attr.count > 0 ? "4px" : "0" }}
                        title={`${attr.name}: ${attr.count}`}
                      />
                    );
                  })}
                </div>
                <span className="text-[9px] text-stone-600 w-5 text-right flex-shrink-0">{item.total}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Vertical variant (default) ───────────────────────────
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-3">
      <h3 className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">{title}</h3>
      <div className={`flex items-end gap-1 ${height}`}>
        {data.map((item) => {
          const heightPct = item.total > 0 ? (item.total / maxTotal) * 100 : 0;
          return (
            <div key={item.xLabel} className="flex-1 flex flex-col items-center h-full justify-end">
              {/* Count label above bar */}
              <span className="text-[9px] font-medium text-stone-600">{item.total || ""}</span>
              {/* Stacked bar */}
              <div
                style={{
                  height: `${Math.max(heightPct, item.total > 0 ? 4 : 0)}%`,
                  minHeight: item.total > 0 ? "6px" : "0",
                }}
                className="w-full rounded-t flex flex-col justify-end overflow-hidden"
              >
                {item.attrs.map((attr) => {
                  const attrPct = item.total > 0 ? (attr.count / item.total) * 100 : 0;
                  return (
                    <div
                      key={attr.attribute}
                      style={{
                        height: `${attrPct}%`,
                        backgroundColor: attr.color,
                        minHeight: attr.count > 0 ? "2px" : "0",
                      }}
                      title={`${attr.name}: ${attr.count}`}
                    />
                  );
                })}
              </div>
              {/* X-axis label */}
              <span className="text-[9px] text-stone-400 mt-0.5">{item.xLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
