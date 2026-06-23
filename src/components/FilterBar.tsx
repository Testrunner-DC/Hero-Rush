import type { CardDatabase } from "../types/card";

interface Props {
  db: CardDatabase;
  search: string;
  setSearch: (v: string) => void;
  filterType: number | "all";
  setFilterType: (v: number | "all") => void;
  filterAttr: number | "all";
  setFilterAttr: (v: number | "all") => void;
  filterRarity: number | "all";
  setFilterRarity: (v: number | "all") => void;
  filterCost: number | "all";
  setFilterCost: (v: number | "all") => void;
  filterPackage: string | "all";
  setFilterPackage: (v: string | "all") => void;
  sortBy: "card_no" | "cost" | "power" | "name";
  setSortBy: (v: "card_no" | "cost" | "power" | "name") => void;
  resultCount: number;
}

export default function FilterBar(props: Props) {
  const {
    db,
    search,
    setSearch,
    filterType,
    setFilterType,
    filterAttr,
    setFilterAttr,
    filterRarity,
    setFilterRarity,
    filterCost,
    setFilterCost,
    filterPackage,
    setFilterPackage,
    sortBy,
    setSortBy,
    resultCount,
  } = props;

  const selectClass =
    "px-2.5 py-1.5 text-sm rounded-lg border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent cursor-pointer hover:border-stone-300 transition";

  const labelClass = "text-xs text-stone-500 font-medium mb-1 block";

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      {/* Search row */}
      <div className="flex gap-3 items-center">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索卡名、编号、效果..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-500">{resultCount} 张</span>
          <button
            onClick={() => {
              setSearch("");
              setFilterType("all");
              setFilterAttr("all");
              setFilterRarity("all");
              setFilterCost("all");
              setFilterPackage("all");
              setSortBy("card_no");
            }}
            className="text-xs text-stone-400 hover:text-red-500 transition px-2 py-1"
          >
            重置
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <div>
          <label className={labelClass}>类型</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value === "all" ? "all" : Number(e.target.value))} className={selectClass + " w-full"}>
            <option value="all">全部</option>
            <option value={1}>角色卡</option>
            <option value={2}>冲击卡</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>颜色</label>
          <select value={filterAttr} onChange={(e) => setFilterAttr(e.target.value === "all" ? "all" : Number(e.target.value))} className={selectClass + " w-full"}>
            <option value="all">全部</option>
            {Object.entries(db.attributes).map(([k, v]) => (
              <option key={k} value={Number(k)}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>稀有度</label>
          <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value === "all" ? "all" : Number(e.target.value))} className={selectClass + " w-full"}>
            <option value="all">全部</option>
            {Object.entries(db.rarities)
              .sort(([, a], [, b]) => Number(a.code === "N" ? 0 : 1) - Number(b.code === "N" ? 0 : 1))
              .map(([k, v]) => (
                <option key={k} value={Number(k)}>
                  {v.cn} ({v.code})
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>等级</label>
          <select value={filterCost} onChange={(e) => setFilterCost(e.target.value === "all" ? "all" : Number(e.target.value))} className={selectClass + " w-full"}>
            <option value="all">全部</option>
            {[0, 1, 2, 3, 4, 5, 6].map((c) => (
              <option key={c} value={c}>
                Lv{c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>系列</label>
          <select value={filterPackage} onChange={(e) => setFilterPackage(e.target.value)} className={selectClass + " w-full"}>
            <option value="all">全部</option>
            <option value="BP01">BP01 基础包</option>
            <option value="SD01">SD01 英雄</option>
            <option value="SD02">SD02 复仇</option>
            <option value="SD03">SD03 集结</option>
            <option value="SD04">SD04 时空</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>排序</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className={selectClass + " w-full"}>
            <option value="card_no">按编号</option>
            <option value="cost">按等级</option>
            <option value="power">按战力</option>
            <option value="name">按名称</option>
          </select>
        </div>
      </div>
    </div>
  );
}
