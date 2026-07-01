/**
 * FilterSidebar — MSA-style left filter sidebar
 *
 * Vertical layout with color dot buttons, small button groups for type/level/rarity/package.
 * Light theme, used in both CardSearchPage and DeckBuilderPage.
 *
 * Supports 战力 and 距离 range filters (P1).
 *
 * When multiSelect=true (DeckBuilder):
 *   - Type section is hidden
 *   - Color / Level / Rarity become multi-select toggle groups
 *   - Section titles show selected counts
 *   - "全选" button clears the selection array (shows all)
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
  powerMin: number | "all";
  powerMax: number | "all";
  distanceMin: number | "all";
  distanceMax: number | "all";
  /** Multi-select: attribute ids (empty = show all). Used when multiSelect=true. */
  selectedAttrs: number[];
  /** Multi-select: rarity ids (empty = show all). Used when multiSelect=true. */
  selectedRarities: number[];
  /** Multi-select: cost values (empty = show all). Used when multiSelect=true. */
  selectedCosts: number[];
}

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  filterType: "all",
  filterAttr: "all",
  filterRarity: "all",
  filterCost: "all",
  filterPackage: "all",
  sortBy: "card_no",
  powerMin: "all",
  powerMax: "all",
  distanceMin: "all",
  distanceMax: "all",
  selectedAttrs: [],
  selectedRarities: [],
  selectedCosts: [],
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
  /** When true, enable multi-select for color/level/rarity filters. Hides type section. */
  multiSelect?: boolean;
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

