import { afterEach, describe, expect, it } from "vitest";
import type { Card } from "../../types/card";
import {
  applyAtomicOperationsV2,
  clearEffectRegistryForTestsV2,
  createGameV2,
  effectiveKeywordsV2,
  executeAuthoritativeCommandV2,
  extractPrintedKeywordsV2,
  hashStateV2,
  hasKeywordV2,
  OFFICIAL_KEYWORD_CATALOG_V2,
  projectBattleViewV2,
  validateStateInvariantsV2,
} from "../index";
import type { CreateGameInputV2, FieldZoneV2, GameCommandV2, GameStateV2, PlayerIndex } from "../index";

afterEach(() => clearEffectRegistryForTestsV2());

function card(id: string, type: 1 | 2, effect = ""): Card {
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
    effect,
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
  const main0 = Array.from({ length: 50 }, (_, index) => `K0-M-${index}`);
  const rush0 = Array.from({ length: 9 }, (_, index) => `K0-R-${index}`);
  const main1 = Array.from({ length: 50 }, (_, index) => `K1-M-${index}`);
  const rush1 = Array.from({ length: 9 }, (_, index) => `K1-R-${index}`);
  return {
    matchId: "m6-keywords",
    seed: "m6-keywords-seed",
    cardDefinitions: [
      ...main0.map((id, index) => card(id, 1, index === 0 ? "唯一 拦截\n空袭\n获得能力【强袭】" : "")),
      ...rush0.map((id) => card(id, 2)),
      ...main1.map((id, index) => card(id, 1, index === 0 ? "应对（常驻【手牌】：此卡可以应对号召。）" : "")),
      ...rush1.map((id) => card(id, 2)),
    ],
    players: [
      { name: "关键词 A", mainDeck: main0, rushDeck: rush0 },
      { name: "关键词 B", mainDeck: main1, rushDeck: rush1 },
    ],
  };
}

