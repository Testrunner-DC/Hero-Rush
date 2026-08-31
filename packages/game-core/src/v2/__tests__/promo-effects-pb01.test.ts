import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Card } from "../../types/card";
import {
  applyAtomicOperationsV2,
  cardControllerV2,
  CARD_IMPLEMENTATIONS_V2,
  clearEffectRegistryForTestsV2,
  collectTriggeredEffectsV2,
  createGameV2,
  effectiveValueV2,
  effectRegistrySnapshotV2,
  executeCommandV2,
  hasKeywordV2,
  PROMO_EFFECT_DEFINITIONS_PB01_V2,
  registerPromoEffectsPb01V2,
  validateStateInvariantsV2,
} from "../index";
import type { CreateGameInputV2, FieldZoneV2, GameStateV2, PlayerIndex } from "../index";

function definition(id: string, type: 1 | 2): Card {
  return { id, card_no: id, name: id, card_type: type, card_type_name: "测试", cost: 1, cost_name: "Lv1", attribute: 1, attribute_name: "红", attribute_color: "#d33", pp_value: null, dp_value: null, power: type === 1 ? "1000" : null, signal_color: null, signal_color_text: null, feature: null, feature_text: null, effect: "", package: "TEST", package_short: "T", rarity: 1, rarity_code: "C", rarity_cn: "普通", rarity_color: "#000", image_url: `/cards/${id}.png`, r: 1 };
}

function fixtureInput(): CreateGameInputV2 {
  const main0 = Array.from({ length: 50 }, (_, index) => `A-${index}`);
  const main1 = Array.from({ length: 50 }, (_, index) => `B-${index}`);
  const rush0 = Array.from({ length: 9 }, (_, index) => `AR-${index}`);
  const rush1 = Array.from({ length: 9 }, (_, index) => `BR-${index}`);
  return { matchId: "promo-pb01", seed: "promo-pb01", cardDefinitions: [...main0.map((id) => definition(id, 1)), ...main1.map((id) => definition(id, 1)), ...rush0.map((id) => definition(id, 2)), ...rush1.map((id) => definition(id, 2))], players: [{ name: "A", mainDeck: main0, rushDeck: rush0 }, { name: "B", mainDeck: main1, rushDeck: rush1 }] };
}

function state(): GameStateV2 {
  const result = createGameV2(fixtureInput());
  return { ...structuredClone(result), status: "playing", flow: { kind: "ACTION", actor: result.firstPlayer }, decision: null };
}

type Zone = "hand" | "base" | "covered" | "retreat" | "void" | FieldZoneV2;
function place(game: GameStateV2, actor: PlayerIndex, zone: Zone, cardNo: string, options: Partial<{ level: number; range: number; power: number; attribute: number; features: string[] }> = {}): string {
  const cardId = game.players[actor].deck.shift()!;
  Object.assign(game.cards[cardId], { cardNo, ...options });
  if (zone === "hand") game.players[actor].hand.push(cardId);
  else if (zone === "base") game.players[actor].baseCards.push(cardId);
  else if (zone === "covered") game.players[actor].baseCovered.push(cardId);
  else if (zone === "retreat") game.players[actor].retreat.push(cardId);
  else if (zone === "void") game.players[actor].void.push(cardId);
  else game.players[actor].field[zone].push(cardId);
  return cardId;
}

beforeEach(() => {
  clearEffectRegistryForTestsV2();
  registerPromoEffectsPb01V2();
});
afterEach(() => clearEffectRegistryForTestsV2());

