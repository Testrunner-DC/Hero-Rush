/**
 * WelcomePage — 欢迎页 / 首页
 *
 * Hero 区域 + 功能快捷入口 + 最近更新 + 数据统计
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
    color: "#ef4444",
  },
  {
    tab: "plaza",
    icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1",
    title: "卡组广场",
    desc: "官方预组、社区卡组、卡组码导入",
    color: "#3b82f6",
  },
  {
    tab: "deck",
    icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    title: "组卡器",
    desc: "构建你的专属卡组，实时校验合规性",
    color: "#f59e0b",
  },
  {
    tab: "battle",
    icon: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    title: "在线对战",
    desc: "P2P 实时对战，与好友切磋",
    color: "#10b981",
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
    <div className="h-full overflow-y-auto scrollbar-thin bg-[#0f1923]">
      {/* ── Hero Section ────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background gradient + pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a0a0a] via-[#0f1923] to-[#0a0f1a]" />
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, #ef4444 0%, transparent 50%), radial-gradient(circle at 80% 80%, #3b82f6 0%, transparent 50%)",
          }}
        />

        <div className="relative px-8 py-16 max-w-5xl mx-auto text-center">
          {/* Logo / Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-600/20 border border-red-500/30 mb-6">
            <span className="text-3xl">⚡</span>
          </div>

          <h1 className="text-4xl font-black text-white mb-3 tracking-tight">
            超英击战 <span className="text-red-500">TCG</span>
          </h1>
          <p className="text-lg text-[#8899aa] mb-8 max-w-2xl mx-auto">
            漫威超级英雄集换式卡牌游戏 — 卡牌图鉴、智能组卡、在线对战，一站式平台
          </p>

          {/* CTA buttons */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => onNavigate("search")}
              className="px-6 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-500 transition shadow-lg shadow-red-900/30"
            >
              浏览卡牌
            </button>
            <button
              onClick={() => onNavigate("deck")}
              className="px-6 py-3 rounded-xl bg-[#1a2535] text-[#c9cdd4] font-medium hover:bg-[#243349] transition border border-[#2a3a50]"
            >
              开始组卡
            </button>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ───────────────────────────────────────────── */}
      <section className="border-y border-[#1e2d42] bg-[#0a1120]">
        <div className="max-w-5xl mx-auto px-8 py-5 flex items-center justify-around gap-4">
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
        <h2 className="text-sm font-bold text-[#667788] uppercase tracking-wide mb-4">功能导航</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FEATURES.map((f) => (
            <button
              key={f.tab}
              onClick={() => onNavigate(f.tab)}
              className="group bg-[#131f2e] rounded-xl border border-[#1e2d42] p-5 text-left hover:border-[#2a3a50] hover:bg-[#1a2535] transition"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition group-hover:scale-110"
                style={{ backgroundColor: `${f.color}20` }}
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
              <h3 className="text-sm font-bold text-[#e8eaed] mb-1 group-hover:text-white transition">
                {f.title}
              </h3>
              <p className="text-xs text-[#667788] leading-relaxed">{f.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ── Quick Tips ──────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 pb-10">
        <h2 className="text-sm font-bold text-[#667788] uppercase tracking-wide mb-4">快速上手</h2>
        <div className="bg-[#131f2e] rounded-xl border border-[#1e2d42] divide-y divide-[#1e2d42]">
          <TipRow
            step="1"
            title="浏览卡牌图鉴"
            desc="在「卡牌」页面查看所有卡牌，使用筛选器按属性、费用、稀有度快速定位。"
            action="去卡牌图鉴"
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
      <footer className="border-t border-[#1e2d42] bg-[#0a1120] py-6">
        <div className="max-w-5xl mx-auto px-8 text-center">
          <p className="text-xs text-[#445566]">
            超英击战 TCG · 卡牌图鉴 & 组卡工具 · 仅供学习交流使用
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
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-xs text-[#667788] mt-0.5">{label}</p>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-8 bg-[#1e2d42]" />;
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
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center text-sm font-bold text-red-400">
        {step}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-[#e8eaed] mb-0.5">{title}</h4>
        <p className="text-xs text-[#667788] leading-relaxed">{desc}</p>
      </div>
      <button
        onClick={onAction}
        className="flex-shrink-0 text-xs text-red-400 hover:text-red-300 font-medium whitespace-nowrap transition"
      >
        {action} →
      </button>
    </div>
  );
}
