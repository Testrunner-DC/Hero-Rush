/**
 * ★ useOnlineBattle —— 联机对战契约层
 *
 * 与 useBattle 共享同样的 reducer，但 dispatch 流程不同：
 * - 本地操作：不直接 dispatch，先发服务端
 * - 服务端盖章（seq + playerIdx）广播回来后才 apply
 * - 对手操作亦由服务端广播送达后 apply
 *
 * 配对成功后 P1 创建初始 BattleState（洗牌/发牌/先后手），
 * 通过中继以 SETUP_COMPLETE action 同步给双端——保证开局完全一致。
 *
 * 自动连接：根据页面 hostname 推导 WebSocket URL
 */

import { useState, useRef, useCallback, useEffect, useReducer } from "react";
import type { CardDatabase } from "../types/card";
import {
  createGameReducer,
  type BattleState,
  type GameAction,
  type PlayerState,
  type Zone,
} from "../engine";
import type { ServerMessage } from "../types/protocol";

/** 根据当前页面 hostname 自动推导 WebSocket URL */
function getDefaultWsUrl(): string {
  const host = window.location.hostname;
  if (host === "hero.grand-umi.com" || host === "grand-umi.com") {
    return `wss://${host}/ws/`;
  }
  return `ws://${host}:8081`;
}

// ============================================================
// 状态类型
// ============================================================

export type OnlineStatus =
  | { type: "idle" }
  | { type: "connecting" }
  | { type: "connected" }
  | { type: "queuing"; position: number }
  | { type: "error"; message: string }
  | { type: "matched"; roomId: string; playerIndex: 0 | 1; opponentName: string }
  | { type: "inGame"; playerIndex: 0 | 1; opponentName: string };

// ============================================================
// 初始状态构建（联机用——确保双端一致）
// ============================================================

