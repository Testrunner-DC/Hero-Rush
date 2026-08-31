import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Card } from "../../types/card";
import {
  applyAtomicOperationsV2,
  CARD_IMPLEMENTATIONS_V2,
  clearEffectRegistryForTestsV2,
  collectTriggeredEffectsV2,
  createGameV2,
  effectiveValueV2,
  effectRegistrySnapshotV2,
  executeCommandV2,
  PROMO_EFFECT_DEFINITIONS_EB01_V2,
  registerPromoEffectsEb01V2,
} from "../index";
import type { CreateGameInputV2, FieldZoneV2, GameStateV2, PlayerIndex } from "../index";

function definition(id: string, type: 1 | 2): Card {
  return {
    id,
    card_no: id,
    name: id,
    card_type: type,
    card_type_name: "测试",
    cost: 1,
    cost_name: "Lv1",
    attribute: 1,
    attribute_name: "红",
    attribute_color: "#d33",
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

function fixtureInput(): CreateGameInputV2 {
  const main0 = Array.from({ length: 50 }, (_, index) => `A-${index}`);
  const main1 = Array.from({ length: 50 }, (_, index) => `B-${index}`);
  const rush0 = Array.from({ length: 9 }, (_, index) => `AR-${index}`);
  const rush1 = Array.from({ length: 9 }, (_, index) => `BR-${index}`);
  return {
    matchId: "promo-eb01",
    seed: "promo-eb01",
    cardDefinitions: [
      ...main0.map((id) => definition(id, 1)),
      ...main1.map((id) => definition(id, 1)),
      ...rush0.map((id) => definition(id, 2)),
      ...rush1.map((id) => definition(id, 2)),
    ],
    players: [
      { name: "A", mainDeck: main0, rushDeck: rush0 },
      { name: "B", mainDeck: main1, rushDeck: rush1 },
    ],
  };
}

function state(): GameStateV2 {
  const result = createGameV2(fixtureInput());
  return { ...structuredClone(result), status: "playing", flow: { kind: "ACTION", actor: result.firstPlayer }, decision: null };
}

type Zone = "hand" | "base" | "retreat" | "void" | FieldZoneV2;
function place(
  game: GameStateV2,
  actor: PlayerIndex,
  zone: Zone,
  cardNo: string,
  options: Partial<{ level: number; range: number; power: number; attribute: number; features: string[] }> = {},
): string {
  const cardId = game.players[actor].deck.shift()!;
  Object.assign(game.cards[cardId], { cardNo, ...options });
  if (zone === "hand") game.players[actor].hand.push(cardId);
  else if (zone === "base") game.players[actor].baseCards.push(cardId);
  else if (zone === "retreat") game.players[actor].retreat.push(cardId);
  else if (zone === "void") game.players[actor].void.push(cardId);
  else game.players[actor].field[zone].push(cardId);
  return cardId;
}

beforeEach(() => {
  clearEffectRegistryForTestsV2();
  registerPromoEffectsEb01V2();
});
afterEach(() => clearEffectRegistryForTestsV2());

describe("EB01 赛事包 1.02 卡效", () => {
  it("4 张促销角色均有完整记录并进入效果注册表", () => {
    const records = CARD_IMPLEMENTATIONS_V2.filter((item) => /^EB01-00[6-9]$/.test(item.cardNo));
    expect(records).toHaveLength(4);
    expect(records.every((item) => item.tests.includes("promo-effects-eb01.test.ts"))).toBe(true);
    expect(PROMO_EFFECT_DEFINITIONS_EB01_V2).toHaveLength(4);
    expect(effectRegistrySnapshotV2().filter((item) => /^EB01-00[6-9]$/.test(item.cardNo))).toHaveLength(4);
  });

  it("「压制打击」只响应敌方 Lv6 放置，并同时降低双方角色战力", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "rear", "EB01-006", { level: 6, power: 5000 });
    const placed = place(game, enemy, "vanguard", "ENEMY-LV6", { level: 6, power: 5000 });
    const event = { type: "CHARACTER_PLACED" as const, actor: enemy, cardId: placed, destination: "vanguard" as const, placementKind: "summon" as const };
    const candidates = collectTriggeredEffectsV2(game, [event]);
    expect(candidates.map((item) => item.effectId)).toEqual(["suppressive-strike"]);

    const resolved = applyAtomicOperationsV2(game, candidates[0].operations).state;
    expect(effectiveValueV2(resolved, source, "power")).toBe(4000);
    expect(effectiveValueV2(resolved, placed, "power")).toBe(4000);

    expect(collectTriggeredEffectsV2(game, [{ ...event, actor }])).toHaveLength(0);
    game.cards[placed].level = 5;
    expect(collectTriggeredEffectsV2(game, [event])).toHaveLength(0);
  });

  it("「心灵共鸣」先撤退费用，可放进该费用腾出的战区，并严格执行回合 1 次", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "rear", "EB01-007", { level: 3, features: ["复仇者联盟", "机械"] });
    const cost = place(game, actor, "vanguard", "COST", { level: 3, features: ["人类", "复仇者联盟"] });
    const hand = place(game, actor, "hand", "HAND", { level: 3, features: ["复仇者联盟"] });

    const activated = executeCommandV2(game, {
      actor,
      commandId: "mind-resonance-activate",
      expectedRevision: game.revision,
      command: { type: "ACTIVATE_EFFECT", sourceCardId: source, effectId: "mind-resonance" },
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok || activated.state.decision?.kind !== "EFFECT_TARGETS") return;
    expect(activated.state.decision.choiceKind).toBe("mixed");
    expect(activated.state.decision.choices).toContain("zone:vanguard");

    const resolved = executeCommandV2(activated.state, {
      actor,
      commandId: "mind-resonance-resolve",
      expectedRevision: activated.state.revision,
      command: { type: "ANSWER_DECISION", decisionId: activated.state.decision.id, cardIds: [cost, hand, "zone:vanguard"] },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.players[actor].retreat).toContain(cost);
    expect(resolved.state.players[actor].field.vanguard).toEqual([hand]);
    expect(resolved.state.usage.effectUseKeysThisTurn).toContain(`${source}:mind-resonance`);

    const repeated = executeCommandV2(resolved.state, {
      actor,
      commandId: "mind-resonance-repeat",
      expectedRevision: resolved.state.revision,
      command: { type: "ACTIVATE_EFFECT", sourceCardId: source, effectId: "mind-resonance" },
    });
    expect(repeated.ok).toBe(false);
    if (!repeated.ok) expect(repeated.code).toBe("EFFECT_NOT_AVAILABLE");
  });

  it("「心灵共鸣」允许只支付撤退费用而不执行可选放置，且拒绝不完整的可选组合", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "rear", "EB01-007", { level: 3, features: ["复仇者联盟"] });
    const cost = place(game, actor, "vanguard", "COST", { level: 3, features: ["复仇者联盟"] });
    const hand = place(game, actor, "hand", "HAND", { level: 3, features: ["复仇者联盟"] });
    const effect = PROMO_EFFECT_DEFINITIONS_EB01_V2.find((item) => item.effectId === "mind-resonance")!;
    expect(effect.validateTargets?.(game, actor, source, [cost, hand])).toBeTruthy();
    expect(effect.validateTargets?.(game, actor, source, [cost])).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [cost])).state;
    expect(resolved.players[actor].retreat).toContain(cost);
    expect(resolved.players[actor].hand).toContain(hand);
    expect(resolved.usage.effectUseKeysThisTurn).toContain(`${source}:mind-resonance`);
  });

  it("「混沌本源」按己方虚空区角色数增幅，并在同回合只触发一次", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "base", "EB01-008", { level: 6, power: 500 });
    place(game, actor, "void", "VOID-1");
    place(game, actor, "void", "VOID-2");
    place(game, actor, "void", "VOID-3");
    const event = { type: "BATTLE_BASE_MOVED" as const, actor, cardId: source, from: "vanguard" as const, destination: "base" as const };
    const candidates = collectTriggeredEffectsV2(game, [event]);
    expect(candidates.map((item) => item.effectId)).toEqual(["chaos-origin"]);

    const resolved = applyAtomicOperationsV2(game, candidates[0].operations).state;
    expect(effectiveValueV2(resolved, source, "power")).toBe(3500);
    expect(resolved.usage.effectUseKeysThisTurn).toContain(`${source}:chaos-origin`);
    expect(collectTriggeredEffectsV2(resolved, [event])).toHaveLength(0);
  });

  it("「以一敌二」仅在自身战胜后选发，并让自身与敌方 Lv3 或以下角色一同撤退", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "EB01-009", { level: 3, power: 9000 });
    const target = place(game, enemy, "flankLeft", "ENEMY-LV3", { level: 3, power: 3000 });
    const battled = place(game, enemy, "retreat", "DEFEATED", { level: 2, power: 1000 });
    const event = { type: "CHARACTER_BATTLE_RESOLVED" as const, attackerId: source, targetId: battled, winnerCardId: source, defeatedCardIds: [battled], tied: false };
    const candidates = collectTriggeredEffectsV2(game, [event]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].optional).toBe(true);
    expect(candidates[0].targeting?.choices).toEqual([target]);

    const effect = PROMO_EFFECT_DEFINITIONS_EB01_V2.find((item) => item.effectId === "one-against-two")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target])).state;
    expect(resolved.players[actor].retreat).toContain(source);
    expect(resolved.players[enemy].retreat).toContain(target);
    expect(collectTriggeredEffectsV2(game, [{ ...event, winnerCardId: battled }])).toHaveLength(0);
  });
});