export default function FilterSidebar({
  db,
  state,
  onChange,
  onReset,
  resultCount,
  compact = false,
  hideSearch = false,
  multiSelect = false,
}: Props) {
  const {
    search,
    filterType,
    filterAttr,
    filterRarity,
    filterCost,
    filterPackage,
    sortBy,
    powerMin,
    powerMax,
    distanceMin,
    distanceMax,
    selectedAttrs,
    selectedRarities,
    selectedCosts,
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

  /** Toggle a value in/out of an array (multi-select helper). */
  const toggleIn = (arr: number[], val: number): number[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

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
        <p className={sectionTitle}>
          颜色{multiSelect && selectedAttrs.length > 0 ? ` (${selectedAttrs.length})` : ""}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {multiSelect ? (
            <>
              <button
                onClick={() => onChange({ selectedAttrs: [] })}
                className={`w-6 h-6 rounded-full border-2 transition flex items-center justify-center text-[10px] font-bold ${
                  selectedAttrs.length === 0
                    ? "border-stone-800 text-stone-800"
                    : "border-transparent text-stone-500 hover:text-stone-700"
                } bg-stone-300`}
                title="全选"
              >
                全
              </button>
              {Object.entries(db.attributes).map(([k, v]) => {
                const isSelected = selectedAttrs.includes(Number(k));
                return (
                  <button
                    key={k}
                    onClick={() => onChange({ selectedAttrs: toggleIn(selectedAttrs, Number(k)) })}
                    className={`w-6 h-6 rounded-full border-2 transition ${
                      isSelected ? "border-stone-800 scale-110" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: v.color }}
                    title={v.name}
                  />
                );
              })}
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* ── Type ─────────────────────────────────────────────── */}
      {/* Hidden when multiSelect is enabled (DeckBuilder mode) */}
      {!multiSelect && (
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
      )}

      {/* ── Level (cost) ─────────────────────────────────────── */}
      <div>
        <p className={sectionTitle}>
          等级{multiSelect && selectedCosts.length > 0 ? ` (${selectedCosts.length})` : ""}
        </p>
        <div className="flex flex-wrap gap-1">
          {multiSelect ? (
            <>
              <button
                onClick={() => onChange({ selectedCosts: [] })}
                className={`${btnBase} rounded transition ${
                  selectedCosts.length === 0
                    ? "bg-red-500 text-white"
                    : "bg-stone-100 text-stone-500 hover:text-stone-700 hover:bg-stone-200"
                }`}
              >
                全选
              </button>
              {([0, 1, 2, 3, 4, 5, 6] as const).map((v) => {
                const isSelected = selectedCosts.includes(v);
                return (
                  <button
                    key={v}
                    onClick={() => onChange({ selectedCosts: toggleIn(selectedCosts, v) })}
                    className={`${btnBase} rounded transition ${
                      isSelected
                        ? "bg-red-500 text-white"
                        : "bg-stone-100 text-stone-500 hover:text-stone-700 hover:bg-stone-200"
                    }`}
                  >
                    Lv{v}
                  </button>
                );
              })}
            </>
          ) : (
            (["all", 0, 1, 2, 3, 4, 5, 6] as const).map((v) => (
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
            ))
          )}
        </div>
      </div>

      {/* ── Rarity ───────────────────────────────────────────── */}
      <div>
        <p className={sectionTitle}>
          稀有度{multiSelect && selectedRarities.length > 0 ? ` (${selectedRarities.length})` : ""}
        </p>
        <div className="flex flex-wrap gap-1">
          {multiSelect ? (
            <>
              <button
                onClick={() => onChange({ selectedRarities: [] })}
                className={`${btnBase} rounded transition ${
                  selectedRarities.length === 0
                    ? "bg-red-500 text-white"
                    : "bg-stone-100 text-stone-500 hover:text-stone-700 hover:bg-stone-200"
                }`}
              >
                全选
              </button>
              {Object.entries(db.rarities)
                .sort(([, a], [, b]) => {
                  const order = (code: string) =>
                    code === "N" ? 0 : code === "R" ? 1 : code === "SR" ? 2 : code === "SSR" ? 3 : code === "UR" ? 4 : code === "MR" ? 5 : 6;
                  return order(a.code) - order(b.code);
                })
                .map(([k, v]) => {
                  const isSelected = selectedRarities.includes(Number(k));
                  return (
                    <button
                      key={k}
                      onClick={() => onChange({ selectedRarities: toggleIn(selectedRarities, Number(k)) })}
                      className={`${btnBase} rounded transition border ${
                        isSelected
                          ? "text-white"
                          : "text-stone-500 hover:text-stone-700 bg-stone-100 border-stone-200"
                      }`}
                      style={
                        isSelected
                          ? { backgroundColor: v.color, borderColor: v.color }
                          : {}
                      }
                      title={v.cn}
                    >
                      {v.code}
                    </button>
                  );
                })}
            </>
          ) : (
            <>
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
            </>
          )}
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

      {/* ── 战力 ────────────────────────────────────────── */}
      <div>
        <p className={sectionTitle}>战力</p>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            step={500}
            value={powerMin === "all" ? "" : powerMin}
            onChange={(e) => onChange({ powerMin: parseRangeValue(e.target.value) })}
            placeholder="最小"
            className="w-[60px] bg-white border border-stone-200 rounded text-sm text-stone-700 placeholder-stone-400 px-2 py-1.5 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
          />
          <span className="text-stone-400 text-xs">—</span>
          <input
            type="number"
            step={500}
            value={powerMax === "all" ? "" : powerMax}
            onChange={(e) => onChange({ powerMax: parseRangeValue(e.target.value) })}
            placeholder="最大"
            className="w-[60px] bg-white border border-stone-200 rounded text-sm text-stone-700 placeholder-stone-400 px-2 py-1.5 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
          />
        </div>
      </div>

      {/* ── 距离 ────────────────────────────────────────── */}
      <div>
        <p className={sectionTitle}>距离</p>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={distanceMin === "all" ? "" : distanceMin}
            onChange={(e) => onChange({ distanceMin: parseRangeValue(e.target.value) })}
            placeholder="最小"
            className="w-[60px] bg-white border border-stone-200 rounded text-sm text-stone-700 placeholder-stone-400 px-2 py-1.5 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
          />
          <span className="text-stone-400 text-xs">—</span>
          <input
            type="number"
            value={distanceMax === "all" ? "" : distanceMax}
            onChange={(e) => onChange({ distanceMax: parseRangeValue(e.target.value) })}
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
