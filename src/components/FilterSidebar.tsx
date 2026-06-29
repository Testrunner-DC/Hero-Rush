/**
 * FilterSidebar — MSA-style left filter sidebar
 *
 * Vertical layout with color dot buttons, small button groups for type/level/rarity/package.
 * Light theme, used in both CardSearchPage and DeckBuilderPage.
 *
 * Supports DP (战力) and PP (距离) range filters (P1).
 */

import type { CardDatabase } from "../types/card";

export type SortBy = "card_no" | "cost" | "power" | "name";

export interface FilterState {
  search: string;
  filterType: number | "all";
  filterAttr: number | "all";
  filterRarity: number | "all";
  filterCost: number | "all";
  filterPackage: string | "all";
  sortBy: SortBy;
  dpMin: number | "all";
  dpMax: number | "all";
  ppMin: number | "all";
  ppMax: number | "all";
}

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  filterType: "all",
  filterAttr: "all",
  filterRarity: "all",
  filterCost: "all",
  filterPackage: "all",
  sortBy: "card_no",
  dpMin: "all",
  dpMax: "all",
  ppMin: "all",
  ppMax: "all",
};

interface Props {
  db: CardDatabase;
  state: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  resultCount: number;
  compact?: boolean;
  /** When true, skip rendering the search box + result count row. Used when the parent renders search externally. */
  hideSearch?: boolean;
}

const SORT_LABELS: Record<SortBy, string> = {
  card_no: "编号",
  cost: "等级",
  power: "战力",
  name: "名称",
};

const PACKAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "BP01", label: "BP01" },
  { value: "SD01", label: "SD01" },
  { value: "SD02", label: "SD02" },
  { value: "SD03", label: "SD03" },
  { value: "SD04", label: "SD04" },
  { value: "PB01", label: "PB01" },
  { value: "TB01", label: "TB01" },
];

