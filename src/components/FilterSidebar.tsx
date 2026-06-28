/**
 * FilterSidebar — jinteki-style left filter sidebar
 *
 * Vertical layout with color dot buttons, small button groups for type/level/rarity/package.
 * Compact dark theme, used in both CardSearchPage and DeckBuilderPage.
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
}

interface Props {
  db: CardDatabase;
  state: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  resultCount: number;
  /** Compact mode for deckbuilder (narrower sidebar) */
  compact?: boolean;
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

export default function FilterSidebar({ db, state, onChange, onReset, resultCount, compact = false }: Props) {
  const {
    search,
    filterType,
    filterAttr,
    filterRarity,
    filterCost,
    filterPackage,
    sortBy,
  } = state;

  const sectionTitle = compact ? "text-[11px] text-[#667788] font-semibold uppercase tracking-wide mb-1.5" : "text-xs text-[#667788] font-semibold uppercase tracking-wide mb-2";
  const btnBase = compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {/* ── Search box ───────────────────────────────────────── */}
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#445566] pointer-events-none"
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
          className="w-full bg-[#0f1923] border border-[#2a3a50] rounded text-sm text-[#c9cdd4] placeholder-[#445566] pl-8 pr-3 py-2 focus:outline-none focus:border-red-500 transition"
        />
      </div>

      {/* ── Result count ─────────────────────────────────────── */}
      <div className="text-xs text-[#667788] pb-1 border-b border-[#1e2d42]">
        {resultCount} 张结果
      </div>

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
                  ? "bg-red-600 text-white"
                  : "bg-[#1a2535] text-[#8899aa] hover:text-white"
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
              filterAttr === "all" ? "border-white text-white" : "border-transparent text-[#667788] hover:text-[#c9cdd4]"
            } bg-[#445566]`}
            title="全部"
          >
            全
          </button>
          {Object.entries(db.attributes).map(([k, v]) => (
            <button
              key={k}
              onClick={() => onChange({ filterAttr: Number(k) })}
              className={`w-6 h-6 rounded-full border-2 transition ${
                filterAttr === Number(k) ? "border-white scale-110" : "border-transparent hover:scale-105"
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
                  ? "bg-red-600 text-white"
                  : "bg-[#1a2535] text-[#8899aa] hover:text-white"
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
                  ? "bg-red-600 text-white"
                  : "bg-[#1a2535] text-[#8899aa] hover:text-white"
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
                ? "bg-red-600 text-white"
                : "bg-[#1a2535] text-[#8899aa] hover:text-white"
            }`}
          >
            全部
          </button>
          {Object.entries(db.rarities)
            .sort(([, a], [, b]) => {
              const order = (code: string) => (code === "N" ? 0 : code === "R" ? 1 : code === "SR" ? 2 : code === "SSR" ? 3 : code === "UR" ? 4 : code === "MR" ? 5 : 6);
              return order(a.code) - order(b.code);
            })
            .map(([k, v]) => (
              <button
                key={k}
                onClick={() => onChange({ filterRarity: Number(k) })}
                className={`${btnBase} rounded transition border ${
                  filterRarity === Number(k)
                    ? "text-white"
                    : "text-[#8899aa] hover:text-white bg-[#1a2535] border-[#2a3a50]"
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
                ? "bg-red-600 text-white"
                : "bg-[#1a2535] text-[#8899aa] hover:text-white"
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
                  ? "bg-red-600 text-white"
                  : "bg-[#1a2535] text-[#8899aa] hover:text-white"
              }`}
            >
              {pkg.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Reset ────────────────────────────────────────────── */}
      <button
        onClick={onReset}
        className="w-full text-xs text-[#8899aa] hover:text-red-400 py-1.5 border border-[#2a3a50] rounded transition"
      >
        清除筛选
      </button>
    </div>
  );
}
