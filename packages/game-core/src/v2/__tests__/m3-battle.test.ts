import { afterEach, describe, expect, it } from "vitest";
import type { Card } from "../../types/card";
import {
  advanceAutomaticFlowV2,
  battleDistanceV2,
  clearEffectRegistryForTestsV2,
  createGameV2,
  executeAuthoritativeCommandV2,
  executeCommandV2,
  hashStateV2,
  projectBattleViewV2,
  registerEffectV2,
  validateStateInvariantsV2,
} from "../index";
import type {
  CreateGameInputV2,
  FieldZoneV2,
  GameCommandV2,
  GameStateV2,
  PlayerIndex,
} from "../index";

afterEach(() => clearEffectRegistryForTestsV2());

function card(id: string, type: 1 | 2): Card {
  return {
    id,
    card_no: id,
    name: id,
    card_type: type,
    card_type_name: type === 1 ? "角色卡" : "冲击卡",
    cost: 1,
    cost_name: "1",
    attribute: 1,
    attribute_name: "测试",
    attribute_color: "#000",
    pp_value: null,
    dp_value: null,
    power: type === 1 ? "1000" : null,
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
    rarity_color: "#000",
    image_url: `/cards/${id}.png`,
    r: 1,
  };
}

function input(): CreateGameInputV2 {
  const m0 = Array.from({ length: 50 }, (_, index) => `P0-M-${index}`);
  const r0 = Array.from({ length: 9 }, (_, index) => `P0-R-${index}`);
  const m1 = Array.from({ length: 50 }, (_, index) => `P1-M-${index}`);
  const r1 = Array.from({ length: 9 }, (_, index) => `P1-R-${index}`);
  return {
    matchId: "m3-battle",
    seed: "m3-seed",
    cardDefinitions: [
      ...m0.map((id) => card(id, 1)),
      ...r0.map((id) => card(id, 2)),
      ...m1.map((id) => card(id, 1)),
      ...r1.map((id) => card(id, 2)),
    ],
    players: [
      { name: "A", mainDeck: m0, rushDeck: r0 },
      { name: "B", mainDeck: m1, rushDeck: r1 },
    ],
  };
}

function command(state: GameStateV2, actor: PlayerIndex, gameCommand: GameCommandV2, automatic = true) {
  const envelope = {
    actor,
    commandId: `m3-${state.revision}`,
    expectedRevision: state.revision,
    command: gameCommand,
  };
  return automatic
    ? executeAuthoritativeCommandV2(state, envelope)
    : executeCommandV2(state, envelope);
}

function actionState(): GameStateV2 {
  let state = createGameV2(input());
  for (let index = 0; index < 2; index += 1) {
    const actor = state.decision?.actor;
    if (actor === undefined) throw new Error("missing mulligan");
    const result = command(state, actor, { type: "SUBMIT_MULLIGAN", cardIds: [] });
    if (!result.ok) throw new Error(result.message);
    state = result.state;
  }
  return state;
}

function placeFromHand(state: GameStateV2, actor: PlayerIndex, zone: FieldZoneV2): string {
  const id = state.players[actor].hand[0];
  state.players[actor].hand = state.players[actor].hand.slice(1);
  state.players[actor].field[zone] = [id];
  return id;
}

function enterBattleAdjust(state: GameStateV2) {
  state.turnNumber = 2;
  const actor = state.activePlayer;
  return command(state, actor, { type: "END_ACTION_PHASE" });
}

function currentLayout(state: GameStateV2, actor: PlayerIndex) {
  return Object.fromEntries(
    (["vanguard", "flankLeft", "flankRight", "rear"] as const).map((zone) => [zone, state.players[actor].field[zone][0] ?? null]),
  ) as Record<FieldZoneV2, string | null>;
}

