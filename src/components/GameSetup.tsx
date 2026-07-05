import { useState, useCallback, useEffect, useRef, type Dispatch } from "react";
import type { CardDatabase } from "../types/card";
import type { SetupPhase, PlayerState, BattleState, GameAction } from "../engine";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

/** Preselected deck info from the battle lobby (card ID format). */
export interface PreselectedDeck {
  p1MainCardIds: string[];
  p1RushCardIds: string[];
  p1Name: string;
  /** Which precon to use for player 2 */
  p2Precon: "sd01" | "sd02";
}

type FirstPlayerChoice = "random" | "p1" | "p2";

interface GameSetupProps {
  db: CardDatabase;
  /** Reducer dispatch 函数 */
  dispatch: Dispatch<GameAction>;
  /** Preselected deck from battle lobby. When provided, auto-starts the game. */
  preselectedDeck?: PreselectedDeck;
  /** First player choice from battle lobby */
  firstPlayerChoice?: FirstPlayerChoice;
  /** Callback to return to lobby */
  onBackToLobby?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Find the best (highest rarity) rush card for a given package prefix. */
function getRushCardIds(db: CardDatabase, prefix: string): string[] {
  const rushCards = db.cards.filter(
    (c) => c.card_no.startsWith(prefix) && c.card_type === 2
  );
  const best = rushCards.reduce<string | null>((best, c) => {
    if (!best) return c.id;
    const bestCard = db.cards.find((x) => x.id === best)!;
    return c.rarity > bestCard.rarity ? c.id : best;
  }, null);
  return best ? Array(9).fill(best) : [];
}

/** Fisher-Yates shuffle */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Create a player state object */
function makePlayer(
  id: 1 | 2,
  deck: string[],
  rushDeck: string[],
  hand: string[],
  isFirst: boolean
): PlayerState {
  return {
    id,
    name: `玩家${id}`,
    deck,
    rushDeck,
    hand,
    baseCards: [],
    baseCovered: [],
    field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
    timeline: [],
    retreat: [],
    void: [],
    isFirstPlayer: isFirst,
  };
}

/**
 * 创建包含所有 T01 新增字段的完整 BattleState
 * 确保所有可选字段都有初始值
 */
function createFullBattleState(
  players: [PlayerState, PlayerState],
  activePlayerIndex: number,
  log: string[]
): BattleState {
  return {
    isSetup: false,
    setupPhase: "DONE" as SetupPhase,
    turnPhase: "TURN_START",
    players,
    activePlayerIndex,
    turnNumber: 1,
    remainingSummons: activePlayerIndex === 0 ? 1 : 3,
    baseDeployedThisTurn: false,
    baseMovesUsed: {},
    conflictZonesCompleted: [],
    conflictAttackedCards: [],
    log,
    isGameOver: false,
    winner: null,
    conflictSubPhase: "adjust",
    conflictMovesUsed: 0,
    currentAttackZone: null,
    pendingAttack: null,
    pendingSummon: null,
    eventListeners: [],
    registeredAbilities: [],
    modifiers: [],
    attachments: {},
    pendingCounter: null,
    enteredThisTurn: [],
    // T01 新增字段初始化
    counterUsedThisTurn: [false, false],
    counterPassCount: 0,
    conflictAttackCount: {},
    temporaryAbilities: {},
    interceptUsedThisTurn: [],
    effectUsedThisTurn: [],
    activatedEffectsThisTurn: [],
    mulliganSelected: [],
    // Q7 新增字段初始化
    pendingTargetSelection: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

/**
 * 游戏准备 — 按规则书 303.1 执行
 *
 * 两种模式：
 *   1. 手动模式（默认）：4 步流程（洗牌→先后手→起手→调度）
 *   2. 大厅模式（preselectedDeck 提供时）：自动开始，无需手动操作
 *
 * T04 重构：Step 3 mulligan 流程改为实际选牌（先攻先行→选牌放回卡组底→抽等量→洗混）
 */
export default function GameSetup({
  db,
  dispatch,
  preselectedDeck,
  firstPlayerChoice = "random",
  onBackToLobby,
}: GameSetupProps) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [rolling, setRolling] = useState(false);
  const [firstPlayerResult, setFirstPlayerResult] = useState<1 | 2 | null>(null);
  const [loadingPrecon, setLoadingPrecon] = useState(false);
  const [autoStartError, setAutoStartError] = useState<string | null>(null);

  // ===== 大厅模式状态 =====
  /** 大厅模式数据已准备完毕，可以进入调度 */
  const [lobbyDataReady, setLobbyDataReady] = useState(false);
  /** 大厅模式额外日志（卡组名等） */
  const [lobbyExtraLog, setLobbyExtraLog] = useState<string[]>([]);
  /** 是否处于大厅模式 */
  const isLobbyMode = !!preselectedDeck;

  // ===== Mulligan 相关状态 =====
  /** 暂存的卡组与手牌（Step 2 抽牌后保存） */
  const [p1Deck, setP1Deck] = useState<string[]>([]);
  const [p2Deck, setP2Deck] = useState<string[]>([]);
  const [p1Hand, setP1Hand] = useState<string[]>([]);
  const [p2Hand, setP2Hand] = useState<string[]>([]);
  const [p1Rush, setP1Rush] = useState<string[]>([]);
  const [p2Rush, setP2Rush] = useState<string[]>([]);

  /** 当前调度玩家（1 或 2），null 表示调度结束 */
  const [mulliganPlayer, setMulliganPlayer] = useState<1 | 2 | null>(null);
  /** 当前玩家选中的要放回卡组底的手牌 ID */
  const [mulliganSelected, setMulliganSelected] = useState<string[]>([]);
  /** P1 已完成调度 */
  const [p1MulliganDone, setP1MulliganDone] = useState(false);
  /** P2 已完成调度 */
  const [p2MulliganDone, setP2MulliganDone] = useState(false);
  /** 调度完成标记 — 触发 useEffect 中的 finalizeGame */
  const [mulliganComplete, setMulliganComplete] = useState(false);
  /** 防止 finalizeGame 重复调用 */
  const finalizeCalledRef = useRef(false);

  // ===== Mulligan 悬浮详情 =====
  const [mulliganHover, setMulliganHover] = useState<string | null>(null);
  const mulliganHoverCard = mulliganHover ? db.cards.find((c) => c.id === mulliganHover) : null;

  // ===== 大厅模式：自动准备数据 → 进入调度阶段 =====
  useEffect(() => {
    if (!preselectedDeck) return;

    let cancelled = false;

    const autoStart = async () => {
      try {
        const preconFile =
          preselectedDeck.p2Precon === "sd01" ? "/precon_sd01.json" : "/precon_sd02.json";
        const p2Prefix = preselectedDeck.p2Precon === "sd01" ? "SD01" : "SD02";

        const res = await fetch(preconFile);
        if (!res.ok) throw new Error(`Failed to fetch ${preconFile}`);
        const preconData: { name: string; cards: string[] } = await res.json();

        const p2RushCardIds = getRushCardIds(db, p2Prefix);

        let fp: 1 | 2;
        if (firstPlayerChoice === "p1") fp = 1;
        else if (firstPlayerChoice === "p2") fp = 2;
        else fp = Math.random() < 0.5 ? 1 : 2;

        const shuffledP1Deck = shuffleArray([...preselectedDeck.p1MainCardIds]);
        const shuffledP2Deck = shuffleArray([...preconData.cards]);
        const dealtP1Hand = shuffledP1Deck.splice(0, 6);
        const dealtP2Hand = shuffledP2Deck.splice(0, 6);

        if (!cancelled) {
          console.log("[GameSetup] autoStart data ready:", {
            p1Deck: shuffledP1Deck.length, p2Deck: shuffledP2Deck.length,
            p1Hand: dealtP1Hand.length, p2Hand: dealtP2Hand.length,
            fp, p2Precon: preselectedDeck.p2Precon
          });
          // Bug 1 修正：大厅模式不直接 SETUP_COMPLETE，而是保存数据并进入调度阶段
          setP1Deck(shuffledP1Deck);
          setP2Deck(shuffledP2Deck);
          setP1Hand(dealtP1Hand);
          setP2Hand(dealtP2Hand);
          setP1Rush(preselectedDeck.p1RushCardIds);
          setP2Rush(p2RushCardIds);
          setFirstPlayerResult(fp);
          setLobbyExtraLog([
            `🎮 大厅对战开始！`,
            `📋 玩家1：${preselectedDeck.p1Name}`,
            `📋 玩家2：${preconData.name}`,
            `🎲 玩家${fp} 先攻`,
          ]);
          // 进入调度阶段（先攻玩家先行）
          setMulliganPlayer(fp);
          setMulliganSelected([]);
          setStep(3);
          setLobbyDataReady(true);
        }
      } catch (err) {
        console.error("Auto-start failed:", err);
        if (!cancelled) {
          setAutoStartError("加载卡组失败，请返回大厅重试");
        }
      }
    };

    autoStart();

    return () => {
      cancelled = true;
    };
  }, [preselectedDeck, firstPlayerChoice, db, dispatch]);

  // ===== 手动模式：4 步流程 =====

  const handleQuickStart = useCallback(async () => {
    setLoadingPrecon(true);
    try {
      const [res1, res2] = await Promise.all([
        fetch("/precon_sd01.json"),
        fetch("/precon_sd02.json"),
      ]);
      const [json1, json2] = await Promise.all([res1.json(), res2.json()]);

      const r1 = getRushCardIds(db, "SD01");
      const r2 = getRushCardIds(db, "SD02");

      const fp: 1 | 2 = Math.random() < 0.5 ? 1 : 2;

      const s1Deck = shuffleArray([...json1.cards]);
      const s2Deck = shuffleArray([...json2.cards]);
      const s1Hand = s1Deck.splice(0, 6);
      const s2Hand = s2Deck.splice(0, 6);

      const state = createFullBattleState(
        [
          makePlayer(1, s1Deck, r1, s1Hand, fp === 1),
          makePlayer(2, s2Deck, r2, s2Hand, fp === 2),
        ],
        fp === 1 ? 0 : 1,
        [
          `🎮 快速开始！使用预组 SD01 vs SD02`,
          `🎲 玩家${fp} 先攻`,
          `📋 玩家1 起手：6张`,
          `📋 玩家2 起手：6张`,
        ]
      );

      dispatch({ type: "SETUP_COMPLETE", state });
    } catch (err) {
      console.error("快速开始失败：", err);
      alert("加载预组失败，请手动设置");
    } finally {
      setLoadingPrecon(false);
    }
  }, [db, dispatch]);

  const handleShuffleDone = () => {
    setStep(1);
  };

  const rollFirstPlayer = () => {
    setRolling(true);
    setFirstPlayerResult(null);
    setTimeout(() => {
      const r: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
      setFirstPlayerResult(r);
      setRolling(false);
    }, 1000);
  };

  const confirmFirstPlayer = useCallback(() => {
    if (!firstPlayerResult) return;
    setStep(2);
  }, [firstPlayerResult]);

  /** Step 2: 确认抽牌 — 实际生成卡组与手牌并保存到 state */
  const confirmDraw = useCallback(() => {
    const allChars = db.cards.filter((c) => c.card_type === 1).map((c) => c.id);
    const allRush = db.cards.filter((c) => c.card_type === 2).map((c) => c.id);

    const d1 = shuffleArray(allChars);
    const d2 = shuffleArray(allChars);
    const r1 = shuffleArray(allRush);
    const r2 = shuffleArray(allRush);

    const h1 = d1.splice(0, 6);
    const h2 = d2.splice(0, 6);

    setP1Deck(d1);
    setP2Deck(d2);
    setP1Hand(h1);
    setP2Hand(h2);
    setP1Rush(r1);
    setP2Rush(r2);

    setStep(3);
    // 先攻玩家先行调度
    setMulliganPlayer(firstPlayerResult ?? 1);
    setMulliganSelected([]);
  }, [db, firstPlayerResult]);

  /** 切换手牌选中状态 */
  const toggleMulliganCard = (cardId: string) => {
    setMulliganSelected((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : [...prev, cardId]
    );
  };

  /**
   * 确认当前玩家的调度
   * 1. 将选中的手牌放回卡组底
   * 2. 从卡组顶抽等量牌
   * 3. 洗混卡组
   */
  const confirmMulligan = useCallback(() => {
    const player = mulliganPlayer;
    if (!player) return;

    const selected = mulliganSelected;
    const isP1 = player === 1;

    // 当前玩家的手牌和卡组
    const currentHand = isP1 ? p1Hand : p2Hand;
    const currentDeck = isP1 ? p1Deck : p2Deck;

    // 分离保留的手牌和放回的手牌
    const keptHand = currentHand.filter((id) => !selected.includes(id));
    const deckAfterBottom = [...currentDeck, ...selected];
    // 从卡组顶抽等量
    const newDraw = deckAfterBottom.splice(0, selected.length);
    const newHand = [...keptHand, ...newDraw];
    // 洗混卡组
    const shuffledDeck = shuffleArray(deckAfterBottom);

    if (isP1) {
      setP1Hand(newHand);
      setP1Deck(shuffledDeck);
      setP1MulliganDone(true);
    } else {
      setP2Hand(newHand);
      setP2Deck(shuffledDeck);
      setP2MulliganDone(true);
    }

    setMulliganSelected([]);

    // 切换到下一个玩家或完成
    const nextPlayer = isP1 ? 2 : 1;
    const nextDone = isP1 ? p2MulliganDone : p1MulliganDone;

    if (nextDone) {
      // 双方都完成调度 — 通过 useEffect 安全调用 finalizeGame
      setMulliganPlayer(null);
      setMulliganComplete(true);
    } else {
      setMulliganPlayer(nextPlayer as 1 | 2);
    }
  }, [mulliganPlayer, mulliganSelected, p1Hand, p2Hand, p1Deck, p2Deck, p1MulliganDone, p2MulliganDone]);

  /** 跳过当前玩家调度 */
  const skipMulligan = useCallback(() => {
    const player = mulliganPlayer;
    if (!player) return;

    const isP1 = player === 1;
    if (isP1) {
      setP1MulliganDone(true);
    } else {
      setP2MulliganDone(true);
    }

    setMulliganSelected([]);

    const nextPlayer = isP1 ? 2 : 1;
    const nextDone = isP1 ? p2MulliganDone : p1MulliganDone;

    if (nextDone) {
      setMulliganPlayer(null);
      setMulliganComplete(true);
    } else {
      setMulliganPlayer(nextPlayer as 1 | 2);
    }
  }, [mulliganPlayer, p1MulliganDone, p2MulliganDone]);

  /** 最终化游戏状态并 dispatch */
  const finalizeGame = useCallback(() => {
    const fp = firstPlayerResult ?? 1;
    console.log("[GameSetup] finalizeGame called:", {
      fp, p1Deck: p1Deck.length, p2Deck: p2Deck.length,
      p1Hand: p1Hand.length, p2Hand: p2Hand.length,
      p1Rush: p1Rush.length, p2Rush: p2Rush.length,
      isLobbyMode
    });

    const baseLog = isLobbyMode
      ? [...lobbyExtraLog, `📋 玩家1 手牌：${p1Hand.length}张`, `📋 玩家2 手牌：${p2Hand.length}张`]
      : [
          `🎮 游戏开始！`,
          `🎲 玩家${fp} 为先攻`,
          `📋 玩家1 手牌：${p1Hand.length}张`,
          `📋 玩家2 手牌：${p2Hand.length}张`,
        ];

    const state = createFullBattleState(
      [
        makePlayer(1, p1Deck, p1Rush, p1Hand, fp === 1),
        makePlayer(2, p2Deck, p2Rush, p2Hand, fp === 2),
      ],
      fp === 1 ? 0 : 1,
      baseLog
    );

    dispatch({ type: "SETUP_COMPLETE", state });
  }, [firstPlayerResult, p1Deck, p2Deck, p1Rush, p2Rush, p1Hand, p2Hand, dispatch, isLobbyMode, lobbyExtraLog]);

  // ===== 安全调用 finalizeGame（修复 stale closure 问题）=====
  // 当 mulliganComplete 为 true 时，所有状态更新已应用，
  // finalizeGame 会使用最新的 p1Hand/p2Hand/p1Deck/p2Deck 等值
  useEffect(() => {
    if (mulliganComplete && !finalizeCalledRef.current) {
      finalizeCalledRef.current = true;
      console.log("[GameSetup] finalizeGame via useEffect — p1Hand:", p1Hand.length, "p2Hand:", p2Hand.length);
      finalizeGame();
    }
  }, [mulliganComplete, finalizeGame, p1Hand.length, p2Hand.length]);

  // ===== 大厅模式：数据准备中显示加载画面 =====
  // 注意：此 early return 必须在所有 hooks 之后，否则违反 Rules of Hooks
  if (isLobbyMode && !lobbyDataReady) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--msa-bg)]">
        <div className="text-center space-y-4">
          {autoStartError ? (
            <>
              <p className="text-red-500 text-lg font-medium">⚠ {autoStartError}</p>
              {onBackToLobby && (
                <button
                  onClick={onBackToLobby}
                  className="px-6 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition"
                >
                  返回大厅
                </button>
              )}
            </>
          ) : (
            <>
              <div className="inline-block w-10 h-10 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-[var(--msa-text-muted)] text-sm">正在准备对战...</p>
              <p className="text-[var(--msa-text-muted)] text-xs">
                卡组：{preselectedDeck!.p1Name}
              </p>
              {onBackToLobby && (
                <button
                  onClick={onBackToLobby}
                  className="text-xs text-[var(--msa-text-muted)] hover:text-[var(--msa-text-secondary)] transition"
                >
                  ← 返回大厅
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  /** 获取当前调度玩家的手牌 */
  const currentMulliganHand = mulliganPlayer === 1 ? p1Hand : p2Hand;

  /** 渲染手牌卡片（调度阶段） */
  const renderMulliganCard = (cardId: string, index: number) => {
    const card = db.cards.find((c) => c.id === cardId);
    const isSelected = mulliganSelected.includes(cardId);
    return (
      <button
        key={cardId + "-" + index}
        onClick={() => toggleMulliganCard(cardId)}
        onMouseEnter={() => setMulliganHover(cardId)}
        onMouseLeave={() => setMulliganHover(null)}
        className={`relative w-16 h-24 rounded-lg border-2 transition-all ${
          isSelected
            ? "border-red-500 bg-red-50 opacity-60"
            : "border-[var(--msa-border)] bg-[var(--msa-bg-alt)] hover:border-[var(--msa-border-strong)]"
        }`}
      >
        {card ? (
          <>
            <img
              src={`/cards/${card.id}.png`}
              alt={card.name}
              className="w-full h-full object-cover rounded-md"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 rounded-b-md py-0.5 px-1">
              <p className="text-[9px] text-[var(--msa-text-primary)]/80 truncate">{card.name}</p>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
            ?
          </div>
        )}
        {isSelected && (
          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 flex items-center justify-center">
            <span className="text-[10px] text-[var(--msa-text-primary)]">✕</span>
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-6 bg-[var(--msa-bg)]">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back to lobby button */}
        {onBackToLobby && (
          <button
            onClick={onBackToLobby}
            className="text-xs text-[var(--msa-text-muted)] hover:text-[var(--msa-text-secondary)] transition flex items-center gap-1"
          >
            ← 返回大厅
          </button>
        )}

        {/* 进度指示 */}
        <div className="flex items-center gap-2 mb-4">
          {[
            { label: "洗牌", done: step > 0 },
            { label: "先后手", done: step > 1 },
            { label: "起手", done: step > 2 },
            { label: "调度", done: mulliganPlayer === null && step >= 3 },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div
                className={`flex-1 text-center text-xs py-1.5 rounded-full font-medium transition ${
                  i === step
                    ? "bg-red-600 text-white"
                    : s.done
                    ? "bg-green-50 text-green-600"
                    : "bg-[var(--msa-surface)] text-[var(--msa-text-muted)]"
                }`}
              >
                {s.label}
              </div>
              {i < 3 && <div className="w-2 h-0.5 bg-[var(--msa-border-strong)] shrink-0" />}
            </div>
          ))}
        </div>

        {/* ===== Step 0: 洗牌 & 放置 ===== */}
        {step === 0 && (
          <div className="text-center space-y-4 py-8">
            <h2 className="text-xl font-bold text-[var(--msa-text-primary)]">准备卡组</h2>
            <p className="text-[var(--msa-text-muted)] max-w-md mx-auto">
              规则 303.1.a/b：<br />
              双方将各自的<strong className="text-[var(--msa-text-secondary)]"> 50 张角色卡</strong>充分洗混后盖放进卡组区域<br />
              将各自的<strong className="text-[var(--msa-text-secondary)]"> 9 张冲击卡</strong>盖放进冲击卡组区域
            </p>

            <div className="flex justify-center gap-8 mt-4">
              {[1, 2].map((pid) => (
                <div key={pid} className="border border-[var(--msa-border)] rounded-xl p-4 w-48 bg-[var(--msa-bg-alt)]">
                  <p className="font-bold text-[var(--msa-text-primary)]">玩家{pid}</p>
                  <div className="mt-2 space-y-2">
                    <div className="bg-blue-50 rounded-lg p-2 text-sm text-blue-600 border border-blue-200">
                      📦 主卡组：{db.cards.filter((c) => c.card_type === 1).length}张角色卡
                      <span className="block text-xs text-blue-600">待洗混</span>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2 text-sm text-amber-600 border border-amber-200">
                      ⚡ 冲击卡组：9张
                      <span className="block text-xs text-amber-600">待放置</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleShuffleDone}
              className="mt-4 px-8 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 transition"
            >
              ✅ 洗牌完成 → 下一步
            </button>

            <div className="mt-2">
              <button
                onClick={handleQuickStart}
                disabled={loadingPrecon}
                className="px-6 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition disabled:opacity-50"
              >
                {loadingPrecon ? "⏳ 加载预组中..." : "⚡ 快速开始（SD01 vs SD02 预组）"}
              </button>
              <p className="text-xs text-[var(--msa-text-muted)] mt-1">
                ⚡ 简化模式，跳过调度（直接开始对战）
              </p>
            </div>
          </div>
        )}

        {/* ===== Step 1: 决定先攻 ===== */}
        {step === 1 && (
          <div className="text-center space-y-4 py-8">
            <h2 className="text-xl font-bold text-[var(--msa-text-primary)]">决定先攻</h2>
            <p className="text-[var(--msa-text-muted)] max-w-md mx-auto">
              规则 303.1.c：双方以同意的方式决定先攻玩家与后攻玩家
            </p>

            {!firstPlayerResult && !rolling && (
              <button
                onClick={rollFirstPlayer}
                className="px-8 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 transition text-lg"
              >
                🎲 掷骰决定先攻
              </button>
            )}

            {rolling && (
              <div className="px-8 py-2.5 rounded-lg bg-[var(--msa-border-strong)] text-[var(--msa-text-muted)] font-medium">
                🎲 掷骰中...
              </div>
            )}

            {firstPlayerResult && (
              <div className="space-y-4">
                <div className="inline-block bg-amber-50 border border-amber-200 rounded-xl px-8 py-4">
                  <p className="text-2xl font-bold text-amber-600">
                    🎉 玩家{firstPlayerResult} 先攻！
                  </p>
                  <p className="text-sm text-[var(--msa-text-muted)] mt-1">
                    玩家{firstPlayerResult === 1 ? 2 : 1} 后攻
                  </p>
                </div>
                <button
                  onClick={confirmFirstPlayer}
                  className="px-8 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-500 transition"
                >
                  确认 → 起始手牌
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== Step 2: 抽起始手牌 ===== */}
        {step === 2 && (
          <div className="text-center space-y-4 py-8">
            <h2 className="text-xl font-bold text-[var(--msa-text-primary)]">抽取起始手牌</h2>
            <p className="text-[var(--msa-text-muted)] max-w-md mx-auto">
              规则 303.1.d：双方从各自卡组抽 <strong className="text-[var(--msa-text-secondary)]">6 张卡</strong> 作为起始手牌
            </p>

            <div className="flex justify-center gap-8 mt-6">
              {[1, 2].map((pid) => (
                <div key={pid} className="border border-[var(--msa-border)] rounded-xl p-5 w-52 bg-[var(--msa-bg-alt)]">
                  <p className="font-bold text-[var(--msa-text-primary)]">
                    玩家{pid}
                    {firstPlayerResult === pid && (
                      <span className="text-xs text-amber-600 ml-1">★先攻</span>
                    )}
                  </p>
                  <div className="mt-3 flex justify-center gap-1">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-10 h-14 bg-gradient-to-br from-[var(--msa-border-strong)] to-[var(--msa-bg)] rounded border border-[var(--msa-border)] shadow-sm flex items-center justify-center text-xs text-gray-400"
                      >
                        ?
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--msa-text-muted)] mt-2">6 张手牌</p>
                </div>
              ))}
            </div>

            <button
              onClick={confirmDraw}
              className="mt-4 px-8 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 transition"
            >
              ✅ 确认各抽6张 → 进入调度
            </button>
          </div>
        )}

        {/* ===== Step 3: 调整起始手牌（Mulligan）===== */}
        {step === 3 && (
          <div className="space-y-4 py-4">
            <h2 className="text-xl font-bold text-[var(--msa-text-primary)] text-center">调整起始手牌</h2>
            <p className="text-[var(--msa-text-muted)] max-w-md mx-auto text-center">
              规则 303.1.e：选中不想要的牌<strong className="text-red-500">放回卡组底</strong>，
              然后从卡组顶抽取等量的牌，再洗混卡组
            </p>

            {mulliganPlayer !== null ? (
              <>
                {/* 当前调度玩家提示 */}
                <div className="text-center">
                  <div className="inline-block bg-amber-50 border border-amber-200 rounded-lg px-6 py-2">
                    <p className="text-sm font-bold text-amber-600">
                      玩家{mulliganPlayer} 调整中
                      {firstPlayerResult === mulliganPlayer && (
                        <span className="text-xs text-amber-300 ml-1">★先攻</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* 手牌选择区 */}
                <div className="bg-[var(--msa-bg-alt)] border border-[var(--msa-border)] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-[var(--msa-text-muted)]">
                      玩家{mulliganPlayer} 的手牌（{currentMulliganHand.length}张）
                    </span>
                    <span className="text-xs text-red-500">
                      已选 {mulliganSelected.length} 张放回
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {currentMulliganHand.map((cardId, idx) => renderMulliganCard(cardId, idx))}
                  </div>

                  {/* 悬浮详情弹窗 */}
                  {mulliganHoverCard && (
                    <div className="mt-3 flex gap-3 bg-white/90 border border-[var(--msa-border-strong)] rounded-lg p-3">
                      <div className="w-20 shrink-0 rounded overflow-hidden border border-[var(--msa-border-strong)]" style={{ aspectRatio: "746 / 1041" }}>
                        <img
                          src={`/cards/${mulliganHoverCard.id}.png`}
                          alt={mulliganHoverCard.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <h3 className="text-sm font-bold text-[var(--msa-text-primary)] truncate">{mulliganHoverCard.name}</h3>
                        <p className="text-[11px] text-[var(--msa-text-muted)]">
                          {mulliganHoverCard.card_no} · {mulliganHoverCard.card_type_name}
                        </p>
                        <div className="flex gap-2 text-[11px]">
                          <span className="text-amber-600">Lv{mulliganHoverCard.cost} ({mulliganHoverCard.cost_name})</span>
                          <span className="text-red-500">战力 {mulliganHoverCard.power ?? "?"}</span>
                          {mulliganHoverCard.r != null && (
                            <span className="text-blue-600">R={mulliganHoverCard.r}</span>
                          )}
                        </div>
                        <div className="flex gap-2 text-[10px]">
                          <span className="px-1 py-0.5 rounded" style={{ backgroundColor: mulliganHoverCard.attribute_color + "20", color: mulliganHoverCard.attribute_color }}>
                            {mulliganHoverCard.attribute_name}
                          </span>
                          {mulliganHoverCard.feature_text && (
                            <span className="px-1 py-0.5 rounded bg-gray-100 text-[var(--msa-text-muted)]">{mulliganHoverCard.feature_text}</span>
                          )}
                        </div>
                        {mulliganHoverCard.effect && mulliganHoverCard.effect !== "-" && (
                          <p className="text-[11px] text-[var(--msa-text-secondary)] leading-relaxed line-clamp-3">
                            {mulliganHoverCard.effect}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex justify-center gap-3">
                  <button
                    onClick={skipMulligan}
                    className="px-6 py-2 rounded-lg bg-stone-200 text-stone-700 text-sm font-medium hover:bg-stone-300 transition"
                  >
                    不调整（跳过）
                  </button>
                  <button
                    onClick={confirmMulligan}
                    disabled={mulliganSelected.length === 0}
                    className="px-6 py-2 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ✅ 确认调整（放回{mulliganSelected.length}张）
                  </button>
                </div>

                {/* 调度进度指示 */}
                <div className="flex justify-center gap-4 text-xs">
                  <span className={p1MulliganDone ? "text-green-600" : "text-[var(--msa-text-muted)]"}>
                    玩家1 {p1MulliganDone ? "✓" : "○"}
                  </span>
                  <span className={p2MulliganDone ? "text-green-600" : "text-[var(--msa-text-muted)]"}>
                    玩家2 {p2MulliganDone ? "✓" : "○"}
                  </span>
                </div>
              </>
            ) : (
              /* 调度完成，显示开始按钮 */
              <div className="text-center space-y-4">
                <div className="inline-block bg-green-50 border border-green-200 rounded-xl px-8 py-4">
                  <p className="text-lg font-bold text-green-600">
                    ✅ 双方调度完成
                  </p>
                  <p className="text-sm text-[var(--msa-text-muted)] mt-1">
                    玩家1：{p1Hand.length}张手牌 | 玩家2：{p2Hand.length}张手牌
                  </p>
                </div>
                <button
                  onClick={finalizeGame}
                  className="px-8 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-500 transition text-lg"
                >
                  🎮 开始游戏！
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
