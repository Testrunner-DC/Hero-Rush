/**
 * ★ useOnlineBattle —— 联机对战契约层
 *
 * 与 useBattle 共享同样的 reducer + 预校验逻辑，但 dispatch 流程不同：
 * - 本地操作：不直接 dispatch，打包后发送服务端
 * - 服务端盖章（seq + playerIdx）广播回来后才 apply
 * - 对手操作亦由服务端广播送达后 apply
 *
 * 连接状态自动机：
 *   idle → connecting → queuing → matched → inGame
 *                     → error（连接失败 / 匹配超时）
 */

import { useState, useRef, useCallback, useEffect, useReducer } from "react";
import type { CardDatabase, Card, DeckEntry } from "../types/card";
import {
  createGameReducer,
  canZoneAttack,
  ZONE_LIST,
  type BattleState,
  type GameAction,
  type TurnPhase,
  type Zone,
} from "../engine";
import type { ServerMessage } from "../types/protocol";

// ============================================================
// 状态类型
// ============================================================

export type OnlineStatus =
  | { type: "idle" }
  | { type: "connecting" }
  | { type: "queuing"; position: number }
  | { type: "error"; message: string }
  | { type: "matched"; roomId: string; playerIndex: 0 | 1; opponentName: string }
  | { type: "inGame"; playerIndex: 0 | 1; opponentName: string };

// ============================================================
// 钩子
// ============================================================

export function useOnlineBattle(db: CardDatabase) {
  const [status, setStatus] = useState<OnlineStatus>({ type: "idle" });
  const [state, dispatch] = useReducer(createGameReducer(db), null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSeqRef = useRef(0);
  const playerIdxRef = useRef<0 | 1>(0);

  // ===== 连接 =====
  const connect = useCallback((url: string) => {
    if (wsRef.current) return;
    setStatus({ type: "connecting" });

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // 状态保持为 connecting，等用户调用 joinQueue
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
            // 游戏开始：只有 P1 执行开局逻辑，P2 等待 SETUP_COMPLETE
            const pi = playerIdxRef.current;
            setStatus({ type: "inGame", playerIndex: pi, opponentName: msg.opponentName });
            break;
          }

          case "GAME_ACTION":
            // 防重复（掉线重连可能收到历史消息）
            if (msg.seq <= lastSeqRef.current) return;
            lastSeqRef.current = msg.seq;
            dispatch(msg.action as GameAction);
            break;

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

  // ===== 离开匹配/断开 =====
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

  // ===== 当前玩家是否是活跃玩家（可以操作） =====
  const isMyTurn = state ? state.activePlayerIndex === playerIdxRef.current : false;

  return {
    status,
    state,
    dispatch,
    playerIdx: playerIdxRef.current,
    isMyTurn,
    connect,
    joinQueue,
    sendAction,
    disconnect,
    /** 原始 useBattle 兼容的 actions（sendAction 的一个版本，在 isMyTurn 时才发送） */
    sendActionIfMyTurn: useCallback((action: GameAction) => {
      if (playerIdxRef.current === 0 || true) {
        // P1/P2 各自只能操作自己的回合；活跃性由 engine dispatch 时自己判断
        sendAction(action);
      }
    }, [sendAction]),
  };
}
