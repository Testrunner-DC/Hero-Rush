/**
 * WelcomePage — 欢迎页 / 首页 (MSA Light Theme)
 *
 * Hero 区域（含 illustration 占位）+ 功能快捷入口 + 最近更新 + 数据统计
 */

import { useMemo } from "react";
import type { CardDatabase } from "../types/card";

interface WelcomePageProps {
  db: CardDatabase;
  onNavigate: (tab: string) => void;
}

interface FeatureCard {
  tab: string;
  icon: string;
  title: string;
  desc: string;
  color: string;
}

const FEATURES: FeatureCard[] = [
  {
    tab: "search",
    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    title: "卡牌图鉴",
    desc: "浏览全部卡牌，按属性、费用、稀有度筛选",
    color: "#b71c1c",
  },
  {
    tab: "plaza",
    icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1",
    title: "卡组广场",
    desc: "官方预组、社区卡组、卡组码导入",
    color: "#378ADD",
  },
  {
    tab: "deck",
    icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    title: "组卡器",
    desc: "构建你的专属卡组，实时校验合规性",
    color: "#d4a853",
  },
  {
    tab: "battle",
    icon: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    title: "在线对战",
    desc: "P2P 实时对战，与好友切磋",
    color: "#639922",
  },
];

export default function WelcomePage({ db, onNavigate }: WelcomePageProps) {
  const stats = useMemo(() => {
    const attrCount = Object.keys(db.attributes || {}).length;
    const packageCount = new Set(db.cards.map((c) => c.package_short)).size;
    return {
      totalCards: db.total_cards,
      totalVariants: db.total_variants,
      attrCount,
      packageCount,
    };
  }, [db]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-[#fcfaf7]">
      {/* ── Hero Section — illustration as full background ──────── */}
      <section className="relative overflow-hidden">
        {/* Red-to-Gold gradient decoration strip at top */}
        <div className="absolute top-0 left-0 right-0 h-1 msa-gradient-strip z-20" />

        {/* Illustration — full-bleed background filling entire section */}
        <img
          src="/illustration.webp"
          alt=""
          className="absolute inset-0 w-full h-full object-cover z-0"
        />

        {/* Content overlay — logo / text / buttons */}
        <div className="relative z-10 px-6 pt-10 pb-10 max-w-5xl mx-auto text-center">
          {/* Logo */}
          <img
            src="/logo.png"
            alt="斗界竞技场 Logo"
            className="mx-auto mb-6 max-w-[384px] w-full h-auto block drop-shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
          />

          {/* Title */}
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
            斗界竞技场
          </h1>
          <p className="text-white/90 text-lg mb-8 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
            漫威对战卡牌：超英击战 对战网页
          </p>

          {/* CTA buttons */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => onNavigate("search")}
              className="px-7 py-3 rounded-xl bg-gradient-to-r from-msa-500 to-msa-700 text-white font-semibold hover:from-msa-600 hover:to-msa-800 transition shadow-lg"
            >
              浏览卡牌
            </button>
            <button
              onClick={() => onNavigate("deck")}
              className="px-7 py-3 rounded-xl bg-white/90 backdrop-blur-sm text-stone-800 font-semibold hover:bg-white transition border border-white/30 shadow-lg"
            >
              开始组卡
            </button>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ───────────────────────────────────────────── */}
      <section className="border-y border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto px-8 py-3 flex items-center justify-around gap-4">
          <StatItem value={stats.totalCards} label="卡牌种类" />
          <Divider />
          <StatItem value={stats.totalVariants} label="卡牌版本" />
          <Divider />
          <StatItem value={stats.attrCount} label="属性" />
          <Divider />
          <StatItem value={stats.packageCount} label="卡包" />
        </div>
      </section>

      {/* ── Feature Cards ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 py-10">
        <h2 className="text-sm font-bold text-stone-500 uppercase tracking-wide mb-4">功能导航</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FEATURES.map((f) => (
            <button
              key={f.tab}
              onClick={() => onNavigate(f.tab)}
              className="group bg-white rounded-xl border border-stone-200 p-5 text-left hover:shadow-card-hover hover:border-msa-400 transition shadow-card"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition group-hover:scale-110"
                style={{ backgroundColor: `${f.color}18` }}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke={f.color}
                  strokeWidth={1.8}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-stone-800 mb-1 group-hover:text-msa-700 transition">
                {f.title}
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">{f.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ── Quick Tips ──────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 pb-10">
        <h2 className="text-sm font-bold text-stone-500 uppercase tracking-wide mb-4">快速上手</h2>
        <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100 shadow-card">
          <TipRow
            step="1"
            title="浏览卡牌图鉴"
            desc="在「卡牌查询」页面查看所有卡牌，使用筛选器按属性、费用、稀有度快速定位。"
            action="去卡牌查询"
            onAction={() => onNavigate("search")}
          />
          <TipRow
            step="2"
            title="构建你的卡组"
            desc="在「组卡器」中拖拽卡牌构建卡组，系统会实时校验 50 张主卡组 + 9 张冲击卡的合规性。"
            action="打开组卡器"
            onAction={() => onNavigate("deck")}
          />
          <TipRow
            step="3"
            title="探索卡组广场"
            desc="在「卡组广场」查看官方预组、保存的卡组，或通过卡组码导入他人分享的卡组。"
            action="逛卡组广场"
            onAction={() => onNavigate("plaza")}
          />
          <TipRow
            step="4"
            title="开始在线对战"
            desc="在「对战」页面创建房间或加入好友房间，进行实时 P2P 对战。"
            action="进入对战"
            onAction={() => onNavigate("battle")}
          />
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200 bg-white py-6">
        <div className="max-w-5xl mx-auto px-8 text-center">
          <p className="text-xs text-stone-400">
            斗界竞技场 · 漫威对战卡牌：超英击战 · 仅供学习交流使用
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-black text-stone-800">{value}</p>
      <p className="text-xs text-stone-400 mt-0.5">{label}</p>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-8 bg-stone-200" />;
}

function TipRow({
  step,
  title,
  desc,
  action,
  onAction,
}: {
  step: string;
  title: string;
  desc: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-msa-50 border border-msa-300 flex items-center justify-center text-sm font-bold text-msa-700">
        {step}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-stone-800 mb-0.5">{title}</h4>
        <p className="text-xs text-stone-400 leading-relaxed">{desc}</p>
      </div>
      <button
        onClick={onAction}
        className="flex-shrink-0 text-xs text-msa-600 hover:text-msa-500 font-medium whitespace-nowrap transition"
      >
        {action} →
      </button>
    </div>
  );
}