function command(state: GameStateV2, actor: PlayerIndex, gameCommand: GameCommandV2) {
  return executeAuthoritativeCommandV2(state, {
    actor,
    commandId: `m6-${state.revision}-${gameCommand.type}`,
    expectedRevision: state.revision,
    command: gameCommand,
  });
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

function enterBattle(state: GameStateV2, actor: PlayerIndex) {
  state.turnNumber = 2;
  const entered = command(state, actor, { type: "END_ACTION_PHASE" });
  if (!entered.ok) throw new Error(entered.message);
  const layout = command(entered.state, actor, {
    type: "SUBMIT_BATTLE_LAYOUT",
    layout: Object.fromEntries((["vanguard", "flankLeft", "flankRight", "rear"] as const).map((zone) => [zone, entered.state.players[actor].field[zone][0] ?? null])) as Record<FieldZoneV2, string | null>,
    flankOrder: ["flankLeft", "flankRight"],
  });
  if (!layout.ok) throw new Error(layout.message);
  return layout.state;
}

describe("V2 1.02 官方关键词原子", () => {
  it("六种官方能力拥有稳定规则原子，且只解析卡面直接印刷能力", () => {
    expect(OFFICIAL_KEYWORD_CATALOG_V2.map((item) => [item.keyword, item.atom.kind])).toEqual([
      ["counter", "PERMIT_RESPONSE_SUMMON"],
      ["intercept", "REDIRECT_ATTACK_TARGET"],
      ["combo", "SET_ATTACK_OPPORTUNITY_LIMIT"],
      ["assault", "BREACH_AFTER_BATTLE_WIN"],
      ["airRaid", "PERMIT_OCCUPIED_BREACH"],
      ["unique", "PREVENT_SAME_NAME_ON_FIELD"],
    ]);
    expect(extractPrintedKeywordsV2("唯一 拦截\n空袭\n连击\n强袭\n应对（常驻【手牌】：此卡可以应对号召。）")).toEqual([
      "counter", "intercept", "combo", "assault", "airRaid", "unique",
    ]);
    expect(extractPrintedKeywordsV2("此卡本回合获得能力【强袭】。\n该角色获得能力【空袭】。")).toEqual([]);
    const state = createGameV2(input());
    const direct = Object.values(state.cards).find((item) => item.definitionId === "K0-M-0");
    const counter = Object.values(state.cards).find((item) => item.definitionId === "K1-M-0");
    expect(direct?.printedKeywords).toEqual(["intercept", "airRaid", "unique"]);
    expect(counter?.printedKeywords).toEqual(["counter"]);
  });

  it("GRANT/REMOVE_KEYWORD 原子支持期限并保证【唯一】不能失去", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const target = state.players[actor].hand[0];
    const granted = applyAtomicOperationsV2(state, [{
      kind: "GRANT_KEYWORD",
      grant: { id: "grant-combo", sourceCardId: target, targetCardId: target, keyword: "combo", duration: "turn" },
    }]);
    expect(granted.trace[0].validationIssues).toEqual([]);
    expect(effectiveKeywordsV2(granted.state, target)).toContain("combo");
    expect(projectBattleViewV2(granted.state, actor, hashStateV2(granted.state)).players[actor].hand.find((item) => item.instanceId === target)?.gainedKeywords).toContain("combo");
    const removed = applyAtomicOperationsV2(granted.state, [{ kind: "REMOVE_KEYWORD", grantId: "grant-combo" }]);
    expect(hasKeywordV2(removed.state, target, "combo")).toBe(false);
    const unique = applyAtomicOperationsV2(removed.state, [{
      kind: "GRANT_KEYWORD",
      grant: { id: "grant-unique", sourceCardId: target, targetCardId: target, keyword: "unique", duration: "permanent" },
    }]);
    const protectedResult = applyAtomicOperationsV2(unique.state, [{ kind: "REMOVE_KEYWORD", grantId: "grant-unique" }]);
    expect(protectedResult.trace[0].validationIssues).toContain("【唯一】能力不能失去");
    expect(hasKeywordV2(protectedResult.state, target, "unique")).toBe(true);
  });

  it("【应对】限制应对号召，【唯一】阻止己方场上出现同名卡", () => {
    const state = structuredClone(actionState());
    const turnActor = state.activePlayer;
    const responder: PlayerIndex = turnActor === 0 ? 1 : 0;
    state.flow = { kind: "TURN_RESPONSE", actor: turnActor, priority: responder };
    state.turnResponse = { priorityPlayer: responder, consecutivePasses: 0, responseSummoned: [false, false] };
    const responseCard = state.players[responder].hand[0];
    state.cards[responseCard].printedKeywords = [];
    const denied = command(state, responder, { type: "SUMMON_CHARACTER", cardId: responseCard, destination: "rear" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("EFFECT_NOT_AVAILABLE");
    state.cards[responseCard].printedKeywords = ["counter"];
    const accepted = command(state, responder, { type: "SUMMON_CHARACTER", cardId: responseCard, destination: "rear" });
    expect(accepted.ok).toBe(true);

    const uniqueState = structuredClone(actionState());
    const actor = uniqueState.activePlayer;
    const existing = placeFromHand(uniqueState, actor, "vanguard");
    const duplicate = uniqueState.players[actor].hand[0];
    uniqueState.cards[duplicate].cardNo = uniqueState.cards[existing].cardNo;
    uniqueState.cards[duplicate].printedKeywords = ["unique"];
    const duplicateSummon = command(uniqueState, actor, { type: "SUMMON_CHARACTER", cardId: duplicate, destination: "rear" });
    expect(duplicateSummon.ok).toBe(false);
    if (!duplicateSummon.ok) expect(duplicateSummon.code).toBe("LIMIT_REACHED");
  });

  it("【空袭】允许攻击有角色战区的破绽，【强袭】在战胜后追加破绽", () => {
    const airRaidState = structuredClone(actionState());
    const actor = airRaidState.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const attacker = placeFromHand(airRaidState, actor, "vanguard");
    placeFromHand(airRaidState, defender, "vanguard");
    airRaidState.cards[attacker].range = 1;
    const ready = enterBattle(airRaidState, actor);
    const denied = command(ready, actor, { type: "DECLARE_ATTACK", attackerId: attacker, target: { kind: "breach", zone: "vanguard" } });
    expect(denied.ok).toBe(false);
    ready.cards[attacker].printedKeywords = ["airRaid"];
    const declared = command(ready, actor, { type: "DECLARE_ATTACK", attackerId: attacker, target: { kind: "breach", zone: "vanguard" } });
    expect(declared.ok).toBe(true);

    const assaultState = structuredClone(actionState());
    const assaultActor = assaultState.activePlayer;
    const assaultDefender: PlayerIndex = assaultActor === 0 ? 1 : 0;
    const assaultAttacker = placeFromHand(assaultState, assaultActor, "vanguard");
    const assaultTarget = placeFromHand(assaultState, assaultDefender, "vanguard");
    assaultState.cards[assaultAttacker].power = 3000;
    assaultState.cards[assaultAttacker].range = 1;
    assaultState.cards[assaultAttacker].printedKeywords = ["assault"];
    assaultState.cards[assaultTarget].power = 1000;
    const assaultReady = enterBattle(assaultState, assaultActor);
    const assaultDeclared = command(assaultReady, assaultActor, { type: "DECLARE_ATTACK", attackerId: assaultAttacker, target: { kind: "character", cardId: assaultTarget } });
    if (!assaultDeclared.ok) throw new Error(assaultDeclared.message);
    const pass1 = command(assaultDeclared.state, assaultDefender, { type: "PASS_PRIORITY" });
    if (!pass1.ok) throw new Error(pass1.message);
    const pass2 = command(pass1.state, assaultActor, { type: "PASS_PRIORITY" });
    expect(pass2.ok).toBe(true);
    if (!pass2.ok) return;
    expect(pass2.state.players[assaultDefender].retreat).toContain(assaultTarget);
    expect(pass2.state.players[assaultActor].timeline).toHaveLength(1);
    expect(pass2.state.players[assaultDefender].timeline).toHaveLength(0);
    expect(pass2.events.some((event) => event.type === "BREACH_HIT")).toBe(true);
  });

  it("【连击】提供同角色第二次攻击机会", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const attacker = placeFromHand(state, actor, "vanguard");
    const target = placeFromHand(state, defender, "vanguard");
    state.cards[attacker].power = 3000;
    state.cards[attacker].range = 1;
    state.cards[attacker].printedKeywords = ["combo"];
    state.cards[target].power = 1000;
    const ready = enterBattle(state, actor);
    const declared = command(ready, actor, { type: "DECLARE_ATTACK", attackerId: attacker, target: { kind: "character", cardId: target } });
    if (!declared.ok) throw new Error(declared.message);
    const pass1 = command(declared.state, defender, { type: "PASS_PRIORITY" });
    if (!pass1.ok) throw new Error(pass1.message);
    const pass2 = command(pass1.state, actor, { type: "PASS_PRIORITY" });
    expect(pass2.ok).toBe(true);
    if (!pass2.ok) return;
    expect(pass2.state.flow).toEqual({ kind: "BATTLE_ATTACK", actor, zone: "vanguard", attackerId: attacker });
    expect(pass2.state.battle?.attackedCardIds.filter((id) => id === attacker)).toHaveLength(1);
    expect(projectBattleViewV2(pass2.state, actor, hashStateV2(pass2.state)).players[actor].exhaustedCardIds).not.toContain(attacker);

    const declaredAgain = command(pass2.state, actor, { type: "DECLARE_ATTACK", attackerId: attacker, target: { kind: "breach", zone: "vanguard" } });
    if (!declaredAgain.ok) throw new Error(declaredAgain.message);
    const secondPass1 = command(declaredAgain.state, defender, { type: "PASS_PRIORITY" });
    if (!secondPass1.ok) throw new Error(secondPass1.message);
    const secondPass2 = command(secondPass1.state, actor, { type: "PASS_PRIORITY" });
    expect(secondPass2.ok).toBe(true);
    if (!secondPass2.ok) return;
    expect(secondPass2.state.usage.attackedCardIdsByPlayer[actor]).toContain(attacker);
    expect(projectBattleViewV2(secondPass2.state, actor, hashStateV2(secondPass2.state)).players[actor].exhaustedCardIds).toContain(attacker);
  });

  it("【拦截】作为回合一次的应对原子重定向合法攻击目标", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const attacker = placeFromHand(state, actor, "vanguard");
    const originalTarget = placeFromHand(state, defender, "vanguard");
    const interceptor = placeFromHand(state, defender, "rear");
    state.cards[attacker].range = 3;
    state.cards[interceptor].printedKeywords = ["intercept"];
    const ready = enterBattle(state, actor);
    const declared = command(ready, actor, { type: "DECLARE_ATTACK", attackerId: attacker, target: { kind: "character", cardId: originalTarget } });
    if (!declared.ok) throw new Error(declared.message);
    const defenderView = projectBattleViewV2(declared.state, defender, hashStateV2(declared.state));
    expect(defenderView.legalActions).toContainEqual({ type: "ACTIVATE_KEYWORD", sourceCardId: interceptor, keyword: "intercept" });
    const intercepted = command(declared.state, defender, { type: "ACTIVATE_KEYWORD", sourceCardId: interceptor, keyword: "intercept" });
    expect(intercepted.ok).toBe(true);
    if (!intercepted.ok) return;
    expect(intercepted.state.battle?.target).toEqual({ kind: "character", cardId: interceptor });
    expect(intercepted.events).toContainEqual({ type: "KEYWORD_ACTIVATED", actor: defender, sourceCardId: interceptor, keyword: "intercept" });
    const passed = command(intercepted.state, actor, { type: "PASS_PRIORITY" });
    if (!passed.ok) throw new Error(passed.message);
    const repeated = command(passed.state, defender, { type: "ACTIVATE_KEYWORD", sourceCardId: interceptor, keyword: "intercept" });
    expect(repeated.ok).toBe(false);
    if (!repeated.ok) expect(repeated.code).toBe("LIMIT_REACHED");
    expect(validateStateInvariantsV2(passed.state)).toEqual([]);
  });
});
