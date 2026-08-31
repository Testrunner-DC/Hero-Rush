import { describe, expect, it } from "vitest";
import type { Card } from "../../types/card";
import {
  advanceAutomaticFlowV2,
  allowedCommandTypesV2,
  createGameV2,
  executeCommandV2,
  hashStateV2,
  projectBattleViewV2,
  validateStateInvariantsV2,
} from "../index";
import type {
  CommandEnvelopeV2,
  CreateGameInputV2,
  FlowStateV2,
  GameCommandV2,
  GameStateV2,
  PlayerIndex,
} from "../index";

function makeCard(id: string, cardType: 1 | 2): Card {
  return {
    id,
    card_no: id,
    name: id,
    card_type: cardType,
    card_type_name: cardType === 1 ? "角色卡" : "冲击卡",
    cost: 1,
    cost_name: "1",
    attribute: 1,
    attribute_name: "测试",
    attribute_color: "#000000",
    pp_value: cardType === 1 ? 1000 : null,
    dp_value: cardType === 1 ? 1000 : null,
    power: cardType === 1 ? "1000" : null,
    signal_color: null,
    signal_color_text: null,
    feature: null,
    feature_text: null,
    effect: "",
    package: "TEST",
    package_short: "T",
    rarity: 1,
    rarity_code: "C",
    rarity_cn: "普通",
    rarity_color: "#000000",
    image_url: `/cards/${id}.png`,
  };
}

function makeInput(seed = "m2-seed"): CreateGameInputV2 {
  const main0 = Array.from({ length: 50 }, (_, index) => `P0-M-${index}`);
  const rush0 = Array.from({ length: 9 }, (_, index) => `P0-R-${index}`);
  const main1 = Array.from({ length: 50 }, (_, index) => `P1-M-${index}`);
  const rush1 = Array.from({ length: 9 }, (_, index) => `P1-R-${index}`);
  return {
    matchId: "match-m2",
    seed,
    cardDataVersion: "test-cards",
    engineVersion: "test-engine",
    cardDefinitions: [
      ...main0.map((id) => makeCard(id, 1)),
      ...rush0.map((id) => makeCard(id, 2)),
      ...main1.map((id) => makeCard(id, 1)),
      ...rush1.map((id) => makeCard(id, 2)),
    ],
    players: [
      { name: "玩家 A", mainDeck: main0, rushDeck: rush0 },
      { name: "玩家 B", mainDeck: main1, rushDeck: rush1 },
    ],
  };
}

function submitMulligan(state: GameStateV2, actor: PlayerIndex): CommandEnvelopeV2 {
  return {
    actor,
    commandId: `mulligan-${state.revision}`,
    expectedRevision: state.revision,
    command: { type: "SUBMIT_MULLIGAN", cardIds: [] },
  };
}

function execute(state: GameStateV2, actor: PlayerIndex, command: GameCommandV2) {
  return executeCommandV2(state, {
    actor,
    commandId: `action-${state.revision}`,
    expectedRevision: state.revision,
    command,
  });
}

function createActionState(): GameStateV2 {
  const initial = createGameV2(makeInput());
  const first = executeCommandV2(initial, submitMulligan(initial, initial.firstPlayer));
  if (!first.ok) throw new Error(first.message);
  const secondActor: PlayerIndex = initial.firstPlayer === 0 ? 1 : 0;
  const second = executeCommandV2(first.state, submitMulligan(first.state, secondActor));
  if (!second.ok) throw new Error(second.message);
  const automatic = advanceAutomaticFlowV2(second.state);
  if (!automatic.ok) throw new Error(automatic.message);
  return automatic.state;
}

function cloneState(state: GameStateV2): GameStateV2 {
  return structuredClone(state);
}

