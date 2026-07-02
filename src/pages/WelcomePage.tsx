/**
 * WelcomePage — 欢迎页 / 首页 (MSA Light Theme)
 *
 * Hero 区域（含 illustration 占位）+ 数据统计 + 4 个 MSA 风格纵向卡片区域 + Footer
 * Uses useAuth() for auth state and useNavigate() for navigation.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CardDatabase } from "../types/card";
import { useAuth } from "../hooks/useAuth";
import { getLocalDecks } from "../utils/deckCode";

interface WelcomePageProps {
  db: CardDatabase;
}

/** ── 伪数据：赛季排行榜 ──────────────────────────────────────── */

interface RankingEntry {
  rank: number;
  name: string;
  score: number;
  winRate: string;
}

const RANKING_DATA: RankingEntry[] = [
  { rank: 1,  name: "钢铁侠本侠",     score: 1200, winRate: "78%" },
  { rank: 2,  name: "SpiderNoir",     score: 1147, winRate: "72%" },
  { rank: 3,  name: "灭霸响指",       score: 1053, winRate: "69%" },
  { rank: 4,  name: "loklee",         score: 994,  winRate: "65%" },
  { rank: 5,  name: "绯红结界",       score: 972,  winRate: "63%" },
  { rank: 6,  name: "ThorOdinson",    score: 941,  winRate: "61%" },
  { rank: 7,  name: "夜魔降临",       score: 889,  winRate: "58%" },
  { rank: 8,  name: "CaptainM",       score: 854,  winRate: "56%" },
  { rank: 9,  name: "星爵别跑",       score: 827,  winRate: "54%" },
  { rank: 10, name: "BlackWidowXD",   score: 798,  winRate: "52%" },
  { rank: 11, name: "浩克不是绿胖",   score: 765,  winRate: "49%" },
  { rank: 12, name: "冬日战士零号",   score: 731,  winRate: "47%" },
];

/** ── 伪数据：最新动态 ───────────────────────────────────────── */

interface NewsEntry {
  date: string;
  title: string;
  summary: string;
}

