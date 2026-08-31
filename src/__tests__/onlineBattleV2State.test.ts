import { describe, expect, it } from "vitest";
import type { BattleViewV2, PlayerViewV2 } from "@hero-rush/game-core";
import { PROTOCOL_VERSION_V2, type ServerMessageV2 } from "@hero-rush/protocol";
import {
  buildGameCommandV2,
  buildMulliganCommandV2,
  initialOnlineBattleStateV2,
  parseServerMessageV2,
  reduceOnlineBattleMessageV2,
} from "../battle-v2/onlineBattleV2State";

function player(name: string): PlayerViewV2 {
  return {
    name,
    deckCount: 44,
    rushDeckCount: 9,
    handCount: 6,
    hand: [],
    baseCards: [],
    baseCoveredCount: 0,
    baseCovered: [],
    field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
    timeline: [],
    retreat: [],
    void: [],
    attached: [],
    attackedCardIds: [],
    exhaustedCardIds: [],
  };
}

function view(revision = 0): BattleViewV2 {
  const p0 = player("玩家零");
  p0.hand = [
    { instanceId: "card-a", definitionId: "A", level: 1, range: 1, power: 1000, effectiveLevel: 1, effectiveRange: 1, effectivePower: 1000, effectIds: [], keywords: [], gainedKeywords: [] },
    { instanceId: "card-b", definitionId: "B", level: 1, range: 1, power: 1000, effectiveLevel: 1, effectiveRange: 1, effectivePower: 1000, effectIds: [], keywords: [], gainedKeywords: [] },
  ];
  return {
    matchId: "match-v2",
    rulesetVersion: "1.02",
    engineVersion: "test",
    revision,
    stateHash: "1234567890abcdef",
    status: "setup",
    viewer: 0,
    firstPlayer: 0,
    activePlayer: 0,
    turnNumber: 1,
    actionUsage: { summonsUsed: 0, summonLimit: 1, baseDeploymentsUsed: 0, baseDeploymentLimit: 1 },
    flow: { kind: "SETUP_MULLIGAN", actor: 0, completed: [false, false] },
    players: [p0, player("玩家一")],
    pendingDecision: {
      id: `mulligan:0:${revision}`,
      kind: "MULLIGAN",
      actor: 0,
      choices: ["card-a", "card-b"],
      min: 0,
      max: 6,
      continuation: { kind: "AFTER_MULLIGAN", nextActor: 1 },
    },
    decisionCards: [],
    battle: null,
    turnResponse: null,
    attachments: {},
    availableActions: ["SUBMIT_MULLIGAN"],
    legalActions: [],
    combat: null,
  };
}

function matchFound(): ServerMessageV2 {
  return {
    type: "MATCH_FOUND_V2",
    protocolVersion: PROTOCOL_VERSION_V2,
    matchId: "match-v2",
    seat: 0,
    opponentName: "玩家一",
    revision: 0,
    stateHash: "1234567890abcdef",
    state: view(),
  };
}

