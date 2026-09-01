import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CardDatabase } from "@hero-rush/game-core";
import { PROTOCOL_VERSION_V2, type GameCommandV2Message, type ServerMessageV2 } from "@hero-rush/protocol";
import {
  buildGameCommandV2,
  buildMulliganCommandV2,
  initialOnlineBattleStateV2,
  parseServerMessageV2,
  reduceOnlineBattleMessageV2,
} from "../battle-v2/onlineBattleV2State";
import { supabase } from "../lib/supabase";
import { battleV2WebSocketUrl } from "../lib/battleV2WebSocket";

const activeMatchKey = "hero-rush:v2:active-match";
const identityKey = "hero-rush:v2:resume-token";
const id = () => crypto.randomUUID();

export type OnlineStatusV2 =
  | "connecting"
  | "connected"
  | "queuing"
  | "inGame"
  | "reconnecting"
  | "ended"
  | "error";

export function useOnlineBattleV2(_db: CardDatabase) {
  const [status, setStatus] = useState<OnlineStatusV2>("connecting");
  const [battle, setBattle] = useState(initialOnlineBattleStateV2);
  const [opponentConnected, setOpponentConnected] = useState(true);
  const [privateRoomCode, setPrivateRoomCode] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const revisionRef = useRef(0);
  const battleRef = useRef(battle);
  const disposedRef = useRef(false);

  useEffect(() => {
    battleRef.current = battle;
    revisionRef.current = battle.revision;
  }, [battle]);

  const send = useCallback((message: object) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = async () => {
      if (disposedRef.current) return;
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      const ws = new WebSocket(battleV2WebSocketUrl());
      wsRef.current = ws;
      ws.onopen = async () => {
        attempt = 0;
        const { data } = await supabase.auth.getSession();
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
          type: "HELLO_V2",
          protocolVersion: PROTOCOL_VERSION_V2,
          accessToken: data.session?.access_token,
          resumeToken: sessionStorage.getItem(identityKey) ?? undefined,
        }));
      };
      ws.onmessage = (event) => {
        try {
          const message = parseServerMessageV2(JSON.parse(event.data)) as ServerMessageV2;
          if (message.type === "READY_V2") {
            sessionStorage.setItem(identityKey, message.resumeToken);
            const matchId = sessionStorage.getItem(activeMatchKey);
            if (matchId) {
              ws.send(JSON.stringify({
                type: "RESUME_MATCH_V2",
                protocolVersion: PROTOCOL_VERSION_V2,
                requestId: id(),
                matchId,
                lastRevision: revisionRef.current,
              }));
            } else setStatus("connected");
            return;
          }
          if (message.type === "PRIVATE_ROOM_CREATED_V2") {
            setPrivateRoomCode(message.roomCode);
            setStatus("queuing");
            return;
          }
          if (message.type === "QUEUE_STATUS_V2") {
            setPrivateRoomCode(null);
            setStatus("queuing");
            return;
          }
          if (message.type === "MATCH_FOUND_V2" || message.type === "RESUME_OK_V2") {
            sessionStorage.setItem(activeMatchKey, message.matchId);
            setStatus("inGame");
          }
          if (message.type === "OPPONENT_CONNECTION_V2") {
            setOpponentConnected(message.connected);
            return;
          }
          if (message.type === "MATCH_ENDED_V2") {
            sessionStorage.removeItem(activeMatchKey);
            setStatus("ended");
            return;
          }
          if (message.type === "ERROR_V2") {
            if (message.code === "RESUME_DENIED") sessionStorage.removeItem(activeMatchKey);
            setStatus("error");
          }
          setBattle((current) => reduceOnlineBattleMessageV2(current, message));
        } catch {
          setBattle((current) => ({
            ...current,
            lastError: { code: "INVALID_MESSAGE", message: "服务器返回了无法解析的 V2 消息" },
          }));
          setStatus("error");
        }
      };
      ws.onclose = () => {
        if (disposedRef.current) return;
        attempt += 1;
        setStatus("reconnecting");
        retry = setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempt - 1, 4), 15_000));
      };
      ws.onerror = () => setStatus("error");
    };

    void connect();
    return () => {
      disposedRef.current = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const joinQueue = useCallback((deck: string[], rushDeck: string[], playerName: string) => {
    setBattle((current) => ({ ...current, lastError: null }));
    send({
      type: "QUEUE_JOIN_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: id(),
      mode: "casual",
      playerName,
      deckSelection: { deck, rushDeck },
    });
  }, [send]);

  const leaveQueue = useCallback(() => {
    send({ type: "QUEUE_LEAVE_V2", protocolVersion: PROTOCOL_VERSION_V2, requestId: id() });
    setStatus("connected");
    setPrivateRoomCode(null);
  }, [send]);

  const createPrivateRoom = useCallback((deck: string[], rushDeck: string[], playerName: string) => {
    setBattle((current) => ({ ...current, lastError: null }));
    send({
      type: "PRIVATE_ROOM_CREATE_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: id(),
      playerName,
      deckSelection: { deck, rushDeck },
    });
  }, [send]);

  const joinPrivateRoom = useCallback((roomCode: string, deck: string[], rushDeck: string[], playerName: string) => {
    setBattle((current) => ({ ...current, lastError: null }));
    send({
      type: "PRIVATE_ROOM_JOIN_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: id(),
      roomCode: roomCode.trim().toUpperCase(),
      playerName,
      deckSelection: { deck, rushDeck },
    });
  }, [send]);

  const submitMulligan = useCallback((cardIds: string[]) => {
    try {
      const command = buildMulliganCommandV2(battleRef.current, cardIds, {
        requestId: id(),
        commandId: id(),
      });
      send({ type: "GAME_COMMAND_V2", ...command });
    } catch (error) {
      setBattle((current) => ({
        ...current,
        lastError: { code: "CLIENT_VALIDATION", message: error instanceof Error ? error.message : "无法提交调度" },
      }));
    }
  }, [send]);

  const submitGameCommand = useCallback((gameCommand: GameCommandV2Message) => {
    try {
      const command = buildGameCommandV2(battleRef.current, gameCommand, {
        requestId: id(),
        commandId: id(),
      });
      send({ type: "GAME_COMMAND_V2", ...command });
    } catch (error) {
      setBattle((current) => ({
        ...current,
        lastError: {
          code: "CLIENT_VALIDATION",
          message: error instanceof Error ? error.message : "无法提交 V2 命令",
        },
      }));
    }
  }, [send]);

  const surrender = useCallback(() => {
    const matchId = battleRef.current.matchId;
    if (!matchId) return;
    send({
      type: "SURRENDER_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: id(),
      matchId,
    });
  }, [send]);

  return useMemo(() => ({
    status,
    battle,
    opponentConnected,
    privateRoomCode,
    joinQueue,
    leaveQueue,
    createPrivateRoom,
    joinPrivateRoom,
    submitMulligan,
    submitGameCommand,
    surrender,
  }), [status, battle, opponentConnected, privateRoomCode, joinQueue, leaveQueue, createPrivateRoom, joinPrivateRoom, submitMulligan, submitGameCommand, surrender]);
}
