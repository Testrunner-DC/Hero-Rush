/**
 * OnlineBattleLobby — 联机对战大厅
 *
 * 自动连接服务器（根据页面域名推导 WebSocket 地址），选卡组→排队匹配→开始对战。
 */

import { useState, useCallback } from "react";
import type { CardDatabase, Card, Deck } from "../types/card";
import { useOnlineBattle } from "../hooks/useOnlineBattle";
import {
  ZONE_LABELS, PHASE_LABELS,
  getRushCardIds, deckEntriesToCardIds,
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
  const { status, state, playerIdx, isMyTurn, joinQueue, disconnect } = useOnlineBattle(db);
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

          {/* 连接状态 */}
          <section className="flex items-center gap-2 text-sm">
            {status.type === "idle" || status.type === "connecting" ? (
              <><span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /><span className="text-stone-500">正在连接服务器…</span></>
            ) : status.type === "connected" ? (
              <><span className="w-2 h-2 rounded-full bg-green-500" /><span className="text-green-600">已连接，准备匹配</span></>
            ) : status.type === "error" ? (
              <><span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-red-500">⚠️ 服务器连接失败，请刷新重试</span></>
            ) : status.type === "queuing" ? (
              <><span className="w-2 h-2 rounded-full bg-green-500" /><span className="text-green-600">等待对手… 队列位置 #{status.position}</span></>
            ) : status.type === "matched" ? (
              <><span className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-blue-600">已匹配！对手 {status.opponentName}，准备开战</span></>
            ) : null}
          </section>

          {/* 玩家名称 */}
          <section>
            <h2 className="text-sm font-bold text-stone-700 mb-2">玩家名称</h2>
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm"
              placeholder="输入你的名字"
              disabled={status.type === "queuing" || status.type === "matched"}
            />
          </section>

          {/* 卡组选择 */}
          <section>
            <h2 className="text-sm font-bold text-stone-700 mb-2">选择卡组</h2>
            <div className="grid grid-cols-2 gap-3">
              {([["precon_sd01","SD01 英雄"],["precon_sd02","SD02 复仇"]] as const).map(([k,label]) => (
                <button key={k} onClick={() => setSelectedDeck(k)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selectedDeck === k
                      ? "bg-red-50 border-msa-500 shadow-sm"
                      : "bg-white border-stone-200 hover:border-msa-300"
                  }`}
                >
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-msa-600 font-medium">预组</span>
                  <p className="text-sm font-bold text-stone-800 mt-1">{label}</p>
                </button>
              ))}
            </div>
          </section>

          {/* 匹配按钮 */}
          {status.type === "queuing" || status.type === "matched" ? (
            <button onClick={disconnect}
              className="w-full py-3 rounded-lg bg-red-500 text-white font-bold hover:bg-red-400 transition"
            >取消匹配</button>
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

  // ===== 对战中 =====
  return (
    <div className="flex h-full gap-0 bg-[#0f1923]">
      <div className="w-52 shrink-0 flex flex-col border-r border-white/10 overflow-hidden">
        <SidebarSection label="联机" badge={`P${playerIdx + 1}`}>
          <p className="text-xs text-white/40">
            对手: {status.type === "inGame" ? status.opponentName : "?"} · {isMyTurn ? "你的回合" : "对手回合"}
          </p>
        </SidebarSection>
        <SidebarSection label="时间线" badge={`${state.players[playerIdx].timeline.length}/9`}>
          <div className="text-[11px] text-white/30 my-1">你: {state.players[playerIdx].timeline.length}</div>
        </SidebarSection>
      </div>
      <div className="flex-1 flex items-center justify-center text-white/20 border-t border-white/10">
        <p>等待对手操作…</p>
      </div>
    </div>
  );
}