function shuffleDeck(deck: string[]): string[] {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makePlayer(
  id: 1 | 2, name: string, deck: string[], rushDeck: string[],
  hand: string[], isFirstPlayer: boolean
): PlayerState {
  return {
    id, name, deck, rushDeck, hand,
    baseCards: [], baseCovered: [],
    field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
    timeline: [], retreat: [], void: [],
    isFirstPlayer,
  } as PlayerState;
}

function createInitialState(
  p1Deck: string[], p1Rush: string[], p1Name: string,
  p2Deck: string[], p2Rush: string[], p2Name: string
): BattleState {
  const shuffled1 = shuffleDeck(p1Deck);
  const shuffled2 = shuffleDeck(p2Deck);
  const p1Hand = shuffled1.splice(0, 6);
  const p2Hand = shuffled2.splice(0, 6);
  const firstPlayer = Math.random() < 0.5 ? 0 : 1;

  return {
    isSetup: false,
    setupPhase: "DONE",
    turnPhase: "TURN_START",
    players: [
      makePlayer(1, p1Name, shuffled1, p1Rush, p1Hand, firstPlayer === 0),
      makePlayer(2, p2Name, shuffled2, p2Rush, p2Hand, firstPlayer === 1),
    ],
    activePlayerIndex: firstPlayer,
    turnNumber: 1,
    remainingSummons: 3,
    baseDeployedThisTurn: false,
    baseMovesUsed: {},
    conflictZonesCompleted: [],
    conflictAttackedCards: [],
    log: [`🎮 联机对战开始！`, `📋 ${p1Name} vs ${p2Name}`, `🎲 玩家${firstPlayer + 1} 先攻`],
    isGameOver: false,
    winner: null,
    conflictSubPhase: "adjust",
    conflictMovesUsed: 0,
    currentAttackZone: null,
    pendingAttack: null,
    eventListeners: [],
    registeredAbilities: [],
    pendingSummon: null,
    modifiers: [],
    attachments: {},
    pendingCounter: null,
    pendingTargetSelection: null,
    counterUsedThisTurn: [false, false],
    counterPassCount: 0,
    conflictAttackCount: {},
    temporaryAbilities: {},
    interceptUsedThisTurn: [],
    effectUsedThisTurn: [],
    activatedEffectsThisTurn: [],
    mulliganSelected: [],
    enteredThisTurn: [],
  };
}

// ============================================================
// 钩子
// ============================================================

export function useOnlineBattle(db: CardDatabase) {
  const [status, setStatus] = useState<OnlineStatus>({ type: "idle" });
  const [state, dispatch] = useReducer(createGameReducer(db), null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSeqRef = useRef(0);
  const playerIdxRef = useRef<0 | 1>(0);
  const connectedRef = useRef(false);
  const opponentNameRef = useRef("");

  // ===== 自动连接 =====
  const urlRef = useRef(getDefaultWsUrl());

  useEffect(() => {
    if (connectedRef.current) return;
    connectedRef.current = true;

    const url = urlRef.current;
    setStatus({ type: "connecting" });

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus({ type: "connected" });
      };

      ws.onmessage = (e) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case "QUEUE_STATUS":
            setStatus({ type: "queuing", position: msg.position });
            break;

          case "MATCHED":
            playerIdxRef.current = msg.playerIndex;
            setStatus({ type: "matched", roomId: msg.roomId, playerIndex: msg.playerIndex, opponentName: msg.opponentName });
            break;

          case "GAME_START": {
            opponentNameRef.current = msg.opponentName;
            if (msg.playerIndex === 0) {
              // P1：创建初始状态，通过中继同步给双端
              const p1Deck = msg.deck;
              const p1Rush = msg.rushDeck;
              const p2Deck = msg.opponentDeck;
              const p2Rush = msg.opponentRushDeck;
              const p1Name = msg.opponentName; // P1 名称存在 opponentName 字段
              // 游戏 GAME_START 中 deck 是"自己的卡组"，opponentName 是对手名
              // 但 P1 侧：自己名称由 JOIN_QUEUE 携带——这里只需唯一区别
              const state = createInitialState(p1Deck, p1Rush, "P1", p2Deck, p2Rush, msg.opponentName);
              // 发给服务器中继
              ws.send(JSON.stringify({ type: "GAME_ACTION", action: { type: "SETUP_COMPLETE", state } as unknown as GameAction }));
            }
            break;
          }

          case "GAME_ACTION": {
            // SETUP_COMPLETE（含初始状态）的处理——进入游戏
            const action = msg.action as any;
            if (action.type === "SETUP_COMPLETE") {
              dispatch(action);
              setStatus({ type: "inGame", playerIndex: playerIdxRef.current, opponentName: opponentNameRef.current });
              return;
            }
            // 防重复
            if (msg.seq <= lastSeqRef.current) return;
            lastSeqRef.current = msg.seq;
            dispatch(action);
            break;
          }

          case "OPPONENT_DISCONNECTED":
            setStatus((s) => s.type === "inGame" ? { type: "error", message: "对手断开连接" } : s);
            break;

          case "ERROR":
            setStatus({ type: "error", message: msg.message });
            break;

          case "PONG":
            break;
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setStatus((s) => s.type === "inGame"
          ? { type: "error", message: "与服务器断开连接" }
          : { type: "idle" });
      };

      ws.onerror = () => {
        wsRef.current = null;
        setStatus({ type: "error", message: "无法连接服务器" });
      };
    } catch {
      setStatus({ type: "error", message: "创建 WebSocket 失败" });
    }
  }, []);

  // ===== 加入匹配 =====
  const joinQueue = useCallback((deckCards: string[], rushCards: string[], playerName: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setStatus({ type: "error", message: "未连接到服务器" });
      return;
    }
    ws.send(JSON.stringify({ type: "JOIN_QUEUE", playerName, deck: deckCards, rushDeck: rushCards }));
  }, []);

  // ===== 发送游戏动作 =====
  const sendAction = useCallback((action: GameAction) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "GAME_ACTION", action }));
  }, []);

  // ===== 断开 =====
  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      ws.send(JSON.stringify({ type: "LEAVE_QUEUE" }));
      ws.close();
      wsRef.current = null;
    }
    setStatus({ type: "idle" });
  }, []);

  // ===== 清理 =====
  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
    };
  }, []);

  const isMyTurn = state ? state.activePlayerIndex === playerIdxRef.current : false;

  return {
    status,
    state,
    dispatch,
    playerIdx: playerIdxRef.current,
    isMyTurn,
    joinQueue,
    sendAction,
    disconnect,
  };
}
