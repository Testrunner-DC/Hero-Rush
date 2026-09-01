import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { type BattleViewV2, type GameEventV2 } from "@hero-rush/game-core";

function lastWinEvent(events: readonly unknown[]): Extract<GameEventV2, { type: "GAME_WON" }> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event && typeof event === "object" && (event as { type?: unknown }).type === "GAME_WON") return event as Extract<GameEventV2, { type: "GAME_WON" }>;
  }
  return null;
}

export default function GameResultOverlayV2({ view, events, omniscient }: { view: BattleViewV2; events: readonly unknown[]; omniscient: boolean }) {
  const navigate = useNavigate();
  const [minimized, setMinimized] = useState(false);
  if (view.status !== "finished" || view.winner === null) return null;

  const winner = view.winner;
  const loser = winner === 0 ? 1 : 0;
  const winnerScore = view.players[winner].timeline.length;
  const loserScore = view.players[loser].timeline.length;
  const outcome = omniscient ? "对局结束" : winner === view.viewer ? "胜利" : "战败";
  const resultEvent = lastWinEvent(events);
  const reason = resultEvent?.reason === "deck_empty"
    ? `${view.players[loser].name}的主卡组耗尽`
    : winnerScore >= 9 || resultEvent?.reason === "timeline"
      ? `${view.players[winner].name}获得 9 张冲击卡`
      : "权威规则已完成胜负结算";

  if (minimized) {
    return createPortal(
      <button type="button" onClick={() => setMinimized(false)} className="fixed right-5 top-5 z-[150] rounded-full border border-amber-300/65 bg-stone-950 px-4 py-2 text-xs font-black text-amber-100 shadow-2xl" data-ui-contract="hero-rush-v2-restore-result">查看胜负结果</button>,
      document.body,
    );
  }

  return createPortal(
    <div className="hero-game-result fixed inset-0 z-[150] grid place-items-center overflow-auto bg-[radial-gradient(circle_at_center,rgba(183,28,28,.34),rgba(12,10,9,.94)_58%)] p-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="对局结果" data-ui-contract="hero-rush-v2-game-result">
      <section className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-amber-300/45 bg-stone-950/95 px-8 py-9 text-center text-white shadow-[0_28px_90px_rgba(0,0,0,.62)]">
        <div className="hero-game-result-burst pointer-events-none absolute inset-0 opacity-45" />
        <div className="relative">
          <p className="text-[10px] font-black tracking-[.5em] text-amber-300">HERO RUSH · 对局结算</p>
          <h1 className={`mt-3 text-6xl font-black tracking-[.12em] ${outcome === "战败" ? "text-blue-200" : "text-amber-100"}`}>{outcome}</h1>
          <p className="mt-4 text-lg font-bold text-white">{view.players[winner].name} 获得胜利</p>
          <p className="mt-1 text-sm text-white/60">{reason}</p>

          <div className="mx-auto mt-7 flex max-w-sm items-center justify-center gap-5 rounded-2xl border border-white/10 bg-white/[.055] px-5 py-4">
            <div className="min-w-0 flex-1 text-right"><strong className="block truncate text-sm text-red-200">{view.players[winner].name}</strong><span className="font-mono text-3xl font-black text-amber-300">{winnerScore}</span></div>
            <span className="text-xs font-bold tracking-[.18em] text-white/35">冲击卡</span>
            <div className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm text-blue-200">{view.players[loser].name}</strong><span className="font-mono text-3xl font-black text-white/70">{loserScore}</span></div>
          </div>

          <div className="mx-auto mt-5 grid max-w-sm grid-cols-9 gap-1.5" aria-label={`${winnerScore} 张冲击卡`}>
            {Array.from({ length: 9 }, (_, index) => <span key={index} className={`h-2 rounded-full ${index < winnerScore ? "bg-gradient-to-r from-red-500 to-amber-300 shadow-[0_0_10px_rgba(252,211,77,.62)]" : "bg-white/10"}`} />)}
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setMinimized(true)} className="rounded-xl border border-white/15 bg-white/[.06] px-5 py-3 text-sm font-bold text-white/75 transition hover:bg-white/10">查看最终场面</button>
            <button type="button" onClick={() => navigate("/battle")} className="rounded-xl bg-gradient-to-r from-red-700 to-red-600 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:brightness-110">返回对战大厅</button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
