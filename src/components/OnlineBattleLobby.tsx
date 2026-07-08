/**
 * OnlineBattleLobby — 联机对战大厅
 *
 * 连接服务器 → 排队匹配 → 配对成功 → 游戏开始（复用 PlayerArea 渲染战场）
 *
 * 【所有权】本文件归 UI 负责人，但联机逻辑入口由 engine 负责人共管。
 * 改动 useOnlineBattle 的行为前请知会引擎负责人。
 */

import { useState, useCallback } from "react";
import type { CardDatabase, Card, Deck } from "../types/card";
import {
  useOnlineBattle,
  type OnlineStatus,
} from "../hooks/useOnlineBattle";
import {
  ZONE_LIST,
  ZONE_LABELS,
  PHASE_LABELS,
  canZoneAttack,
  getRushCardIds,
  deckEntriesToCardIds,
  type Zone,
  type TurnPhase,
} from "../engine";
import PlayerArea from "./battle/PlayerArea";
import SidebarSection from "./battle/SidebarSection";
import StatRow from "./battle/StatRow";
import CardDetailPanel from "./battle/CardDetailPanel";
import type { ActionMode } from "./battle/constants";

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

export default function OnlineBattleLobby({ db, savedDecks, cardMap }: OnlineBattleLobbyProps) {
  const {
    status,
    state,
    dispatch,
    playerIdx,
    isMyTurn,
    connect,
    joinQueue,
    sendAction,
    disconnect,
  } = useOnlineBattle(db);

  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("玩家");
  const [serverUrl, setServerUrl] = useState("ws://localhost:8081");
  const [actionMode, setActionMode] = useState<ActionMode>({ type: "none" });
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ===== 连接与匹配 =====
  const handleConnect = useCallback(() => {
    connect(serverUrl);
  }, [connect, serverUrl]);

  const handleJoinQueue = useCallback(() => {
    if (!selectedDeck) { alert("请先选择卡组"); return; }
    const deck = getDeckCards(selectedDeck);
    if (!deck) return;
    joinQueue(deck.mainCards, deck.rushCards, playerName);
  }, [selectedDeck, playerName, cardMap, savedDecks, db]);

  const handleCancel = useCallback(() => {
    disconnect();
  }, [disconnect]);

  // ===== 从选择和 cardMap 构造卡组 ID 列表 =====
  function getDeckCards(key: string): { mainCards: string[]; rushCards: string[] } | null {
    if (key === "precon_sd01") {
      return {
        mainCards: ["SD01-001-SEC","SD01-001-SEC","SD01-001-SEC","SD01-002-GR","SD01-002-GR","SD01-002-GR","SD01-003-GR","SD01-003-GR","SD01-003-GR","SD01-004-SR","SD01-004-SR","SD01-004-SR","SD01-005-SR","SD01-005-SR","SD01-005-SR","SD01-006-SR","SD01-006-SR","SD01-006-SR","SD01-007-R","SD01-007-R","SD01-007-R","SD01-008-R","SD01-008-R","SD01-008-R","SD01-009-R","SD01-009-R","SD01-009-R","SD01-010-R","SD01-010-R","SD01-010-R","SD01-011-R","SD01-011-R","SD01-011-R","SD01-012-R","SD01-012-R","SD01-012-R","SD01-013-R","SD01-013-R","SD01-013-R","SD01-014-R","SD01-014-R","SD01-014-R","SD01-015-R","SD01-015-R","SD01-015-R","SD01-016-R","SD01-016-R","SD01-016-R","SD01-017-R","SD01-017-R"],
        rushCards: getRushCardIds(db, "SD01"),
      };
    }
    if (key === "precon_sd02") {
      return {
        mainCards: ["SD02-001-SEC","SD02-001-SEC","SD02-001-SEC","SD02-002-GR","SD02-002-GR","SD02-002-GR","SD02-003-GR","SD02-003-GR","SD02-003-GR","SD02-004-SR","SD02-004-SR","SD02-004-SR","SD02-005-SR","SD02-005-SR","SD02-005-SR","SD02-006-SR","SD02-006-SR","SD02-006-SR","SD02-007-R","SD02-007-R","SD02-007-R","SD02-008-R","SD02-008-R","SD02-008-R","SD02-009-R","SD02-009-R","SD02-009-R","SD02-010-R","SD02-010-R","SD02-010-R","SD02-011-R","SD02-011-R","SD02-011-R","SD02-012-R","SD02-012-R","SD02-012-R","SD02-013-R","SD02-013-R","SD02-013-R","SD02-014-R","SD02-014-R","SD02-014-R","SD02-015-R","SD02-015-R","SD02-015-R","SD02-016-R","SD02-016-R","SD02-016-R","SD02-017-R","SD02-017-R"],
        rushCards: getRushCardIds(db, "SD02"),
      };
    }
    if (key.startsWith("saved_")) {
      const idx = parseInt(key.split("_")[1], 10);
      const deck = savedDecks[idx];
      if (!deck) return null;
      const mainCards = deckEntriesToCardIds(deck.main_deck, cardMap);
      const rushCards = deckEntriesToCardIds(deck.rush_deck, cardMap);
      return { mainCards, rushCards: rushCards.length > 0 ? rushCards : getRushCardIds(db, "SD01") };
    }
    return null;
  }

  // ===== 对战事件处理 =====
  const combinedActions = {
    advancePhase: (next: TurnPhase) => { sendAction({ type: "ADVANCE_PHASE", next }); setActionMode({ type: "none" }); },
    endTurn: () => { sendAction({ type: "END_TURN" }); setActionMode({ type: "none" }); },
    drawCards: () => sendAction({ type: "DRAW_CARDS" }),
    endConflict: () => { sendAction({ type: "ADVANCE_PHASE", next: "END_PHASE" }); setActionMode({ type: "none" }); },
    deployToBase: (playerIdx: number, handIndex: number) => { sendAction({ type: "DEPLOY_TO_BASE", playerIdx, handIndex }); setActionMode({ type: "none" }); },
    summonToField: (playerIdx: number, handIndex: number, zone: Zone | "base") => { sendAction({ type: "SUMMON_TO_FIELD", playerIdx, handIndex, zone }); setActionMode({ type: "none" }); },
    moveCharacter: (playerIdx: number, fromZone: Zone, cardId: string, toZone: Zone) => { sendAction({ type: "MOVE_CHARACTER", playerIdx, fromZone, cardId, toZone }); setActionMode({ type: "none" }); },
    moveCard: (playerIdx: number, fromLoc: Zone | "base", cardId: string, toLoc: Zone | "base") => { sendAction({ type: "MOVE_CARD", playerIdx, fromLoc, cardId, toLoc }); setActionMode({ type: "none" }); },
    setAttackZone: (zone: Zone) => sendAction({ type: "SET_ATTACK_ZONE", zone }),
    startAttack: (playerIdx: number, zone: Zone, cardId: string) => sendAction({ type: "START_ATTACK", playerIdx, zone, cardId }),
    confirmAttack: (ti: number, tz: Zone, tc?: string) => sendAction({ type: "CONFIRM_ATTACK", targetPlayerIdx: ti, targetZone: tz, targetCardId: tc }),
    skipZone: (zone: Zone) => sendAction({ type: "SKIP_ZONE", zone }),
    startAttackSubPhase: () => sendAction({ type: "START_ATTACK_SUBPHASE" }),
    clearAttackTarget: () => sendAction({ type: "CLEAR_ATTACK_TARGET" }),
    canAttackZone: (zone: Zone) => state ? canZoneAttack(state, zone) : false,
    selectRetreat: (cardId: string, loc: Zone | "base") => sendAction({ type: "SELECT_RETREAT", cardId, loc }),
    cancelSummon: () => sendAction({ type: "CANCEL_SUMMON" }),
    passCounter: (playerIdx: number) => sendAction({ type: "PASS_COUNTER", playerIdx }),
    activateEffect: (playerIdx: number, cardId: string, effectId: string) => sendAction({ type: "ACTIVATE_EFFECT", playerIdx, cardId, effectId }),
    selectTargets: (playerIdx: number, targetCardIds: string[]) => sendAction({ type: "SELECT_TARGETS", playerIdx, targetCardIds }),
    cancelTargetSelection: (playerIdx: number) => sendAction({ type: "CANCEL_TARGET_SELECTION", playerIdx }),
    confirmEffect: (playerIdx: number) => sendAction({ type: "CONFIRM_EFFECT", playerIdx }),
    declineEffect: (playerIdx: number) => sendAction({ type: "DECLINE_EFFECT", playerIdx }),
    resetBattle: () => { sendAction({ type: "RESET_BATTLE" }); setActionMode({ type: "none" }); },
  };

  // Toast 监听
  // (from existing BattlePage behavior)
  // Skipped for brevity - will be added in final render

  // ===== 状态渲染 =====
  function renderStatus() {
    switch (status.type) {
      case "connecting":
        return <p className="text-stone-400">正在连接服务器…</p>;
      case "queuing":
        return <p className="text-amber-600">匹配中… 队列位置: {status.position}</p>;
      case "matched":
        return <p className="text-green-600">已配对！对手: {status.opponentName}，等待游戏开始…</p>;
      case "error":
        return <p className="text-red-500">⚠️ {status.message}</p>;
      default:
        return null;
    }
  }

  // ===== 大厅 UI（未对战） =====
  if (!state) {
    return (
      <div className="h-full overflow-y-auto scrollbar-thin bg-[#fcfaf7]">
        <div className="max-w-xl mx-auto p-6 space-y-5">

          <div className="text-center py-3">
            <h1 className="text-xl font-bold text-stone-800 flex items-center justify-center gap-2">
              🌐 联机对战
            </h1>
          </div>

          {/* 服务器地址 */}
          {status.type === "idle" || status.type === "error" ? (
            <section>
              <h2 className="text-sm font-bold text-stone-700 mb-2">服务器地址</h2>
              <input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm"
                placeholder="ws://localhost:8081"
              />
              <button
                onClick={handleConnect}
                className="mt-2 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 transition"
              >
                🔗 连接
              </button>
            </section>
          ) : (
            <section>
              <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                已连接
                <button onClick={handleCancel} className="ml-auto px-3 py-1 rounded bg-stone-200 text-stone-500 text-xs hover:bg-stone-300 transition">
                  断开
                </button>
              </div>
              {renderStatus()}
            </section>
          )}

          {/* 玩家名称 */}
          <section>
            <h2 className="text-sm font-bold text-stone-700 mb-2">玩家名称</h2>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm"
              placeholder="输入你的名字"
              disabled={status.type === "queuing" || status.type === "matched"}
            />
          </section>

          {/* 卡组选择 */}
          <section>
            <h2 className="text-sm font-bold text-stone-700 mb-2">选择卡组</h2>
            {["precon_sd01", "precon_sd02"].map((k) => (
              <button
                key={k}
                onClick={() => setSelectedDeck(k)}
                className={`block w-full text-left rounded-lg border p-3 mb-2 transition ${
                  selectedDeck === k
                    ? "bg-indigo-50 border-indigo-400"
                    : "bg-white border-stone-200 hover:border-stone-300"
                }`}
              >
                <span className="text-sm font-medium">{k === "precon_sd01" ? "SD01 英雄 预组" : "SD02 复仇 预组"}</span>
              </button>
            ))}
          </section>

          {/* 匹配按钮 */}
          {(status.type === "connecting" || status.type === "idle") ? null : status.type === "matched" || status.type === "queuing" ? (
            <button
              onClick={handleCancel}
              className="w-full py-3 rounded-lg bg-red-500 text-white font-bold hover:bg-red-400 transition"
            >
              取消匹配
            </button>
          ) : (
            <button
              onClick={handleJoinQueue}
              disabled={!selectedDeck}
              className="w-full py-3 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition disabled:opacity-40"
            >
              ⚔ 开始匹配
            </button>
          )}

        </div>
      </div>
    );
  }

  // ===== 对战渲染 =====
  const myPlayer = state.players[playerIdx];
  const opponent = state.players[1 - playerIdx];

  return (
    <div className="flex h-full gap-0 bg-[#0f1923]">
      {/* 左侧信息栏 */}
      <div className="w-52 shrink-0 flex flex-col border-r border-white/10 overflow-hidden">
        <SidebarSection label="联机" badge={`P${playerIdx + 1}`}>
          <p className="text-xs text-white/40">
            对手: {status.type === "inGame" ? status.opponentName : "?"} · {isMyTurn ? "你的回合" : "对手回合"}
          </p>
        </SidebarSection>
        <SidebarSection label="时间线" badge={`${Math.max(myPlayer.timeline.length, opponent.timeline.length)}/9`}>
          <div className="text-[11px] text-white/30 my-1">你: {myPlayer.timeline.length} / 对手: {opponent.timeline.length}</div>
        </SidebarSection>
      </div>

      {/* 中央战场 */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* 渲染较简陋的战场，后续可以优化 */}
        <div className="text-center py-2 text-xs text-white/30 border-b border-white/10">
          ⚔ 第{state.turnNumber}回合 · {PHASE_LABELS[state.turnPhase]} · {isMyTurn ? "你的回合" : "对手回合"}
        </div>
        <div className="flex-1 flex items-center justify-center text-white/20">
          <p>战场渲染待接入 PlayerArea（UI 负责人可优化）</p>
        </div>
      </div>
    </div>
  );
}