describe("V2 M2 行动阶段", () => {
  it("投影精确发布可执行卡牌与落点，并与权威内核使用同一判定", () => {
    const state = createActionState();
    const actor = state.activePlayer;
    const view = projectBattleViewV2(state, actor, hashStateV2(state));
    const handIds = new Set(state.players[actor].hand);
    const deploys = view.legalActions.filter((action) => action.type === "DEPLOY_BASE");
    const summons = view.legalActions.filter((action) => action.type === "SUMMON_CHARACTER");

    expect(new Set(deploys.map((action) => action.cardId))).toEqual(handIds);
    expect(new Set(summons.map((action) => action.cardId))).toEqual(handIds);
    expect(summons.every((action) => action.destinations.length === 5)).toBe(true);
    expect(view.legalActions.some((action) => action.type === "MOVE_BATTLE_BASE")).toBe(false);

    const blocked = cloneState(state);
    blocked.usage.baseDeployedThisTurn = true;
    const blockedView = projectBattleViewV2(blocked, actor, hashStateV2(blocked));
    expect(blockedView.legalActions.some((action) => action.type === "DEPLOY_BASE")).toBe(false);
  });

  it("由服务端自动完成回合开始抽 2，并重置回合用量后进入行动阶段", () => {
    const initial = createGameV2(makeInput());
    const first = executeCommandV2(initial, submitMulligan(initial, initial.firstPlayer));
    if (!first.ok) throw new Error(first.message);
    const other: PlayerIndex = initial.firstPlayer === 0 ? 1 : 0;
    const second = executeCommandV2(first.state, submitMulligan(first.state, other));
    if (!second.ok) throw new Error(second.message);

    const result = advanceAutomaticFlowV2(second.state);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const actor = result.state.activePlayer;
    expect(result.state.flow).toEqual({ kind: "ACTION", actor });
    expect(result.state.players[actor].hand).toHaveLength(8);
    expect(result.state.players[actor].deck).toHaveLength(42);
    expect(result.state.usage).toEqual({
      summonsThisTurn: [0, 0],
      baseDeployedThisTurn: false,
      movedCardIds: [],
      enteredThisTurn: [],
      interceptUsedCardIds: [],
      attackedCardIdsByPlayer: [[], []],
      effectUseKeysThisTurn: [],
    });
    expect(result.events).toEqual([{ type: "TURN_CARDS_DRAWN", actor, count: 2 }]);
  });

  it("基地部署每回合最多一次：手牌盖放 1 张后抽 1 张", () => {
    const state = createActionState();
    const actor = state.activePlayer;
    const cardId = state.players[actor].hand[0];
    const expectedDraw = state.players[actor].deck[0];
    const result = execute(state, actor, { type: "DEPLOY_BASE", cardId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[actor].baseCovered).toEqual([cardId]);
    expect(result.state.players[actor].hand).toHaveLength(8);
    expect(result.state.players[actor].hand).toContain(expectedDraw);
    expect(result.state.players[actor].deck).toHaveLength(41);
    expect(result.state.usage.baseDeployedThisTurn).toBe(true);
    expect(result.state.usage.enteredThisTurn).not.toContain(cardId);

    const secondCard = result.state.players[actor].hand[0];
    const repeated = execute(result.state, actor, { type: "DEPLOY_BASE", cardId: secondCard });
    expect(repeated.ok).toBe(false);
    if (!repeated.ok) expect(repeated.code).toBe("LIMIT_REACHED");
  });

  it("拒绝非当前玩家和伪造来源，拒绝时原状态摘要不变", () => {
    const state = createActionState();
    const actor = state.activePlayer;
    const other: PlayerIndex = actor === 0 ? 1 : 0;
    const before = hashStateV2(state);

    const wrongActor = execute(state, other, { type: "END_ACTION_PHASE" });
    const forged = execute(state, actor, { type: "DEPLOY_BASE", cardId: "forged-card" });

    expect(wrongActor.ok).toBe(false);
    if (!wrongActor.ok) expect(wrongActor.code).toBe("WRONG_ACTOR");
    expect(forged.ok).toBe(false);
    if (!forged.ok) expect(forged.code).toBe("INVALID_SOURCE");
    expect(hashStateV2(state)).toBe(before);
  });

  it("先攻首回合行动号召最多 1 次，Lv3 以下直接进场且不产生支付选择", () => {
    const state = createActionState();
    const actor = state.activePlayer;
    const [firstCard, secondCard] = state.players[actor].hand;
    const summoned = execute(state, actor, {
      type: "SUMMON_CHARACTER",
      cardId: firstCard,
      destination: "vanguard",
    });
    expect(summoned.ok).toBe(true);
    if (!summoned.ok) return;
    expect(summoned.state.players[actor].field.vanguard).toEqual([firstCard]);
    expect(summoned.state.usage.enteredThisTurn).toContain(firstCard);

    const repeated = execute(summoned.state, actor, {
      type: "SUMMON_CHARACTER",
      cardId: secondCard,
      destination: "rear",
    });
    expect(repeated.ok).toBe(false);
    if (!repeated.ok) expect(repeated.code).toBe("LIMIT_REACHED");
  });

  it("Lv4 以上号召要求至少撤退 1 张，且场上 Lv 合计必须精确相等", () => {
    const state = cloneState(createActionState());
    const actor = state.activePlayer;
    state.turnNumber = 2;
    const [summonId, level3Id, coveredId] = state.players[actor].hand;
    state.cards[summonId].level = 4;
    state.cards[level3Id].level = 3;
    state.players[actor].hand = state.players[actor].hand.filter(
      (id) => id !== level3Id && id !== coveredId,
    );
    state.players[actor].field.vanguard = [level3Id];
    state.players[actor].baseCovered = [coveredId];

    const requested = execute(state, actor, {
      type: "SUMMON_CHARACTER",
      cardId: summonId,
      destination: "rear",
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    expect(requested.state.decision?.kind).toBe("SUMMON_PAYMENT");
    if (requested.state.decision?.kind !== "SUMMON_PAYMENT") return;
    expect(JSON.parse(JSON.stringify(requested.state.decision))).toEqual(requested.state.decision);
    const hash = hashStateV2(requested.state);
    expect(projectBattleViewV2(requested.state, actor, hash).availableActions).toEqual(["ANSWER_DECISION", "CANCEL_SUMMON_PAYMENT"]);
    const other: PlayerIndex = actor === 0 ? 1 : 0;
    expect(projectBattleViewV2(requested.state, other, hash).pendingDecision).toBeNull();
    const cancelled = execute(requested.state, actor, { type: "CANCEL_SUMMON_PAYMENT", decisionId: requested.state.decision.id });
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) {
      expect(cancelled.state.decision).toBeNull();
      expect(cancelled.state.flow.kind).toBe("ACTION");
      expect(cancelled.state.players[actor].hand).toContain(summonId);
      expect(cancelled.events).toContainEqual({ type: "SUMMON_PAYMENT_CANCELLED", actor, cardId: summonId });
    }

    const stale = execute(requested.state, actor, {
      type: "ANSWER_DECISION",
      decisionId: "stale-decision",
      cardIds: [level3Id, coveredId],
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("STALE_DECISION");
    expect(hashStateV2(requested.state)).toBe(hash);

    const mismatch = execute(requested.state, actor, {
      type: "ANSWER_DECISION",
      decisionId: requested.state.decision.id,
      cardIds: [level3Id],
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.code).toBe("COST_MISMATCH");

    const result = execute(requested.state, actor, {
      type: "ANSWER_DECISION",
      decisionId: requested.state.decision.id,
      cardIds: [level3Id, coveredId],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.decision?.kind).toBe("SUMMON_DESTINATION");
    expect(result.state.players[actor].field.vanguard).toEqual([]);
    expect(result.state.players[actor].baseCovered).toEqual([]);
    expect(result.state.players[actor].hand).toContain(summonId);
    expect(result.state.players[actor].retreat).toEqual([level3Id, coveredId]);
    if (result.state.decision?.kind !== "SUMMON_DESTINATION") return;
    expect(result.state.decision.choices).toEqual(expect.arrayContaining(["zone:vanguard", "zone:rear"]));
    const placed = execute(result.state, actor, {
      type: "ANSWER_DECISION",
      decisionId: result.state.decision.id,
      cardIds: ["zone:rear"],
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.state.players[actor].field.rear).toEqual([summonId]);
    expect(placed.state.players[actor].hand).not.toContain(summonId);
    expect(validateStateInvariantsV2(placed.state)).toEqual([]);
  });

  it("战基移动每张每回合一次；战区进基地保持正面；盖卡仅在合法移动时翻开并恢复为角色", () => {
    const state = cloneState(createActionState());
    const actor = state.activePlayer;
    const movingId = state.players[actor].hand[0];
    state.players[actor].hand = state.players[actor].hand.filter((id) => id !== movingId);
    state.players[actor].field.vanguard = [movingId];

    const toBase = execute(state, actor, {
      type: "MOVE_BATTLE_BASE",
      cardId: movingId,
      from: "vanguard",
      destination: "base",
    });
    expect(toBase.ok).toBe(true);
    if (!toBase.ok) return;
    expect(toBase.state.players[actor].baseCards).toEqual([movingId]);
    expect(toBase.state.players[actor].baseCovered).toEqual([]);

    const repeated = execute(toBase.state, actor, {
      type: "MOVE_BATTLE_BASE",
      cardId: movingId,
      from: "base",
      destination: "rear",
    });
    expect(repeated.ok).toBe(false);
    if (!repeated.ok) expect(repeated.code).toBe("CARD_ALREADY_MOVED");

    const coveredState = cloneState(createActionState());
    const coveredActor = coveredState.activePlayer;
    const coveredId = coveredState.players[coveredActor].hand[0];
    coveredState.players[coveredActor].hand = coveredState.players[coveredActor].hand.filter((id) => id !== coveredId);
    coveredState.players[coveredActor].baseCovered = [coveredId];
    const flipped = execute(coveredState, coveredActor, {
      type: "MOVE_BATTLE_BASE",
      cardId: coveredId,
      from: "base",
      destination: "rear",
    });
    expect(flipped.ok).toBe(true);
    if (flipped.ok) expect(flipped.state.players[coveredActor].field.rear).toEqual([coveredId]);
    const projected = projectBattleViewV2(coveredState, coveredActor, hashStateV2(coveredState));
    expect(projected.legalActions.some((action) => action.type === "MOVE_BATTLE_BASE" && action.cardId === coveredId)).toBe(true);
  });

  it("本回合正面进场的角色不能战基移动", () => {
    const state = cloneState(createActionState());
    const actor = state.activePlayer;
    const cardId = state.players[actor].hand[0];
    state.players[actor].hand = state.players[actor].hand.filter((id) => id !== cardId);
    state.players[actor].field.flankLeft = [cardId];
    state.usage.enteredThisTurn = [cardId];

    const result = execute(state, actor, {
      type: "MOVE_BATTLE_BASE",
      cardId,
      from: "flankLeft",
      destination: "base",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CARD_ENTERED_THIS_TURN");
  });

  it("先攻首回合结束行动时跳过战斗，之后回合进入战斗开始", () => {
    const firstTurn = createActionState();
    const actor = firstTurn.activePlayer;
    const skipped = execute(firstTurn, actor, { type: "END_ACTION_PHASE" });
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(skipped.state.flow).toEqual({ kind: "TURN_RESPONSE_START", actor });

    const laterTurn = cloneState(firstTurn);
    laterTurn.turnNumber = 2;
    const battle = execute(laterTurn, actor, { type: "END_ACTION_PHASE" });
    expect(battle.ok).toBe(true);
    if (battle.ok) expect(battle.state.flow).toEqual({ kind: "BATTLE_START", actor });
  });

  it("所有外部稳定状态共用一张允许命令表，非授权命令一律不改变状态摘要", () => {
    const action = createActionState();
    const actor = action.activePlayer;
    const other: PlayerIndex = actor === 0 ? 1 : 0;
    expect(allowedCommandTypesV2(action, actor)).toEqual([
      "DEPLOY_BASE", "SUMMON_CHARACTER", "MOVE_BATTLE_BASE", "ACTIVATE_EFFECT", "END_ACTION_PHASE",
    ]);
    expect(allowedCommandTypesV2(action, other)).toEqual([]);

    const flowCases = [
      [{ kind: "BATTLE_ADJUST", actor }, ["SUBMIT_BATTLE_LAYOUT"]],
      [{ kind: "BATTLE_FLANK_CHOICE", actor, choices: ["flankLeft", "flankRight"] }, ["CHOOSE_FLANK_ATTACKER"]],
      [{ kind: "BATTLE_ATTACK", actor, zone: "vanguard", attackerId: "attacker" }, ["DECLARE_ATTACK", "PASS_ATTACK_OPPORTUNITY"]],
      [{ kind: "BATTLE_TARGET", actor, attackerId: "attacker" }, ["DECLARE_ATTACK"]],
      [{ kind: "BATTLE_RESPONSE", actor, priority: other }, ["SUMMON_CHARACTER", "ACTIVATE_KEYWORD", "ACTIVATE_EFFECT", "PASS_PRIORITY"]],
      [{ kind: "TURN_RESPONSE", actor, priority: other }, ["SUMMON_CHARACTER", "ACTIVATE_EFFECT", "PASS_PRIORITY"]],
      [{ kind: "END_EXPIRE", actor }, []],
    ] as const;
    for (const [flow, expected] of flowCases) {
      const state = { ...action, flow } as GameStateV2;
      const policyActor = "priority" in flow ? flow.priority : actor;
      expect(allowedCommandTypesV2(state, policyActor)).toEqual(expected);
    }

    const automaticFlows: FlowStateV2[] = [
      { kind: "TURN_START", actor },
      { kind: "BATTLE_START", actor },
      { kind: "BATTLE_NEXT", actor },
      { kind: "TURN_RESPONSE_START", actor },
      { kind: "END_TRIGGER", actor },
      { kind: "END_EXPIRE", actor },
      { kind: "END_DISCARD", actor },
      { kind: "TURN_SWITCH", actor },
    ];
    for (const flow of automaticFlows) {
      expect(allowedCommandTypesV2({ ...action, flow }, actor)).toEqual([]);
      expect(allowedCommandTypesV2({ ...action, flow }, other)).toEqual([]);
    }

    const forbidden: GameCommandV2[] = [
      { type: "SUBMIT_MULLIGAN", cardIds: [] },
      { type: "ANSWER_DECISION", decisionId: "forged", cardIds: [] },
      { type: "SUBMIT_BATTLE_LAYOUT", layout: { vanguard: null, flankLeft: null, flankRight: null, rear: null }, flankOrder: ["flankLeft", "flankRight"] },
      { type: "CHOOSE_FLANK_ATTACKER", zone: "flankLeft" },
      { type: "DECLARE_ATTACK", attackerId: "forged", target: { kind: "breach", zone: "vanguard" } },
      { type: "PASS_ATTACK_OPPORTUNITY", attackerId: "forged" },
      { type: "PASS_PRIORITY" },
    ];
    const before = hashStateV2(action);
    for (const gameCommand of forbidden) {
      const result = execute(action, actor, gameCommand);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INVALID_FLOW");
      expect(hashStateV2(action)).toBe(before);
    }
  });
});
