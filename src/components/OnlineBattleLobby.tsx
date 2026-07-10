/**
 * OnlineBattleLobby — 联机对战大厅
 *
 * 自动连接服务器 → 选卡组排队匹配 → 对战中渲染阶段按钮与手牌。
 */

import { useState, useCallback } from "react";
import type { CardDatabase, Card, Deck } from "../types/card";
import { useOnlineBattle } from "../hooks/useOnlineBattle";
import {
  ZONE_LIST, ZONE_LABELS, PHASE_LABELS,
  getRushCardIds, deckEntriesToCardIds,
  getAllFieldCards, canZoneAttack,
  type Zone, type TurnPhase,
} from "../engine";
import SidebarSection from "./battle/SidebarSection";

// ============================================================
// Props
// ============================================================

interface OnlineBattleLobbyProps {
  db: CardDatabase;
  savedDecks: Deck[];
  cardMap: Map<string, Card>;
  onBack: () => void;
}

// ============================================================
// 主组件
// ============================================================

export default function OnlineBattleLobby({ db, savedDecks, cardMap, onBack }: OnlineBattleLobbyProps) {
  const { status, state, playerIdx, isMyTurn, joinQueue, sendAction, disconnect } = useOnlineBattle(db);
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("斗士");

  // ===== 卡组 ID 列表构造 =====
  function getDeckCards(key: string): { mainCards: string[]; rushCards: string[] } | null {
    if (key === "precon_sd01") return {
      mainCards: ["SD01-001-SEC","SD01-001-SEC","SD01-001-SEC","SD01-002-GR","SD01-002-GR","SD01-002-GR","SD01-003-GR","SD01-003-GR","SD01-003-GR","SD01-004-SR","SD01-004-SR","SD01-004-SR","SD01-005-SR","SD01-005-SR","SD01-005-SR","SD01-006-SR","SD01-006-SR","SD01-006-SR","SD01-007-R","SD01-007-R","SD01-007-R","SD01-008-R","SD01-008-R","SD01-008-R","SD01-009-R","SD01-009-R","SD01-009-R","SD01-010-R","SD01-010-R","SD01-010-R","SD01-011-R","SD01-011-R","SD01-011-R","SD01-012-R","SD01-012-R","SD01-012-R","SD01-013-R","SD01-013-R","SD01-013-R","SD01-014-R","SD01-014-R","SD01-014-R","SD01-015-R","SD01-015-R","SD01-015-R","SD01-016-R","SD01-016-R","SD01-016-R","SD01-017-R","SD01-017-R"],
      rushCards: getRushCardIds(db, "SD01"),
    };
    if (key === "precon_sd02") return {
      mainCards: ["SD02-001-SEC","SD02-001-SEC","SD02-001-SEC","SD02-002-GR","SD02-002-GR","SD02-002-GR","SD02-003-GR","SD02-003-GR","SD02-003-GR","SD02-004-SR","SD02-004-SR","SD02-004-SR","SD02-005-SR","SD02-005-SR","SD02-005-SR","SD02-006-SR","SD02-006-SR","SD02-006-SR","SD02-007-R","SD02-007-R","SD02-007-R","SD02-008-R","SD02-008-R","SD02-008-R","SD02-009-R","SD02-009-R","SD02-009-R","SD02-010-R","SD02-010-R","SD02-010-R","SD02-011-R","SD02-011-R","SD02-011-R","SD02-012-R","SD02-012-R","SD02-012-R","SD02-013-R","SD02-013-R","SD02-013-R","SD02-014-R","SD02-014-R","SD02-014-R","SD02-015-R","SD02-015-R","SD02-015-R","SD02-016-R","SD02-016-R","SD02-016-R","SD02-017-R","SD02-017-R"],
      rushCards: getRushCardIds(db, "SD02"),
    };
    if (key.startsWith("saved_")) {
      const idx = parseInt(key.split("_")[1], 10);
      const deck = savedDecks[idx];
      if (!deck) return null;
      return {
        mainCards: deckEntriesToCardIds(deck.main_deck, cardMap),
        rushCards: deckEntriesToCardIds(deck.rush_deck, cardMap),
      };
    }
    return null;
  }

  const handleJoinQueue = useCallback(() => {
    if (!selectedDeck) { alert("请先选择卡组"); return; }
    const deck = getDeckCards(selectedDeck);
    if (!deck) return;
    joinQueue(deck.mainCards, deck.rushCards, playerName);
  }, [selectedDeck, playerName, cardMap, savedDecks, db, joinQueue]);

  const handleLeave = useCallback(() => {
    disconnect();
    onBack();
  }, [disconnect, onBack]);

  // ===== 获取卡牌函数（渲染用） =====
  const getCard = (id: string): Card | undefined => db.cards.find((c) => c.id === id);

  // ===== 联机等待大厅 =====
  if (!state) {
    return (
      <div className="h-full overflow-y-auto scrollbar-thin bg-[#fcfaf7]">
        <div className="max-w-xl mx-auto p-6 space-y-5">
          <div className="flex items-center gap-2">
            <button onClick={handleLeave}
              className="px-3 py-1 rounded-lg bg-stone-100 text-stone-500 text-xs hover:bg-stone-200 transition"
            >← 返回</button>
            <h1 className="text-xl font-bold text-stone-800">🌐 联机对战</h1>
          </div>
          <section className="flex items-center gap-2 text-sm">
            {status.type === "idle" || status.type === "connecting" ? (
              <><span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /><span className="text-stone-500">正在连接服务器…</span></>
            ) : status.type === "connected" ? (
              <><span className="w-2 h-2 rounded-full bg-green-500" /><span className="text-green-600">已连接，准备匹配</span></>
            ) : status.type === "error" ? (
              <><span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-red-500">⚠️ 服务器连接失败，请刷新重试</span></>
            ) : status.type === "queuing" ? (
              <><span className="w-2 h-2 rounded-full bg-green-500" /><span className="text-green-600">等待对手… #{status.position}</span></>
            ) : status.type === "matched" ? (
              <><span className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-blue-600">已匹配！对手 {status.opponentName}</span></>
            ) : null}
          </section>
          <section>
            <h2 className="text-sm font-bold text-stone-700 mb-2">玩家名称</h2>
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm"
              placeholder="输入你的名字"
              disabled={status.type === "queuing" || status.type === "matched"}
            />
          </section>
          <section>
            <h2 className="text-sm font-bold text-stone-700 mb-2">选择卡组</h2>
            <div className="grid grid-cols-2 gap-3">
              {([["precon_sd01","SD01 英雄"],["precon_sd02","SD02 复仇"]] as const).map(([k,label]) => (
                <button key={k} onClick={() => setSelectedDeck(k)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selectedDeck === k ? "bg-red-50 border-msa-500 shadow-sm" : "bg-white border-stone-200 hover:border-msa-300"
                  }`}
                >
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-msa-600 font-medium">预组</span>
                  <p className="text-sm font-bold text-stone-800 mt-1">{label}</p>
                </button>
              ))}
            </div>
          </section>
          {status.type === "queuing" || status.type === "matched" ? (
            <button onClick={disconnect} className="w-full py-3 rounded-lg bg-red-500 text-white font-bold hover:bg-red-400 transition">取消匹配</button>
          ) : (
            <button onClick={handleJoinQueue}
              disabled={!selectedDeck || (status.type !== "connected" && status.type !== "connecting")}
              className="w-full py-3 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition disabled:opacity-40"
            >⚔ 开始匹配</button>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // 对战中
  // ============================================================
  const me = state.players[playerIdx];
  const opponent = state.players[1 - playerIdx];

  const renderMiniCard = (id: string, i: number) => (
    <span key={i} className="inline-block w-8 h-11 rounded border border-white/10 bg-black/30 overflow-hidden" title={getCard(id)?.name ?? id}>
      <img src={`/cards/${id}.png`} alt="" className="w-full h-full object-cover opacity-80"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    </span>
  );

  return (
    <div className="flex h-full gap-0 bg-[#0f1923]">
      {/* 左侧栏 */}
      <div className="w-52 shrink-0 flex flex-col border-r border-white/10 overflow-hidden">
        <SidebarSection label="联机" badge={`P${playerIdx + 1}`}>
          <p className="text-xs text-white/40">
            {status.type === "inGame" ? status.opponentName : "?"} · {isMyTurn ? "🟢你的回合" : "🔴对手回合"}
          </p>
        </SidebarSection>
        <SidebarSection label="手牌" badge={`${me.hand.length}`}>
          <div className="flex flex-wrap gap-0.5">
            {me.hand.slice(0, 9).map((id, i) => renderMiniCard(id, i))}
          </div>
        </SidebarSection>
        <SidebarSection label="场上" badge={`${getAllFieldCards(me).length}`}>
          <div className="text-[11px] text-white/30">
            {ZONE_LIST.map((z) => `${ZONE_LABELS[z]}:${me.field[z].length}`).join(" ")}
          </div>
        </SidebarSection>
        <SidebarSection label="时间线" badge={`${me.timeline.length}/9`}>
          <div className="flex gap-0.5 flex-wrap">
            {me.timeline.map((id, i) => renderMiniCard(id, i))}
            {me.timeline.length === 0 && <span className="text-[11px] text-white/20">无</span>}
          </div>
        </SidebarSection>
        <SidebarSection label="日志" last>
          <div className="text-[11px] text-white/30 leading-tight whitespace-pre-line max-h-32 overflow-y-auto">
            {state.log.slice(-10).join("\n")}
          </div>
        </SidebarSection>
      </div>

      {/* 中央战场 */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* 对手区域 */}
        <div className="h-[35%] bg-gradient-to-b from-black/40 to-transparent border-b border-white/5 p-2 overflow-y-auto">
          <div className="text-[11px] text-red-300/60 mb-1">{status.type === "inGame" ? status.opponentName : "对手"} · 手牌 {opponent.hand.length} 张</div>
          <div className="flex flex-wrap gap-1">
            {opponent.hand.map((_, i) => (
              <span key={i} className="w-8 h-11 rounded border border-white/10 bg-gradient-to-br from-red-900/40 to-purple-900/40" />
            ))}
          </div>
          <div className="text-[11px] text-red-300/40 mt-2">场上</div>
          <div className="flex gap-1 mt-0.5">
            {ZONE_LIST.map((z) => (
              <div key={z} className="flex flex-col items-center">
                <span className="text-[10px] text-white/20">{ZONE_LABELS[z]}</span>
                <div className="flex gap-0.5">
                  {opponent.field[z].map((id, i) => renderMiniCard(id, i * 10 + ZONE_LIST.indexOf(z)))}
                  {opponent.field[z].length === 0 && <span className="w-8 h-11 rounded border border-white/5 bg-black/20" />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 阶段信息栏 */}
        <div className="shrink-0 h-7 flex items-center justify-center bg-gradient-to-r from-transparent via-red-950/50 to-transparent border-y border-red-500/20 text-xs text-white/50 gap-2">
          <span>第{state.turnNumber}回合</span>
          <span className="text-amber-400/80">{PHASE_LABELS[state.turnPhase]}</span>
          <span>{isMyTurn ? "🟢你的回合" : "🔴对手回合"}</span>
          {isMyTurn && state.turnPhase === "ACTION" && (
            <span className="text-green-400/60">号召 {state.remainingSummons}/3</span>
          )}
        </div>

        {/* 我方区域+操作按钮 */}
        <div className="h-[35%] bg-gradient-to-t from-black/40 to-transparent p-2 overflow-y-auto">
          <div className="flex gap-1">
            {ZONE_LIST.map((z) => (
              <div key={z} className="flex flex-col items-center">
                <span className="text-[10px] text-white/20">{ZONE_LABELS[z]}</span>
                <div className="flex gap-0.5">
                  {me.field[z].map((id, i) => renderMiniCard(id, i * 10 + ZONE_LIST.indexOf(z)))}
                  {me.field[z].length === 0 && <span className="w-8 h-11 rounded border border-white/5 bg-black/20" />}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex gap-1 overflow-x-auto">
              {me.hand.map((id, i) => (
                <span key={i} className="shrink-0" title={getCard(id)?.name ?? id}>
                  <img src={`/cards/${id}.png`} alt="" className="w-8 h-11 rounded object-cover border border-white/10"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 底部阶段按钮 */}
        <div className="shrink-0 h-14 bg-black/60 backdrop-blur-sm border-t border-white/10 flex items-center justify-center gap-2 px-4">
          {!isMyTurn && <span className="text-white/30 text-sm">等待对手操作…</span>}

          {isMyTurn && state.turnPhase === "TURN_START" && (
            <button onClick={() => sendAction({ type: "ADVANCE_PHASE", next: "DRAW" })}
              className="px-5 py-2 rounded-lg bg-emerald-600/90 text-white text-sm font-bold hover:bg-emerald-500 transition"
            >→ 抽卡阶段</button>
          )}

          {isMyTurn && state.turnPhase === "DRAW" && (
            <button onClick={() => sendAction({ type: "DRAW_CARDS" })}
              className="px-5 py-2 rounded-lg bg-emerald-600/90 text-white text-sm font-bold hover:bg-emerald-500 transition"
            >📥 抽 2 张 → 行动</button>
          )}

          {isMyTurn && state.turnPhase === "ACTION" && (
            <>
              <button onClick={() => sendAction({ type: "ADVANCE_PHASE", next: "CONFLICT" })}
                className="px-5 py-2 rounded-lg bg-red-700/90 text-white text-sm font-bold hover:bg-red-600 transition"
              >⚔ 冲突阶段</button>
              <button onClick={() => sendAction({ type: "ADVANCE_PHASE", next: "END_PHASE" })}
                className="px-3 py-2 rounded-lg bg-stone-700/80 text-white/70 text-xs hover:bg-stone-600 transition"
              >跳过 → 结束</button>
            </>
          )}

          {isMyTurn && state.turnPhase === "CONFLICT" && (
            <button onClick={() => sendAction({ type: "ADVANCE_PHASE", next: "END_PHASE" })}
              className="px-5 py-2 rounded-lg bg-orange-600/90 text-white text-sm font-bold hover:bg-orange-500 transition"
            >结束冲突 →</button>
          )}

          {isMyTurn && state.turnPhase === "END_PHASE" && !state.isGameOver && (
            <button onClick={() => sendAction({ type: "END_TURN" })}
              className="px-6 py-2 rounded-lg bg-indigo-600/90 text-white text-sm font-bold hover:bg-indigo-500 transition"
            >⏹ 结束回合</button>
          )}

          {state.isGameOver && (
            <div className="text-white font-bold">
              🎉 {state.winner === playerIdx ? "你" : "对手"} 获胜！
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