export default function FilterSidebar({ db, state, onChange, onReset, resultCount, compact = false, hideSearch = false }: Props) {
  const {
    search,
    filterType,
    filterAttr,
    filterRarity,
    filterCost,
    filterPackage,
    sortBy,
    dpMin,
    dpMax,
    ppMin,
    ppMax,
  } = state;

  const sectionTitle = compact
    ? "text-[11px] text-stone-500 font-semibold uppercase tracking-wide mb-1.5"
    : "text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2";
  const btnBase = compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs";

  /** Parse input value: empty → "all", otherwise parseInt. */
  const parseRangeValue = (v: string): number | "all" => {
    if (v.trim() === "") return "all";
    const n = parseInt(v, 10);
    return isNaN(n) ? "all" : n;
  };

  return (
    <div className={compact ? "grid grid-cols-2 gap-x-3 gap-y-2" : "space-y-4"}>
      {/* ── Search box ───────────────────────────────────────── */}
      {!hideSearch && (
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="搜索卡名/编号/效果..."
            className="w-full bg-white border border-stone-200 rounded text-sm text-stone-700 placeholder-stone-400 pl-8 pr-3 py-2 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition"
          />
        </div>
      )}

      {/* ── Result count ─────────────────────────────────────── */}
      {!hideSearch && (
        <div className="text-xs text-stone-500 pb-1 border-b border-stone-100">
          {resultCount} 张结果
        </div>
      )}

      {/* ── Sort ─────────────────────────────────────────────── */}
      <div>
        <p className={sectionTitle}>排序</p>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(SORT_LABELS) as SortBy[]).map((s) => (
            <button
              key={s}
              onClick={() => onChange({ sortBy: s })}
              className={`${btnBase} rounded transition ${
                sortBy === s
                  ? "bg-red-500 text-white"
                  : "bg-stone-100 text-stone-500 hover:text-stone-700 hover:bg-stone-200"
              }`}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Color (attribute) — dot buttons ──────────────────── */}
      <div>
        <p className={sectionTitle}>颜色</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onChange({ filterAttr: "all" })}
            className={`w-6 h-6 rounded-full border-2 transition flex items-center justify-center text-[10px] font-bold ${
              filterAttr === "all"
                ? "border-stone-800 text-stone-800"
                : "border-transparent text-stone-500 hover:text-stone-700"
            } bg-stone-300`}
            title="全部"
          >
            全
          </button>
          {Object.entries(db.attributes).map(([k, v]) => (
            <button
              key={k}
              onClick={() => onChange({ filterAttr: Number(k) })}
              className={`w-6 h-6 rounded-full border-2 transition ${
                filterAttr === Number(k) ? "border-stone-800 scale-110" : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: v.color }}
              title={v.name}
            />
          ))}
        </div>
      </div>

      {/* ── Type ─────────────────────────────────────────────── */}
      <div>
        <p className={sectionTitle}>类型</p>
        <div className="flex flex-wrap gap-1">
          {([
            { v: "all", l: "全部" },
            { v: "1", l: "角色" },
            { v: "2", l: "冲击" },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              onClick={() => onChange({ filterType: opt.v === "all" ? "all" : Number(opt.v) })}
              className={`${btnBase} rounded transition ${
                String(filterType) === opt.v
                  ? "bg-red-500 text-white"
                  : "bg-stone-100 text-stone-500 hover:text-stone-700 hover:bg-stone-200"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Level (cost) ─────────────────────────────────────── */}
      <div>
        <p className={sectionTitle}>等级</p>
        <div className="flex flex-wrap gap-1">
          {(["all", 0, 1, 2, 3, 4, 5, 6] as const).map((v) => (
            <button
              key={v}
              onClick={() => onChange({ filterCost: v })}
              className={`${btnBase} rounded transition ${
                filterCost === v
                  ? "bg-red-500 text-white"
                  : "bg-stone-100 text-stone-500 hover:text-stone-700 hover:bg-stone-200"
              }`}
            >
              {v === "all" ? "全部" : `Lv${v}`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Rarity ───────────────────────────────────────────── */}
      <div>
        <p className={sectionTitle}>稀有度</p>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => onChange({ filterRarity: "all" })}
            className={`${btnBase} rounded transition ${
              filterRarity === "all"
                ? "bg-red-500 text-white"
                : "bg-stone-100 text-stone-500 hover:text-stone-700 hover:bg-stone-200"
            }`}
          >
            全部
          </button>
          {Object.entries(db.rarities)
            .sort(([, a], [, b]) => {
              const order = (code: string) =>
                code === "N" ? 0 : code === "R" ? 1 : code === "SR" ? 2 : code === "SSR" ? 3 : code === "UR" ? 4 : code === "MR" ? 5 : 6;
              return order(a.code) - order(b.code);
            })
            .map(([k, v]) => (
              <button
                key={k}
                onClick={() => onChange({ filterRarity: Number(k) })}
                className={`${btnBase} rounded transition border ${
                  filterRarity === Number(k)
                    ? "text-white"
                    : "text-stone-500 hover:text-stone-700 bg-stone-100 border-stone-200"
                }`}
                style={
                  filterRarity === Number(k)
                    ? { backgroundColor: v.color, borderColor: v.color }
                    : {}
                }
                title={v.cn}
              >
                {v.code}
              </button>
            ))}
        </div>
      </div>

      {/* ── Package ──────────────────────────────────────────── */}
      <div>
        <p className={sectionTitle}>系列</p>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => onChange({ filterPackage: "all" })}
            className={`${btnBase} rounded transition ${
              filterPackage === "all"
                ? "bg-red-500 text-white"
                : "bg-stone-100 text-stone-500 hover:text-stone-700 hover:bg-stone-200"
            }`}
          >
            全部
          </button>
          {PACKAGE_OPTIONS.map((pkg) => (
            <button
              key={pkg.value}
              onClick={() => onChange({ filterPackage: pkg.value })}
              className={`${btnBase} rounded transition ${
                filterPackage === pkg.value
                  ? "bg-red-500 text-white"
                  : "bg-stone-100 text-stone-500 hover:text-stone-700 hover:bg-stone-200"
            }`}
            >
              {pkg.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── DP (战力) ────────────────────────────────────────── */}
      <div>
        <p className={sectionTitle}>战力 (DP)</p>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={dpMin === "all" ? "" : dpMin}
            onChange={(e) => onChange({ dpMin: parseRangeValue(e.target.value) })}
            placeholder="最小"
            className="w-[60px] bg-white border border-stone-200 rounded text-sm text-stone-700 placeholder-stone-400 px-2 py-1.5 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
          />
          <span className="text-stone-400 text-xs">—</span>
          <input
            type="number"
            value={dpMax === "all" ? "" : dpMax}
            onChange={(e) => onChange({ dpMax: parseRangeValue(e.target.value) })}
            placeholder="最大"
            className="w-[60px] bg-white border border-stone-200 rounded text-sm text-stone-700 placeholder-stone-400 px-2 py-1.5 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
          />
        </div>
      </div>

      {/* ── PP (距离) ────────────────────────────────────────── */}
      <div>
        <p className={sectionTitle}>距离 (PP)</p>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={ppMin === "all" ? "" : ppMin}
            onChange={(e) => onChange({ ppMin: parseRangeValue(e.target.value) })}
            placeholder="最小"
            className="w-[60px] bg-white border border-stone-200 rounded text-sm text-stone-700 placeholder-stone-400 px-2 py-1.5 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
          />
          <span className="text-stone-400 text-xs">—</span>
          <input
            type="number"
            value={ppMax === "all" ? "" : ppMax}
            onChange={(e) => onChange({ ppMax: parseRangeValue(e.target.value) })}
            placeholder="最大"
            className="w-[60px] bg-white border border-stone-200 rounded text-sm text-stone-700 placeholder-stone-400 px-2 py-1.5 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
          />
        </div>
      </div>

      {/* ── Reset ────────────────────────────────────────────── */}
      <button
        onClick={onReset}
        className={`w-full text-xs text-stone-500 hover:text-red-600 py-1.5 border border-stone-200 rounded transition ${compact ? "col-span-2" : ""}`}
      >
        清除筛选
      </button>
    </div>
  );
}
