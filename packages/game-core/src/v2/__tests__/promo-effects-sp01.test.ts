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
  hasKeywordV2,
  isCardEffectSuppressedV2,
  promoAttackTargetRestrictionV2,
  promoSummonPaymentForbiddenV2,
  PROMO_EFFECT_DEFINITIONS_SP01_V2,
  queueActivatedEffectV2,
  registerPromoEffectsSp01V2,
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
  return { matchId: "promo-sp01", seed: "promo-sp01", cardDefinitions: [...main0.map((id) => definition(id, 1)), ...main1.map((id) => definition(id, 1)), ...rush0.map((id) => definition(id, 2)), ...rush1.map((id) => definition(id, 2))], players: [{ name: "A", mainDeck: main0, rushDeck: rush0 }, { name: "B", mainDeck: main1, rushDeck: rush1 }] };
}

function state(): GameStateV2 {
  const result = createGameV2(fixtureInput());
  return { ...structuredClone(result), status: "playing", flow: { kind: "ACTION", actor: result.firstPlayer }, decision: null };
}

type Zone = "hand" | "base" | "covered" | "retreat" | "void" | FieldZoneV2;
function place(game: GameStateV2, actor: PlayerIndex, zone: Zone, cardNo: string, options: Partial<{ name: string; level: number; range: number; power: number; attribute: number; features: string[]; printedKeywords: GameStateV2["cards"][string]["printedKeywords"] }> = {}): string {
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
  registerPromoEffectsSp01V2();
});
afterEach(() => clearEffectRegistryForTestsV2());

