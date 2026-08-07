/**
 * 权威联机契约层。
 * 浏览器只发送 GameCommand；状态、顺序号和玩家身份均以服务端返回为准。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BattleState, CardDatabase } from "@hero-rush/game-core";
import type { GameCommand, ServerMessage } from "@hero-rush/protocol";
import { PROTOCOL_VERSION } from "@hero-rush/protocol";
import { supabase } from "../lib/supabase";

function getDefaultWsUrl(): string {
  const host = window.location.hostname;
  if (host === "hero.grand-umi.com" || host === "grand-umi.com") return `wss://${host}/ws/`;
  return `ws://${host || "localhost"}:8081`;
}

const resumeStorageKey = "hero-rush:active-match";
const identityStorageKey = "hero-rush:resume-token";
const requestId = () => crypto.randomUUID();

export type OnlineStatus =
  | { type: "idle" }
  | { type: "connecting" }
  | { type: "reconnecting"; attempt: number }
  | { type: "connected"; authenticated: boolean }
  | { type: "queuing"; position: number }
  | { type: "privateWaiting"; roomCode: string }
  | { type: "inGame"; playerIndex: 0 | 1; opponentName: string }
  | { type: "ended"; winner: 0 | 1 | null; reason: string }
  | { type: "error"; message: string };

export function useOnlineBattle(_db: CardDatabase, enabled = true) {
  const [status, setStatus] = useState<OnlineStatus>({ type: "idle" });
  const [state, setState] = useState<BattleState | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const playerIdxRef = useRef<0 | 1>(0);
  const seqRef = useRef(0);
  const matchIdRef = useRef<string | null>(sessionStorage.getItem(resumeStorageKey));
  const opponentNameRef = useRef("");
  const manualCloseRef = useRef(false);
  const disposedRef = useRef(false);
  const authenticatedRef = useRef(false);

  const mergeSnapshot = useCallback((incoming: BattleState, events: string[] = []) => {
    setState((previous) => ({
      ...incoming,
      cardInstances: {
        ...(previous?.cardInstances ?? {}),
        ...(incoming.cardInstances ?? {}),
      },
      log: previous ? [...previous.log, ...events] : incoming.log,
    }));
  }, []);

  const handleServerMessage = useCallback((ws: WebSocket, message: ServerMessage) => {
    switch (message.type) {
      case "READY": {
        authenticatedRef.current = message.authenticated;
        // 游客恢复身份必须按标签页隔离；同源页面共享 localStorage 会被
        // 服务端识别为同一玩家，无法在同一浏览器中进行双端对战。
        sessionStorage.setItem(identityStorageKey, message.resumeToken);
        const activeMatch = matchIdRef.current;
        if (activeMatch) {
          ws.send(JSON.stringify({
            type: "RESUME_MATCH",
            requestId: requestId(),
            matchId: activeMatch,
            lastSeq: seqRef.current,
          }));
        } else {
          setStatus({ type: "connected", authenticated: message.authenticated });
        }
        return;
      }
      case "QUEUE_STATUS":
        setStatus({ type: "queuing", position: message.position });
        return;
      case "PRIVATE_ROOM_CREATED":
        setStatus({ type: "privateWaiting", roomCode: message.roomCode });
        setLastError(null);
        return;
      case "MATCH_FOUND":
        matchIdRef.current = message.matchId;
        sessionStorage.setItem(resumeStorageKey, message.matchId);
        playerIdxRef.current = message.seat;
        opponentNameRef.current = message.opponentName;
        seqRef.current = message.seq;
        mergeSnapshot(message.state as unknown as BattleState);
        setStatus({ type: "inGame", playerIndex: message.seat, opponentName: message.opponentName });
        setLastError(null);
        return;
      case "STATE_UPDATED":
        if (message.matchId !== matchIdRef.current || message.seq < seqRef.current) return;
        seqRef.current = message.seq;
        mergeSnapshot(message.state as unknown as BattleState, message.events);
        return;
      case "COMMAND_REJECTED":
        seqRef.current = message.currentSeq;
        setLastError(message.message);
        return;
      case "RESUME_OK":
        matchIdRef.current = message.matchId;
        sessionStorage.setItem(resumeStorageKey, message.matchId);
        playerIdxRef.current = message.seat;
        seqRef.current = message.seq;
        mergeSnapshot(message.state as unknown as BattleState);
        setStatus({
          type: "inGame",
          playerIndex: message.seat,
          opponentName: message.opponentName,
        });
        opponentNameRef.current = message.opponentName;
        setLastError(null);
        return;
      case "OPPONENT_CONNECTION":
        setLastError(message.connected ? null : "对手断线，正在等待重连");
        return;
      case "MATCH_ENDED":
        sessionStorage.removeItem(resumeStorageKey);
        matchIdRef.current = null;
        setStatus({ type: "ended", winner: message.winner, reason: message.reason });
        return;
      case "ERROR":
        if (message.code === "RESUME_DENIED") {
          sessionStorage.removeItem(resumeStorageKey);
          matchIdRef.current = null;
          setState(null);
          setStatus({ type: "connected", authenticated: false });
        }
        setLastError(message.message);
        return;
      case "PONG":
        return;
    }
  }, [mergeSnapshot]);

  useEffect(() => {
    if (!enabled) {
      setStatus({ type: "idle" });
      return;
    }
    disposedRef.current = false;
    manualCloseRef.current = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = async () => {
      if (disposedRef.current || manualCloseRef.current) return;
      setStatus(attempt === 0 ? { type: "connecting" } : { type: "reconnecting", attempt });
      const ws = new WebSocket(getDefaultWsUrl());
      wsRef.current = ws;

      ws.onopen = async () => {
        attempt = 0;
        const { data } = await supabase.auth.getSession();
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
          type: "HELLO",
          protocolVersion: PROTOCOL_VERSION,
          accessToken: data.session?.access_token,
          resumeToken: sessionStorage.getItem(identityStorageKey) ?? undefined,
        }));
      };
      ws.onmessage = (event) => {
        try {
          handleServerMessage(ws, JSON.parse(event.data) as ServerMessage);
        } catch {
          setLastError("服务器返回了无法解析的消息");
        }
      };
      ws.onerror = () => setLastError("无法连接联机服务器");
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (disposedRef.current || manualCloseRef.current) return;
        attempt += 1;
        const delay = Math.min(1000 * 2 ** Math.min(attempt - 1, 4), 15_000);
        setStatus({ type: "reconnecting", attempt });
        retryTimer = setTimeout(connect, delay);
      };
    };

    void connect();
    return () => {
      disposedRef.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, handleServerMessage]);

  const send = useCallback((message: object): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setLastError("当前未连接到服务器");
      return false;
    }
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  const joinQueue = useCallback((deck: string[], rushDeck: string[], playerName: string) => {
    setLastError(null);
    send({
      type: "QUEUE_JOIN",
      requestId: requestId(),
      mode: "casual",
      playerName,
      deckSelection: { deck, rushDeck },
    });
  }, [send]);

  const leaveQueue = useCallback(() => {
    send({ type: "QUEUE_LEAVE", requestId: requestId() });
    setStatus((current) => current.type === "queuing" || current.type === "privateWaiting"
      ? { type: "connected", authenticated: authenticatedRef.current }
      : current);
  }, [send]);

  const createPrivateRoom = useCallback((deck: string[], rushDeck: string[], playerName: string) => {
    setLastError(null);
    send({
      type: "PRIVATE_ROOM_CREATE",
      requestId: requestId(),
      playerName,
      deckSelection: { deck, rushDeck },
    });
  }, [send]);

  const joinPrivateRoom = useCallback((roomCode: string, deck: string[], rushDeck: string[], playerName: string) => {
    setLastError(null);
    send({
      type: "PRIVATE_ROOM_JOIN",
      requestId: requestId(),
      roomCode: roomCode.trim().toUpperCase(),
      playerName,
      deckSelection: { deck, rushDeck },
    });
  }, [send]);

  const sendAction = useCallback((command: GameCommand): boolean => {
    const matchId = matchIdRef.current ?? sessionStorage.getItem(resumeStorageKey);
    if (!matchId) {
      setLastError("当前没有可操作的联机对局");
      return false;
    }
    matchIdRef.current = matchId;
    setLastError(null);
    return send({
      type: "GAME_COMMAND",
      requestId: requestId(),
      matchId,
      commandId: requestId(),
      expectedSeq: seqRef.current,
      command,
    });
  }, [send]);

  const surrender = useCallback(() => {
    const matchId = matchIdRef.current;
    if (matchId) send({ type: "SURRENDER", requestId: requestId(), matchId });
  }, [send]);

  const returnToLobby = useCallback(() => {
    if (matchIdRef.current && status.type !== "ended") surrender();
    sessionStorage.removeItem(resumeStorageKey);
    matchIdRef.current = null;
    seqRef.current = 0;
    setState(null);
    setStatus({ type: "connected", authenticated: authenticatedRef.current });
  }, [status.type, surrender]);

  const disconnect = useCallback(() => {
    manualCloseRef.current = true;
    if (matchIdRef.current) surrender();
    else leaveQueue();
    wsRef.current?.close();
    wsRef.current = null;
    sessionStorage.removeItem(resumeStorageKey);
    matchIdRef.current = null;
    setState(null);
    setStatus({ type: "idle" });
  }, [leaveQueue, surrender]);

  const playerIdx = playerIdxRef.current;
  const isMyTurn = Boolean(state && state.activePlayerIndex === playerIdx);

  return useMemo(() => ({
    status,
    state,
    playerIdx,
    isMyTurn,
    lastError,
    joinQueue,
    leaveQueue,
    createPrivateRoom,
    joinPrivateRoom,
    sendAction,
    surrender,
    returnToLobby,
    disconnect,
  }), [status, state, playerIdx, isMyTurn, lastError, joinQueue, leaveQueue, createPrivateRoom, joinPrivateRoom, sendAction, surrender, returnToLobby, disconnect]);
}

export type OnlineBattleController = ReturnType<typeof useOnlineBattle>;