describe("PB01 第二批 1.02 卡效", () => {
  it("PB01 全 11 张卡均有完整记录，9 个起动/触发效果进入注册表", () => {
    const records = CARD_IMPLEMENTATIONS_V2.filter((item) => /^PB01-/.test(item.cardNo));
    expect(records).toHaveLength(11);
    expect(records.every((item) => item.tests.includes("promo-effects-pb01.test.ts"))).toBe(true);
    expect(PROMO_EFFECT_DEFINITIONS_PB01_V2).toHaveLength(9);
    expect(effectRegistrySnapshotV2().filter((item) => /^PB01-/.test(item.cardNo))).toHaveLength(9);
  });

  it("「毁灭者」战胜后只令己方其他银河护卫队角色本回合 R+1", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "PB01-001", { range: 1, features: ["银河护卫队"] });
    const guardianA = place(game, actor, "flankLeft", "GUARDIAN-A", { range: 1, features: ["银河护卫队"] });
    const guardianB = place(game, actor, "rear", "GUARDIAN-B", { range: 2, features: ["人类", "银河护卫队"] });
    const other = place(game, actor, "flankRight", "OTHER", { range: 2, features: ["复仇者联盟"] });
    const defeated = place(game, enemy, "retreat", "DEFEATED");
    const event = { type: "CHARACTER_BATTLE_RESOLVED" as const, attackerId: source, targetId: defeated, winnerCardId: source, defeatedCardIds: [defeated], tied: false };
    const candidates = collectTriggeredEffectsV2(game, [event]);
    expect(candidates).toHaveLength(1);
    const resolved = applyAtomicOperationsV2(game, candidates[0].operations).state;
    expect(effectiveValueV2(resolved, source, "range")).toBe(1);
    expect(effectiveValueV2(resolved, guardianA, "range")).toBe(2);
    expect(effectiveValueV2(resolved, guardianB, "range")).toBe(3);
    expect(effectiveValueV2(resolved, other, "range")).toBe(2);
  });

  it("攻击声明会累计角色目标历史，而放弃攻击不会伪造目标", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "ATTACKER", { range: 1, power: 3000 });
    const target = place(game, enemy, "vanguard", "TARGET", { power: 3000 });
    game.flow = { kind: "BATTLE_ATTACK", actor, attackerId: source };
    game.battle = { order: ["vanguard", "flankLeft", "flankRight", "rear"], cursor: 0, flankOrderChosen: false, attackerId: source, target: null, attackedCardIds: [], priorityPlayer: null, consecutivePasses: 0, responseSummoned: [false, false] };
    const declared = executeCommandV2(game, { actor, commandId: "record-target", expectedRevision: game.revision, command: { type: "DECLARE_ATTACK", attackerId: source, target: { kind: "character", cardId: target } } });
    expect(declared.ok).toBe(true);
    if (declared.ok) expect(declared.state.usage.attackedTargetCardIdsThisTurn).toEqual([target]);

    const passState = state();
    const passActor = passState.activePlayer;
    const passer = place(passState, passActor, "vanguard", "PASSER");
    passState.flow = { kind: "BATTLE_ATTACK", actor: passActor, attackerId: passer };
    passState.battle = { order: ["vanguard", "flankLeft", "flankRight", "rear"], cursor: 0, flankOrderChosen: false, attackerId: passer, target: null, attackedCardIds: [], priorityPlayer: null, consecutivePasses: 0, responseSummoned: [false, false] };
    const passed = executeCommandV2(passState, { actor: passActor, commandId: "pass-no-target", expectedRevision: passState.revision, command: { type: "PASS_ATTACK_OPPORTUNITY", attackerId: passer } });
    expect(passed.ok).toBe(true);
    if (passed.ok) expect(passed.state.usage.attackedTargetCardIdsThisTurn).toEqual([]);
  });

  it("「暖心小兔子」只在目标本回合此前已被攻击时撤退该目标", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "PB01-002");
    const target = place(game, enemy, "vanguard", "TARGET", { level: 6 });
    const event = { type: "ATTACK_DECLARED" as const, actor, attackerId: source, target: { kind: "character" as const, cardId: target } };
    game.usage.attackedTargetCardIdsThisTurn = [target];
    expect(collectTriggeredEffectsV2(game, [event])).toHaveLength(0);
    game.usage.attackedTargetCardIdsThisTurn.push(target);
    const candidates = collectTriggeredEffectsV2(game, [event]);
    expect(candidates).toHaveLength(1);
    const resolved = applyAtomicOperationsV2(game, candidates[0].operations).state;
    expect(resolved.players[enemy].field.vanguard).not.toContain(target);
    expect(resolved.players[enemy].retreat).toContain(target);
  });

  it("「危险姐妹」星云按其他银河护卫队数量实时获得 R 与战力", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "PB01-004", { range: 1, power: 1000, features: ["银河护卫队"] });
    const guardianA = place(game, actor, "flankLeft", "GUARDIAN-A", { features: ["银河护卫队"] });
    place(game, actor, "rear", "GUARDIAN-B", { features: ["银河护卫队"] });
    place(game, actor, "flankRight", "OTHER", { features: ["人类"] });
    expect(effectiveValueV2(game, source, "range")).toBe(3);
    expect(effectiveValueV2(game, source, "power")).toBe(3000);
    game.players[actor].field.flankLeft = [];
    game.players[actor].retreat.push(guardianA);
    expect(effectiveValueV2(game, source, "range")).toBe(2);
    expect(effectiveValueV2(game, source, "power")).toBe(2000);
  });

  it("「我是格鲁特」按当前手牌数实时降低战力并遵守数值下限", () => {
    const game = state();
    const actor = game.activePlayer;
    game.players[actor].hand = [];
    const source = place(game, actor, "vanguard", "PB01-006", { power: 5000 });
    place(game, actor, "hand", "HAND-1");
    place(game, actor, "hand", "HAND-2");
    expect(effectiveValueV2(game, source, "power")).toBe(3000);
    place(game, actor, "hand", "HAND-3");
    place(game, actor, "hand", "HAND-4");
    place(game, actor, "hand", "HAND-5");
    place(game, actor, "hand", "HAND-6");
    expect(effectiveValueV2(game, source, "power")).toBe(0);
  });

  it("「先决打击」仅在攻击更高战力角色时令其本回合战力 -2000", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "PB01-007", { power: 3000 });
    const target = place(game, enemy, "vanguard", "TARGET", { power: 5000 });
    const event = { type: "ATTACK_DECLARED" as const, actor, attackerId: source, target: { kind: "character" as const, cardId: target } };
    const candidates = collectTriggeredEffectsV2(game, [event]);
    expect(candidates).toHaveLength(1);
    const resolved = applyAtomicOperationsV2(game, candidates[0].operations).state;
    expect(effectiveValueV2(resolved, target, "power")).toBe(3000);
    game.cards[target].power = 3000;
    expect(collectTriggeredEffectsV2(game, [event])).toHaveLength(0);
  });

  it("「银河舞者」只响应敌方效果放置；裁剪自身成功后才把该角色移至卡组底", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "base", "PB01-003");
    const placed = place(game, enemy, "vanguard", "PLACED");
    const event = { type: "CHARACTER_PLACED" as const, actor: enemy, cardId: placed, destination: "vanguard" as const, placementKind: "effect" as const };
    const candidates = collectTriggeredEffectsV2(game, [event]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].optional).toBe(true);
    const resolved = applyAtomicOperationsV2(game, candidates[0].operations).state;
    expect(resolved.players[actor].void).toContain(source);
    expect(resolved.players[enemy].field.vanguard).not.toContain(placed);
    expect(resolved.players[enemy].deck.at(-1)).toBe(placed);
    expect(collectTriggeredEffectsV2(game, [{ ...event, placementKind: "summon" }])).toHaveLength(0);
  });

  it("「危险姐妹」卡魔拉在两个银河护卫队存在时从手牌直接放置", () => {
    const game = state();
    const actor = game.activePlayer;
    place(game, actor, "vanguard", "GUARDIAN-A", { features: ["银河护卫队"] });
    place(game, actor, "flankLeft", "GUARDIAN-B", { features: ["人类", "银河护卫队"] });
    const source = place(game, actor, "hand", "PB01-005");
    const effect = PROMO_EFFECT_DEFINITIONS_PB01_V2.find((item) => item.effectId === "dangerous-sisters-gamora-deploy")!;
    expect(effect.canActivate?.(game, actor, source)).toBe(true);
    expect(effect.validateTargets?.(game, actor, source, ["zone:rear"])).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, ["zone:rear"])).state;
    expect(resolved.players[actor].field.rear).toEqual([source]);
    expect(resolved.players[actor].hand).not.toContain(source);
  });

  it("「雷霆传送」仅在战区非空且全部为黄色角色时于手牌获得【应对】", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "hand", "PB01-008");
    expect(hasKeywordV2(game, source, "counter")).toBe(false);
    place(game, actor, "vanguard", "YELLOW-A", { attribute: 2 });
    place(game, actor, "rear", "YELLOW-B", { attribute: 2 });
    expect(hasKeywordV2(game, source, "counter")).toBe(true);
    place(game, actor, "flankLeft", "RED", { attribute: 1 });
    expect(hasKeywordV2(game, source, "counter")).toBe(false);
  });

  it("「神兵天降」撤退基地全部 6 张卡后才把自身放置进战区", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "hand", "PB01-009");
    const base = [
      place(game, actor, "base", "BASE-1"),
      place(game, actor, "base", "BASE-2"),
      place(game, actor, "base", "BASE-3"),
      place(game, actor, "covered", "COVER-1"),
      place(game, actor, "covered", "COVER-2"),
      place(game, actor, "covered", "COVER-3"),
    ];
    const effect = PROMO_EFFECT_DEFINITIONS_PB01_V2.find((item) => item.effectId === "divine-descent-hulk")!;
    expect(effect.canActivate?.(game, actor, source)).toBe(true);
    const selected = [...base, "zone:vanguard"];
    expect(effect.validateTargets?.(game, actor, source, selected)).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, selected)).state;
    expect(resolved.players[actor].baseCards).toEqual([]);
    expect(resolved.players[actor].baseCovered).toEqual([]);
    expect(resolved.players[actor].retreat).toEqual(expect.arrayContaining(base));
    expect(resolved.players[actor].field.vanguard).toEqual([source]);
  });

  it("「深入敌后」按所在场地转移控制权，触发由敌方控制并选择其战区角色", () => {
    const game = state();
    const owner = game.activePlayer;
    const controller = (owner === 0 ? 1 : 0) as PlayerIndex;
    place(game, owner, "covered", "OWN-COVER-1");
    place(game, owner, "covered", "OWN-COVER-2");
    place(game, controller, "covered", "ENEMY-COVER-1");
    const source = place(game, owner, "hand", "PB01-010", { power: 3500 });
    const controlledTarget = place(game, controller, "flankLeft", "CONTROLLED-TARGET", { power: 4000 });
    const deploy = PROMO_EFFECT_DEFINITIONS_PB01_V2.find((item) => item.effectId === "behind-enemy-lines-deploy")!;
    expect(deploy.canActivate?.(game, owner, source)).toBe(true);
    const placed = applyAtomicOperationsV2(game, deploy.buildOperations(game, owner, source, ["zone:rear"]));
    expect(placed.state.players[controller].field.rear).toEqual([source]);
    expect(placed.state.cards[source].owner).toBe(owner);
    expect(cardControllerV2(placed.state, source)).toBe(controller);
    expect(validateStateInvariantsV2(placed.state)).toEqual([]);

    const triggers = collectTriggeredEffectsV2(placed.state, placed.events);
    expect(triggers.map((item) => [item.controller, item.effectId])).toContainEqual([controller, "behind-enemy-lines-retreat"]);
    const trigger = triggers.find((item) => item.effectId === "behind-enemy-lines-retreat")!;
    expect(trigger.targeting?.choices).toContain(controlledTarget);
    const retreatEffect = PROMO_EFFECT_DEFINITIONS_PB01_V2.find((item) => item.effectId === "behind-enemy-lines-retreat")!;
    const resolved = applyAtomicOperationsV2(placed.state, retreatEffect.buildOperations(placed.state, controller, source, [controlledTarget])).state;
    expect(resolved.players[controller].retreat).toContain(controlledTarget);
  });

  it("「星体访客」可从虚空区起动，裁剪撤退区 Lv4+ 费用后放置并记录回合一次", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "void", "PB01-011");
    const cost = place(game, actor, "retreat", "LV4-COST", { level: 4 });
    const activated = executeCommandV2(game, { actor, commandId: "astral-activate", expectedRevision: game.revision, command: { type: "ACTIVATE_EFFECT", sourceCardId: source, effectId: "astral-visitor" } });
    expect(activated.ok).toBe(true);
    if (!activated.ok || activated.state.decision?.kind !== "EFFECT_TARGETS") return;
    expect(activated.state.decision.choices).toContain(cost);
    expect(activated.state.decision.choices).toContain("zone:rear");
    const resolved = executeCommandV2(activated.state, { actor, commandId: "astral-resolve", expectedRevision: activated.state.revision, command: { type: "ANSWER_DECISION", decisionId: activated.state.decision.id, cardIds: [cost, "zone:rear"] } });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.players[actor].void).toContain(cost);
    expect(resolved.state.players[actor].field.rear).toContain(source);
    expect(resolved.state.usage.effectUseKeysThisTurn).toContain(`${source}:astral-visitor`);
  });
});