describe("V2 浏览器契约状态", () => {
  it("解析并接收按座位投影的初始视图", () => {
    const parsed = parseServerMessageV2(matchFound());
    const state = reduceOnlineBattleMessageV2(initialOnlineBattleStateV2, parsed);
    expect(state.matchId).toBe("match-v2");
    expect(state.seat).toBe(0);
    expect(state.view?.pendingDecision?.actor).toBe(0);
    expect(state.lastError).toBeNull();
  });

  it("忽略其他对局及较旧 revision 的更新", () => {
    const current = reduceOnlineBattleMessageV2(initialOnlineBattleStateV2, matchFound());
    const stale: ServerMessageV2 = {
      type: "STATE_UPDATED_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      matchId: "match-v2",
      revision: 0,
      stateHash: "abcdef1234567890",
      events: [],
      state: view(0),
    };
    const newer = { ...current, revision: 2 };
    expect(reduceOnlineBattleMessageV2(newer, stale)).toBe(newer);
    expect(reduceOnlineBattleMessageV2(current, { ...stale, matchId: "other-match" })).toBe(current);
  });

  it("累积服务端事件供对局记录面板显示", () => {
    const current = reduceOnlineBattleMessageV2(initialOnlineBattleStateV2, matchFound());
    const updated: ServerMessageV2 = {
      type: "STATE_UPDATED_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      matchId: "match-v2",
      revision: 1,
      stateHash: "abcdef1234567890",
      events: [{ type: "TURN_CARDS_DRAWN", actor: 0, count: 2 }],
      state: view(1),
    };
    expect(reduceOnlineBattleMessageV2(current, updated).events).toEqual([
      { type: "TURN_CARDS_DRAWN", actor: 0, count: 2 },
    ]);
  });

  it("从当前 revision 生成一次性 SUBMIT_MULLIGAN 命令", () => {
    const state = reduceOnlineBattleMessageV2(initialOnlineBattleStateV2, matchFound());
    const command = buildMulliganCommandV2(state, ["card-a"], {
      requestId: "request-1",
      commandId: "command-1",
    });
    expect(command).toEqual({
      protocolVersion: 2,
      requestId: "request-1",
      matchId: "match-v2",
      commandId: "command-1",
      expectedRevision: 0,
      command: { type: "SUBMIT_MULLIGAN", cardIds: ["card-a"] },
    });
  });

  it("只从服务端 availableActions 生成行动阶段命令", () => {
    const current = reduceOnlineBattleMessageV2(initialOnlineBattleStateV2, matchFound());
    const actionView: BattleViewV2 = {
      ...view(3),
      revision: 3,
      status: "playing",
      flow: { kind: "ACTION", actor: 0 },
      pendingDecision: null,
      availableActions: ["DEPLOY_BASE", "SUMMON_CHARACTER", "MOVE_BATTLE_BASE", "END_ACTION_PHASE"],
    };
    const actionState = { ...current, revision: 3, view: actionView };
    expect(buildGameCommandV2(actionState, { type: "END_ACTION_PHASE" }, {
      requestId: "request-action",
      commandId: "command-action",
    })).toMatchObject({
      expectedRevision: 3,
      command: { type: "END_ACTION_PHASE" },
    });
    expect(() => buildGameCommandV2(actionState, {
      type: "ANSWER_DECISION",
      decisionId: "missing",
      cardIds: [],
    }, { requestId: "r", commandId: "c" })).toThrow("不允许");
  });

  it("浏览器侧提前拒绝重复、伪造及非本方调度选择", () => {
    const state = reduceOnlineBattleMessageV2(initialOnlineBattleStateV2, matchFound());
    expect(() => buildMulliganCommandV2(state, ["card-a", "card-a"], { requestId: "r", commandId: "c" }))
      .toThrow("重复或不可选");
    expect(() => buildMulliganCommandV2(state, ["forged"], { requestId: "r", commandId: "c" }))
      .toThrow("重复或不可选");
    expect(() => buildMulliganCommandV2({ ...state, seat: 1 }, [], { requestId: "r", commandId: "c" }))
      .toThrow("不是本方");
  });

  it("保留服务端拒绝原因与权威 revision", () => {
    const current = reduceOnlineBattleMessageV2(initialOnlineBattleStateV2, matchFound());
    const rejected: ServerMessageV2 = {
      type: "COMMAND_REJECTED_V2",
      protocolVersion: PROTOCOL_VERSION_V2,
      requestId: "request-1",
      matchId: "match-v2",
      commandId: "command-1",
      currentRevision: 3,
      stateHash: "abcdef1234567890",
      code: "STALE_REVISION",
      message: "命令基于过期状态",
    };
    const next = reduceOnlineBattleMessageV2(current, rejected);
    expect(next.revision).toBe(3);
    expect(next.lastError).toEqual({ code: "STALE_REVISION", message: "命令基于过期状态" });
  });
});
