import type { BattleViewV2 } from "@hero-rush/game-core";
import {
  PROTOCOL_VERSION_V2,
  ServerMessageV2Schema,
  type GameCommandV2Message,
  type GameCommandEnvelopeV2Message,
  type ServerMessageV2,
} from "@hero-rush/protocol";

export interface OnlineBattleStateV2 {
  matchId: string | null;
  seat: 0 | 1 | null;
  opponentName: string;
  revision: number;
  stateHash: string | null;
  view: BattleViewV2 | null;
  events: unknown[];
  lastError: { code: string; message: string } | null;
}

export const initialOnlineBattleStateV2: OnlineBattleStateV2 = {
  matchId: null,
  seat: null,
  opponentName: "",
  revision: 0,
  stateHash: null,
  view: null,
  events: [],
  lastError: null,
};

function isBattleViewV2(value: unknown): value is BattleViewV2 {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<BattleViewV2>;
  return view.rulesetVersion === "1.02"
    && typeof view.matchId === "string"
    && typeof view.revision === "number"
    && Array.isArray(view.players)
    && view.players.length === 2;
}

export function parseServerMessageV2(input: unknown): ServerMessageV2 {
  return ServerMessageV2Schema.parse(input);
}

export function reduceOnlineBattleMessageV2(
  current: OnlineBattleStateV2,
  message: ServerMessageV2,
): OnlineBattleStateV2 {
  switch (message.type) {
    case "MATCH_FOUND_V2":
    case "RESUME_OK_V2": {
      if (!isBattleViewV2(message.state)) {
        return { ...current, lastError: { code: "INVALID_VIEW", message: "服务器返回的 V2 对局视图无效" } };
      }
      return {
        matchId: message.matchId,
        seat: message.seat,
        opponentName: message.opponentName,
        revision: message.revision,
        stateHash: message.stateHash,
        view: message.state,
        events: message.type === "RESUME_OK_V2" ? current.events : [],
        lastError: null,
      };
    }
    case "STATE_UPDATED_V2":
    case "COMMAND_ACCEPTED_V2": {
      if (current.matchId !== message.matchId || message.revision < current.revision) return current;
      if (!isBattleViewV2(message.state)) {
        return { ...current, lastError: { code: "INVALID_VIEW", message: "服务器返回的 V2 对局视图无效" } };
      }
      return {
        ...current,
        revision: message.revision,
        stateHash: message.stateHash,
        view: message.state,
        events: [...current.events, ...message.events].slice(-80),
        lastError: null,
      };
    }
    case "COMMAND_REJECTED_V2":
      if (current.matchId !== message.matchId) return current;
      return {
        ...current,
        revision: message.currentRevision,
        stateHash: message.stateHash,
        lastError: { code: message.code, message: message.message },
      };
    case "ERROR_V2":
      return { ...current, lastError: { code: message.code, message: message.message } };
    case "READY_V2":
    case "QUEUE_STATUS_V2":
    case "PRIVATE_ROOM_CREATED_V2":
    case "OPPONENT_CONNECTION_V2":
    case "MATCH_ENDED_V2":
    case "PONG_V2":
      return current;
  }
  return current;
}

export function buildMulliganCommandV2(
  state: OnlineBattleStateV2,
  cardIds: string[],
  ids: { requestId: string; commandId: string },
): GameCommandEnvelopeV2Message {
  if (!state.matchId || state.seat === null || !state.view) {
    throw new Error("当前没有可提交调度的 V2 对局");
  }
  if (state.view.pendingDecision?.kind !== "MULLIGAN") {
    throw new Error("当前没有调度决策");
  }
  if (state.view.pendingDecision.actor !== state.seat) {
    throw new Error("当前不是本方的调度决策");
  }
  const choices = new Set(state.view.pendingDecision.choices);
  if (new Set(cardIds).size !== cardIds.length || cardIds.some((id) => !choices.has(id))) {
    throw new Error("调度选择包含重复或不可选卡牌");
  }
  return {
    protocolVersion: PROTOCOL_VERSION_V2,
    requestId: ids.requestId,
    matchId: state.matchId,
    commandId: ids.commandId,
    expectedRevision: state.revision,
    command: { type: "SUBMIT_MULLIGAN", cardIds },
  };
}

export function buildGameCommandV2(
  state: OnlineBattleStateV2,
  command: GameCommandV2Message,
  ids: { requestId: string; commandId: string },
): GameCommandEnvelopeV2Message {
  if (!state.matchId || state.seat === null || !state.view) {
    throw new Error("当前没有可提交命令的 V2 对局");
  }
  if (!state.view.availableActions.includes(command.type)) {
    throw new Error("当前阶段不允许执行该操作");
  }
  if (command.type === "ANSWER_DECISION" || command.type === "CANCEL_SUMMON_PAYMENT") {
    if (!state.view.pendingDecision || state.view.pendingDecision.id !== command.decisionId) {
      throw new Error("当前选择已经过期");
    }
  }
  return {
    protocolVersion: PROTOCOL_VERSION_V2,
    requestId: ids.requestId,
    matchId: state.matchId,
    commandId: ids.commandId,
    expectedRevision: state.revision,
    command,
  };
}
