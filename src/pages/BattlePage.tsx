import { useState, useEffect, useCallback } from "react";
import type { CardDatabase, Card, Deck } from "../types/card";
import {
  getAllFieldCards,
  getActivatableEffects,
  getKeywordCardNames,
  getRushCardIds,
  deckEntriesToCardIds,
  type TurnPhase,
  type Zone,
} from "../engine";
import { useBattle } from "../hooks/useBattle";
import GameSetup, { type PreselectedDeck } from "../components/GameSetup";
import SidebarSection from "../components/battle/SidebarSection";
import StatRow from "../components/battle/StatRow";
import CardDetailPanel from "../components/battle/CardDetailPanel";
import PlayerArea from "../components/battle/PlayerArea";
import { ZONE_LIST, ZONE_LABELS, PHASE_LABELS, type ActionMode } from "../components/battle/constants";
import OnlineBattleLobby from "../components/OnlineBattleLobby";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface BattlePageProps {
  db: CardDatabase;
  savedDecks: Deck[];
  cardMap: Map<string, Card>;
}

type LobbyPhase = "lobby" | "setup";
type GameMode = "local" | "online";
type FirstPlayerChoice = "random" | "p1" | "p2";

/** Precon JSON format (minimal) */
interface PreconData {
  name: string;
  cards: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// BattleLobby sub-component
// ─────────────────────────────────────────────────────────────────────────

interface BattleLobbyProps {
  db: CardDatabase;
  savedDecks: Deck[];
  cardMap: Map<string, Card>;
  onStart: (deck: PreselectedDeck, firstPlayer: FirstPlayerChoice) => void;
  onSwitchMode: () => void;
}

function BattleLobby({ db, savedDecks, cardMap, onStart, onSwitchMode }: BattleLobbyProps) {
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [firstPlayer, setFirstPlayer] = useState<FirstPlayerChoice>("random");
  const [preconData, setPreconData] = useState<PreconData[]>([]);
  const [preconLoading, setPreconLoading] = useState(true);

  // Load precon JSON data
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("./precon_sd01.json").then((r) => r.json() as Promise<PreconData>),
      fetch("./precon_sd02.json").then((r) => r.json() as Promise<PreconData>),
    ])
      .then(([sd01, sd02]) => {
        if (cancelled) return;
        setPreconData([sd01, sd02]);
        setPreconLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load precon data:", err);
        setPreconLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStart = useCallback(() => {
    if (!selectedDeck) return;

    if (selectedDeck === "precon_sd01" && preconData[0]) {
      const rushCardIds = getRushCardIds(db, "SD01");
      onStart(
        {
          p1MainCardIds: [...preconData[0].cards],
          p1RushCardIds: rushCardIds,
          p1Name: preconData[0].name,
          p2Precon: "sd02",
        },
        firstPlayer
      );
    } else if (selectedDeck === "precon_sd02" && preconData[1]) {
      const rushCardIds = getRushCardIds(db, "SD02");
      onStart(
        {
          p1MainCardIds: [...preconData[1].cards],
          p1RushCardIds: rushCardIds,
          p1Name: preconData[1].name,
          p2Precon: "sd01",
        },
        firstPlayer
      );
    } else if (selectedDeck.startsWith("saved_")) {
      const idx = parseInt(selectedDeck.split("_")[1], 10);
      const deck = savedDecks[idx];
      if (!deck) return;
      const mainCardIds = deckEntriesToCardIds(deck.main_deck, cardMap);
      const rushCardIds = deckEntriesToCardIds(deck.rush_deck, cardMap);
      // If no rush cards in deck, use SD01 rush cards as default
      const finalRushCardIds =
        rushCardIds.length > 0 ? rushCardIds : getRushCardIds(db, "SD01");
      onStart(
        {
          p1MainCardIds: mainCardIds,
          p1RushCardIds: finalRushCardIds,
          p1Name: deck.name,
          p2Precon: "sd01",
        },
        firstPlayer
      );
    }
  }, [selectedDeck, preconData, savedDecks, cardMap, db, firstPlayer, onStart]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-[#fcfaf7]">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Title */}
        <div className="text-center py-4">
          <h1 className="text-2xl font-bold text-stone-800 flex items-center justify-center gap-2">
            <span className="text-msa-600">⚔</span>
            对战大厅
          </h1>
          {/* 模式切换 */}
          <div className="flex justify-center gap-2 mt-2">
            <span className="px-3 py-1 rounded bg-msa-600 text-white text-xs font-bold">
              🏠 本地
            </span>
            <button
              onClick={onSwitchMode}
              className="px-3 py-1 rounded bg-stone-100 text-stone-500 text-xs font-medium hover:bg-stone-200 transition"
            >
              🌐 联机对战
            </button>
          </div>
          <p className="text-sm text-stone-400 mt-1.5">
            选择卡组和先后手，开始一场对战
          </p>
        </div>

        {/* Deck selection */}
        <section>
          <h2 className="text-sm font-bold text-stone-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-msa-500 rounded-full" />
            选择卡组
          </h2>

          {/* Precon options */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {preconLoading ? (
              <>
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="bg-white rounded-xl border border-stone-200 p-4 animate-pulse h-24"
                  />
                ))}
              </>
            ) : (
              preconData.map((precon, i) => {
                const id = i === 0 ? "precon_sd01" : "precon_sd02";
                const isSelected = selectedDeck === id;
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedDeck(id)}
                    className={`text-left rounded-xl border p-4 transition ${
                      isSelected
                        ? "bg-red-50 border-msa-500 shadow-sm"
                        : "bg-white border-stone-200 hover:border-stone-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-msa-600 font-medium">
                        预组
                      </span>
                      {isSelected && (
                        <span className="text-msa-600 text-sm">✓</span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-stone-800">{precon.name}</p>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      {precon.cards.length} 张角色卡
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {/* Saved decks */}
          <p className="text-[11px] text-stone-500 font-semibold uppercase tracking-wide mb-2">
            我的卡组
          </p>
          {savedDecks.length === 0 ? (
            <div className="text-center py-6 bg-stone-50 rounded-xl border border-dashed border-stone-200">
              <p className="text-sm text-stone-400">
                还没有保存的卡组，去组卡器创建一个吧！
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedDecks.map((deck, i) => {
                const id = `saved_${i}`;
                const isSelected = selectedDeck === id;
                const mainCount = deck.main_deck.reduce((s, e) => s + e.count, 0);
                const rushCount = deck.rush_deck.reduce((s, e) => s + e.count, 0);
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedDeck(id)}
                    className={`w-full text-left rounded-lg border p-3 transition flex items-center gap-3 ${
                      isSelected
                        ? "bg-blue-50 border-blue-500 shadow-sm"
                        : "bg-white border-stone-200 hover:border-stone-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="w-1 h-8 rounded-full bg-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">
                        {deck.name}
                      </p>
                      <p className="text-[11px] text-stone-400">
                        {mainCount}/50 角色卡
                        {rushCount > 0 && ` · ${rushCount}/9 冲击卡`}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="text-blue-600 text-sm flex-shrink-0">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* First player selection */}
        <section>
          <h2 className="text-sm font-bold text-stone-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-msa-500 rounded-full" />
            先后手选择
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: "random" as const, l: "🎲 随机" },
              { v: "p1" as const, l: "🔵 我方先手" },
              { v: "p2" as const, l: "🔴 敌方先手" },
            ]).map((opt) => (
              <button
                key={opt.v}
                onClick={() => setFirstPlayer(opt.v)}
                className={`py-2.5 text-sm rounded-lg border transition font-medium ${
                  firstPlayer === opt.v
                    ? "bg-msa-600 text-white border-msa-500"
                    : "bg-white text-stone-500 border-stone-200 hover:text-stone-700 hover:border-stone-300"
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </section>

        {/* Start button */}
        <div className="pt-2">
          <button
            onClick={handleStart}
            disabled={!selectedDeck}
            className="w-full py-3 rounded-lg bg-msa-600 text-white text-base font-bold hover:bg-msa-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ⚔ 开始对战
          </button>
          {!selectedDeck && (
            <p className="text-center text-xs text-stone-400 mt-2">
              请先选择一个卡组
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export default function BattlePage({ db, savedDecks, cardMap }: BattlePageProps) {
  // ===== 游戏状态（useBattle 契约层管理） =====
  const { state, dispatch, actions } = useBattle(db);

  // ===== UI 状态（useState 管理） =====
  const [actionMode, setActionMode] = useState<ActionMode>({ type: "none" });
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  // Q7: 目标选择 UI 状态
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);

  // Toast 通知状态
  const [toast, setToast] = useState<string | null>(null);

  // ===== 大厅状态 =====
  const [lobbyPhase, setLobbyPhase] = useState<LobbyPhase>("lobby");
  const [gameMode, setGameMode] = useState<GameMode>("local");
  const [preselectedDeck, setPreselectedDeck] = useState<PreselectedDeck | null>(null);
  const [firstPlayerChoice, setFirstPlayerChoice] = useState<FirstPlayerChoice>("random");

  // ===== 大厅启动回调 =====
  const handleLobbyStart = useCallback((deck: PreselectedDeck, firstPlayer: FirstPlayerChoice) => {
    setPreselectedDeck(deck);
    setFirstPlayerChoice(firstPlayer);
    setLobbyPhase("setup");
  }, []);

  const handleBackToLobby = useCallback(() => {
    setLobbyPhase("lobby");
    setPreselectedDeck(null);
  }, []);

  // Q7: 当 pendingTargetSelection 变化时重置已选目标
  useEffect(() => {
    setSelectedTargetIds([]);
  }, [state?.pendingTargetSelection]);

  // Toast 通知：监听 state.log 变化，将最新的 ⚠️ 日志作为 toast 显示
  useEffect(() => {
    if (!state || state.log.length === 0) return;
    const latestLog = state.log[state.log.length - 1];
    if (latestLog.startsWith("⚠️")) {
      setToast(latestLog);
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [state?.log?.length]);

  // === 大厅阶段 ===
  if (!state && lobbyPhase === "lobby") {
    // 联机模式
    if (gameMode === "online") {
      return (
        <OnlineBattleLobby
          db={db}
          savedDecks={savedDecks}
          cardMap={cardMap}
          onBack={() => setGameMode("local")}
        />
      );
    }
    return (
      <BattleLobby
        db={db}
        savedDecks={savedDecks}
        cardMap={cardMap}
        onStart={handleLobbyStart}
        onSwitchMode={() => setGameMode("online")}
      />
    );
  }

  // === 准备阶段 ===
  if (!state) {
    console.log("[BattlePage] Rendering GameSetup, lobbyPhase:", lobbyPhase, "preselectedDeck:", !!preselectedDeck);
    return (
      <GameSetup
        db={db}
        dispatch={dispatch}
        preselectedDeck={preselectedDeck ?? undefined}
        firstPlayerChoice={firstPlayerChoice}
        onBackToLobby={handleBackToLobby}
      />
    );
  }

  console.log("[BattlePage] State is non-null, rendering battle UI. turnPhase:", state.turnPhase, "players:", state.players.length);

  // ============================================================
  // 事件处理（业务校验在 useBattle 契约层，这里只联动菜单 UI 状态）
  // ============================================================

  const drawCards = () => actions.drawCards();

  const advancePhase = (next: TurnPhase) => {
    if (actions.advancePhase(next)) setActionMode({ type: "none" });
  };

  const endTurn = () => {
    if (actions.endTurn()) setActionMode({ type: "none" });
  };

  const endConflict = () => {
    actions.endConflict();
    setActionMode({ type: "none" });
  };

  const deployToBase = (playerIdx: number, handIndex: number) => {
    if (actions.deployToBase(playerIdx, handIndex)) setActionMode({ type: "none" });
  };

  const summonToField = (playerIdx: number, handIndex: number, zone: Zone | "base") => {
    if (actions.summonToField(playerIdx, handIndex, zone)) setActionMode({ type: "none" });
  };

  const moveCharacter = (playerIdx: number, fromZone: Zone, cardId: string, toZone: Zone) => {
    if (actions.moveCharacter(playerIdx, fromZone, cardId, toZone)) setActionMode({ type: "none" });
  };

  /** 战基移动：角色在战区与基地之间移动 */
  const moveCard = (playerIdx: number, fromLoc: Zone | "base", cardId: string, toLoc: Zone | "base") => {
    if (actions.moveCard(playerIdx, fromLoc, cardId, toLoc)) setActionMode({ type: "none" });
  };

  const onZoneAttackClick = (zone: Zone) => actions.setAttackZone(zone);

  const startAttack = actions.startAttack;
  const confirmAttack = actions.confirmAttack;
  const skipZone = actions.skipZone;
  const startAttackSubPhase = actions.startAttackSubPhase;
  const canZoneAttackFn = actions.canAttackZone;

  // === 点击手牌：选中/取消选中 ===
  const onHandCardClick = (playerIdx: number, _cardId: string, handIndex: number) => {
    if (state.pendingSummon) return;
    if (state.activePlayerIndex !== playerIdx || state.turnPhase !== "ACTION") return;
    // 切换选中状态：再次点击同一手牌取消选中
    if (
      actionMode.type === "handSelect" &&
      actionMode.playerIdx === playerIdx &&
      actionMode.handIndex === handIndex
    ) {
      setActionMode({ type: "none" });
    } else {
      setActionMode({ type: "handSelect", playerIdx, handIndex });
    }
  };

  // === 点击场上角色 ===
  const onFieldCardClick = (playerIdx: number, zone: Zone, cardId: string) => {
    // 冲突阶段：攻击方点击 = 选攻击者
    if (
      state.turnPhase === "CONFLICT" &&
      state.conflictSubPhase === "attack" &&
      state.activePlayerIndex === playerIdx
    ) {
      if (!state.currentAttackZone || state.currentAttackZone !== zone) return;
      startAttack(playerIdx, zone, cardId);
      return;
    }
    // 行动阶段/冲突调整：点击 = 移动菜单（再次点击同一角色撤销选择）
    const canMove =
      (state.turnPhase === "ACTION" ||
        (state.turnPhase === "CONFLICT" && state.conflictSubPhase === "adjust")) &&
      state.activePlayerIndex === playerIdx;
    if (canMove) {
      if (actionMode.type === "moveMenu" && actionMode.cardId === cardId) {
        setActionMode({ type: "none" });
      } else {
        setActionMode({ type: "moveMenu", playerIdx, zone, cardId });
      }
    }
  };

  // === 撤退选择（pendingSummon） ===
  const onSelectRetreat = actions.selectRetreat;
  const cancelSummon = actions.cancelSummon;

  // === 卡牌 hover ===
  const onCardHover = (card: Card | null) => {
    setHoveredCard(card);
  };

  const closeMenu = () => {
    setActionMode({ type: "none" });
    if (state.pendingAttack) actions.clearAttackTarget();
  };

  // ============================================================
  // 派生变量
  // ============================================================

  const p1 = state.players[0];
  const p2 = state.players[1];
  const activeIdx = state.activePlayerIndex;
  const activeP = state.players[activeIdx];
  const isActionPhase = state.turnPhase === "ACTION";
  const isConflictPhase = state.turnPhase === "CONFLICT";
  const isConflictAdjust = isConflictPhase && state.conflictSubPhase === "adjust";
  const isConflictAttack = isConflictPhase && state.conflictSubPhase === "attack";
  const attackTarget = state.pendingAttack;
  const currentAttackZone = state.currentAttackZone;
  const conflictSubPhase = state.conflictSubPhase;
  const conflictMovesUsed = state.conflictMovesUsed;

  // 渲染小卡片（侧边栏用）
  const renderMiniCard = (id: string) => {
    const card = db.cards.find((c) => c.id === id);
    return (
      <div
        key={id}
        className="w-10 h-14 rounded border border-white/10 bg-black/30 overflow-hidden relative shadow-inner"
        title={card?.name || id}
        onMouseEnter={() => card && onCardHover(card)}
        onMouseLeave={() => onCardHover(null)}
      >
        {card ? (
          <img
            src={`/cards/${card.id}.png`}
            alt={card.name}
            className="w-full h-full object-cover opacity-80"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/10" />
        )}
      </div>
    );
  };

  return (
    <div
      className="flex h-full gap-0 bg-[#0f1923]"
      onClick={closeMenu}
    >
      {/* ═══ 左侧信息栏 ═══ */}
      <div className="w-52 shrink-0 flex flex-col border-r border-white/10 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <SidebarSection label="时间线" badge={`${Math.max(p1.timeline.length, p2.timeline.length)}/9`}>
          <div className="space-y-1">
            <div className="text-[11px] text-blue-300/70 mb-0.5">我方 ({p1.timeline.length})</div>
            <div className="flex gap-0.5 flex-wrap">
              {p1.timeline.map((id) => renderMiniCard(id))}
              {p1.timeline.length === 0 && <span className="text-[11px] text-white/20">无</span>}
            </div>
            <div className="text-[11px] text-red-300/70 mt-1 mb-0.5">敌方 ({p2.timeline.length})</div>
            <div className="flex gap-0.5 flex-wrap">
              {p2.timeline.map((id) => renderMiniCard(id))}
              {p2.timeline.length === 0 && <span className="text-[11px] text-white/20">无</span>}
            </div>
          </div>
        </SidebarSection>

        <SidebarSection label="撤退区">
          <div className="space-y-1">
            {[p1, p2].map((p, pi) => (
              <div key={pi}>
                <div className={`text-[11px] mb-0.5 ${pi === 0 ? "text-blue-300/70" : "text-red-300/70"}`}>
                  {pi === 0 ? "我方" : "敌方"} ({p.retreat.length})
                </div>
                {p.retreat.length > 0 ? (
                  <div className="flex gap-0.5 flex-wrap">
                    {p.retreat.slice(0, 8).map((id) => renderMiniCard(id))}
                    {p.retreat.length > 8 && <span className="text-[10px] text-white/30 self-center">+{p.retreat.length - 8}</span>}
                  </div>
                ) : (
                  <span className="text-[11px] text-white/20">无</span>
                )}
              </div>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection label="虚空区">
          <div className="space-y-1">
            {[p1, p2].map((p, pi) => (
              <div key={pi}>
                <div className={`text-[11px] mb-0.5 ${pi === 0 ? "text-blue-300/70" : "text-red-300/70"}`}>
                  {pi === 0 ? "我方" : "敌方"} ({p.void.length})
                </div>
                {p.void.length > 0 ? (
                  <div className="flex gap-0.5 flex-wrap">
                    {p.void.slice(0, 6).map((id) => renderMiniCard(id))}
                  </div>
                ) : (
                  <span className="text-[11px] text-white/20">无</span>
                )}
              </div>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection label="冲击卡组" last>
          <div className="space-y-1.5">
            {[p1, p2].map((p, pi) => (
              <div key={pi} className="flex items-center gap-1.5">
                <div className={`text-[11px] w-8 shrink-0 ${pi === 0 ? "text-blue-300/80" : "text-red-300/80"}`}>
                  {pi === 0 ? "我方" : "敌方"}
                </div>
                <div className="flex-1 h-10 rounded bg-black/40 border border-white/10 relative overflow-hidden">
                  {p.rushDeck.length > 0 ? (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 to-purple-900/60" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-bold text-white/70">{p.rushDeck.length}</span>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[11px] text-white/15">空</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SidebarSection>

        {/* 对战日志 */}
        <div className="flex-1 min-h-0 mt-auto border-t border-white/10 flex flex-col overflow-hidden">
          <div className="shrink-0 px-2 py-1.5 bg-white/5 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-white/50 tracking-wider">📜 日志</span>
            <span className="text-[11px] text-white/30">{state.log.length}条</span>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {state.log.slice(-80).map((entry, i) => (
              <p key={i} className="text-[11px] text-white/45 font-mono leading-snug whitespace-pre-line">
                {entry}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ 中央战场 ═══ */}
      <div className="flex-1 flex flex-col min-w-0 relative" onClick={(e) => e.stopPropagation()}>
        {/* ===== pendingSummon 覆盖层提示 ===== */}
        {state.pendingSummon && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 bg-black/90 border border-amber-500/40 rounded-lg px-4 py-2 flex items-center gap-3 shadow-2xl backdrop-blur-sm">
            <span className="text-sm text-amber-300 font-medium">
              选择需要撤退的角色（还需 Lv {state.pendingSummon.requiredLv - state.pendingSummon.selectedLv}）
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); cancelSummon(); }}
              className="px-3 py-1 rounded bg-stone-700 text-white/70 text-xs hover:bg-stone-600 transition"
            >
              ✕ 取消
            </button>
          </div>
        )}

        {/* ===== pendingCounter 应对窗口提示 ===== */}
        {state.pendingCounter && (() => {
          const pc = state.pendingCounter;
          return (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 bg-black/90 border border-purple-500/50 rounded-lg px-4 py-2.5 flex items-center gap-3 shadow-2xl backdrop-blur-sm">
            <span className="text-sm text-purple-300 font-medium">
              🛡️ 应对窗口 — 玩家{pc.summoningPlayerIdx + 1} 正在号召
              「{db.cards.find((c) => c.id === pc.summoningCardId)?.name ?? "?"}」
            </span>
            <span className="text-xs text-purple-400/60">
              应对已用：P1 {state.counterUsedThisTurn?.[0] ? "✓" : "○"} | P2 {state.counterUsedThisTurn?.[1] ? "✓" : "○"}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                actions.passCounter(1 - pc.summoningPlayerIdx);
              }}
              className="px-3 py-1 rounded bg-stone-700 text-white/70 text-xs hover:bg-stone-600 transition"
            >
              不行动（Pass）
            </button>
          </div>
          );
        })()}

        {/* ===== 选发确认提示条 ===== */}
        {state.pendingEffectConfirmation && (() => {
          const pec = state.pendingEffectConfirmation;
          return (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 bg-black/90 border border-indigo-500/50 rounded-lg px-4 py-2.5 flex items-center gap-3 shadow-2xl backdrop-blur-sm">
            <span className="text-sm text-indigo-300 font-medium">
              ⚡ {pec.prompt}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); actions.confirmEffect(pec.playerIdx); }}
              className="px-3 py-1 rounded bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition"
            >
              ✅ 发动
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); actions.declineEffect(pec.playerIdx); }}
              className="px-3 py-1 rounded bg-stone-700 text-white/70 text-xs hover:bg-stone-600 transition"
            >
              ⏭️ 放弃
            </button>
          </div>
          );
        })()}

        {/* ===== Q7: pendingTargetSelection 目标选择模态框 ===== */}
        {state.pendingTargetSelection && (() => {
          const pts = state.pendingTargetSelection;
          const targetLabel = pts.targetPlayerIdx === 0 ? "我方" : "敌方";
          const isZoneSelection = pts.targetKind === "zone";
          const canConfirm = selectedTargetIds.length >= pts.minTargets && selectedTargetIds.length <= pts.maxTargets;

          /** 切换目标选中状态 */
          const toggleTarget = (cardId: string) => {
            if (selectedTargetIds.includes(cardId)) {
              setSelectedTargetIds(selectedTargetIds.filter((id) => id !== cardId));
            } else if (selectedTargetIds.length < pts.maxTargets) {
              setSelectedTargetIds([...selectedTargetIds, cardId]);
            }
          };

          return (
            <div
              className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center backdrop-blur-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white border border-amber-300 rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4">
                <h3 className="text-lg font-bold text-amber-700 text-center mb-2">
                  🎯 选择目标
                </h3>
                <p className="text-sm text-stone-500 text-center mb-4">
                  {pts.prompt ?? `请选择${targetLabel}场上 ${pts.minTargets}-${pts.maxTargets} 张角色`}
                  （已选 {selectedTargetIds.length}/{pts.maxTargets}）
                </p>

                {/* 可选目标列表 */}
                <div className="flex flex-wrap gap-2 justify-center mb-4 min-h-[100px]">
                  {pts.availableTargets.length === 0 ? (
                    <p className="text-sm text-stone-400">没有可选目标</p>
                  ) : isZoneSelection ? (
                    // 区域选择：渲染战区按钮
                    pts.availableTargets.map((zoneId) => {
                      const isSelected = selectedTargetIds.includes(zoneId);
                      return (
                        <button
                          key={zoneId}
                          onClick={() => toggleTarget(zoneId)}
                          className={`px-5 py-3 rounded-lg border text-sm font-bold transition ${
                            isSelected
                              ? "bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-400"
                              : "bg-white border-stone-200 text-stone-600 hover:border-amber-300"
                          }`}
                        >
                          {ZONE_LABELS[zoneId as keyof typeof ZONE_LABELS] ?? zoneId}
                          {isSelected && <span className="ml-1.5">✓</span>}
                        </button>
                      );
                    })
                  ) : (
                    pts.availableTargets.map((cardId) => {
                      const card = db.cards.find((c) => c.id === cardId);
                      const isSelected = selectedTargetIds.includes(cardId);
                      return (
                        <button
                          key={cardId}
                          onClick={() => toggleTarget(cardId)}
                            className={`relative w-20 rounded border overflow-hidden shadow-md transition ${
                            isSelected
                              ? "ring-2 ring-amber-400 border-amber-400 scale-105"
                              : "border-stone-200 hover:border-amber-300 hover:scale-105"
                          }`}
                          style={{ aspectRatio: "746 / 1041" }}
                          title={`${card?.name || cardId} (Lv${card?.cost ?? "?"} 战力${card?.power ?? "?"})`}
                        >
                          {card ? (
                            <img
                              src={`/cards/${card.id}.png`}
                              alt={card.name}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-stone-200 to-stone-300" />
                          )}
                          <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center leading-tight py-0.5">
                            {card?.name?.slice(0, 6) ?? cardId.slice(0, 6)}
                          </span>
                          {isSelected && (
                            <span className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                              <span className="text-[10px] text-white">✓</span>
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex justify-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.cancelTargetSelection(state.activePlayerIndex);
                    }}
                    className="px-5 py-2 rounded-lg bg-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-300 transition"
                  >
                    ✕ 取消
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canConfirm) {
                        actions.selectTargets(state.activePlayerIndex, selectedTargetIds);
                      }
                    }}
                    disabled={!canConfirm}
                    className="px-5 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ✅ 确认选择
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ===== 敌方区域（上）===== */}
        <div className="min-h-[40%] flex flex-col">
          <PlayerArea
            player={p2}
            isActive={activeIdx === 1}
            db={db}
            isActionPhase={isActionPhase}
            isConflictPhase={isConflictPhase}
            isConflictAdjust={isConflictAdjust}
            isConflictAttack={isConflictAttack}
            conflictSubPhase={conflictSubPhase}
            conflictZonesCompleted={state.conflictZonesCompleted}
            conflictAttackedCards={state.conflictAttackedCards}
            currentAttackZone={currentAttackZone}
            canZoneAttack={canZoneAttackFn}
            actionMode={actionMode}
            playerIdx={1}
            onHandCardClick={onHandCardClick}
            onFieldCardClick={onFieldCardClick}
            onDeploy={deployToBase}
            onSummon={summonToField}
            onMove={moveCharacter}
            onMoveCard={moveCard}
            attackTarget={attackTarget}
            onConfirmAttack={confirmAttack}
            onZoneAttack={onZoneAttackClick}
            onZoneSkip={skipZone}
            onCardHover={onCardHover}
            isEnemy={true}
            enteredThisTurn={state.enteredThisTurn}
            pendingSummon={state.pendingSummon}
            onSelectRetreat={onSelectRetreat}
          />
        </div>

        {/* VS 分隔线 */}
        <div className="shrink-0 h-7 flex items-center justify-center bg-gradient-to-r from-transparent via-red-950/50 to-transparent border-y border-red-500/20 gap-3">
          <span className="text-sm font-bold tracking-widest text-red-400/80 drop-shadow">⚔ VS ⚔</span>
          <span className="text-[11px] text-white/25">
            第{state.turnNumber}回合 · {PHASE_LABELS[state.turnPhase]} · {activeP.name}
            {activeP.isFirstPlayer && <span className="text-yellow-400/70 ml-1">★先攻</span>}
            {isConflictAttack && currentAttackZone && (
              <span className="ml-2 text-orange-400/70">| 当前攻击: {ZONE_LABELS[currentAttackZone]}</span>
            )}
          </span>
        </div>

        {/* ===== 我方区域（下）===== */}
        <div className="min-h-[40%] flex flex-col">
          <PlayerArea
            player={p1}
            isActive={activeIdx === 0}
            db={db}
            isActionPhase={isActionPhase}
            isConflictPhase={isConflictPhase}
            isConflictAdjust={isConflictAdjust}
            isConflictAttack={isConflictAttack}
            conflictSubPhase={conflictSubPhase}
            conflictZonesCompleted={state.conflictZonesCompleted}
            conflictAttackedCards={state.conflictAttackedCards}
            currentAttackZone={currentAttackZone}
            canZoneAttack={canZoneAttackFn}
            actionMode={actionMode}
            playerIdx={0}
            onHandCardClick={onHandCardClick}
            onFieldCardClick={onFieldCardClick}
            onDeploy={deployToBase}
            onSummon={summonToField}
            onMove={moveCharacter}
            onMoveCard={moveCard}
            attackTarget={attackTarget}
            onConfirmAttack={confirmAttack}
            onZoneAttack={onZoneAttackClick}
            onZoneSkip={skipZone}
            onCardHover={onCardHover}
            isEnemy={false}
            enteredThisTurn={state.enteredThisTurn}
            pendingSummon={state.pendingSummon}
            onSelectRetreat={onSelectRetreat}
          />
        </div>

        {/* ===== 底部阶段按钮栏 ===== */}
        <div className="shrink-0 h-14 bg-black/60 backdrop-blur-sm border-t border-white/10 flex items-center justify-center gap-2 px-4 relative">
          {state.turnPhase === "TURN_START" && (
            <button
              onClick={() => advancePhase("DRAW")}
              className="px-5 py-2 rounded-lg bg-emerald-600/90 text-white text-sm font-bold hover:bg-emerald-500 transition shadow-lg"
            >
              → 抽卡阶段
            </button>
          )}

          {state.turnPhase === "DRAW" && (
            <button
              onClick={() => drawCards()}
              className="px-5 py-2 rounded-lg bg-emerald-600/90 text-white text-sm font-bold hover:bg-emerald-500 transition shadow-lg"
            >
              📥 抽2张牌 → 行动阶段
            </button>
          )}

          {state.turnPhase === "ACTION" && (
            <>
              <button
                onClick={() => advancePhase("CONFLICT")}
                className="px-5 py-2 rounded-lg bg-red-700/90 text-white text-sm font-bold hover:bg-red-600 transition shadow-lg"
              >
                ⚔ 冲突阶段
              </button>
              <div className="flex items-center gap-3 text-xs text-white/40 mx-2">
                <span>号召:{state.remainingSummons}/3</span>
                <span>基地:{state.baseDeployedThisTurn ? "✓" : "○"}</span>
              </div>

              {/* ===== 起动效果按钮 ===== */}
              {(() => {
                const effectButtons = getActivatableEffects(state, db, activeIdx);
                if (effectButtons.length === 0) return null;

                return (
                  <div className="flex items-center gap-1.5 mx-1">
                    {effectButtons.slice(0, 4).map((btn) => (
                      <button
                        key={`${btn.cardId}-${btn.effectId}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          actions.activateEffect(activeIdx, btn.cardId, btn.effectId);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-700/80 text-white text-xs font-medium hover:bg-indigo-600 transition border border-indigo-500/40"
                        title={`${btn.cardName} — ${btn.effectLabel}`}
                      >
                        ⚡ {btn.effectLabel}
                      </button>
                    ))}
                  </div>
                );
              })()}

              <button
                onClick={() => advancePhase("END_PHASE")}
                className="px-3 py-2 rounded-lg bg-stone-700/80 text-white/70 text-xs hover:bg-stone-600 transition"
              >
                跳过 → 结束
              </button>
            </>
          )}

          {state.turnPhase === "CONFLICT" && (
            <>
              {conflictSubPhase === "adjust" && (
                <>
                  <span className="text-xs text-white/40 mr-2">
                    调整战区位置 ({conflictMovesUsed}/4次)
                  </span>
                  <button
                    onClick={startAttackSubPhase}
                    className="px-5 py-2 rounded-lg bg-orange-600/90 text-white text-sm font-bold hover:bg-orange-500 transition shadow-lg"
                  >
                    ⚔ 开始攻击
                  </button>
                  <button
                    onClick={endConflict}
                    className="px-3 py-2 rounded-lg bg-stone-700/80 text-white/70 text-xs hover:bg-stone-600 transition"
                  >
                    跳过 → 结束
                  </button>
                </>
              )}
              {conflictSubPhase === "attack" && (
                <>
                  <span className="text-xs text-orange-400/70 mr-2">
                    已完成: {state.conflictZonesCompleted.length}/4 区域
                  </span>

                  {/* ===== 连击提示 ===== */}
                  {(() => {
                    const comboCards = getKeywordCardNames(state, db, activeIdx, "combo");
                    if (comboCards.length === 0) return null;
                    return (
                      <span className="text-xs text-yellow-400/80 mr-2 px-2 py-0.5 rounded bg-yellow-900/20 border border-yellow-700/30">
                        ⚔ 连击: {comboCards.join(", ")}
                      </span>
                    );
                  })()}

                  {/* ===== 强袭提示 ===== */}
                  {(() => {
                    const assaultCards = getKeywordCardNames(state, db, activeIdx, "assault");
                    if (assaultCards.length === 0) return null;
                    return (
                      <span className="text-xs text-red-400/80 mr-2 px-2 py-0.5 rounded bg-red-900/20 border border-red-700/30">
                        💪 强袭: {assaultCards.join(", ")}
                      </span>
                    );
                  })()}
                  {attackTarget && (
                    <button
                      onClick={() => actions.clearAttackTarget()}
                      className="px-3 py-2 rounded-lg bg-stone-700/80 text-white/70 text-xs hover:bg-stone-600 transition"
                    >
                      ✕ 取消攻击
                    </button>
                  )}
                  {currentAttackZone && !attackTarget && (
                    <button
                      onClick={() => actions.startAttackSubPhase()}
                      className="px-3 py-2 rounded-lg bg-stone-700/80 text-white/70 text-xs hover:bg-stone-600 transition"
                    >
                      ✕ 取消选区
                    </button>
                  )}
                  <button
                    onClick={endConflict}
                    className="px-4 py-2 rounded-lg bg-stone-600/90 text-white text-sm font-medium hover:bg-stone-500 transition"
                  >
                    结束冲突 →
                  </button>
                </>
              )}
            </>
          )}

          {state.turnPhase === "END_PHASE" && !state.isGameOver && (
            <button
              onClick={endTurn}
              className="px-6 py-2 rounded-lg bg-indigo-600/90 text-white text-sm font-bold hover:bg-indigo-500 transition shadow-lg"
            >
              ⏹️ 结束回合 → 换人
            </button>
          )}

          {state.isGameOver && (
            <div
              className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center shadow-2xl">
                <p className="text-3xl mb-2">🎉 游戏结束!</p>
                <p className="text-xl font-bold text-msa-700 mb-1">
                  {(state.winner === 0 ? p1.name : p2.name)} 获胜!
                </p>
                <p className="text-sm text-stone-500 mb-4">
                  {state.winner === 0 ? "敌方时间线已满或卡组耗尽" : "我方时间线已满或卡组耗尽"}
                </p>
                <button
                  onClick={() => {
                    actions.resetBattle();
                    setActionMode({ type: "none" });
                    setLobbyPhase("lobby");
                    setPreselectedDeck(null);
                  }}
                  className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition"
                >
                  返回大厅
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 右侧信息栏（卡组信息 + 卡牌详情面板）═══ */}
      <div
        className="w-60 shrink-0 flex flex-col border-l border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 卡组信息 */}
        <div className="border-b border-white/5 shrink-0">
          {[p1, p2].map((p, pi) => (
            <div key={pi} className="flex items-center gap-2 p-2 border-b border-white/5 last:border-b-0">
              <span className={`text-[11px] w-8 shrink-0 ${pi === 0 ? "text-blue-300/80" : "text-red-300/80"}`}>
                {pi === 0 ? "我方" : "敌方"}
              </span>
              <div className="flex-1 h-12 rounded bg-black/40 border border-white/10 relative overflow-hidden">
                {p.deck.length > 0 ? (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-900/50 to-cyan-900/50" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-sm font-bold text-white/80">{p.deck.length}</span>
                      <span className="text-[10px] text-white/30">张</span>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[11px] text-red-400/50">空!</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 精简 STATS */}
        <div className="shrink-0 p-2 space-y-1 border-b border-white/5">
          <div className="text-[11px] text-white/30 font-bold tracking-wider">STATS</div>
          <StatRow label="手牌" v1={p1.hand.length} v2={p2.hand.length} />
          <StatRow label="基地" v1={p1.baseCards.length + p1.baseCovered.length} v2={p2.baseCards.length + p2.baseCovered.length} suffix="/6" />
          <StatRow label="场上" v1={getAllFieldCards(p1).length} v2={getAllFieldCards(p2).length} />
          <StatRow label="时间线" v1={p1.timeline.length} v2={p2.timeline.length} suffix="/9" highlight={true} />
          <div className="pt-1 space-y-0.5">
            <div className="text-[11px] text-white/40">
              阶段：<span className="text-amber-400/80">{PHASE_LABELS[state.turnPhase]}</span>
            </div>
            <div className="text-[11px] text-white/40">
              行动方：<span className={activeIdx === 0 ? "text-blue-400/80" : "text-red-400/80"}>{activeP.name}</span>
            </div>
            {isActionPhase && (
              <div className="text-[11px] text-white/40">
                号召：<span className="text-green-400/80">{state.remainingSummons}/3</span>
              </div>
            )}
            {isConflictAttack && (
              <div className="text-[11px] text-white/40">
                已完成：<span className="text-orange-400/80">{state.conflictZonesCompleted.length}/4</span>
              </div>
            )}
          </div>
        </div>

        {/* 卡牌详情面板 */}
        <CardDetailPanel card={hoveredCard} />
      </div>

      {/* Toast 通知 */}
      {toast && (
        <div
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 rounded-lg bg-amber-900/90 text-amber-100 text-sm font-medium shadow-2xl backdrop-blur-sm border border-amber-500/30 transition-all duration-300 ${
            toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