describe("SP01 结附/放置事件批次", () => {
  it("SP01-001～009 完成登记，13 个起动/触发效果进入注册表", () => {
    const records = CARD_IMPLEMENTATIONS_V2.filter((item) => /^SP01-00[1-9]$/.test(item.cardNo));
    expect(records).toHaveLength(9);
    expect(records.every((item) => item.tests.includes("promo-effects-sp01.test.ts"))).toBe(true);
    expect(PROMO_EFFECT_DEFINITIONS_SP01_V2.filter((item) => /^SP01-00[1-9]$/.test(item.cardNo))).toHaveLength(13);
    expect(effectRegistrySnapshotV2().filter((item) => /^SP01-00[1-9]$/.test(item.cardNo))).toHaveLength(13);
  });

  it("本文件已覆盖 SP01-001～080，104 个起动/触发效果进入注册表", () => {
    const records = CARD_IMPLEMENTATIONS_V2.filter((item) => /^SP01-/.test(item.cardNo));
    expect(records).toHaveLength(80);
    expect(PROMO_EFFECT_DEFINITIONS_SP01_V2).toHaveLength(104);
    expect(effectRegistrySnapshotV2().filter((item) => /^SP01-/.test(item.cardNo))).toHaveLength(104);
  });

  it("「蜘蛛宿敌」卡耐基从场上撤退后支付手牌并结附，随后压低敌方最低战力角色", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "retreat", "SP01-001", { level: 6 });
    const discard = place(game, actor, "hand", "DISCARD");
    const host = place(game, actor, "vanguard", "HUMAN-HOST", { level: 5, features: ["人类"], power: 3000 });
    const low = place(game, enemy, "vanguard", "LOW", { power: 2000 });
    place(game, enemy, "rear", "HIGH", { power: 4000 });
    const retreatEvent = { type: "CARDS_RETREATED" as const, cardIds: [source], reason: "effect" as const, fromFieldCardIds: [source] };
    const returnTrigger = collectTriggeredEffectsV2(game, [retreatEvent])[0];
    expect(returnTrigger.optional).toBe(true);
    expect(returnTrigger.targeting?.choices).toEqual(expect.arrayContaining([discard, host]));
    const returnEffect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-carnage-return")!;
    const attached = applyAtomicOperationsV2(game, returnEffect.buildOperations(game, actor, source, [discard, host]));
    expect(attached.state.players[actor].retreat).toContain(discard);
    expect(attached.state.attachments[host]).toContain(source);

    const pressure = collectTriggeredEffectsV2(attached.state, attached.events).find((item) => item.effectId === "spider-nemesis-carnage-pressure")!;
    expect(pressure.targeting?.choices).toEqual([low]);
    const pressureEffect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-carnage-pressure")!;
    const resolved = applyAtomicOperationsV2(attached.state, pressureEffect.buildOperations(attached.state, actor, source, [low])).state;
    expect(effectiveValueV2(resolved, low, "power")).toBe(0);
  });

  it("「蜘蛛宿敌」神秘客展示同 Lv 红色手牌后放置，并记录回合一次", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "SP01-002", { level: 3 });
    const red = place(game, actor, "hand", "RED-LV3", { level: 3, attribute: 1 });
    const attachment = place(game, actor, "hand", "ATTACHMENT");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== attachment);
    game.attachments[source] = [attachment];
    const event = { type: "CARD_ATTACHED" as const, cardId: attachment, hostCardId: source };
    const trigger = collectTriggeredEffectsV2(game, [event])[0];
    expect(trigger.targeting?.choices).toEqual(expect.arrayContaining([red, "zone:rear"]));
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-mysterio-illusion")!;
    expect(effect.validateTargets?.(game, actor, source, [red, "zone:rear"])).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [red, "zone:rear"]));
    expect(resolved.events.some((item) => item.type === "CARDS_REVEALED")).toBe(true);
    expect(resolved.state.players[actor].field.rear).toContain(red);
    expect(resolved.state.usage.effectUseKeysThisTurn).toContain(`${source}:spider-nemesis-mysterio-illusion`);
    expect(collectTriggeredEffectsV2(resolved.state, [event])).toHaveLength(0);
  });

  it("「凤凰宿主」从撤退区回归后完成敌方 Lv6 撤退、手牌回底，并禁止自身作为本回合号召素材", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "retreat", "SP01-003", { level: 6 });
    const ownLv6 = place(game, actor, "vanguard", "OWN-LV6", { level: 6 });
    const enemyLv6 = place(game, enemy, "vanguard", "ENEMY-LV6", { level: 6 });
    place(game, enemy, "rear", "ENEMY-OTHER", { level: 2 });
    const hand = place(game, actor, "hand", "HAND-TO-BOTTOM", { level: 1 });
    const returnEffect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "phoenix-host-return")!;
    expect(returnEffect.canActivate?.(game, actor, source)).toBe(true);
    const returned = applyAtomicOperationsV2(game, returnEffect.buildOperations(game, actor, source, [ownLv6, "zone:rear"]));
    expect(returned.state.players[actor].retreat).toContain(ownLv6);
    expect(returned.state.players[actor].field.rear).toContain(source);
    expect(returned.events).toContainEqual(expect.objectContaining({ type: "CARD_PLACED_FIELD_BY_EFFECT", cardId: source, fromZone: "retreat" }));

    const arrival = collectTriggeredEffectsV2(returned.state, returned.events).find((item) => item.effectId === "phoenix-host-arrival")!;
    expect(arrival.targeting?.choices).toEqual(expect.arrayContaining([enemyLv6, hand]));
    const arrivalEffect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "phoenix-host-arrival")!;
    const resolved = applyAtomicOperationsV2(returned.state, arrivalEffect.buildOperations(returned.state, actor, source, [enemyLv6, hand])).state;
    expect(resolved.players[enemy].retreat).toContain(enemyLv6);
    expect(resolved.players[actor].deck.at(-1)).toBe(hand);
    expect(resolved.usage.summonPaymentBlockedCardIds).toContain(source);

    const highSummon = place(resolved, actor, "hand", "HIGH-SUMMON", { level: 6 });
    const rejected = executeCommandV2(resolved, { actor, commandId: "blocked-summon-material", expectedRevision: resolved.revision, command: { type: "SUMMON_CHARACTER", cardId: highSummon, destination: "vanguard" } });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe("COST_MISMATCH");
  });

  it("「顶级刺客」艾丽卡响应敌方低级人类入场；存在夜魔侠时在自身入场后裁剪敌人", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "hand", "SP01-004");
    place(game, actor, "base", "DAREDEVIL", { name: "「无畏守护」夜魔侠" });
    const enemyRole = place(game, enemy, "vanguard", "ENEMY-HUMAN", { level: 3, features: ["人类"] });
    const event = { type: "CHARACTER_PLACED" as const, actor: enemy, cardId: enemyRole, destination: "vanguard" as const, placementKind: "summon" as const };
    const trigger = collectTriggeredEffectsV2(game, [event])[0];
    expect(trigger.optional).toBe(true);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "top-assassin-elektra-arrival")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, ["zone:rear"], { triggerEvent: event })).state;
    expect(resolved.players[actor].field.rear).toContain(source);
    expect(resolved.players[enemy].void).toContain(enemyRole);
  });

  it("艾丽卡因效果从场上撤退时，为我方场上角色提供本回合 R+1", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "retreat", "SP01-004");
    const target = place(game, actor, "base", "TARGET", { range: 2 });
    const event = { type: "CARDS_RETREATED" as const, cardIds: [source], reason: "effect" as const, fromFieldCardIds: [source] };
    const trigger = collectTriggeredEffectsV2(game, [event])[0];
    expect(trigger.targeting?.choices).toContain(target);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "top-assassin-elektra-legacy")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target])).state;
    expect(effectiveValueV2(resolved, target, "range")).toBe(3);
  });

  it("「终局之战」撤退全部装甲后应对入场，并按撤退区装甲角色数实时增加战力", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "hand", "SP01-005", { power: 500 });
    const armorA = place(game, actor, "vanguard", "ARMOR-A", { name: "MK50装甲", power: 2000 });
    const armorB = place(game, actor, "base", "ARMOR-B", { name: "反浩克装甲", power: 2000 });
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "endgame-iron-man-arrival")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, ["zone:rear"])).state;
    expect(resolved.players[actor].retreat).toEqual(expect.arrayContaining([armorA, armorB]));
    expect(resolved.players[actor].field.rear).toContain(source);
    expect(effectiveValueV2(resolved, source, "power")).toBe(2500);
  });

  it("「蜘蛛宿敌」红魔按自身与另一张场上卡的 Lv 合计裁剪敌方对应角色", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-006", { level: 2 });
    const other = place(game, actor, "base", "OTHER", { level: 1 });
    const target = place(game, enemy, "vanguard", "TARGET-LV3", { level: 3 });
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-red-goblin")!;
    expect(effect.canActivate?.(game, actor, source)).toBe(true);
    expect(effect.validateTargets?.(game, actor, source, [other, target])).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [other, target])).state;
    expect(resolved.players[actor].void).toEqual(expect.arrayContaining([source, other]));
    expect(resolved.players[enemy].void).toContain(target);
  });

  it("「蜘蛛伴侣」花网结附时授予【强袭】和蛛网 R+1；起动后加战力并撤退自身", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "WEB-HOST", { range: 1, power: 3000, features: ["蛛网"] });
    const source = place(game, actor, "hand", "SP01-007");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== source);
    game.attachments[host] = [source];
    expect(hasKeywordV2(game, host, "assault")).toBe(true);
    expect(effectiveValueV2(game, host, "range")).toBe(2);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-companion-flower-web-boost")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [host])).state;
    expect(resolved.players[actor].retreat).toContain(source);
    expect(effectiveValueV2(resolved, host, "power")).toBe(5000);
    expect(hasKeywordV2(resolved, host, "assault")).toBe(false);
    expect(effectiveValueV2(resolved, host, "range")).toBe(1);
  });

  it("「蜘蛛伴侣」西尔弗在己方人类从场上撤退时，支付基地卡后抽牌并记录回合一次", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "base", "SP01-008");
    const human = place(game, actor, "retreat", "HUMAN", { features: ["人类"] });
    const baseCost = place(game, actor, "covered", "BASE-COST");
    const handBefore = game.players[actor].hand.length;
    const event = { type: "CARDS_RETREATED" as const, cardIds: [human], reason: "effect" as const, fromFieldCardIds: [human] };
    const trigger = collectTriggeredEffectsV2(game, [event])[0];
    expect(trigger.optional).toBe(true);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-companion-silver-sable-draw")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [baseCost])).state;
    expect(resolved.players[actor].retreat).toContain(baseCost);
    expect(resolved.players[actor].hand).toHaveLength(handBefore + 1);
    expect(resolved.usage.effectUseKeysThisTurn).toContain(`${source}:spider-companion-silver-sable-draw`);
  });

  it("「蜘蛛战友」黑豹只在自身效果把结附卡移到此卡时舍弃敌方卡组顶 2 张", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-009");
    const oldHost = place(game, actor, "rear", "OLD-HOST");
    const attached = place(game, actor, "hand", "ATTACHED");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== attached);
    game.attachments[oldHost] = [attached];
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-ally-black-panther-rebind")!;
    expect(effect.validateTargets?.(game, actor, source, [attached, source])).toBeNull();
    const moved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [attached, source]));
    expect(moved.state.attachments[source]).toContain(attached);
    const trigger = collectTriggeredEffectsV2(moved.state, moved.events).find((item) => item.effectId === "spider-ally-black-panther-mill")!;
    expect(trigger).toBeTruthy();
    const deckBefore = moved.state.players[enemy].deck.length;
    const resolved = applyAtomicOperationsV2(moved.state, trigger.operations).state;
    expect(resolved.players[enemy].deck).toHaveLength(deckBefore - 2);
    expect(resolved.players[enemy].retreat).toHaveLength(2);
    expect(collectTriggeredEffectsV2(moved.state, [{ type: "CARD_ATTACHED", cardId: attached, hostCardId: source }])).toHaveLength(0);
  });

  it("「杀意解放」按敌方战区角色数舍弃等量手牌，并同步获得 Lv、R、战力增幅", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-011", { level: 3, range: 1, power: 9000 });
    const handA = game.players[actor].hand[0];
    const handB = game.players[actor].hand[1];
    place(game, enemy, "vanguard", "ENEMY-A");
    place(game, enemy, "rear", "ENEMY-B");
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "killing-intent-hulk")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [handA, handB])).state;
    expect(resolved.players[actor].retreat).toEqual(expect.arrayContaining([handA, handB]));
    expect(effectiveValueV2(resolved, source, "level")).toBe(5);
    expect(effectiveValueV2(resolved, source, "range")).toBe(3);
    expect(effectiveValueV2(resolved, source, "power")).toBe(11000);
  });

  it("敌方战区为 0 张时，「杀意解放」无需打开空选择弹框即可完成", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "SP01-011", { level: 3 });
    const resolved = executeCommandV2(game, { actor, commandId: "zero-killing-intent", expectedRevision: game.revision, command: { type: "ACTIVATE_EFFECT", sourceCardId: source, effectId: "killing-intent-hulk" } });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.state.decision).toBeNull();
      expect(resolved.state.usage.effectUseKeysThisTurn).toContain(`${source}:killing-intent-hulk`);
    }
  });

  it("「蜘蛛战友」秘客先撤退己方人类；结算后我方较少时裁剪敌方 Lv3 以下角色", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-012");
    const cost = place(game, actor, "rear", "HUMAN-COST", { features: ["人类"] });
    const target = place(game, enemy, "vanguard", "ENEMY-LV3", { level: 3 });
    place(game, enemy, "rear", "ENEMY-OTHER", { level: 4 });
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-ally-magik")!;
    expect(effect.validateTargets?.(game, actor, source, [cost, target])).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [cost, target])).state;
    expect(resolved.players[actor].retreat).toContain(cost);
    expect(resolved.players[enemy].void).toContain(target);
  });

  it("「蜘蛛战友」卢克·凯奇在己方基地增加时，本回合自身 R+1 且敌方角色战力 -500", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-016", { range: 1 });
    const target = place(game, enemy, "base", "ENEMY", { power: 3000 });
    const event = { type: "CARDS_PLACED_IN_BASE" as const, actor, cardIds: ["x"], face: "down" as const };
    const trigger = collectTriggeredEffectsV2(game, [event])[0];
    expect(trigger.targeting?.choices).toContain(target);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-ally-luke-cage")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target])).state;
    expect(effectiveValueV2(resolved, source, "range")).toBe(2);
    expect(effectiveValueV2(resolved, target, "power")).toBe(2500);
  });

  it("「蜘蛛宿敌」猎人克莱文仅在战斗阶段按敌方战区有效能力总数增加战力", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-018", { power: 2000 });
    place(game, enemy, "vanguard", "ENEMY-A", { printedKeywords: ["unique", "intercept"] });
    place(game, enemy, "rear", "ENEMY-B", { printedKeywords: ["combo"] });
    expect(effectiveValueV2(game, source, "power")).toBe(2000);
    game.flow = { kind: "BATTLE_ADJUST", actor };
    expect(effectiveValueV2(game, source, "power")).toBe(5000);
  });

  it("「蜘蛛战友」杰西卡使用可回放随机状态展示敌方手牌，再盖放同 Lv 撤退区角色", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    for (const id of game.players[enemy].hand) game.cards[id].level = 2;
    const target = place(game, actor, "retreat", "MATCH-LV2", { level: 2, features: ["蛛网"] });
    const source = place(game, actor, "vanguard", "SP01-010");
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-ally-jessica-random-reveal")!;
    const cursorBefore = game.randomState.cursor;
    const revealed = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, []));
    expect(revealed.state.randomState.cursor).toBe(cursorBefore + 1);
    const revealEvent = revealed.events.find((event) => event.type === "CARDS_REVEALED");
    expect(revealEvent?.type === "CARDS_REVEALED" ? revealEvent.cards : []).toHaveLength(1);
    const followup = collectTriggeredEffectsV2(revealed.state, revealed.events).find((item) => item.effectId === "spider-ally-jessica-cover")!;
    expect(followup.targeting?.choices).toContain(target);
    const cover = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-ally-jessica-cover")!;
    const resolved = applyAtomicOperationsV2(revealed.state, cover.buildOperations(revealed.state, actor, source, [target])).state;
    expect(resolved.players[actor].baseCovered).toContain(target);
  });

  it("「蜘蛛战友」托尼只抵消已有战力减少，不会把减益反转成加成", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "rear", "SP01-013");
    place(game, actor, "base", "LV6", { level: 6 });
    const target = place(game, actor, "vanguard", "TARGET", { power: 4000 });
    game.modifiers.push({ id: "debuff", sourceCardId: source, targetCardId: target, type: "power", value: -2000, duration: "turn" });
    expect(effectiveValueV2(game, target, "power")).toBe(2500);
    game.modifiers[0].value = -300;
    expect(effectiveValueV2(game, target, "power")).toBe(4000);
  });

  it("「暗影救援」蜘蛛女孩仅在作为结附卡跟随宿主撤退时触发基地救援", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "HOST");
    const source = place(game, actor, "hand", "SP01-014", { level: 6, features: ["蛛网"] });
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== source);
    game.attachments[host] = [source];
    const rescued = place(game, actor, "retreat", "WEB-LV3", { level: 3, features: ["蛛网"] });
    const retreated = applyAtomicOperationsV2(game, [{ kind: "RETREAT", cardIds: [host] }]);
    const retreatEvent = retreated.events.find((event) => event.type === "CARDS_RETREATED");
    expect(retreatEvent?.type === "CARDS_RETREATED" ? retreatEvent.followedAttachmentCardIds : []).toContain(source);
    const candidate = collectTriggeredEffectsV2(retreated.state, retreated.events).find((item) => item.effectId === "shadow-rescue-follow-retreat")!;
    expect(candidate.targeting?.choices).toContain(rescued);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "shadow-rescue-follow-retreat")!;
    const resolved = applyAtomicOperationsV2(retreated.state, effect.buildOperations(retreated.state, actor, source, [rescued])).state;
    expect(resolved.players[actor].baseCards).toContain(rescued);
  });

  it("「暗影救援」手牌起动先舍弃自身，再把基地盖卡移回手牌", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "hand", "SP01-014");
    const covered = place(game, actor, "covered", "COVERED");
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "shadow-rescue-covered-return")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [covered])).state;
    expect(resolved.players[actor].retreat).toContain(source);
    expect(resolved.players[actor].hand).toContain(covered);
  });

  it("「命运牵引」分别识别结附宿主攻击与【蛛网】效果放置，并裁剪双方卡组顶", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const host = place(game, actor, "vanguard", "HOST");
    const source = place(game, actor, "hand", "SP01-015", { features: ["蛛网"] });
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== source);
    game.attachments[host] = [source];
    const attack = { type: "ATTACK_DECLARED" as const, actor, attackerId: host, target: { kind: "breach" as const, zone: "vanguard" as const } };
    const attackTrigger = collectTriggeredEffectsV2(game, [attack]).find((item) => item.effectId === "destiny-pull-attack-mill")!;
    const attackResolved = applyAtomicOperationsV2(game, attackTrigger.operations).state;
    expect(attackResolved.players[actor].retreat).toHaveLength(1);
    expect(attackResolved.players[enemy].retreat).toHaveLength(1);

    const placedGame = state();
    const placedActor = placedGame.activePlayer;
    const placedEnemy = (placedActor === 0 ? 1 : 0) as PlayerIndex;
    const placedSource = place(placedGame, placedActor, "hand", "SP01-015", { features: ["蛛网"] });
    const webCause = place(placedGame, placedActor, "base", "WEB-CAUSE", { features: ["蛛网"] });
    const placed = applyAtomicOperationsV2(placedGame, [{ kind: "PLACE_FIELD", cardId: placedSource, destination: "vanguard", sourceCardId: webCause }]);
    const placementTrigger = collectTriggeredEffectsV2(placed.state, placed.events).find((item) => item.effectId === "destiny-pull-web-placement-mill")!;
    const placementResolved = applyAtomicOperationsV2(placed.state, placementTrigger.operations).state;
    expect(placementResolved.players[placedActor].retreat).toHaveLength(3);
    expect(placementResolved.players[placedEnemy].retreat).toHaveLength(3);
  });

  it("「蜘蛛伴侣」银貂支付两张侧翼角色后，撤退敌方侧翼或后卫 Lv5 以下角色", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "flankLeft", "SP01-019");
    const partner = place(game, actor, "flankRight", "PARTNER", { range: 2 });
    const target = place(game, enemy, "rear", "TARGET", { level: 5 });
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-companion-silver-sable-flank")!;
    expect(effect.canActivate?.(game, actor, source)).toBe(true);
    expect(effect.validateTargets?.(game, actor, source, [partner, target])).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [partner, target])).state;
    expect(resolved.players[actor].retreat).toEqual(expect.arrayContaining([source, partner]));
    expect(resolved.players[enemy].retreat).toContain(target);
  });

  it("「蜘蛛宿敌」狼蛛先盖伏合法敌方基地人类，再盖伏自身", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "base", "SP01-020", { level: 2 });
    const target = place(game, enemy, "base", "HUMAN", { level: 2, features: ["人类"] });
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-tarantula-cover")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target])).state;
    expect(resolved.players[enemy].baseCovered).toContain(target);
    expect(resolved.players[actor].baseCovered).toContain(source);
  });

  it("「命运之网」在蛛网角色进场时结附手牌，并在被己方效果裁剪后回到基地", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "base", "SP01-021", { features: ["蛛网"] });
    const placed = place(game, actor, "vanguard", "WEB-PLACED", { features: ["蛛网"] });
    const attachment = place(game, actor, "hand", "WEB-HAND", { features: ["蛛网"] });
    const placementEvent = { type: "CHARACTER_PLACED" as const, actor, cardId: placed, destination: "vanguard" as const, placementKind: "effect" as const };
    const attachCandidate = collectTriggeredEffectsV2(game, [placementEvent]).find((item) => item.effectId === "web-of-destiny-attach")!;
    expect(attachCandidate.optional).toBe(true);
    const attachEffect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "web-of-destiny-attach")!;
    const attached = applyAtomicOperationsV2(game, attachEffect.buildOperations(game, actor, source, [attachment, placed])).state;
    expect(attached.attachments[placed]).toContain(attachment);

    const banished = applyAtomicOperationsV2(attached, [{ kind: "BANISH", cardIds: [source], sourceCardId: placed }]);
    const returnCandidate = collectTriggeredEffectsV2(banished.state, banished.events).find((item) => item.effectId === "web-of-destiny-return")!;
    expect(returnCandidate).toBeTruthy();
    const returnEffect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "web-of-destiny-return")!;
    const returned = applyAtomicOperationsV2(banished.state, returnEffect.buildOperations(banished.state, actor, source, [])).state;
    expect(returned.players[actor].baseCards).toContain(source);
  });

  it("「瞬击魅影」结附时授予宿主连击；蛛网角色攻击获胜后可从手牌互换进场", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "WEB-HOST", { features: ["蛛网"] });
    const attachedSource = place(game, actor, "hand", "SP01-022");
    const attached = applyAtomicOperationsV2(game, [{ kind: "ATTACH", cardId: attachedSource, hostCardId: host }]);
    const attachTrigger = collectTriggeredEffectsV2(attached.state, attached.events).find((item) => item.effectId === "phantom-strike-attach-combo")!;
    const comboState = applyAtomicOperationsV2(attached.state, attachTrigger.operations).state;
    expect(hasKeywordV2(comboState, host, "combo")).toBe(true);

    const swapGame = state();
    const swapActor = swapGame.activePlayer;
    const attacker = place(swapGame, swapActor, "vanguard", "WEB-ATTACKER", { features: ["蛛网"] });
    const source = place(swapGame, swapActor, "hand", "SP01-022");
    const battleEvent = { type: "CHARACTER_BATTLE_RESOLVED" as const, attackerId: attacker, targetId: "target", winnerCardId: attacker, defeatedCardIds: ["target"], tied: false };
    const swapCandidate = collectTriggeredEffectsV2(swapGame, [battleEvent]).find((item) => item.effectId === "phantom-strike-victory-swap")!;
    const swapped = applyAtomicOperationsV2(swapGame, swapCandidate.operations).state;
    expect(swapped.players[swapActor].field.vanguard).toEqual([source]);
    expect(swapped.players[swapActor].hand).toContain(attacker);
    expect(hasKeywordV2(swapped, source, "combo")).toBe(true);
  });

  it("「蜘蛛宿敌」毒液结附纳尔时撤退宿主，并可裁剪低等级人类获得其战力", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "KNNULL", { name: "纳尔" });
    const attachedSource = place(game, actor, "hand", "SP01-023");
    const attached = applyAtomicOperationsV2(game, [{ kind: "ATTACH", cardId: attachedSource, hostCardId: host }]);
    const retreatTrigger = collectTriggeredEffectsV2(attached.state, attached.events).find((item) => item.effectId === "spider-nemesis-venom-knull")!;
    const retreated = applyAtomicOperationsV2(attached.state, retreatTrigger.operations).state;
    expect(retreated.players[actor].retreat).toEqual(expect.arrayContaining([host, attachedSource]));

    const boostGame = state();
    const boostActor = boostGame.activePlayer;
    const source = place(boostGame, boostActor, "vanguard", "SP01-023", { power: 9000 });
    const cost = place(boostGame, boostActor, "rear", "HUMAN", { level: 3, power: 2500, features: ["人类"] });
    const boost = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-venom-boost")!;
    const boosted = applyAtomicOperationsV2(boostGame, boost.buildOperations(boostGame, boostActor, source, [cost])).state;
    expect(boosted.players[boostActor].void).toContain(cost);
    expect(effectiveValueV2(boosted, source, "power")).toBe(11500);
  });

  it("「驾驶机甲」令机械宿主战力 -1000，跟随撤退后可回场并结附撤退区机械", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "MACHINE-HOST", { power: 4000, features: ["机械"] });
    const source = place(game, actor, "hand", "SP01-024");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== source);
    game.attachments[host] = [source];
    expect(effectiveValueV2(game, host, "power")).toBe(3000);
    const machine = place(game, actor, "retreat", "MACHINE", { features: ["机械"] });
    const retreated = applyAtomicOperationsV2(game, [{ kind: "RETREAT", cardIds: [host] }]);
    const candidate = collectTriggeredEffectsV2(retreated.state, retreated.events).find((item) => item.effectId === "mecha-pilot-penny-return")!;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "mecha-pilot-penny-return")!;
    expect(effect.validateTargets?.(retreated.state, actor, source, ["zone:rear", machine])).toBeNull();
    const resolved = applyAtomicOperationsV2(retreated.state, effect.buildOperations(retreated.state, actor, source, ["zone:rear", machine])).state;
    expect(resolved.players[actor].field.rear).toEqual([source]);
    expect(resolved.attachments[source]).toContain(machine);
  });

  it("「枪火谈判」在宿主攻击时裁剪卡组顶，号召进场时检索顶 3 张【蛛网】并裁剪其余", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "HOST");
    const source = place(game, actor, "hand", "SP01-025");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== source);
    game.attachments[host] = [source];
    const attack = { type: "ATTACK_DECLARED" as const, actor, attackerId: host, target: { kind: "breach" as const, zone: "vanguard" as const } };
    const attackTrigger = collectTriggeredEffectsV2(game, [attack]).find((item) => item.effectId === "gunfire-negotiation-attack-banish")!;
    const attacked = applyAtomicOperationsV2(game, attackTrigger.operations).state;
    expect(attacked.players[actor].void).toHaveLength(1);

    const summonGame = state();
    const summonActor = summonGame.activePlayer;
    const summoned = place(summonGame, summonActor, "vanguard", "SP01-025");
    const top = summonGame.players[summonActor].deck.slice(0, 3);
    summonGame.cards[top[0]].features = ["蛛网"];
    const event = { type: "CHARACTER_SUMMONED" as const, actor: summonActor, cardId: summoned, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const candidate = collectTriggeredEffectsV2(summonGame, [event]).find((item) => item.effectId === "gunfire-negotiation-summon-search")!;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "gunfire-negotiation-summon-search")!;
    const resolved = applyAtomicOperationsV2(summonGame, effect.buildOperations(summonGame, summonActor, summoned, [top[0]])).state;
    expect(resolved.players[summonActor].hand).toContain(top[0]);
    expect(resolved.players[summonActor].void).toEqual(expect.arrayContaining(top.slice(1)));
  });

  it("「守望挚爱」支持结附位与宿主互换，也支持从手牌替换格温并压低敌方战力", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "HUMAN-HOST", { features: ["人类"] });
    const source = place(game, actor, "hand", "SP01-026");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== source);
    game.attachments[host] = [source];
    const swap = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "watch-beloved-attachment-swap")!;
    const swapped = applyAtomicOperationsV2(game, swap.buildOperations(game, actor, source, [])).state;
    expect(swapped.players[actor].field.vanguard).toEqual([source]);
    expect(swapped.attachments[source]).toContain(host);

    const handGame = state();
    const handActor = handGame.activePlayer;
    const enemy = (handActor === 0 ? 1 : 0) as PlayerIndex;
    const handSource = place(handGame, handActor, "hand", "SP01-026");
    const gwen = place(handGame, handActor, "vanguard", "GWEN", { name: "格温" });
    const target = place(handGame, enemy, "vanguard", "ENEMY", { power: 3000 });
    const response = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "watch-beloved-hand-swap")!;
    const responded = applyAtomicOperationsV2(handGame, response.buildOperations(handGame, handActor, handSource, [gwen, target])).state;
    expect(responded.players[handActor].field.vanguard).toEqual([handSource]);
    expect(effectiveValueV2(responded, target, "power")).toBe(2000);
  });

  it("「共生战衣」按虚空中异名蛛网角色增幅，并可从蛛网宿主解除至战区", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "SP01-027", { name: "共生战衣", power: 2500 });
    place(game, actor, "retreat", "VOID-WEB", { name: "其他蛛网", features: ["蛛网"] });
    const voidWeb = game.players[actor].retreat.pop()!;
    game.players[actor].void.push(voidWeb);
    expect(effectiveValueV2(game, source, "power")).toBe(3000);

    const host = place(game, actor, "rear", "WEB-HOST", { features: ["蛛网"] });
    game.players[actor].field.vanguard = [];
    game.attachments[host] = [source];
    const event = { type: "CARD_ATTACHED" as const, cardId: source, hostCardId: host };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "symbiote-suit-detach")!;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "symbiote-suit-detach")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, ["zone:vanguard"])).state;
    expect(resolved.players[actor].field.vanguard).toEqual([source]);
  });

  it("「纵横二代」令宿主 R-1，并在跟随撤退后返回空战区", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "HOST", { range: 3 });
    const source = place(game, actor, "hand", "SP01-028");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== source);
    game.attachments[host] = [source];
    expect(effectiveValueV2(game, host, "range")).toBe(2);
    const retreated = applyAtomicOperationsV2(game, [{ kind: "RETREAT", cardIds: [host] }]);
    const candidate = collectTriggeredEffectsV2(retreated.state, retreated.events).find((item) => item.effectId === "web-warrior-ultimate-return")!;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "web-warrior-ultimate-return")!;
    const resolved = applyAtomicOperationsV2(retreated.state, effect.buildOperations(retreated.state, actor, source, ["zone:rear"])).state;
    expect(resolved.players[actor].field.rear).toEqual([source]);
  });

  it("「蜘蛛机甲」从基地结附并给予 R+1；作为 Lv4 唯一结附卡时再给予战力 +3000", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "base", "SP01-029");
    const host = place(game, actor, "vanguard", "HOST", { level: 4, range: 1, power: 2000 });
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-mecha-attach")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [host])).state;
    expect(resolved.attachments[host]).toEqual([source]);
    expect(effectiveValueV2(resolved, host, "range")).toBe(2);
    expect(effectiveValueV2(resolved, host, "power")).toBe(5000);
  });

  it("「多元邀请」结附时可裁剪自身与撤退区蛛网抽 2，战区起动可裁剪蛛网手牌抽 1", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "HOST");
    const source = place(game, actor, "hand", "SP01-030");
    const web = place(game, actor, "retreat", "WEB", { features: ["蛛网"] });
    const attached = applyAtomicOperationsV2(game, [{ kind: "ATTACH", cardId: source, hostCardId: host }]);
    const candidate = collectTriggeredEffectsV2(attached.state, attached.events).find((item) => item.effectId === "multiverse-invitation-attach-draw")!;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "multiverse-invitation-attach-draw")!;
    const handBefore = attached.state.players[actor].hand.length;
    const resolved = applyAtomicOperationsV2(attached.state, effect.buildOperations(attached.state, actor, source, [web])).state;
    expect(resolved.players[actor].void).toEqual(expect.arrayContaining([source, web]));
    expect(resolved.players[actor].hand).toHaveLength(handBefore + 2);

    const actionGame = state();
    const actionActor = actionGame.activePlayer;
    const actionSource = place(actionGame, actionActor, "vanguard", "SP01-030");
    const handWeb = place(actionGame, actionActor, "hand", "HAND-WEB", { features: ["蛛网"] });
    const action = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "multiverse-invitation-action-draw")!;
    const actionResolved = applyAtomicOperationsV2(actionGame, action.buildOperations(actionGame, actionActor, actionSource, [handWeb])).state;
    expect(actionResolved.players[actionActor].void).toContain(handWeb);
  });

  it("「坚守正道」战败后先裁剪顶 3 张，再按更新后的虚空选择最低 Lv 蛛网回场", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "retreat", "SP01-031");
    const existing = place(game, actor, "retreat", "OLD-WEB", { level: 4, features: ["蛛网"] });
    game.players[actor].retreat = game.players[actor].retreat.filter((id) => id !== existing);
    game.players[actor].void.push(existing);
    const top = game.players[actor].deck.slice(0, 3);
    game.cards[top[0]].features = ["蛛网"];
    game.cards[top[0]].level = 2;
    const battle = { type: "CHARACTER_BATTLE_RESOLVED" as const, attackerId: source, targetId: "target", winnerCardId: "target", defeatedCardIds: [source], tied: false };
    const first = collectTriggeredEffectsV2(game, [battle]).find((item) => item.effectId === "stand-righteous-defeat-banish")!;
    const banished = applyAtomicOperationsV2(game, first.operations);
    const second = collectTriggeredEffectsV2(banished.state, banished.events).find((item) => item.effectId === "stand-righteous-void-return")!;
    expect(second.targeting?.choices).toContain(top[0]);
    expect(second.targeting?.choices).not.toContain(existing);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "stand-righteous-void-return")!;
    const resolved = applyAtomicOperationsV2(banished.state, effect.buildOperations(banished.state, actor, source, [top[0], "zone:vanguard"])).state;
    expect(resolved.players[actor].field.vanguard).toEqual([top[0]]);
  });

  it("「联盟领袖」按敌方角色的蛛网结附数压低战力，并在被蛛网效果裁剪后裁剪 3 抽 1", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "base", "SP01-032");
    const target = place(game, enemy, "vanguard", "TARGET", { power: 5000 });
    const webA = place(game, enemy, "hand", "WEB-A", { features: ["蛛网"] });
    const webB = place(game, enemy, "hand", "WEB-B", { features: ["蛛网"] });
    game.players[enemy].hand = game.players[enemy].hand.filter((id) => id !== webA && id !== webB);
    game.attachments[target] = [webA, webB];
    expect(effectiveValueV2(game, target, "power")).toBe(3000);

    const webCause = place(game, actor, "vanguard", "WEB-CAUSE", { features: ["蛛网"] });
    const banished = applyAtomicOperationsV2(game, [{ kind: "BANISH", cardIds: [source], sourceCardId: webCause }]);
    const candidate = collectTriggeredEffectsV2(banished.state, banished.events).find((item) => item.effectId === "alliance-leader-void-draw")!;
    const handBefore = banished.state.players[actor].hand.length;
    const resolved = applyAtomicOperationsV2(banished.state, candidate.operations).state;
    expect(resolved.players[actor].hand).toHaveLength(handBefore + 1);
  });

  it("「蜘蛛导师」同时叠加宿主增幅与己方回合等量战区蛛网增幅", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const mentor = place(game, actor, "vanguard", "SP01-033", { power: 2000, features: ["蛛网"] });
    const host = place(game, actor, "rear", "WEB-HOST", { power: 2000, range: 1, features: ["蛛网"] });
    const attachedMentor = place(game, actor, "hand", "SP01-033");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== attachedMentor);
    game.attachments[host] = [attachedMentor];
    place(game, enemy, "vanguard", "ENEMY-A");
    place(game, enemy, "rear", "ENEMY-B");
    expect(effectiveValueV2(game, host, "power")).toBe(4000);
    expect(effectiveValueV2(game, host, "range")).toBe(3);
    expect(effectiveValueV2(game, mentor, "power")).toBe(3000);
  });

  it("「终极模式」结附时撤退其他结附卡，应对时裁剪蛛网并强化宿主", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "HOST", { power: 3000 });
    const old = place(game, actor, "hand", "OLD-ATTACH");
    const source = place(game, actor, "hand", "SP01-034");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== old && id !== source);
    game.attachments[host] = [old, source];
    const attachEvent = { type: "CARD_ATTACHED" as const, cardId: source, hostCardId: host };
    const clear = collectTriggeredEffectsV2(game, [attachEvent]).find((item) => item.effectId === "ultimate-mode-clear-attachments")!;
    const cleared = applyAtomicOperationsV2(game, clear.operations).state;
    expect(cleared.players[actor].retreat).toContain(old);
    const web = place(cleared, actor, "retreat", "WEB", { features: ["蛛网"] });
    const boost = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "ultimate-mode-response-boost")!;
    const resolved = applyAtomicOperationsV2(cleared, boost.buildOperations(cleared, actor, source, [web])).state;
    expect(resolved.players[actor].void).toContain(web);
    expect(effectiveValueV2(resolved, host, "power")).toBe(4000);
  });

  it("「命运镜像」在人类战败时裁剪自身，把虚空 Lv3 蜘蛛侠放置进空战区", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "rear", "SP01-035");
    const defeated = place(game, actor, "retreat", "HUMAN", { features: ["人类"] });
    const spider = place(game, actor, "retreat", "SPIDER", { name: "蜘蛛侠", level: 3 });
    game.players[actor].retreat = game.players[actor].retreat.filter((id) => id !== spider);
    game.players[actor].void.push(spider);
    const battle = { type: "CHARACTER_BATTLE_RESOLVED" as const, attackerId: defeated, targetId: "target", winnerCardId: "target", defeatedCardIds: [defeated], tied: false };
    const candidate = collectTriggeredEffectsV2(game, [battle]).find((item) => item.effectId === "destiny-mirror-prowler")!;
    expect(candidate.optional).toBe(true);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "destiny-mirror-prowler")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [spider, "zone:vanguard"])).state;
    expect(resolved.players[actor].void).toContain(source);
    expect(resolved.players[actor].field.vanguard).toEqual([spider]);
  });

  it("「蜘蛛感应」给予宿主 +1000，并可裁剪自身把黄色人类移回手牌", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "YELLOW-HUMAN", { power: 3000, attribute: 2, features: ["人类"] });
    const source = place(game, actor, "hand", "SP01-036");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== source);
    game.attachments[host] = [source];
    expect(effectiveValueV2(game, host, "power")).toBe(4000);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-sense-return-yellow")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [host])).state;
    expect(resolved.players[actor].void).toContain(source);
    expect(resolved.players[actor].hand).toContain(host);
  });

  it("「蜘蛛导师」蜘蛛女侠给予宿主 R+2，跟随撤退后可返回基地", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "HOST", { range: 1 });
    const source = place(game, actor, "hand", "SP01-037");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== source);
    game.attachments[host] = [source];
    expect(effectiveValueV2(game, host, "range")).toBe(3);
    const retreated = applyAtomicOperationsV2(game, [{ kind: "RETREAT", cardIds: [host] }]);
    const candidate = collectTriggeredEffectsV2(retreated.state, retreated.events).find((item) => item.effectId === "spider-mentor-woman-return")!;
    const resolved = applyAtomicOperationsV2(retreated.state, candidate.operations).state;
    expect(resolved.players[actor].baseCards).toContain(source);
  });

  it("「蜘蛛宿敌」回旋镖使目标降至 0 撤退时，凭同一效果来源事件额外抽 1", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-038");
    const target = place(game, enemy, "vanguard", "TARGET", { power: 1000 });
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-boomerang")!;
    const reduced = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target]));
    expect(reduced.state.players[enemy].retreat).toContain(target);
    const stateEvent = reduced.events.find((event) => event.type === "CARDS_RETREATED" && event.reason === "state");
    expect(stateEvent?.type === "CARDS_RETREATED" ? stateEvent.sourceCardId : null).toBe(source);
    const draw = collectTriggeredEffectsV2(reduced.state, reduced.events).find((item) => item.effectId === "spider-nemesis-boomerang-draw")!;
    const handBefore = reduced.state.players[actor].hand.length;
    const resolved = applyAtomicOperationsV2(reduced.state, draw.operations).state;
    expect(resolved.players[actor].hand).toHaveLength(handBefore + 1);
  });

  it("「意识孢子」从撤退区放置时扩散另一张奥创，并把手牌依容量盖放基地", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "retreat", "SP01-039");
    const ultron = place(game, actor, "retreat", "ULTRON", { name: "奥创" });
    const placed = applyAtomicOperationsV2(game, [{ kind: "PLACE_FIELD", cardId: source, destination: "vanguard", sourceCardId: source }]);
    const candidate = collectTriggeredEffectsV2(placed.state, placed.events).find((item) => item.effectId === "consciousness-spore-ultron")!;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "consciousness-spore-ultron")!;
    const hand = [...placed.state.players[actor].hand];
    const resolved = applyAtomicOperationsV2(placed.state, effect.buildOperations(placed.state, actor, source, [ultron, "zone:rear"])).state;
    expect(resolved.players[actor].field.rear).toEqual([ultron]);
    expect(resolved.players[actor].baseCovered).toEqual(expect.arrayContaining(hand));
  });

  it("「抑制装置」在场上以 R 替换 Lv，并以被裁剪浩克的 Lv 压低同 Lv 敌人", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "hand", "SP01-040", { level: 6, range: 3 });
    const hulk = place(game, actor, "vanguard", "HULK", { name: "浩克", level: 4 });
    const target = place(game, enemy, "vanguard", "TARGET", { level: 4, power: 5000 });
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "suppression-device-hulk")!;
    expect(effect.validateTargets?.(game, actor, source, [hulk, "zone:rear", target])).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [hulk, "zone:rear", target])).state;
    expect(resolved.players[actor].void).toContain(hulk);
    expect(effectiveValueV2(resolved, source, "level")).toBe(3);
    expect(effectiveValueV2(resolved, target, "power")).toBe(1000);
  });

  it("「蜘蛛宿敌」章鱼博士按结附数压低敌方先锋 R，战胜后移动并在有机械时裁剪目标", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-041");
    const attachment = place(game, actor, "hand", "ATTACH");
    game.players[actor].hand = game.players[actor].hand.filter((id) => id !== attachment);
    game.attachments[source] = [attachment];
    const target = place(game, enemy, "vanguard", "TARGET", { power: 4000, range: 2 });
    place(game, actor, "base", "MACHINE", { features: ["机械"] });
    expect(effectiveValueV2(game, target, "range")).toBe(1);
    const event = { type: "CHARACTER_BATTLE_RESOLVED" as const, attackerId: source, targetId: "loser", winnerCardId: source, defeatedCardIds: ["loser"], tied: false };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "spider-nemesis-octopus-victory")!;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-octopus-victory")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target])).state;
    expect(resolved.players[enemy].void).toContain(target);
  });

  it("「蜘蛛宿敌」绿魔裁剪顶 1 抽 2 后进入敌方基地，并在该方回合开始裁剪其卡组底 3", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-042");
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-green-goblin-infiltrate")!;
    const infiltrated = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, []));
    expect(infiltrated.state.players[enemy].baseCards).toContain(source);
    const bottom = infiltrated.state.players[enemy].deck.slice(-3);
    const turnDraw = { type: "TURN_CARDS_DRAWN" as const, actor: enemy, count: 2 };
    const candidate = collectTriggeredEffectsV2(infiltrated.state, [turnDraw]).find((item) => item.effectId === "spider-nemesis-green-goblin-bottom-banish")!;
    const resolved = applyAtomicOperationsV2(infiltrated.state, candidate.operations).state;
    expect(resolved.players[enemy].void).toEqual(expect.arrayContaining(bottom));
  });

  it("「蜘蛛宿敌」金并在后卫支付 1 张手牌，可选择是否继续放置宿敌援军", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "rear", "SP01-043");
    const discard = place(game, actor, "hand", "DISCARD");
    const reinforcement = place(game, actor, "hand", "NEMESIS", { name: "蜘蛛宿敌" });
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-kingpin")!;
    expect(effect.validateTargets?.(game, actor, source, [discard])).toBeNull();
    expect(effect.validateTargets?.(game, actor, source, [discard, reinforcement, "zone:vanguard"])).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [discard, reinforcement, "zone:vanguard"])).state;
    expect(resolved.players[actor].retreat).toContain(discard);
    expect(resolved.players[actor].field.vanguard).toEqual([reinforcement]);
  });

  it("「蜘蛛宿敌」电王入场盖伏原本 Lv3 以下基地角色，并获得本回合 R 与战力增幅", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-044", { range: 1, power: 2000 });
    const target = place(game, enemy, "base", "TARGET", { level: 3 });
    const event = { type: "CHARACTER_PLACED" as const, actor, cardId: source, destination: "vanguard" as const, placementKind: "effect" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "spider-nemesis-electro-arrival")!;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-electro-arrival")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target])).state;
    expect(resolved.players[enemy].baseCovered).toContain(target);
    expect(effectiveValueV2(resolved, source, "range")).toBe(4);
    expect(effectiveValueV2(resolved, source, "power")).toBe(5000);
  });

  it("「时间制御」按我方战区原本战力 500 的角色数替换全队 R", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "SP01-045", { power: 5000, range: 1 });
    const lowA = place(game, actor, "flankLeft", "LOW-A", { power: 500, range: 3 });
    const lowB = place(game, actor, "rear", "LOW-B", { power: 500, range: 0 });
    expect(effectiveValueV2(game, source, "range")).toBe(2);
    expect(effectiveValueV2(game, lowA, "range")).toBe(2);
    expect(effectiveValueV2(game, lowB, "range")).toBe(2);
  });

  it("「混沌熵增」按基地盖卡数裁剪敌方基地角色并同步获得 R/战力", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-046", { range: 1, power: 500 });
    place(game, actor, "covered", "COVER-A");
    place(game, actor, "covered", "COVER-B");
    const target = place(game, enemy, "base", "TARGET", { level: 2 });
    const event = { type: "CHARACTER_PLACED" as const, actor, cardId: source, destination: "vanguard" as const, placementKind: "summon" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "chaos-entropy-arrival")!;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "chaos-entropy-arrival")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target])).state;
    expect(resolved.players[enemy].void).toContain(target);
    expect(effectiveValueV2(resolved, source, "range")).toBe(3);
    expect(effectiveValueV2(resolved, source, "power")).toBe(2500);
  });

  it("「共生体之神」纳尔从手牌降临并结附任意张不同名共生体，按结附数同步强化", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "hand", "SP01-047", { level: 6, range: 0, power: 2500, printedKeywords: ["unique"] });
    const first = place(game, actor, "retreat", "SP01-049", { name: "共生体甲", features: ["共生体"], printedKeywords: ["assault"] });
    const second = place(game, actor, "retreat", "SYMBIOTE-B", { name: "共生体乙", features: ["共生体"] });
    const duplicate = place(game, actor, "retreat", "SYMBIOTE-C", { name: "共生体乙", features: ["共生体"] });
    place(game, actor, "retreat", "SYMBIOTE-D", { name: "共生体丁", features: ["共生体"] });
    const arrival = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "symbiote-god-knull-arrival")!;
    expect(arrival.validateTargets?.(game, actor, source, ["zone:vanguard", second, duplicate])).not.toBeNull();
    const arrived = applyAtomicOperationsV2(game, arrival.buildOperations(game, actor, source, ["zone:vanguard", first, second])).state;
    expect(arrived.players[actor].field.vanguard).toEqual([source]);
    expect(arrived.attachments[source]).toEqual([first, second]);
    expect(effectiveValueV2(arrived, source, "range")).toBe(2);
    expect(effectiveValueV2(arrived, source, "power")).toBe(4500);

    const copy = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "symbiote-god-knull-copy")!;
    const copied = applyAtomicOperationsV2(arrived, copy.buildOperations(arrived, actor, source, [first]), source).state;
    expect(hasKeywordV2(copied, source, "assault")).toBe(true);
    expect(queueActivatedEffectV2(copied, actor, source, "spider-ally-harry-balance")).not.toBeNull();
  });

  it("纳尔复制的触发与持续效果均以纳尔自身作为效果来源执行", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-047", { level: 6, range: 0, power: 2500 });
    const copiedCard = place(game, actor, "retreat", "SP01-054", { name: "皮鞭", features: ["共生体"] });
    game.attachments[source] = [copiedCard];
    const copied = applyAtomicOperationsV2(game, [{ kind: "GRANT_COPIED_EFFECTS", grant: { id: "copy-trigger", sourceCardId: source, targetCardId: source, copiedFromCardId: copiedCard, copiedCardNo: "SP01-054", duration: "turn" } }], source).state;
    const moved = place(copied, enemy, "base", "MOVED", { power: 3000 });
    const event = { type: "BATTLE_BASE_MOVED" as const, actor: enemy, cardId: moved, from: "vanguard" as const, destination: "base" as const };
    const trigger = collectTriggeredEffectsV2(copied, [event]).find((item) => item.sourceCardId === source && item.effectId === "spider-nemesis-lash-move")!;
    expect(trigger).toBeTruthy();
    expect(trigger.operations[0].kind).toBe("ADD_MODIFIER");

    const continuousCard = place(copied, actor, "retreat", "SP01-051");
    copied.effectCopies = [{ id: "copy-continuous", sourceCardId: source, targetCardId: source, copiedFromCardId: continuousCard, copiedCardNo: "SP01-051", duration: "turn" }];
    place(copied, enemy, "rear", "ENEMY-LV1", { level: 1 });
    place(copied, enemy, "flankLeft", "ENEMY-LV6", { level: 6 });
    expect(hasKeywordV2(copied, source, "combo")).toBe(true);
    expect(hasKeywordV2(copied, source, "assault")).toBe(true);
  });

  it("「蜘蛛战友」夜魔侠从基地应对，撤退人类后抽 1 张并记录回合一次", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "base", "SP01-048");
    const human = place(game, actor, "vanguard", "HUMAN", { features: ["人类"] });
    const handBefore = game.players[actor].hand.length;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-ally-daredevil-draw")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [human])).state;
    expect(resolved.players[actor].retreat).toContain(human);
    expect(resolved.players[actor].hand).toHaveLength(handBefore + 1);
    expect(resolved.usage.effectUseKeysThisTurn).toContain(`${source}:spider-ally-daredevil-draw`);
  });

  it("「蜘蛛战友」哈利只让战区角色较少的一方抽 1，再舍弃该方卡组底 1", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-049");
    place(game, enemy, "vanguard", "ENEMY-A");
    place(game, enemy, "rear", "ENEMY-B");
    const bottom = game.players[actor].deck.at(-1)!;
    const handBefore = game.players[actor].hand.length;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-ally-harry-balance")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [])).state;
    expect(resolved.players[actor].hand).toHaveLength(handBefore + 1);
    expect(resolved.players[actor].retreat).toContain(bottom);
  });

  it("「蜘蛛宿敌」吞噬夺取敌方撤退区 Lv3 人类并结附，宿主及结附组免疫 Lv1 卡牌效果", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-050", { level: 3 });
    const human = place(game, enemy, "retreat", "ENEMY-HUMAN", { level: 3, power: 3000, features: ["人类"] });
    const summon = { type: "CHARACTER_SUMMONED" as const, actor, cardId: source, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const candidate = collectTriggeredEffectsV2(game, [summon]).find((item) => item.effectId === "spider-nemesis-devour-summon")!;
    expect(candidate.optional).toBe(true);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-devour-summon")!;
    const captured = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [human, "zone:rear"])).state;
    expect(captured.players[actor].field.rear).toEqual([human]);
    expect(captured.attachments[human]).toContain(source);

    const lv1 = place(captured, enemy, "base", "LV1-SOURCE", { level: 1 });
    const immune = applyAtomicOperationsV2(captured, [{ kind: "ADD_MODIFIER", modifier: { id: "lv1-hit", sourceCardId: lv1, targetCardId: human, type: "power", value: -1000, duration: "turn" } }], lv1);
    expect(immune.trace[0].succeeded).toBe(false);
    expect(effectiveValueV2(immune.state, human, "power")).toBe(3000);

    const lv2 = place(immune.state, enemy, "base", "LV2-SOURCE", { level: 2 });
    const affected = applyAtomicOperationsV2(immune.state, [{ kind: "ADD_MODIFIER", modifier: { id: "lv2-hit", sourceCardId: lv2, targetCardId: human, type: "power", value: -1000, duration: "turn" } }], lv2);
    expect(affected.trace[0].succeeded).toBe(true);
    expect(effectiveValueV2(affected.state, human, "power")).toBe(2000);
  });

  it("吞噬免疫同样屏蔽 Lv1 结附卡的持续增幅，但不屏蔽 Lv2 来源", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "HOST", { power: 3000, range: 1 });
    const devour = place(game, actor, "rear", "SP01-050", { level: 3 });
    const lv1Attachment = place(game, actor, "flankLeft", "SP01-033", { level: 1 });
    game.attachments[host] = [devour, lv1Attachment];
    expect(effectiveValueV2(game, host, "power")).toBe(3000);
    expect(effectiveValueV2(game, host, "range")).toBe(1);
    game.cards[lv1Attachment].level = 2;
    expect(effectiveValueV2(game, host, "power")).toBe(4000);
    expect(effectiveValueV2(game, host, "range")).toBe(2);
  });

  it("「蜘蛛宿敌」极端按敌方 Lv1/Lv6 场况分别获得连击与强袭", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-051");
    place(game, enemy, "base", "LV1", { level: 1 });
    place(game, enemy, "vanguard", "LV6", { level: 6 });
    expect(hasKeywordV2(game, source, "combo")).toBe(true);
    expect(hasKeywordV2(game, source, "assault")).toBe(true);
  });

  it("「蜘蛛宿敌」嚎叫把获得的战力减少总量翻倍，但不翻倍正向增幅", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "SP01-052", { power: 9000 });
    game.modifiers.push(
      { id: "down", sourceCardId: source, targetCardId: source, type: "power", value: -1000, duration: "turn" },
      { id: "up", sourceCardId: source, targetCardId: source, type: "power", value: 500, duration: "turn" },
    );
    expect(effectiveValueV2(game, source, "power")).toBe(7500);
  });

  it("「蜘蛛宿敌」暴乱在低战力人类攻击时舍弃卡组底 3 并侵附，按宿主原本 R 降战力", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "hand", "SP01-053");
    const attacker = place(game, enemy, "vanguard", "HUMAN", { power: 3000, range: 2, features: ["人类"] });
    const bottom = game.players[actor].deck.slice(-3);
    const event = { type: "ATTACK_DECLARED" as const, actor: enemy, attackerId: attacker, target: { kind: "breach" as const, zone: "vanguard" as const } };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "spider-nemesis-riot-attach")!;
    const resolved = applyAtomicOperationsV2(game, candidate.operations).state;
    expect(resolved.players[actor].retreat).toEqual(expect.arrayContaining(bottom));
    expect(resolved.attachments[attacker]).toContain(source);
    expect(effectiveValueV2(resolved, attacker, "power")).toBe(1000);
  });

  it("「蜘蛛宿敌」皮鞭在敌方战基移动后减战力，若因此归零撤退则继续裁剪", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    place(game, actor, "vanguard", "SP01-054");
    const target = place(game, enemy, "base", "TARGET", { power: 1000 });
    const movedEvent = { type: "BATTLE_BASE_MOVED" as const, actor: enemy, cardId: target, from: "vanguard" as const, destination: "base" as const };
    const first = collectTriggeredEffectsV2(game, [movedEvent]).find((item) => item.effectId === "spider-nemesis-lash-move")!;
    const reduced = applyAtomicOperationsV2(game, first.operations);
    expect(reduced.state.players[enemy].retreat).toContain(target);
    const second = collectTriggeredEffectsV2(reduced.state, reduced.events).find((item) => item.effectId === "spider-nemesis-lash-banish")!;
    const resolved = applyAtomicOperationsV2(reduced.state, second.operations).state;
    expect(resolved.players[enemy].void).toContain(target);
  });

  it("「蜘蛛宿敌」秃鹫战基移动后可舍弃 3 手牌，把撤退区机械结附于自身", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "SP01-055");
    const hand = [place(game, actor, "hand", "H1"), place(game, actor, "hand", "H2"), place(game, actor, "hand", "H3")];
    const machine = place(game, actor, "retreat", "MACHINE", { features: ["机械"] });
    const event = { type: "BATTLE_BASE_MOVED" as const, actor, cardId: source, from: "base" as const, destination: "vanguard" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "spider-nemesis-vulture-move")!;
    expect(candidate.optional).toBe(true);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-vulture-move")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [...hand, machine])).state;
    expect(resolved.players[actor].retreat).toEqual(expect.arrayContaining(hand));
    expect(resolved.attachments[source]).toContain(machine);
  });

  it("「蜘蛛宿敌」犀牛人用确定性随机状态撤退敌方 1 张基地盖卡", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-056");
    const coveredA = place(game, enemy, "covered", "COVER-A");
    const coveredB = place(game, enemy, "covered", "COVER-B");
    const event = { type: "BATTLE_BASE_MOVED" as const, actor, cardId: source, from: "base" as const, destination: "vanguard" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "spider-nemesis-rhino-move")!;
    const cursorBefore = game.randomState.cursor;
    const resolved = applyAtomicOperationsV2(game, candidate.operations).state;
    expect(resolved.randomState.cursor).toBe(cursorBefore + 1);
    expect(resolved.players[enemy].retreat.filter((id) => id === coveredA || id === coveredB)).toHaveLength(1);
  });

  it("「烧杀掳掠」在敌方 Lv2 人类放置时舍弃自身并撤退该角色", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "hand", "SP01-057");
    const target = place(game, enemy, "vanguard", "HUMAN", { level: 2, features: ["人类"] });
    const event = { type: "CHARACTER_PLACED" as const, actor: enemy, cardId: target, destination: "vanguard" as const, placementKind: "effect" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "burn-loot-hand")!;
    const resolved = applyAtomicOperationsV2(game, candidate.operations).state;
    expect(resolved.players[actor].retreat).toContain(source);
    expect(resolved.players[enemy].retreat).toContain(target);
  });

  it("「蜘蛛宿敌」墓碑按敌方侧翼角色数舍弃双方卡组底，并获得等量 R", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-058", { range: 0 });
    place(game, enemy, "flankLeft", "FLANK-A");
    place(game, enemy, "flankRight", "FLANK-B");
    const ownBottom = game.players[actor].deck.slice(-2);
    const enemyBottom = game.players[enemy].deck.slice(-2);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-tombstone-flanks")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [])).state;
    expect(resolved.players[actor].retreat).toEqual(expect.arrayContaining(ownBottom));
    expect(resolved.players[enemy].retreat).toEqual(expect.arrayContaining(enemyBottom));
    expect(effectiveValueV2(resolved, source, "range")).toBe(2);
  });

  it("「基因反噬」结附人类并增幅；己方回合结束时宿主未攻击则裁剪宿主", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "hand", "SP01-059");
    const host = place(game, actor, "vanguard", "HUMAN", { power: 2000, features: ["人类"] });
    const attach = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "genetic-backlash-attach")!;
    const attached = applyAtomicOperationsV2(game, attach.buildOperations(game, actor, source, [host])).state;
    expect(effectiveValueV2(attached, host, "power")).toBe(3000);
    const event = { type: "END_TRIGGERS_PROCESSED" as const, actor };
    const candidate = collectTriggeredEffectsV2(attached, [event]).find((item) => item.effectId === "genetic-backlash-end-banish")!;
    const resolved = applyAtomicOperationsV2(attached, candidate.operations).state;
    expect(resolved.players[actor].void).toContain(host);
    expect(resolved.players[actor].retreat).toContain(source);
  });

  it("「蜘蛛宿敌」蜥蜴展示基地盖卡后，只允许同 Lv 撤退区角色盖放基地", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "SP01-060");
    const covered = place(game, actor, "covered", "COVER", { level: 3 });
    const target = place(game, actor, "retreat", "MATCH", { level: 3 });
    const event = { type: "BATTLE_BASE_MOVED" as const, actor, cardId: source, from: "base" as const, destination: "vanguard" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "spider-nemesis-lizard-move")!;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-lizard-move")!;
    expect(effect.validateTargets?.(game, actor, source, [covered, target])).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [covered, target])).state;
    expect(resolved.players[actor].baseCovered).toContain(target);
  });

  it("「蜘蛛宿敌」底片先生从手牌进入侧翼并翻面全部基地，入场后持续封锁 Lv5 以上号召素材", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "hand", "SP01-061", { level: 6 });
    const faceUp = place(game, actor, "base", "FACE-UP", { level: 1 });
    const covered = place(game, actor, "covered", "COVERED", { level: 1 });
    const arrival = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-negative-hand-arrival")!;
    expect(arrival.canActivate?.(game, actor, source)).toBe(true);
    const placed = applyAtomicOperationsV2(game, arrival.buildOperations(game, actor, source, ["zone:flankLeft"]));
    expect(placed.state.players[actor].field.flankLeft).toEqual([source]);
    expect(placed.state.players[actor].baseCovered).toContain(faceUp);
    expect(placed.state.players[actor].baseCards).toContain(covered);
    const lock = collectTriggeredEffectsV2(placed.state, placed.events).find((item) => item.effectId === "spider-nemesis-negative-payment-lock")!;
    const locked = applyAtomicOperationsV2(placed.state, lock.operations).state;
    expect(locked.usage.minimumSummonPaymentLevelBlockedThisTurn[actor]).toBe(5);

    const highPayment = place(locked, actor, "base", "HIGH-PAYMENT", { level: 5 });
    const summon = place(locked, actor, "hand", "LV5-SUMMON", { level: 5 });
    const result = executeCommandV2(locked, { actor, expectedRevision: locked.revision, command: { type: "SUMMON_CHARACTER", cardId: summon } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("COST_MISMATCH");
    expect(locked.players[actor].baseCards).toContain(highPayment);
  });

  it("「地狱之王」墨菲斯托保留献祭角色 Lv 上下文，抽牌后可选同 Lv 无效果角色入场", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "base", "SP01-062", { level: 3, printedKeywords: ["unique"] });
    const human = place(game, actor, "hand", "HUMAN-COST", { level: 3, features: ["人类"] });
    const drawn = game.players[actor].deck[0];
    Object.assign(game.cards[drawn], { level: 3, hasEffectText: false });
    const activation = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "hell-lord-mephisto-banish-draw")!;
    const first = applyAtomicOperationsV2(game, activation.buildOperations(game, actor, source, [human]), source);
    expect(first.state.players[actor].void).toContain(human);
    expect(first.state.players[actor].hand).toContain(drawn);
    expect(first.state.usage.effectUseKeysThisTurn).toContain(`${source}:hell-lord-mephisto-banish-draw`);
    const drawEvent = first.events.find((event) => event.type === "TURN_CARDS_DRAWN")!;
    expect(drawEvent.type === "TURN_CARDS_DRAWN" && drawEvent.contextValue).toBe(3);
    const followup = collectTriggeredEffectsV2(first.state, first.events).find((item) => item.effectId === "hell-lord-mephisto-place")!;
    expect(followup.optional).toBe(true);
    expect(followup.targeting?.choices).toContain(drawn);
    const placement = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "hell-lord-mephisto-place")!;
    const resolved = applyAtomicOperationsV2(first.state, placement.buildOperations(first.state, actor, source, [drawn, "zone:rear"], { triggerEvent: drawEvent })).state;
    expect(resolved.players[actor].field.rear).toEqual([drawn]);
  });

  it("「蜘蛛战友」反毒液号召进场后可结附，使宿主自身效果失效并在离开后恢复", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-067");
    const host = place(game, actor, "rear", "SP01-051", { printedKeywords: ["intercept", "unique"] });
    place(game, enemy, "vanguard", "ENEMY-LV1", { level: 1 });
    const summon = { type: "CHARACTER_SUMMONED" as const, actor, cardId: source, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const candidate = collectTriggeredEffectsV2(game, [summon]).find((item) => item.effectId === "spider-ally-anti-venom-attach")!;
    expect(candidate.optional).toBe(true);
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-ally-anti-venom-attach")!;
    const attached = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [host])).state;
    expect(isCardEffectSuppressedV2(attached, host)).toBe(true);
    expect(hasKeywordV2(attached, host, "intercept")).toBe(false);
    expect(hasKeywordV2(attached, host, "combo")).toBe(false);
    expect(hasKeywordV2(attached, host, "unique")).toBe(true);

    const detached = applyAtomicOperationsV2(attached, [{ kind: "DETACH", cardId: source, destination: "retreat" }]).state;
    expect(isCardEffectSuppressedV2(detached, host)).toBe(false);
    expect(hasKeywordV2(detached, host, "intercept")).toBe(true);
    expect(hasKeywordV2(detached, host, "combo")).toBe(true);
  });

  it("反毒液抑制层统一阻止宿主的起动与触发效果", () => {
    const game = state();
    const actor = game.activePlayer;
    const activator = place(game, actor, "base", "SP01-069");
    const triggerSource = place(game, actor, "vanguard", "SP01-064");
    const antiA = place(game, actor, "rear", "SP01-067");
    const antiB = place(game, actor, "flankLeft", "SP01-067");
    game.attachments[activator] = [antiA];
    game.attachments[triggerSource] = [antiB];
    expect(queueActivatedEffectV2(game, actor, activator, "spider-companion-mary-jane")).toBeNull();
    const turnDraw = { type: "TURN_CARDS_DRAWN" as const, actor: (actor === 0 ? 1 : 0) as PlayerIndex, count: 2 };
    expect(collectTriggeredEffectsV2(game, [turnDraw]).some((item) => item.sourceCardId === triggerSource)).toBe(false);
  });

  it("「责任继承」战败后结附敌方低战力角色，令其战基移动并在有其他机械时盖伏", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "retreat", "SP01-068", { features: ["机械"] });
    const host = place(game, enemy, "vanguard", "HOST", { power: 4000 });
    place(game, actor, "base", "OTHER-MACHINE", { features: ["机械"] });
    const battle = { type: "CHARACTER_BATTLE_RESOLVED" as const, attackerId: source, targetId: "winner", winnerCardId: "winner", defeatedCardIds: [source], tied: false };
    const first = collectTriggeredEffectsV2(game, [battle]).find((item) => item.effectId === "responsibility-inheritance-defeat")!;
    const attached = applyAtomicOperationsV2(game, first.targeting ? PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "responsibility-inheritance-defeat")!.buildOperations(game, actor, source, [host]) : first.operations);
    const second = collectTriggeredEffectsV2(attached.state, attached.events).find((item) => item.effectId === "responsibility-inheritance-attach")!;
    const resolved = applyAtomicOperationsV2(attached.state, second.operations).state;
    expect(resolved.players[enemy].baseCovered).toContain(host);
    expect(resolved.players[actor].retreat).toContain(source);
  });

  it("「蜘蛛伴侣」玛丽简从基地应对，强化蛛网角色后盖伏自身", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "base", "SP01-069");
    const target = place(game, actor, "vanguard", "WEB", { power: 2000, range: 1, features: ["蛛网"] });
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-companion-mary-jane")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target])).state;
    expect(effectiveValueV2(resolved, target, "power")).toBe(2500);
    expect(effectiveValueV2(resolved, target, "range")).toBe(2);
    expect(resolved.players[actor].baseCovered).toContain(source);
  });

  it("「多元感应」结附先舍弃顶 3；己方蛛网进入虚空时可裁剪自身令其回场", () => {
    const game = state();
    const actor = game.activePlayer;
    const host = place(game, actor, "vanguard", "HOST");
    const source = place(game, actor, "hand", "SP01-070");
    const attached = applyAtomicOperationsV2(game, [{ kind: "ATTACH", cardId: source, hostCardId: host }]);
    const mill = collectTriggeredEffectsV2(attached.state, attached.events).find((item) => item.effectId === "multiverse-sense-attach-mill")!;
    const milled = applyAtomicOperationsV2(attached.state, mill.operations).state;
    expect(milled.players[actor].retreat).toHaveLength(3);
    const web = milled.players[actor].retreat[0];
    milled.cards[web].features = ["蛛网"];
    milled.cards[web].level = 3;
    const banished = applyAtomicOperationsV2(milled, [{ kind: "BANISH", cardIds: [web], sourceCardId: host }]);
    const candidate = collectTriggeredEffectsV2(banished.state, banished.events).find((item) => item.effectId === "multiverse-sense-void-return")!;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "multiverse-sense-void-return")!;
    const resolved = applyAtomicOperationsV2(banished.state, effect.buildOperations(banished.state, actor, source, [web, "zone:rear"])).state;
    expect(resolved.players[actor].void).toContain(source);
    expect(resolved.players[actor].field.rear).toEqual([web]);
  });

  it("「毒液2099」应对结附人类并令敌方 Lv-3；宿主遭敌方减战力时按当前战力反噬", () => {
    const game = state();
    const actor = game.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "hand", "SP01-071");
    const host = place(game, actor, "vanguard", "HUMAN", { power: 3000, features: ["人类"] });
    const target = place(game, enemy, "vanguard", "TARGET", { level: 5, power: 5000 });
    const attach = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "venom-2099-response-attach")!;
    const attached = applyAtomicOperationsV2(game, attach.buildOperations(game, actor, source, [host, target])).state;
    expect(effectiveValueV2(attached, target, "level")).toBe(2);
    const enemySource = place(attached, enemy, "base", "ENEMY-SOURCE");
    const reduced = applyAtomicOperationsV2(attached, [{ kind: "ADD_MODIFIER", modifier: { id: "enemy-down", sourceCardId: enemySource, targetCardId: host, type: "power", value: -500, duration: "turn" } }]);
    const retaliation = collectTriggeredEffectsV2(reduced.state, reduced.events).find((item) => item.effectId === "venom-2099-retaliation")!;
    const retaliated = applyAtomicOperationsV2(reduced.state, PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "venom-2099-retaliation")!.buildOperations(reduced.state, actor, source, [target])).state;
    expect(retaliation).toBeTruthy();
    expect(effectiveValueV2(retaliated, target, "power")).toBe(2500);
  });

  it("「头号黑粉」令符合条件的战区角色移动至基地后抽 1 张", () => {
    const game = state();
    const actor = game.activePlayer;
    const source = place(game, actor, "rear", "SP01-072");
    const target = place(game, actor, "vanguard", "WEB", { features: ["蛛网"] });
    const handBefore = game.players[actor].hand.length;
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "top-hater-jameson-move")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target])).state;
    expect(resolved.players[actor].baseCards).toContain(target);
    expect(resolved.players[actor].hand).toHaveLength(handBefore + 1);
  });

  it("SP01-073～080 共 8 张完成实施登记，本段 11 个起动/触发效果进入注册表", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^SP01-0(?:7[3-9]|80)$/.test(item.cardNo))).toHaveLength(8);
    expect(PROMO_EFFECT_DEFINITIONS_SP01_V2.filter((item) => /^SP01-0(?:7[3-9]|80)$/.test(item.cardNo))).toHaveLength(11);
    expect(effectRegistrySnapshotV2().filter((item) => /^SP01-0(?:7[3-9]|80)$/.test(item.cardNo))).toHaveLength(11);
  });

  it("「蜘蛛宿敌」蝎子仅在敌方战区存在蛛网角色时持续失去 3000 战力", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "SP01-073", { power: 5000 });
    expect(effectiveValueV2(game, source, "power")).toBe(5000);
    place(game, enemy, "rear", "WEB", { features: ["蛛网"] });
    expect(effectiveValueV2(game, source, "power")).toBe(2000);
  });

  it("「终局烁灭」结附舍弃卡组顶 2 张，起动支付蛛网手牌后随机撤退敌方盖卡", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const host = place(game, actor, "vanguard", "HOST");
    const source = place(game, actor, "hand", "SP01-074");
    const attached = applyAtomicOperationsV2(game, [{ kind: "ATTACH", cardId: source, hostCardId: host }]);
    const mill = collectTriggeredEffectsV2(attached.state, attached.events).find((item) => item.effectId === "endgame-blip-attach")!;
    const milled = applyAtomicOperationsV2(attached.state, mill.operations).state;
    expect(milled.players[actor].retreat).toHaveLength(2);

    const actionSource = place(milled, actor, "rear", "SP01-074");
    const cost = place(milled, actor, "hand", "WEB-COST", { features: ["蛛网"] });
    const coveredA = place(milled, enemy, "covered", "COVER-A");
    const coveredB = place(milled, enemy, "covered", "COVER-B");
    const effect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "endgame-blip-action")!;
    const resolved = applyAtomicOperationsV2(milled, effect.buildOperations(milled, actor, actionSource, [cost]), actionSource).state;
    expect(resolved.players[actor].retreat).toContain(cost);
    expect(resolved.players[enemy].retreat.filter((id) => id === coveredA || id === coveredB)).toHaveLength(1);
  });

  it("「蜘蛛宿敌」胡狼裁剪人类后，只允许同名角色从手牌或撤退区进入合法位置", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "rear", "SP01-075");
    const cost = place(game, actor, "hand", "HUMAN-COST", { name: "彼得·帕克", features: ["人类"] });
    const sameName = place(game, actor, "retreat", "SAME-NAME", { name: "彼得·帕克" });
    const activation = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-jackal-banish")!;
    const banished = applyAtomicOperationsV2(game, activation.buildOperations(game, actor, source, [cost]), source);
    const candidate = collectTriggeredEffectsV2(banished.state, banished.events).find((item) => item.effectId === "spider-nemesis-jackal-place")!;
    const follow = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-jackal-place")!;
    const context = { triggerEvent: banished.events.find((event) => event.type === "CARDS_BANISHED")! };
    expect(follow.validateTargets?.(banished.state, actor, source, [sameName, "zone:vanguard"], context)).toBeNull();
    const resolved = applyAtomicOperationsV2(banished.state, follow.buildOperations(banished.state, actor, source, [sameName, "zone:vanguard"], context), source).state;
    expect(candidate.optional).toBe(true);
    expect(resolved.players[actor].field.vanguard).toEqual([sameName]);
  });

  it("莫比亚斯以我方人类为代价返场并赋予攻击者强袭；朋克结附限制宿主只能攻击先锋", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const morbius = place(game, actor, "retreat", "SP01-076");
    const human = place(game, actor, "vanguard", "HUMAN", { features: ["人类"] });
    const returnEffect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-morbius-return")!;
    const returned = applyAtomicOperationsV2(game, returnEffect.buildOperations(game, actor, morbius, [human, "zone:vanguard"]), morbius).state;
    const attacker = place(returned, enemy, "vanguard", "ATTACKER");
    const attacked = { type: "ATTACK_DECLARED" as const, actor: enemy, attackerId: attacker, target: { kind: "character" as const, cardId: morbius } };
    const assault = collectTriggeredEffectsV2(returned, [attacked]).find((item) => item.effectId === "spider-nemesis-morbius-assault")!;
    const granted = applyAtomicOperationsV2(returned, assault.operations, morbius).state;
    expect(hasKeywordV2(granted, attacker, "assault")).toBe(true);

    const punk = place(granted, enemy, "hand", "SP01-077");
    const attached = applyAtomicOperationsV2(granted, [{ kind: "ATTACH", cardId: punk, hostCardId: attacker }]).state;
    expect(promoAttackTargetRestrictionV2(attached, attacker, { kind: "breach", zone: "rear" }, (id) => effectiveValueV2(attached, id, "level"))).toContain("先锋");
    expect(promoAttackTargetRestrictionV2(attached, attacker, { kind: "breach", zone: "vanguard" }, (id) => effectiveValueV2(attached, id, "level"))).toBeNull();
  });

  it("梅姨盖放撤退区蛛网；格温阻止低 Lv 宿主成为号召素材并在被裁剪后压制敌方", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const may = place(game, actor, "base", "SP01-078");
    const web = place(game, actor, "retreat", "WEB", { features: ["蛛网"] });
    const mayEffect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "mind-harbor-may")!;
    const covered = applyAtomicOperationsV2(game, mayEffect.buildOperations(game, actor, may, [web]), may).state;
    expect(covered.players[actor].baseCovered).toEqual(expect.arrayContaining([may, web]));

    const host = place(covered, actor, "vanguard", "LOW-HOST", { level: 3 });
    const gwen = place(covered, actor, "hand", "SP01-079");
    const attached = applyAtomicOperationsV2(covered, [{ kind: "ATTACH", cardId: gwen, hostCardId: host }]).state;
    expect(promoSummonPaymentForbiddenV2(attached, host, (id) => effectiveValueV2(attached, id, "level"))).toBe(true);
    const target = place(attached, enemy, "vanguard", "TARGET", { power: 3000 });
    const banished = applyAtomicOperationsV2(attached, [{ kind: "BANISH", cardIds: [gwen], sourceCardId: gwen }]);
    const pressure = collectTriggeredEffectsV2(banished.state, banished.events).find((item) => item.effectId === "spider-companion-gwen-void")!;
    const reduced = applyAtomicOperationsV2(banished.state, PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-companion-gwen-void")!.buildOperations(banished.state, actor, gwen, [target]), gwen).state;
    expect(pressure.targeting?.choices).toContain(target);
    expect(effectiveValueV2(reduced, target, "power")).toBe(2000);
  });

  it("惊悚号召到战区或基地时，分别把敌方低 Lv 角色移向另一侧区域", () => {
    const fieldGame = state(); const actor = fieldGame.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const fieldSource = place(fieldGame, actor, "vanguard", "SP01-080");
    const enemyBattle = place(fieldGame, enemy, "rear", "ENEMY-BATTLE", { level: 3 });
    const fieldEvent = { type: "CHARACTER_SUMMONED" as const, actor, cardId: fieldSource, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const fieldCandidate = collectTriggeredEffectsV2(fieldGame, [fieldEvent]).find((item) => item.effectId === "spider-nemesis-shocker-field")!;
    const fieldResolved = applyAtomicOperationsV2(fieldGame, PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-shocker-field")!.buildOperations(fieldGame, actor, fieldSource, [enemyBattle]), fieldSource).state;
    expect(fieldCandidate.optional).toBe(true);
    expect(fieldResolved.players[enemy].baseCards).toContain(enemyBattle);

    const baseGame = state(); const baseActor = baseGame.activePlayer; const baseEnemy = (baseActor === 0 ? 1 : 0) as PlayerIndex;
    const baseSource = place(baseGame, baseActor, "base", "SP01-080");
    const enemyBase = place(baseGame, baseEnemy, "base", "ENEMY-BASE", { level: 2 });
    const baseEvent = { type: "CHARACTER_SUMMONED" as const, actor: baseActor, cardId: baseSource, destination: "base" as const, paymentCardIds: [], summonKind: "action" as const };
    const baseCandidate = collectTriggeredEffectsV2(baseGame, [baseEvent]).find((item) => item.effectId === "spider-nemesis-shocker-base")!;
    const baseEffect = PROMO_EFFECT_DEFINITIONS_SP01_V2.find((item) => item.effectId === "spider-nemesis-shocker-base")!;
    const context = { triggerEvent: baseEvent };
    expect(baseEffect.validateTargets?.(baseGame, baseActor, baseSource, [enemyBase, "zone:rear"], context)).toBeNull();
    const baseResolved = applyAtomicOperationsV2(baseGame, baseEffect.buildOperations(baseGame, baseActor, baseSource, [enemyBase, "zone:rear"], context), baseSource).state;
    expect(baseCandidate.optional).toBe(true);
    expect(baseResolved.players[baseEnemy].field.rear).toEqual([enemyBase]);
  });
});