const NEWS_DATA: NewsEntry[] = [
  {
    date: "2026-06-28",
    title: "新卡包「混沌之战」即将上线",
    summary:
      "包含全新传奇卡牌「绯红女巫」与「快银」，预计下周更新，敬请关注。",
  },
  {
    date: "2026-06-25",
    title: "赛季排行系统正式开放",
    summary:
      "玩家现在可以在首页查看实时赛季排名，与全国玩家同台竞技。",
  },
  {
    date: "2026-06-20",
    title: "版本 2.4 更新日志：平衡性调整",
    summary:
      "「美国队长」战力上调、「洛基」诡计体系获得新支援卡，详见更新日志。",
  },
  {
    date: "2026-06-15",
    title: "开发者日志：P2P 对战底层重构",
    summary:
      "WebRTC 信令链路已全面升级，延迟降低约 40%，断线重连体验大幅提升。",
  },
  {
    date: "2026-06-10",
    title: "「无限手套」活动即将结束",
    summary:
      "限时活动「无限手套」将于 7 月 1 日截止，请尽快完成挑战领取限定卡背。",
  },
  {
    date: "2026-06-04",
    title: "社区锦标赛 S2 报名开启",
    summary:
      "第二届斗界社区锦标赛现已开放报名，前 32 强将获得实体卡包奖励。",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

export default function WelcomePage({ db }: WelcomePageProps) {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const stats = useMemo(() => {
    // Count completed battles from localStorage battleHistory
    let battlesCompleted: number = 0;
    try {
      const raw = localStorage.getItem("battleHistory");
      if (raw) {
        const history = JSON.parse(raw);
        if (Array.isArray(history)) {
          battlesCompleted = history.filter(
            (entry: unknown) =>
              typeof entry === "object" &&
              entry !== null &&
              (entry as Record<string, unknown>).status === "completed"
          ).length;
        }
      }
    } catch {
      battlesCompleted = 0;
    }

    // Count saved public decks
    const publicDecks: number = getLocalDecks().length;

    // Online players — placeholder for WebSocket integration
    const onlinePlayers: string = "...";

    return { battlesCompleted, publicDecks, onlinePlayers };
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

          {/* Auth CTA */}
          {isAuthenticated && user ? (
            <p className="text-white/95 text-lg font-medium drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
              欢迎回来，{user.nickname}！
            </p>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => navigate("/login")}
                className="px-6 py-2.5 rounded-lg bg-[#b71c1c] text-white text-sm font-bold hover:bg-[#8b0000] transition shadow-lg"
              >
                注册 / 登录
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Stats Bar ───────────────────────────────────────────── */}
      <section className="border-y border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto px-8 py-3 flex items-center justify-around gap-4">
          <StatItem value={stats.battlesCompleted} label="已进行对局" />
          <Divider />
          <StatItem value={stats.publicDecks} label="公开卡组" />
          <Divider />
          <StatItem value={stats.onlinePlayers} label="在线玩家" />
        </div>
      </section>

      {/* ── 区域 1：赛季排行 ────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 py-10">
        <SeasonRankingCard data={RANKING_DATA} />
      </section>

      {/* ── 区域 2：最新动态 ────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 py-10">
        <DevUpdatesCard data={NEWS_DATA} navigate={navigate} />
      </section>

      {/* ── 区域 3：卡牌图鉴 ────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 py-10">
        <CardGallery db={db} navigate={navigate} />
      </section>

      {/* ── 区域 4：关于斗界竞技场 ──────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 py-10">
        <AboutArena navigate={navigate} />
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

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

/** ── StatItem ────────────────────────────────────────────────── */

function StatItem({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-black text-stone-800">{value}</p>
      <p className="text-xs text-stone-400 mt-0.5">{label}</p>
    </div>
  );
}

/** ── Divider ─────────────────────────────────────────────────── */

function Divider() {
  return <div className="w-px h-8 bg-stone-200" />;
}

/** ── SeasonRankingCard — 区域 1：赛季排行 ───────────────────── */

/** Available tabs inside the season ranking card. */
type SeasonTab = "ranking" | "ongoing" | "completed";

/**
 * Return a rank-appropriate colour:
 *   rank 1 → gold, rank 2 → silver, rank 3 → bronze, others → warm grey.
 */
function getRankColor(rank: number): string {
  if (rank === 1) return "#e8c868"; // gold
  if (rank === 2) return "#c0c0c0"; // silver
  if (rank === 3) return "#cd7f32"; // bronze
  return "#a8a29e"; // stone-400
}

function SeasonRankingCard({ data }: { data: RankingEntry[] }) {
  const [activeTab, setActiveTab] = useState<SeasonTab>("ranking");

  const tabs: { key: SeasonTab; label: string }[] = [
    { key: "ranking", label: "赛季排名" },
    { key: "ongoing", label: "进行中对局" },
    { key: "completed", label: "已完成对局" },
  ];

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-card p-5">
      {/* ── Header: title + season name ── */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-black text-stone-800">赛季排行</h2>
        <span className="text-sm text-stone-400">幻影咏叹 .2</span>
      </div>

      {/* ── Tab pills ── */}
      <div className="flex gap-2 mb-5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={
              "px-4 py-1.5 text-sm font-medium rounded-full transition " +
              (activeTab === tab.key
                ? "bg-msa-600 text-white"
                : "text-stone-400 hover:text-stone-600")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === "ranking" && (
        <div className="max-h-[480px] overflow-y-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-stone-400 uppercase tracking-wide border-b border-stone-100">
                <th className="text-left pb-2 font-medium">排名</th>
                <th className="text-left pb-2 font-medium">玩家</th>
                <th className="text-right pb-2 font-medium">积分</th>
                <th className="text-right pb-2 font-medium">胜率</th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry) => {
                const rankColor = getRankColor(entry.rank);
                return (
                  <tr
                    key={entry.rank}
                    className="border-b border-stone-50 last:border-0"
                  >
                    {/* Rank */}
                    <td className="py-2.5">
                      <span
                        className="inline-flex items-center justify-center w-8 h-6 text-xs font-bold"
                        style={{ color: rankColor }}
                      >
                        {String(entry.rank).padStart(2, "0")}
                      </span>
                    </td>

                    {/* Player name */}
                    <td className="py-2.5 font-medium text-stone-800">
                      {entry.name}
                    </td>

                    {/* Score */}
                    <td className="py-2.5 text-right text-stone-600 tabular-nums">
                      {entry.score.toLocaleString()}
                    </td>

                    {/* Win rate */}
                    <td className="py-2.5 text-right text-stone-500 tabular-nums">
                      {entry.winRate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "ongoing" && (
        <div className="py-12 text-center text-sm text-stone-400">
          暂无进行中的对局
        </div>
      )}

      {activeTab === "completed" && (
        <div className="py-12 text-center text-sm text-stone-400">
          暂无已完成的对局
        </div>
      )}

      {/* ── Season countdown ── */}
      <div className="mt-5 pt-4 border-t border-stone-100 flex items-center gap-2">
        <span className="text-xs text-stone-400">赛季剩余</span>
        <span className="text-sm font-bold text-msa-600 tabular-nums">
          14 天 06:32:15
        </span>
      </div>
    </div>
  );
}

/** ── DevUpdatesCard — 区域 2：最新动态 ──────────────────────── */

function DevUpdatesCard({
  data,
  navigate,
}: {
  data: NewsEntry[];
  navigate: ReturnType<typeof useNavigate>;
}) {
  /** Format ISO date string into a short Chinese-style label. */
  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-card p-5">
      {/* ── Header: title + view all ── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-black text-stone-800">最新动态</h2>
        <button
          onClick={() => navigate("/plaza")}
          className="text-xs text-msa-600 hover:text-msa-500 font-medium transition"
        >
          查看全部 →
        </button>
      </div>

      {/* ── News list ── */}
      <ul className="divide-y divide-stone-100">
        {data.map((entry, idx) => (
          <li key={idx} className="py-3 first:pt-0 last:pb-0">
            {/* Date */}
            <p className="text-xs text-stone-400 mb-1">
              {formatDate(entry.date)}
            </p>

            {/* Title — clickable MSA red link */}
            <button
              onClick={() => navigate("/plaza")}
              className="text-sm font-bold text-msa-600 hover:text-msa-500 transition text-left"
            >
              {entry.title}
            </button>

            {/* Summary */}
            <p className="text-xs text-stone-500 leading-relaxed mt-1">
              {entry.summary}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** ── CardGallery — 区域 3：卡牌图鉴 ─────────────────────────── */

function CardGallery({
  db,
  navigate,
}: {
  db: CardDatabase;
  navigate: ReturnType<typeof useNavigate>;
}) {
  /** Pick up to 6 cards that have distinct card_no (unique game cards). */
  const displayCards = useMemo(() => {
    const seen = new Set<string>();
    const result: typeof db.cards = [];
    for (const card of db.cards) {
      if (seen.has(card.card_no)) continue;
      seen.add(card.card_no);
      result.push(card);
      if (result.length >= 6) break;
    }
    return result;
  }, [db]);

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-card p-5">
      {/* ── Header ── */}
      <h2 className="text-lg font-black text-stone-800 mb-5">卡牌图鉴</h2>

      {/* ── Card grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {displayCards.map((card) => (
          <div key={card.id} className="flex flex-col items-center">
            <img
              src={`/cards/${card.id}.png`}
              alt={card.name}
              className="w-full rounded-lg shadow-md object-contain bg-stone-50"
              loading="lazy"
            />
            <p className="mt-2 text-xs text-stone-600 text-center leading-tight">
              {card.name}
            </p>
          </div>
        ))}
      </div>

      {/* ── Browse all button ── */}
      <div className="mt-6 pt-4 border-t border-stone-100 text-center">
        <button
          onClick={() => navigate("/builder")}
          className="text-sm font-medium text-msa-600 hover:text-msa-500 transition"
        >
          浏览全部卡牌 →
        </button>
      </div>
    </div>
  );
}

/** ── AboutArena — 区域 4：关于斗界竞技场 ───────────────────── */

function AboutArena({
  navigate,
}: {
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-card p-5">
      {/* ── Header ── */}
      <h2 className="text-lg font-black text-stone-800 mb-4">
        关于斗界竞技场
      </h2>

      {/* ── Intro text ── */}
      <div className="text-sm text-stone-600 leading-relaxed space-y-3 mb-6">
        <p>
          斗界竞技场是一个免费的漫威对战卡牌（超英击战）在线对战平台。
        </p>
        <p>
          在这里你可以浏览全部卡牌、组建自己的专属卡组、与全国玩家实时对战。
        </p>
        <p>
          平台持续更新最新卡包与赛季内容，欢迎加入斗界社区。
        </p>
      </div>

      {/* ── Quick links ── */}
      <div className="pt-4 border-t border-stone-100 flex gap-6">
        <button
          onClick={() => navigate("/builder")}
          className="text-sm font-medium text-msa-600 hover:text-msa-500 transition"
        >
          卡牌数据库 →
        </button>
        <button
          onClick={() => navigate("/builder")}
          className="text-sm font-medium text-msa-600 hover:text-msa-500 transition"
        >
          组卡器 →
        </button>
      </div>
    </div>
  );
}