describe("V2 M3 战斗主流程", () => {
  it("六节点距离矩阵按后卫—侧翼—先锋—敌先锋—敌侧翼—敌后卫逐段计算", () => {
    const nodes: Array<[PlayerIndex, FieldZoneV2]> = [
      [0, "rear"], [0, "flankLeft"], [0, "vanguard"],
      [1, "vanguard"], [1, "flankRight"], [1, "rear"],
    ];
    const matrix = nodes.map(([owner, zone]) => nodes.map(([targetOwner, targetZone]) => (
      Math.abs((owner === 0 ? battleDistanceV2(0, zone, targetOwner, targetZone) : 0))
    )));
    expect(matrix[0]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(matrix[2][3]).toBe(1);
    expect(matrix[1][4]).toBe(3);
  });

  it("战区调整必须是完整、无重复的原子排列，且不提前锁定侧翼攻击顺序", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const first = placeFromHand(state, actor, "vanguard");
    const second = placeFromHand(state, actor, "rear");
    const entered = enterBattleAdjust(state);
    expect(entered.ok).toBe(true);
    if (!entered.ok) return;
    expect(entered.state.flow.kind).toBe("BATTLE_ADJUST");
    const before = hashStateV2(entered.state);
    const invalid = command(entered.state, actor, {
      type: "SUBMIT_BATTLE_LAYOUT",
      layout: { vanguard: first, flankLeft: first, flankRight: null, rear: null },
      flankOrder: ["flankLeft", "flankRight"],
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.code).toBe("INVALID_LAYOUT");
    expect(hashStateV2(entered.state)).toBe(before);

    const valid = command(entered.state, actor, {
      type: "SUBMIT_BATTLE_LAYOUT",
      layout: { vanguard: first, flankLeft: second, flankRight: null, rear: null },
      flankOrder: ["flankRight", "flankLeft"],
    });
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.state.battle?.order).toEqual(["vanguard", "flankLeft", "flankRight", "rear"]);
    expect(valid.state.flow).toMatchObject({ kind: "BATTLE_ATTACK", attackerId: first });
  });

  it("两个侧翼都能攻击时，由回合玩家在侧翼攻击时选择先攻角色", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const left = placeFromHand(state, actor, "flankLeft");
    const right = placeFromHand(state, actor, "flankRight");
    state.cards[left].range = 1;
    state.cards[right].range = 1;
    const entered = enterBattleAdjust(state);
    if (!entered.ok) throw new Error(entered.message);
    const layout = command(entered.state, actor, { type: "SUBMIT_BATTLE_LAYOUT", layout: currentLayout(entered.state, actor) });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    expect(layout.state.flow).toEqual({ kind: "BATTLE_FLANK_CHOICE", actor, choices: ["flankLeft", "flankRight"] });
    const chosen = command(layout.state, actor, { type: "CHOOSE_FLANK_ATTACKER", zone: "flankRight" });
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.state.flow).toMatchObject({ kind: "BATTLE_ATTACK", zone: "flankRight", attackerId: right });
  });

  it("一侧侧翼攻击期间应对号召到已跳过的另一侧翼时，新角色仍获得攻击机会", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const attackerId = placeFromHand(state, actor, "flankRight");
    const targetId = placeFromHand(state, defender, "vanguard");
    const responseSummonId = state.players[actor].hand[0];
    state.cards[attackerId].power = 2000;
    state.cards[attackerId].range = 3;
    state.cards[responseSummonId].printedKeywords = ["counter"];

    const entered = enterBattleAdjust(state);
    if (!entered.ok) throw new Error(entered.message);
    const layout = command(entered.state, actor, { type: "SUBMIT_BATTLE_LAYOUT", layout: currentLayout(entered.state, actor) });
    if (!layout.ok) throw new Error(layout.message);
    expect(layout.state.flow).toMatchObject({ kind: "BATTLE_ATTACK", zone: "flankRight", attackerId });

    const declared = command(layout.state, actor, { type: "DECLARE_ATTACK", attackerId, target: { kind: "character", cardId: targetId } });
    if (!declared.ok) throw new Error(declared.message);
    const defenderPassed = command(declared.state, defender, { type: "PASS_PRIORITY" });
    if (!defenderPassed.ok) throw new Error(defenderPassed.message);
    const summoned = command(defenderPassed.state, actor, { type: "SUMMON_CHARACTER", cardId: responseSummonId, destination: "flankLeft" });
    expect(summoned.ok).toBe(true);
    if (!summoned.ok) return;
    expect(summoned.state.battle?.order.slice(summoned.state.battle.cursor + 1)).toContain("flankLeft");

    const passBack = command(summoned.state, defender, { type: "PASS_PRIORITY" });
    if (!passBack.ok) throw new Error(passBack.message);
    const resolved = command(passBack.state, actor, { type: "PASS_PRIORITY" });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.flow).toEqual({ kind: "BATTLE_ATTACK", actor, zone: "flankLeft", attackerId: responseSummonId });
  });

  it("声明角色攻击后由非回合玩家先应对，双方连续放弃后按战力判定", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const attackerId = placeFromHand(state, actor, "vanguard");
    const targetId = placeFromHand(state, defender, "vanguard");
    state.cards[attackerId].power = 3000;
    state.cards[attackerId].range = 1;
    state.cards[targetId].power = 2000;
    state.modifiers.push({
      id: "presentation-power-bonus",
      sourceCardId: attackerId,
      targetCardId: attackerId,
      type: "power",
      value: 500,
      duration: "turn",
    });
    const entered = enterBattleAdjust(state);
    if (!entered.ok) throw new Error(entered.message);
    const layout = command(entered.state, actor, {
      type: "SUBMIT_BATTLE_LAYOUT",
      layout: currentLayout(entered.state, actor),
      flankOrder: ["flankLeft", "flankRight"],
    });
    if (!layout.ok) throw new Error(layout.message);
    const declared = command(layout.state, actor, {
      type: "DECLARE_ATTACK",
      attackerId,
      target: { kind: "character", cardId: targetId },
    });
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;
    expect(declared.state.flow).toEqual({ kind: "BATTLE_RESPONSE", actor, priority: defender });
    const combatView = projectBattleViewV2(declared.state, actor, hashStateV2(declared.state));
    expect(combatView.combat).toEqual({
      attacker: { cardId: attackerId, seat: actor, zone: "vanguard", power: 3500, range: 1 },
      target: { kind: "character", cardId: targetId, seat: defender, zone: "vanguard", power: 2000 },
      distance: 1,
      priorityPlayer: defender,
      consecutivePasses: 0,
    });
    const projectedAttacker = combatView.players[actor].field.vanguard[0];
    expect(projectedAttacker).toMatchObject({ power: 3000, effectivePower: 3500, range: 1, effectiveRange: 1 });

    const wrongPass = command(declared.state, actor, { type: "PASS_PRIORITY" });
    expect(wrongPass.ok).toBe(false);
    if (!wrongPass.ok) expect(wrongPass.code).toBe("WRONG_ACTOR");
    const firstPass = command(declared.state, defender, { type: "PASS_PRIORITY" });
    if (!firstPass.ok) throw new Error(firstPass.message);
    const secondPass = command(firstPass.state, actor, { type: "PASS_PRIORITY" });
    expect(secondPass.ok).toBe(true);
    if (!secondPass.ok) return;
    expect(secondPass.state.players[defender].retreat).toContain(targetId);
    expect(secondPass.state.players[actor].field.vanguard).toEqual([attackerId]);
    expect(secondPass.state.flow.kind).toBe("TURN_RESPONSE");
    expect(validateStateInvariantsV2(secondPass.state)).toEqual([]);
  });

  it("攻击破绽把冲击卡放入时间线，第 9 张立即判胜", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const attackerId = placeFromHand(state, actor, "vanguard");
    state.cards[attackerId].range = 1;
    const timeline = state.players[actor].rushDeck.slice(0, 8);
    state.players[actor].rushDeck = state.players[actor].rushDeck.slice(8);
    state.players[actor].timeline = timeline;
    const entered = enterBattleAdjust(state);
    if (!entered.ok) throw new Error(entered.message);
    const layout = command(entered.state, actor, {
      type: "SUBMIT_BATTLE_LAYOUT",
      layout: currentLayout(entered.state, actor),
      flankOrder: ["flankLeft", "flankRight"],
    });
    if (!layout.ok) throw new Error(layout.message);
    const declared = command(layout.state, actor, {
      type: "DECLARE_ATTACK",
      attackerId,
      target: { kind: "breach", zone: "vanguard" },
    });
    if (!declared.ok) throw new Error(declared.message);
    const pass1 = command(declared.state, defender, { type: "PASS_PRIORITY" });
    if (!pass1.ok) throw new Error(pass1.message);
    const pass2 = command(pass1.state, actor, { type: "PASS_PRIORITY" });
    expect(pass2.ok).toBe(true);
    if (!pass2.ok) return;
    expect(pass2.state.status).toBe("finished");
    expect(pass2.state.winner).toBe(actor);
    expect(pass2.state.players[actor].timeline).toHaveLength(9);
    expect(pass2.state.players[defender].timeline).toHaveLength(0);
  });

  it("从起始调度完整推进多个回合，界面可用指令链能无卡死地打到 9 分", () => {
    let state = structuredClone(actionState());
    const scorer = state.firstPlayer;
    const defender: PlayerIndex = scorer === 0 ? 1 : 0;
    const seenFlows = new Set<string>();
    const revisionTrail = [state.revision];
    let breachHits = 0;

    for (let step = 0; step < 500 && state.status !== "finished"; step += 1) {
      seenFlows.add(state.flow.kind);
      const beforeRevision = state.revision;
      let result: ReturnType<typeof command>;

      if (state.decision) {
        const decision = state.decision;
        const chosen = decision.choices.slice(0, decision.min);
        result = command(state, decision.actor, { type: "ANSWER_DECISION", decisionId: decision.id, cardIds: chosen });
      } else if (state.flow.kind === "ACTION") {
        const actor = state.activePlayer;
        const hasFieldCard = Object.values(state.players[actor].field).some((cards) => cards.length > 0);
        if (actor === scorer && !hasFieldCard) {
          const cardId = state.players[actor].hand[0];
          result = command(state, actor, { type: "SUMMON_CHARACTER", cardId, destination: "vanguard" });
        } else {
          result = command(state, actor, { type: "END_ACTION_PHASE" });
        }
      } else if (state.flow.kind === "BATTLE_ADJUST") {
        const actor = state.activePlayer;
        result = command(state, actor, { type: "SUBMIT_BATTLE_LAYOUT", layout: currentLayout(state, actor), flankOrder: ["flankLeft", "flankRight"] });
      } else if (state.flow.kind === "BATTLE_ATTACK") {
        const actor = state.activePlayer;
        const view = projectBattleViewV2(state, actor, hashStateV2(state));
        const attack = view.legalActions.find((action) => action.type === "DECLARE_ATTACK" && action.attackerId === state.flow.attackerId);
        const breach = attack?.type === "DECLARE_ATTACK" ? attack.targets.find((target) => target.kind === "breach") : undefined;
        result = breach
          ? command(state, actor, { type: "DECLARE_ATTACK", attackerId: state.flow.attackerId, target: breach })
          : command(state, actor, { type: "PASS_ATTACK_OPPORTUNITY", attackerId: state.flow.attackerId });
      } else if (state.flow.kind === "BATTLE_RESPONSE" || state.flow.kind === "TURN_RESPONSE") {
        result = command(state, state.flow.priority, { type: "PASS_PRIORITY" });
      } else {
        throw new Error(`simulation stalled at unsupported flow ${state.flow.kind}`);
      }

      if (!result.ok) throw new Error(`simulation rejected at ${state.flow.kind}: ${result.code} ${result.message}`);
      breachHits += result.events.filter((event) => event.type === "BREACH_HIT").length;
      state = result.state;
      revisionTrail.push(state.revision);
      expect(state.revision).toBeGreaterThan(beforeRevision);
      expect(validateStateInvariantsV2(state)).toEqual([]);
    }

    expect(state.status).toBe("finished");
    expect(state.winner).toBe(scorer);
    expect(state.players[scorer].timeline).toHaveLength(9);
    expect(state.players[defender].timeline).toHaveLength(0);
    expect(breachHits).toBe(9);
    expect(state.turnNumber).toBeGreaterThanOrEqual(17);
    for (const expectedFlow of ["ACTION", "BATTLE_ADJUST", "BATTLE_ATTACK", "BATTLE_RESPONSE", "TURN_RESPONSE"]) expect(seenFlows.has(expectedFlow)).toBe(true);
    expect(revisionTrail.every((revision, index) => index === 0 || revision > revisionTrail[index - 1])).toBe(true);
  });

  it("攻击角色保持已攻击状态，直到自己的下个回合开始", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const attackerId = placeFromHand(state, actor, "vanguard");
    const targetId = placeFromHand(state, defender, "vanguard");
    const entered = enterBattleAdjust(state);
    if (!entered.ok) throw new Error(entered.message);
    const layout = command(entered.state, actor, {
      type: "SUBMIT_BATTLE_LAYOUT",
      layout: currentLayout(entered.state, actor),
      flankOrder: ["flankLeft", "flankRight"],
    });
    if (!layout.ok) throw new Error(layout.message);
    const declared = command(layout.state, actor, {
      type: "DECLARE_ATTACK",
      attackerId,
      target: { kind: "character", cardId: targetId },
    });
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;
    expect(declared.state.usage.attackedCardIdsByPlayer[actor]).toContain(attackerId);
    expect(projectBattleViewV2(declared.state, actor, hashStateV2(declared.state)).players[actor].attackedCardIds).toContain(attackerId);

    const otherStart = structuredClone(declared.state);
    otherStart.activePlayer = defender;
    otherStart.flow = { kind: "TURN_START", actor: defender };
    otherStart.battle = null;
    const otherTurn = advanceAutomaticFlowV2(otherStart);
    expect(otherTurn.ok).toBe(true);
    if (!otherTurn.ok) return;
    expect(otherTurn.state.usage.attackedCardIdsByPlayer[actor]).toContain(attackerId);
    const opponentBattle = structuredClone(otherTurn.state);
    opponentBattle.flow = { kind: "BATTLE_ADJUST", actor: defender };
    opponentBattle.battle = {
      order: ["vanguard", "flankLeft", "flankRight", "rear"], cursor: 0,
      attackerId: null, target: null, attackedCardIds: [], priorityPlayer: null,
      consecutivePasses: 0, responseSummoned: [false, false],
    };
    expect(projectBattleViewV2(opponentBattle, defender, hashStateV2(opponentBattle)).players[actor].exhaustedCardIds).toContain(attackerId);

    const ownStart = structuredClone(otherTurn.state);
    ownStart.activePlayer = actor;
    ownStart.flow = { kind: "TURN_START", actor };
    const ownTurn = advanceAutomaticFlowV2(ownStart);
    expect(ownTurn.ok).toBe(true);
    if (ownTurn.ok) expect(ownTurn.state.usage.attackedCardIdsByPlayer[actor]).toEqual([]);
  });

  it("应对使原目标失效后，有其他合法目标时返回目标步骤重选", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const attackerId = placeFromHand(state, actor, "vanguard");
    const targetId = placeFromHand(state, defender, "vanguard");
    const effectSource = state.players[defender].hand[0];
    state.cards[attackerId].range = 1;
    registerEffectV2({
      cardNo: state.cards[effectSource].cardNo,
      effectId: "retreat-original-target",
      activation: "response",
      buildOperations: () => [{ kind: "RETREAT", cardIds: [targetId] }],
    });
    const entered = enterBattleAdjust(state);
    if (!entered.ok) throw new Error(entered.message);
    const layout = command(entered.state, actor, {
      type: "SUBMIT_BATTLE_LAYOUT",
      layout: currentLayout(entered.state, actor),
      flankOrder: ["flankLeft", "flankRight"],
    });
    if (!layout.ok) throw new Error(layout.message);
    const declared = command(layout.state, actor, {
      type: "DECLARE_ATTACK",
      attackerId,
      target: { kind: "character", cardId: targetId },
    });
    if (!declared.ok) throw new Error(declared.message);
    const activated = command(declared.state, defender, {
      type: "ACTIVATE_EFFECT",
      sourceCardId: effectSource,
      effectId: "retreat-original-target",
    });
    if (!activated.ok) throw new Error(activated.message);
    expect(activated.state.players[defender].field.vanguard).toEqual([]);
    const pass1 = command(activated.state, actor, { type: "PASS_PRIORITY" });
    if (!pass1.ok) throw new Error(pass1.message);
    const pass2 = command(pass1.state, defender, { type: "PASS_PRIORITY" });
    expect(pass2.ok).toBe(true);
    if (!pass2.ok) return;
    expect(pass2.state.flow).toEqual({ kind: "BATTLE_TARGET", actor, attackerId });
    expect(pass2.events).toContainEqual({ type: "ATTACK_TARGET_INVALIDATED", actor, attackerId, canReselect: true });
    const restored = JSON.parse(JSON.stringify(pass2.state)) as GameStateV2;
    expect(hashStateV2(restored)).toBe(hashStateV2(pass2.state));
    const actorView = projectBattleViewV2(restored, actor, hashStateV2(restored));
    const defenderView = projectBattleViewV2(restored, defender, hashStateV2(restored));
    expect(actorView.availableActions).toEqual(["DECLARE_ATTACK"]);
    expect(defenderView.availableActions).toEqual([]);
    const attackAction = actorView.legalActions.find((action) => action.type === "DECLARE_ATTACK");
    expect(attackAction?.attackerId).toBe(attackerId);
    expect(attackAction?.targets).toContainEqual({ kind: "breach", zone: "vanguard" });
    expect(defenderView.legalActions).toEqual([]);
    expect(actorView.players[defender].hand).toEqual([]);
    expect(defenderView.players[actor].hand).toEqual([]);
    expect(validateStateInvariantsV2(restored)).toEqual([]);
    const reselected = command(pass2.state, actor, {
      type: "DECLARE_ATTACK",
      attackerId,
      target: { kind: "breach", zone: "vanguard" },
    });
    expect(reselected.ok).toBe(true);
    if (reselected.ok) expect(reselected.state.flow.kind).toBe("BATTLE_RESPONSE");
  });

  it("应对把目标移出射程后重新计算位置，并允许改选新破绽", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const attackerId = placeFromHand(state, actor, "vanguard");
    const targetId = placeFromHand(state, defender, "vanguard");
    const effectSource = state.players[defender].hand[0];
    state.cards[attackerId].range = 1;
    registerEffectV2({
      cardNo: state.cards[effectSource].cardNo,
      effectId: "move-target-out-of-range",
      activation: "response",
      buildOperations: () => [{ kind: "MOVE_FIELD", cardId: targetId, destination: "rear" }],
    });
    const entered = enterBattleAdjust(state);
    if (!entered.ok) throw new Error(entered.message);
    const layout = command(entered.state, actor, {
      type: "SUBMIT_BATTLE_LAYOUT", layout: currentLayout(entered.state, actor), flankOrder: ["flankLeft", "flankRight"],
    });
    if (!layout.ok) throw new Error(layout.message);
    const declared = command(layout.state, actor, { type: "DECLARE_ATTACK", attackerId, target: { kind: "character", cardId: targetId } });
    if (!declared.ok) throw new Error(declared.message);
    const activated = command(declared.state, defender, { type: "ACTIVATE_EFFECT", sourceCardId: effectSource, effectId: "move-target-out-of-range" });
    if (!activated.ok) throw new Error(activated.message);
    expect(activated.state.players[defender].field.rear).toEqual([targetId]);
    const pass1 = command(activated.state, actor, { type: "PASS_PRIORITY" });
    if (!pass1.ok) throw new Error(pass1.message);
    const pass2 = command(pass1.state, defender, { type: "PASS_PRIORITY" });
    expect(pass2.ok).toBe(true);
    if (!pass2.ok) return;
    expect(pass2.state.flow).toEqual({ kind: "BATTLE_TARGET", actor, attackerId });
    expect(pass2.events).toContainEqual({ type: "ATTACK_TARGET_INVALIDATED", actor, attackerId, canReselect: true });
  });

  it("应对使攻击者撤退后取消该次攻击且不能重选", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const attackerId = placeFromHand(state, actor, "vanguard");
    const targetId = placeFromHand(state, defender, "vanguard");
    const effectSource = state.players[defender].hand[0];
    registerEffectV2({
      cardNo: state.cards[effectSource].cardNo,
      effectId: "retreat-attacker",
      activation: "response",
      buildOperations: () => [{ kind: "RETREAT", cardIds: [attackerId] }],
    });
    const entered = enterBattleAdjust(state);
    if (!entered.ok) throw new Error(entered.message);
    const layout = command(entered.state, actor, { type: "SUBMIT_BATTLE_LAYOUT", layout: currentLayout(entered.state, actor), flankOrder: ["flankLeft", "flankRight"] });
    if (!layout.ok) throw new Error(layout.message);
    const declared = command(layout.state, actor, { type: "DECLARE_ATTACK", attackerId, target: { kind: "character", cardId: targetId } });
    if (!declared.ok) throw new Error(declared.message);
    const activated = command(declared.state, defender, { type: "ACTIVATE_EFFECT", sourceCardId: effectSource, effectId: "retreat-attacker" });
    if (!activated.ok) throw new Error(activated.message);
    const pass1 = command(activated.state, actor, { type: "PASS_PRIORITY" });
    if (!pass1.ok) throw new Error(pass1.message);
    const pass2 = command(pass1.state, defender, { type: "PASS_PRIORITY" }, false);
    expect(pass2.ok).toBe(true);
    if (!pass2.ok) return;
    expect(pass2.state.flow.kind).toBe("BATTLE_NEXT");
    expect(pass2.events).toContainEqual({ type: "ATTACK_TARGET_INVALIDATED", actor, attackerId, canReselect: false });
  });

  it("应对把攻击者 R 降为 0 后取消该次攻击且不能重选", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const attackerId = placeFromHand(state, actor, "vanguard");
    const targetId = placeFromHand(state, defender, "vanguard");
    const effectSource = state.players[defender].hand[0];
    state.cards[attackerId].range = 1;
    registerEffectV2({
      cardNo: state.cards[effectSource].cardNo,
      effectId: "set-attacker-range-zero",
      activation: "response",
      buildOperations: () => [{
        kind: "ADD_MODIFIER",
        modifier: { id: "range-zero", sourceCardId: effectSource, targetCardId: attackerId, type: "range", value: 0, mode: "replace", duration: "turn" },
      }],
    });
    const entered = enterBattleAdjust(state);
    if (!entered.ok) throw new Error(entered.message);
    const layout = command(entered.state, actor, { type: "SUBMIT_BATTLE_LAYOUT", layout: currentLayout(entered.state, actor), flankOrder: ["flankLeft", "flankRight"] });
    if (!layout.ok) throw new Error(layout.message);
    const declared = command(layout.state, actor, { type: "DECLARE_ATTACK", attackerId, target: { kind: "character", cardId: targetId } });
    if (!declared.ok) throw new Error(declared.message);
    const activated = command(declared.state, defender, { type: "ACTIVATE_EFFECT", sourceCardId: effectSource, effectId: "set-attacker-range-zero" });
    if (!activated.ok) throw new Error(activated.message);
    const pass1 = command(activated.state, actor, { type: "PASS_PRIORITY" });
    if (!pass1.ok) throw new Error(pass1.message);
    const pass2 = command(pass1.state, defender, { type: "PASS_PRIORITY" }, false);
    expect(pass2.ok).toBe(true);
    if (!pass2.ok) return;
    expect(pass2.state.flow.kind).toBe("BATTLE_NEXT");
    expect(pass2.events).toContainEqual({ type: "ATTACK_TARGET_INVALIDATED", actor, attackerId, canReselect: false });
  });

  it("放弃攻击机会同样消耗机会，并进入独立回合应对", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const attackerId = placeFromHand(state, actor, "vanguard");
    const entered = enterBattleAdjust(state);
    if (!entered.ok) throw new Error(entered.message);
    const layout = command(entered.state, actor, {
      type: "SUBMIT_BATTLE_LAYOUT",
      layout: currentLayout(entered.state, actor),
      flankOrder: ["flankLeft", "flankRight"],
    });
    if (!layout.ok) throw new Error(layout.message);
    const passed = command(layout.state, actor, { type: "PASS_ATTACK_OPPORTUNITY", attackerId });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.battle).toBeNull();
    expect(passed.state.flow.kind).toBe("TURN_RESPONSE");
  });

  it("回合应对双方连续放弃后自动结束回合，并为另一玩家抽牌进入行动", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const other: PlayerIndex = actor === 0 ? 1 : 0;
    state.flow = { kind: "TURN_RESPONSE", actor, priority: other };
    state.turnResponse = { priorityPlayer: other, consecutivePasses: 0, responseSummoned: [false, false] };
    const beforeHand = state.players[other].hand.length;
    const first = command(state, other, { type: "PASS_PRIORITY" });
    if (!first.ok) throw new Error(first.message);
    const second = command(first.state, actor, { type: "PASS_PRIORITY" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.activePlayer).toBe(other);
    expect(second.state.turnNumber).toBe(state.turnNumber + 1);
    expect(second.state.flow).toEqual({ kind: "ACTION", actor: other });
    expect(second.state.players[other].hand).toHaveLength(beforeHand + 2);
  });

  it("回合应对由非回合玩家先行动，每名玩家在该阶段最多应对号召一次", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const responder: PlayerIndex = actor === 0 ? 1 : 0;
    state.flow = { kind: "TURN_RESPONSE", actor, priority: responder };
    state.turnResponse = { priorityPlayer: responder, consecutivePasses: 0, responseSummoned: [false, false] };
    const summonId = state.players[responder].hand[0];
    state.cards[summonId].printedKeywords = ["counter"];
    const summoned = command(state, responder, {
      type: "SUMMON_CHARACTER",
      cardId: summonId,
      destination: "rear",
    });
    expect(summoned.ok).toBe(true);
    if (!summoned.ok) return;
    expect(summoned.state.players[responder].field.rear).toEqual([summonId]);
    expect(summoned.state.turnResponse?.responseSummoned[responder]).toBe(true);
    expect(summoned.state.flow).toEqual({ kind: "TURN_RESPONSE", actor, priority: actor });

    const pass = command(summoned.state, actor, { type: "PASS_PRIORITY" });
    if (!pass.ok) throw new Error(pass.message);
    const secondId = pass.state.players[responder].hand[0];
    pass.state.cards[secondId].printedKeywords = ["counter"];
    const repeated = command(pass.state, responder, {
      type: "SUMMON_CHARACTER",
      cardId: secondId,
      destination: "flankLeft",
    });
    expect(repeated.ok).toBe(false);
    if (!repeated.ok) expect(repeated.code).toBe("LIMIT_REACHED");
  });

  it("结束阶段手牌超过 9 时挂起可恢复的固定数量弃牌决策", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const other: PlayerIndex = actor === 0 ? 1 : 0;
    const extra = state.players[actor].deck.splice(0, 3);
    state.players[actor].hand.push(...extra);
    state.flow = { kind: "TURN_RESPONSE", actor, priority: other };
    state.turnResponse = { priorityPlayer: other, consecutivePasses: 0, responseSummoned: [false, false] };
    const first = command(state, other, { type: "PASS_PRIORITY" });
    if (!first.ok) throw new Error(first.message);
    const second = command(first.state, actor, { type: "PASS_PRIORITY" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.flow.kind).toBe("END_DISCARD");
    expect(second.state.decision?.kind).toBe("DISCARD_TO_LIMIT");
    if (second.state.decision?.kind !== "DISCARD_TO_LIMIT") return;
    const restored = JSON.parse(JSON.stringify(second.state)) as GameStateV2;
    const restoredHash = hashStateV2(restored);
    expect(restoredHash).toBe(hashStateV2(second.state));
    const actorView = projectBattleViewV2(restored, actor, restoredHash);
    const otherView = projectBattleViewV2(restored, other, restoredHash);
    expect(actorView.pendingDecision?.kind).toBe("DISCARD_TO_LIMIT");
    expect(actorView.availableActions).toEqual(["ANSWER_DECISION"]);
    expect(otherView.pendingDecision).toBeNull();
    expect(otherView.availableActions).toEqual([]);
    expect(validateStateInvariantsV2(restored)).toEqual([]);
    const selected = second.state.decision.choices.slice(0, second.state.decision.min);
    const answered = command(second.state, actor, {
      type: "ANSWER_DECISION",
      decisionId: second.state.decision.id,
      cardIds: selected,
    });
    expect(answered.ok).toBe(true);
    if (!answered.ok) return;
    expect(answered.state.players[actor].hand).toHaveLength(9);
    expect(answered.state.activePlayer).toBe(other);
    expect(answered.state.flow.kind).toBe("ACTION");
  });

  it("抽牌使主卡组变为 0 时立即由对手获胜", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const other: PlayerIndex = actor === 0 ? 1 : 0;
    const keep = state.players[actor].deck[0];
    const moved = state.players[actor].deck.slice(1);
    state.players[actor].deck = [keep];
    state.players[actor].retreat.push(...moved);
    state.flow = { kind: "TURN_START", actor };
    const result = advanceAutomaticFlowV2(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.status).toBe("finished");
    expect(result.state.winner).toBe(other);
  });
});
