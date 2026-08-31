import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Card } from "../../types/card";
import {
  applyAtomicOperationsV2,
  CARD_IMPLEMENTATIONS_V2,
  clearEffectRegistryForTestsV2,
  collectTriggeredEffectsV2,
  createGameV2,
  effectRegistrySnapshotV2,
  PROMO_EFFECT_DEFINITIONS_TB01_V2,
  registerPromoEffectsTb01V2,
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
  return { matchId: "promo-tb01", seed: "promo-tb01", cardDefinitions: [...main0.map((id) => definition(id, 1)), ...main1.map((id) => definition(id, 1)), ...rush0.map((id) => definition(id, 2)), ...rush1.map((id) => definition(id, 2))], players: [{ name: "A", mainDeck: main0, rushDeck: rush0 }, { name: "B", mainDeck: main1, rushDeck: rush1 }] };
}

function state(): GameStateV2 {
  const result = createGameV2(fixtureInput());
  return { ...structuredClone(result), status: "playing", flow: { kind: "ACTION", actor: result.firstPlayer }, decision: null };
}

type Zone = "hand" | "base" | "retreat" | FieldZoneV2;
function place(game: GameStateV2, actor: PlayerIndex, zone: Zone, cardNo: string, level = 1): string {
  const cardId = game.players[actor].deck.shift()!;
  Object.assign(game.cards[cardId], { cardNo, level });
  if (zone === "hand") game.players[actor].hand.push(cardId);
  else if (zone === "base") game.players[actor].baseCards.push(cardId);
  else if (zone === "retreat") game.players[actor].retreat.push(cardId);
  else game.players[actor].field[zone].push(cardId);
  return cardId;
}

beforeEach(() => {
  clearEffectRegistryForTestsV2();
  registerPromoEffectsTb01V2();
});
afterEach(() => clearEffectRegistryForTestsV2());

describe("TB01 斗界之主 1.02 卡效", () => {
  it("普通、金、银 3 个卡号分别登记，并共用同一规则实现", () => {
    const records = CARD_IMPLEMENTATIONS_V2.filter((item) => /^TB01-/.test(item.cardNo));
    expect(records).toHaveLength(3);
    expect(records.every((item) => item.effectIds.includes("battleworld-lord-banish") && item.effectIds.includes("keyword-unique") && item.effectIds.includes("keyword-counter"))).toBe(true);
    expect(PROMO_EFFECT_DEFINITIONS_TB01_V2).toHaveLength(3);
    expect(effectRegistrySnapshotV2().filter((item) => /^TB01-/.test(item.cardNo))).toHaveLength(3);
  });

  for (const cardNo of ["TB01-001", "TB01-001（金）", "TB01-001（银）"]) {
    it(`${cardNo} 因号召进场时可裁剪敌方场上 Lv2 或以下卡牌`, () => {
      const game = state();
      const actor = game.activePlayer;
      const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
      const source = place(game, actor, "vanguard", cardNo, 6);
      const enemyBase = place(game, enemy, "base", "ENEMY-LV2", 2);
      const enemyHigh = place(game, enemy, "vanguard", "ENEMY-LV3", 3);
      const event = { type: "CHARACTER_PLACED" as const, actor, cardId: source, destination: "vanguard" as const, placementKind: "summon" as const };
      const candidates = collectTriggeredEffectsV2(game, [event]);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].optional).toBe(true);
      expect(candidates[0].targeting?.choices).toContain(enemyBase);
      expect(candidates[0].targeting?.choices).not.toContain(enemyHigh);
      const effect = PROMO_EFFECT_DEFINITIONS_TB01_V2.find((item) => item.cardNo === cardNo)!;
      const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [enemyBase])).state;
      expect(resolved.players[enemy].baseCards).not.toContain(enemyBase);
      expect(resolved.players[enemy].void).toContain(enemyBase);
      expect(collectTriggeredEffectsV2(game, [{ ...event, placementKind: "effect" }])).toHaveLength(0);
    });
  }

  it("合法目标包含敌方场上的结附卡，但不包含盖卡", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "base", "TB01-001", 6);
    const host = place(game, enemy, "rear", "HOST", 4);
    const attached = place(game, enemy, "hand", "ATTACHED", 1);
    game.players[enemy].hand = game.players[enemy].hand.filter((id) => id !== attached);
    game.attachments[host] = [attached];
    const covered = place(game, enemy, "hand", "COVERED", 1);
    game.players[enemy].hand = game.players[enemy].hand.filter((id) => id !== covered);
    game.players[enemy].baseCovered.push(covered);
    const event = { type: "CHARACTER_PLACED" as const, actor, cardId: source, destination: "base" as const, placementKind: "summon" as const };
    const candidate = collectTriggeredEffectsV2(game, [event])[0];
    expect(candidate.targeting?.choices).toContain(attached);
    expect(candidate.targeting?.choices).not.toContain(covered);
  });
});
