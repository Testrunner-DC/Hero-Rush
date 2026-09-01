import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AtomicOperationV2,
  BattleViewV2,
  GameEventV2,
  PlayerIndex,
} from "@hero-rush/game-core";
import {
  PROTOCOL_VERSION_V2,
  ServerMessageV2Schema,
  type GameCommandV2Message,
  type SandboxCommandPayloadV2Message,
} from "@hero-rush/protocol";
import { supabase } from "../lib/supabase";

function websocketUrl(): string {
  const host = window.location.hostname;
  if (window.location.protocol === "https:") return `wss://${window.location.host}/ws/`;
  return `ws://${host || "localhost"}:8081`;
}

const identityKey = "hero-rush:v2:resume-token";
const sandboxMatchKey = "hero-rush:v2:active-sandbox";
const id = () => crypto.randomUUID();

export interface SandboxDeckInputV2 {
  name: string;
  deck: string[];
  rushDeck: string[];
}

export interface SandboxLogV2 {
  revision: number;
  label: string;
  events: GameEventV2[];
  trace?: unknown[];
}

type SandboxStatusV2 = "connecting" | "connected" | "creating" | "ready" | "reconnecting" | "error";

export function useSandboxBattleV2() {
  const [status, setStatus] = useState<SandboxStatusV2>("connecting");
  const [view, setView] = useState<BattleViewV2 | null>(null);
  const [logs, setLogs] = useState<SandboxLogV2[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [invariantIssues, setInvariantIssues] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const viewRef = useRef<BattleViewV2 | null>(null);
  const disposedRef = useRef(false);
  const readyRef = useRef(false);
  const pendingCreateRef = useRef<{ seed: string; players: [SandboxDeckInputV2, SandboxDeckInputV2] } | null>(null);
  const commandLabelsRef = useRef(new Map<string, string>());
  const resumeRequestRef = useRef<string | null>(null);

  useEffect(() => { viewRef.current = view; }, [view]);

  const send = useCallback((message: object): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  const sendCreate = useCallback((input: { seed: string; players: [SandboxDeckInputV2, SandboxDeckInputV2] }) => {
    setStatus("creating");
    setLastError(null);
    return send({
      type: "SANDBOX_CREATE_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: id(),
      seed: input.seed,
      players: input.players.map((player) => ({
        name: player.name,
        deckSelection: { deck: player.deck, rushDeck: player.rushDeck },
      })),
    });
  }, [send]);

  useEffect(() => {
    disposedRef.current = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

    const connect = async () => {
      if (disposedRef.current) return;
      readyRef.current = false;
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      const ws = new WebSocket(websocketUrl());
      wsRef.current = ws;
      ws.onopen = async () => {
        const { data } = await supabase.auth.getSession();
        if (wsRef.current !== ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
          type: "HELLO_V2",
          protocolVersion: PROTOCOL_VERSION_V2,
          accessToken: data.session?.access_token,
          resumeToken: sessionStorage.getItem(identityKey) ?? undefined,
        }));
        heartbeat = setInterval(() => {
          if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "PING_V2", protocolVersion: PROTOCOL_VERSION_V2, timestamp: Date.now() }));
          }
        }, 25_000);
      };
      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        let raw: unknown;
        try {
          raw = JSON.parse(event.data);
        } catch {
          setLastError("服务器返回了无效 JSON");
          setStatus("error");
          return;
        }
        const parsed = ServerMessageV2Schema.safeParse(raw);
        if (!parsed.success) {
          setLastError("服务器返回了无法解析的 V2 沙盒消息");
          setStatus("error");
          return;
        }
        const message = parsed.data;
        if (message.type === "READY_V2") {
          attempt = 0;
          readyRef.current = true;
          setLastError(null);
          sessionStorage.setItem(identityKey, message.resumeToken);
          const activeMatchId = viewRef.current?.matchId ?? sessionStorage.getItem(sandboxMatchKey);
          if (activeMatchId) {
            const requestId = id();
            resumeRequestRef.current = requestId;
            setStatus("reconnecting");
            send({
              type: "SANDBOX_RESUME_V2",
              protocolVersion: PROTOCOL_VERSION_V2,
              requestId,
              matchId: activeMatchId,
              lastRevision: viewRef.current?.revision ?? 0,
            });
            return;
          }
          const pending = pendingCreateRef.current;
          if (pending) sendCreate(pending);
          else setStatus("connected");
          return;
        }
        if (message.type === "SANDBOX_CREATED_V2") {
          const nextView = message.state as BattleViewV2;
          if (viewRef.current?.matchId === nextView.matchId && nextView.revision < viewRef.current.revision) return;
          setView(nextView);
          viewRef.current = nextView;
          sessionStorage.setItem(sandboxMatchKey, message.matchId);
          resumeRequestRef.current = null;
          setInvariantIssues(message.invariantIssues);
          setLogs(message.recovered
            ? (message.journal ?? []).map((entry) => ({
                revision: entry.revision,
                label: entry.accepted ? entry.label : `${entry.label} · 拒绝 ${entry.code ?? "UNKNOWN"}`,
                events: entry.events as GameEventV2[],
                trace: entry.trace,
              }))
            : [{ revision: message.revision, label: "服务端建立沙盒", events: [] }]);
          setLastError(null);
          setStatus("ready");
          return;
        }
        if (message.type === "COMMAND_ACCEPTED_V2" && viewRef.current?.matchId === message.matchId) {
          if (message.revision < viewRef.current.revision) return;
          const label = commandLabelsRef.current.get(message.commandId) ?? "服务端接受命令";
          commandLabelsRef.current.delete(message.commandId);
          const nextView = message.state as BattleViewV2;
          setView(nextView);
          viewRef.current = nextView;
          setInvariantIssues(message.invariantIssues ?? []);
          setLogs((current) => [...current.slice(-49), {
            revision: message.revision,
            label,
            events: message.events as GameEventV2[],
            trace: message.trace,
          }]);
          setLastError(null);
          setStatus("ready");
          return;
        }
        if (message.type === "COMMAND_REJECTED_V2" && viewRef.current?.matchId === message.matchId) {
          setLastError(`${message.code}：${message.message}`);
          commandLabelsRef.current.delete(message.commandId);
          return;
        }
        if (message.type === "ERROR_V2") {
          if (message.code === "SANDBOX_RESUME_DENIED" && message.requestId === resumeRequestRef.current) {
            resumeRequestRef.current = null;
            sessionStorage.removeItem(sandboxMatchKey);
            setView(null);
            viewRef.current = null;
            const pending = pendingCreateRef.current;
            if (pending) sendCreate(pending);
            else setStatus("connected");
            return;
          }
          setLastError(`${message.code}：${message.message}`);
          setStatus("error");
        }
      };
      ws.onclose = () => {
        if (wsRef.current !== ws || disposedRef.current) return;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        readyRef.current = false;
        attempt += 1;
        setStatus("reconnecting");
        retry = setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempt - 1, 4), 15_000));
      };
      ws.onerror = () => {
        setLastError("无法连接 V2 权威沙盒服务");
        setStatus("error");
      };
    };

    void connect();
    return () => {
      disposedRef.current = true;
      if (retry) clearTimeout(retry);
      if (heartbeat) clearInterval(heartbeat);
      const activeMatchId = viewRef.current?.matchId ?? sessionStorage.getItem(sandboxMatchKey);
      if (activeMatchId && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "SANDBOX_CLOSE_V2",
          protocolVersion: PROTOCOL_VERSION_V2,
          requestId: id(),
          matchId: activeMatchId,
        }));
      }
      sessionStorage.removeItem(sandboxMatchKey);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sendCreate]);

  const createSandbox = useCallback((seed: string, players: [SandboxDeckInputV2, SandboxDeckInputV2]) => {
    const input = { seed, players };
    pendingCreateRef.current = input;
    resumeRequestRef.current = null;
    if (readyRef.current) sendCreate(input);
  }, [sendCreate]);

  const submitPayload = useCallback((payload: SandboxCommandPayloadV2Message, label: string) => {
    const current = viewRef.current;
    if (!current) {
      setLastError("沙盒尚未由服务器建立");
      return false;
    }
    const commandId = id();
    commandLabelsRef.current.set(commandId, label);
    const sent = send({
      type: "SANDBOX_COMMAND_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: id(),
      matchId: current.matchId,
      commandId,
      expectedRevision: current.revision,
      payload,
    });
    if (!sent) {
      commandLabelsRef.current.delete(commandId);
      setLastError("沙盒连接不可用，命令未发送");
    }
    return sent;
  }, [send]);

  const submitGameCommand = useCallback((actor: PlayerIndex, command: GameCommandV2Message, label: string = command.type) => (
    submitPayload({ kind: "GAME", actor, command }, label)
  ), [submitPayload]);

  const applyAtomicOperations = useCallback((operations: AtomicOperationV2[], label: string) => (
    submitPayload({ kind: "ATOMIC", operations }, label)
  ), [submitPayload]);

  const finishMulligan = useCallback(() => submitPayload({ kind: "FINISH_MULLIGAN" }, "双方跳过调度"), [submitPayload]);

  return useMemo(() => ({
    status,
    view,
    logs,
    lastError,
    invariantIssues,
    createSandbox,
    submitGameCommand,
    applyAtomicOperations,
    finishMulligan,
  }), [status, view, logs, lastError, invariantIssues, createSandbox, submitGameCommand, applyAtomicOperations, finishMulligan]);
}
