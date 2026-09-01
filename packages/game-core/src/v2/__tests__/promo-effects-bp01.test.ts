import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Card } from "../../types/card";
import {
  applyAtomicOperationsV2,
  attackOpportunityLimitV2,
  CARD_IMPLEMENTATIONS_V2,
  clearEffectRegistryForTestsV2,
  collectTriggeredEffectsV2,
  createGameV2,
  effectiveValueV2,
  effectRegistrySnapshotV2,
  executeCommandV2,
  prepareEffectResolutionV2,
  PROMO_EFFECT_DEFINITIONS_BP01_V2,
  registerPromoEffectsBp01V2,
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
  return { matchId: "promo-bp01", seed: "promo-bp01", cardDefinitions: [...main0.map((id) => definition(id, 1)), ...main1.map((id) => definition(id, 1)), ...rush0.map((id) => definition(id, 2)), ...rush1.map((id) => definition(id, 2))], players: [{ name: "A", mainDeck: main0, rushDeck: rush0 }, { name: "B", mainDeck: main1, rushDeck: rush1 }] };
}

function state(): GameStateV2 {
  const result = createGameV2(fixtureInput());
  return { ...structuredClone(result), status: "playing", flow: { kind: "ACTION", actor: result.firstPlayer }, decision: null };
}

type Zone = "hand" | "base" | "covered" | "retreat" | "void" | FieldZoneV2;
function place(game: GameStateV2, actor: PlayerIndex, zone: Zone, cardNo: string, options: Partial<{ name: string; level: number; range: number; power: number; attribute: number; features: string[]; effectText: string }> = {}): string {
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

beforeEach(() => { clearEffectRegistryForTestsV2(); registerPromoEffectsBp01V2(); });
afterEach(() => clearEffectRegistryForTestsV2());

describe("BP01-001～009 首批效果", () => {
  it("9 张卡均有实施记录，7 个起动/触发效果进入注册表", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-00[1-9]$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-00[1-9]$/.test(item.cardNo))).toHaveLength(7);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-00[1-9]$/.test(item.cardNo))).toHaveLength(7);
  });

  it("BP01-010～018 均有实施记录，本段 10 个起动/触发效果", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-01[0-8]$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-01[0-8]$/.test(item.cardNo))).toHaveLength(10);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-01[0-8]$/.test(item.cardNo))).toHaveLength(10);
  });

  it("BP01-019～027 均有实施记录，本段 7 个起动/触发效果", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-0(?:19|2[0-7])$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:19|2[0-7])$/.test(item.cardNo))).toHaveLength(7);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-0(?:19|2[0-7])$/.test(item.cardNo))).toHaveLength(7);
  });

  it("BP01-028～036 均有实施记录，批次累计 33 个起动/触发效果", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-0(?:2[8-9]|3[0-6])$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:0[1-9]|1[0-9]|2[0-9]|3[0-6])$/.test(item.cardNo))).toHaveLength(33);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-0(?:0[1-9]|1[0-9]|2[0-9]|3[0-6])$/.test(item.cardNo))).toHaveLength(33);
  });

  it("反物质钢铁侠按号召撤退卡数裁剪不高于 X 的敌方角色", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "vanguard", "BP01-001");
    const target = place(game, enemy, "rear", "TARGET", { level: 2 });
    const event = { type: "CHARACTER_SUMMONED" as const, actor, cardId: source, destination: "vanguard" as const, paymentCardIds: ["cost-a", "cost-b"], summonKind: "action" as const };
    const candidate = collectTriggeredEffectsV2(game, [event])[0];
    expect(candidate.targeting?.choices).toContain(target);
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "antimatter-iron-man-banish")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target])).state;
    expect(resolved.players[enemy].void).toContain(target);
  });

  it("潜龙谍影与红房实验品分别完成应对减益和攻击时增益", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const widow = place(game, actor, "hand", "BP01-002");
    const ally = place(game, actor, "vanguard", "ALLY", { attribute: 1, power: 2000 });
    const target = place(game, enemy, "vanguard", "TARGET", { power: 4000 });
    const response = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "shadow-agent-widow-response")!;
    const reduced = applyAtomicOperationsV2(game, response.buildOperations(game, actor, widow, [target])).state;
    expect(effectiveValueV2(reduced, target, "power")).toBe(2000);
    const support = place(reduced, actor, "hand", "BP01-005");
    const attack = { type: "ATTACK_DECLARED" as const, actor, attackerId: ally, target: { kind: "character" as const, cardId: target } };
    const trigger = collectTriggeredEffectsV2(reduced, [attack]).find((item) => item.effectId === "red-room-specimen-boost")!;
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "red-room-specimen-boost")!;
    const boosted = applyAtomicOperationsV2(reduced, effect.buildOperations(reduced, actor, support, [ally])).state;
    expect(trigger.optional).toBe(true);
    expect(effectiveValueV2(boosted, ally, "power")).toBe(5000);
  });

  it("雷霆知音只在己方回合结束且侧翼未攻击时按自身战力压制", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "flankLeft", "BP01-003", { power: 3500 });
    const target = place(game, enemy, "vanguard", "TARGET", { power: 5000 });
    const event = { type: "END_TRIGGERS_PROCESSED" as const, actor };
    const candidate = collectTriggeredEffectsV2(game, [event])[0];
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "thunder-confidant-end")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target])).state;
    expect(candidate.sourceCardId).toBe(source);
    expect(effectiveValueV2(resolved, target, "power")).toBe(1500);
  });

  it("遇强则强只在全红场面增幅；寂静猎手按手牌奇偶切换增益", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const hulk = place(game, actor, "vanguard", "BP01-004", { level: 2, power: 500, attribute: 1 });
    place(game, enemy, "vanguard", "ENEMY-A"); place(game, enemy, "rear", "ENEMY-B");
    expect(effectiveValueV2(game, hulk, "level")).toBe(4);
    expect(effectiveValueV2(game, hulk, "power")).toBe(2500);
    const panther = place(game, actor, "rear", "BP01-006", { range: 2, power: 500, attribute: 1 });
    place(game, actor, "hand", "HAND");
    expect(effectiveValueV2(game, panther, "range")).toBe(4);
    game.players[actor].hand.push(game.players[actor].deck.shift()!);
    expect(effectiveValueV2(game, panther, "power")).toBe(6000);
  });

  it("虚空重构保留从撤退区裁剪的来源信息，并在支付两手牌后回场", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, actor, "retreat", "BP01-007");
    const handA = place(game, actor, "hand", "HAND-A"); const handB = place(game, actor, "hand", "HAND-B");
    const enemyVanguard = place(game, enemy, "vanguard", "TARGET", { power: 3000 });
    const banished = applyAtomicOperationsV2(game, [{ kind: "BANISH", cardIds: [source], sourceCardId: enemyVanguard }]);
    const candidate = collectTriggeredEffectsV2(banished.state, banished.events)[0];
    expect(candidate.optional).toBe(true);
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "void-reconstruction-vision")!;
    const resolved = applyAtomicOperationsV2(banished.state, effect.buildOperations(banished.state, actor, source, [handA, handB, "zone:rear"])).state;
    expect(resolved.players[actor].field.rear).toEqual([source]);
    expect(effectiveValueV2(resolved, enemyVanguard, "power")).toBe(2000);
  });

  it("卸载脉冲裁剪双方全部场上结附；组装脉冲支付高等级红色角色后压制", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const pulse = place(game, actor, "vanguard", "BP01-008");
    const enemyHost = place(game, enemy, "vanguard", "HOST");
    const ownAttachment = place(game, actor, "retreat", "ATTACH-A"); const enemyAttachment = place(game, enemy, "retreat", "ATTACH-B");
    game.attachments[pulse] = [ownAttachment]; game.attachments[enemyHost] = [enemyAttachment];
    const clear = collectTriggeredEffectsV2(game, [{ type: "CHARACTER_PLACED" as const, actor, cardId: pulse, destination: "vanguard" as const, placementKind: "effect" as const }])[0];
    const cleared = applyAtomicOperationsV2(game, clear.operations).state;
    expect(cleared.players[actor].void).toContain(ownAttachment); expect(cleared.players[enemy].void).toContain(enemyAttachment);

    const assemble = place(cleared, actor, "rear", "BP01-009");
    const cost = place(cleared, actor, "retreat", "COST", { level: 5, attribute: 1 });
    const target = enemyHost;
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "assemble-pulse-iron-man")!;
    const resolved = applyAtomicOperationsV2(cleared, effect.buildOperations(cleared, actor, assemble, [cost, target])).state;
    expect(resolved.players[actor].void).toContain(cost);
    expect(effectiveValueV2(resolved, target, "power")).toBe(0);
  });

  it("进化加载可结附高阶机械，并从后卫展示、回收 Lv1 机械盖卡", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "hand", "BP01-010");
    const host = place(game, actor, "vanguard", "MACHINE-HOST", { level: 4, features: ["机械"] });
    const attach = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "evolution-load-attach")!;
    const attached = applyAtomicOperationsV2(game, attach.buildOperations(game, actor, source, [host])).state;
    expect(attached.attachments[host]).toContain(source);

    const rearSource = place(attached, actor, "rear", "BP01-010");
    const covered = place(attached, actor, "covered", "LV1-MACHINE", { level: 1, features: ["机械"] });
    const recover = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "evolution-load-rear-recover")!;
    const recovered = applyAtomicOperationsV2(attached, recover.buildOperations(attached, actor, rearSource, [covered])).state;
    expect(recovered.players[actor].hand).toContain(covered);
  });

  it("疾风迅雷抽牌后获得仅限角色目标的第 2 次攻击机会", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "BP01-011", { range: 3, power: 3000 });
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "gale-thunder-thor")!;
    const granted = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, []), source).state;
    expect(attackOpportunityLimitV2(granted, source)).toBe(2);
    granted.flow = { kind: "BATTLE_ATTACK", actor, zone: "vanguard", attackerId: source };
    granted.battle = { order: ["vanguard", "flankLeft", "flankRight", "rear"], cursor: 0, attackerId: source, target: null, attackedCardIds: [source], priorityPlayer: null, consecutivePasses: 0, responseSummoned: [false, false] };
    const result = executeCommandV2(granted, { actor, expectedRevision: granted.revision, command: { type: "DECLARE_ATTACK", attackerId: source, target: { kind: "breach", zone: "rear" } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_TARGET");
  });

  it("雷霆闪充在基地有红色角色时把卡组顶 2 张盖放基地", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "BP01-012");
    place(game, actor, "base", "RED-BASE", { attribute: 1 });
    const top = game.players[actor].deck.slice(0, 2);
    const event = { type: "CHARACTER_SUMMONED" as const, actor, cardId: source, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const candidate = collectTriggeredEffectsV2(game, [event])[0];
    const resolved = applyAtomicOperationsV2(game, candidate.operations).state;
    expect(candidate.optional).toBe(true);
    expect(resolved.players[actor].baseCovered).toEqual(expect.arrayContaining(top));
  });

  it("瓦坎达万岁移动并盖伏高战力人类；防御程序与瓦解射线按各自门槛处理", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const panther = place(game, actor, "vanguard", "BP01-013");
    const human = place(game, enemy, "vanguard", "HUMAN", { power: 5000, features: ["人类"] });
    const summon = { type: "CHARACTER_SUMMONED" as const, actor, cardId: panther, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const move = collectTriggeredEffectsV2(game, [summon])[0];
    const moveDef = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "wakanda-forever-cover")!;
    const covered = applyAtomicOperationsV2(game, moveDef.buildOperations(game, actor, panther, [human])).state;
    expect(covered.players[enemy].baseCovered).toContain(human);

    const ultron = place(covered, actor, "rear", "BP01-014", { name: "奥创·防御" });
    place(covered, actor, "base", "OTHER-ULTRON", { name: "奥创·分身" });
    const low = place(covered, enemy, "rear", "LOW", { level: 3, power: 4000 });
    const ultronEvent = { ...summon, cardId: ultron, destination: "rear" as const };
    expect(collectTriggeredEffectsV2(covered, [ultronEvent]).some((item) => item.effectId === "defense-program-ultron")).toBe(true);
    const vision = place(covered, actor, "flankLeft", "BP01-015");
    const visionEvent = { ...summon, cardId: vision, destination: "flankLeft" as const };
    const ray = collectTriggeredEffectsV2(covered, [visionEvent]).find((item) => item.effectId === "disintegration-ray-vision")!;
    const rayDef = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "disintegration-ray-vision")!;
    const banished = applyAtomicOperationsV2(covered, rayDef.buildOperations(covered, actor, vision, [low])).state;
    expect(ray.optional).toBe(true);
    expect(banished.players[enemy].void).toContain(low);
  });

  it("高维震荡响应我方高阶号召；复仇暴怒与对等打击完成后续压制", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const shock = place(game, actor, "rear", "BP01-016");
    const summoned = place(game, actor, "vanguard", "HIGH", { level: 4 });
    const low = place(game, enemy, "vanguard", "LOW", { level: 3, power: 3000 });
    const summon = { type: "CHARACTER_SUMMONED" as const, actor, cardId: summoned, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const move = collectTriggeredEffectsV2(game, [summon]).find((item) => item.effectId === "higher-dimensional-shock")!;
    const moveDef = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "higher-dimensional-shock")!;
    const moved = applyAtomicOperationsV2(game, moveDef.buildOperations(game, actor, shock, [low])).state;
    expect(move.optional).toBe(true);
    expect(moved.players[enemy].baseCards).toContain(low);

    const hulk = place(moved, actor, "flankLeft", "BP01-017", { power: 4000 });
    const retreatTarget = place(moved, enemy, "retreat", "RETREAT-TARGET");
    const rage = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "vengeful-rage-hulk")!;
    const enraged = applyAtomicOperationsV2(moved, rage.buildOperations(moved, actor, hulk, [retreatTarget])).state;
    expect(effectiveValueV2(enraged, hulk, "power")).toBe(5000);

    const equal = place(enraged, actor, "flankRight", "BP01-018");
    const enemyA = place(enraged, enemy, "rear", "ENEMY-A", { level: 3, power: 3000 });
    place(enraged, enemy, "flankLeft", "ENEMY-B");
    const equalDef = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "equal-strike-iron-man")!;
    const reduced = applyAtomicOperationsV2(enraged, equalDef.buildOperations(enraged, actor, equal, [enemyA])).state;
    expect(effectiveValueV2(reduced, enemyA, "power")).toBe(1000);
  });

  it("振金挖掘攻击时舍弃卡组顶并增幅；撕裂一切裁剪红色撤退角色后抽牌", () => {
    const game = state(); const actor = game.activePlayer;
    const panther = place(game, actor, "vanguard", "BP01-019", { power: 1500 });
    const top = game.players[actor].deck[0];
    const attack = { type: "ATTACK_DECLARED" as const, actor, attackerId: panther, target: { kind: "breach" as const, zone: "vanguard" as const } };
    const excavate = collectTriggeredEffectsV2(game, [attack])[0];
    const boosted = applyAtomicOperationsV2(game, excavate.operations).state;
    expect(boosted.players[actor].retreat).toContain(top);
    expect(effectiveValueV2(boosted, panther, "power")).toBe(3500);

    const hulk = place(boosted, actor, "rear", "BP01-020");
    const cost = place(boosted, actor, "retreat", "RED-COST", { attribute: 1 });
    const tear = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "tear-everything-hulk")!;
    const handBefore = boosted.players[actor].hand.length;
    const resolved = applyAtomicOperationsV2(boosted, tear.buildOperations(boosted, actor, hulk, [cost])).state;
    expect(resolved.players[actor].void).toContain(cost);
    expect(resolved.players[actor].hand).toHaveLength(handBefore + 1);
  });

  it("雷霆呼唤先公开卡组顶 3 张，再从公开结果选择人类并舍弃其余", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "BP01-021");
    const top = game.players[actor].deck.slice(0, 3);
    Object.assign(game.cards[top[1]], { features: ["人类"] });
    const summon = { type: "CHARACTER_SUMMONED" as const, actor, cardId: source, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const reveal = collectTriggeredEffectsV2(game, [summon]).find((item) => item.effectId === "thunder-call-reveal")!;
    const shown = applyAtomicOperationsV2(game, reveal.operations);
    const select = collectTriggeredEffectsV2(shown.state, shown.events).find((item) => item.effectId === "thunder-call-select")!;
    expect(select.targeting?.choices).toEqual([top[1]]);
    const selectDef = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "thunder-call-select")!;
    const resolved = applyAtomicOperationsV2(shown.state, selectDef.buildOperations(shown.state, actor, source, [top[1]], { triggerEvent: shown.events[0] })).state;
    expect(resolved.players[actor].hand).toContain(top[1]);
    expect(resolved.players[actor].retreat).toEqual(expect.arrayContaining([top[0], top[2]]));
  });

  it("顶级特工只选择具有常驻文本的低阶角色；MK44 结附后清理其他结附并强化宿主", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const widow = place(game, actor, "vanguard", "BP01-022");
    place(game, actor, "base", "AVENGER", { features: ["复仇者联盟"] });
    const target = place(game, enemy, "vanguard", "CONTINUOUS", { level: 3, effectText: "常驻【场上】：测试" });
    const summon = { type: "CHARACTER_SUMMONED" as const, actor, cardId: widow, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const agent = collectTriggeredEffectsV2(game, [summon]).find((item) => item.effectId === "top-agent-widow")!;
    expect(agent.targeting?.choices).toContain(target);

    const mk44 = place(game, actor, "rear", "BP01-023");
    const host = place(game, actor, "flankLeft", "HOST", { power: 3000 });
    const oldAttachment = place(game, actor, "retreat", "OLD-ATTACH");
    game.attachments[host] = [oldAttachment];
    const attach = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "mk44-melee-attach")!;
    const resolved = applyAtomicOperationsV2(game, attach.buildOperations(game, actor, mk44, [host])).state;
    expect(resolved.attachments[host]).toEqual([mk44]);
    expect(resolved.players[actor].retreat).toContain(oldAttachment);
    expect(effectiveValueV2(resolved, host, "power")).toBe(4000);
  });

  it("同步瞄准、雷霆狂怒与协同作战的持续层按战区布局实时生效", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    place(game, actor, "rear", "BP01-024");
    const ironMan = place(game, actor, "vanguard", "IRON", { name: "钢铁侠 MK", range: 4 });
    expect(effectiveValueV2(game, ironMan, "range")).toBe(2);

    const solo = state(); const soloActor = solo.activePlayer;
    const thor = place(solo, soloActor, "vanguard", "BP01-025");
    expect(attackOpportunityLimitV2(solo, thor)).toBe(2);

    const coordinated = state(); const team = coordinated.activePlayer; const foe = (team === 0 ? 1 : 0) as PlayerIndex;
    place(coordinated, team, "rear", "BP01-027");
    place(coordinated, team, "flankLeft", "LEFT", { level: 3 }); place(coordinated, team, "flankRight", "RIGHT", { level: 3 });
    const vanguard = place(coordinated, foe, "vanguard", "TARGET", { power: 3000 });
    expect(effectiveValueV2(coordinated, vanguard, "power")).toBe(2000);
  });

  it("临别赠礼作为号召素材撤退后，可盖放卡组顶并回到卡组底", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "retreat", "BP01-026");
    const top = game.players[actor].deck[0];
    const event = { type: "CARDS_RETREATED" as const, cardIds: [source], reason: "summon_payment" as const };
    const candidate = collectTriggeredEffectsV2(game, [event])[0];
    const resolved = applyAtomicOperationsV2(game, candidate.operations).state;
    expect(resolved.players[actor].baseCovered).toContain(top);
    expect(resolved.players[actor].deck.at(-1)).toBe(source);
  });

  it("深入敌后进入敌方基地后，由敌方选择原控制者的低阶基地角色撤退", () => {
    const game = state(); const owner = game.activePlayer; const enemy = (owner === 0 ? 1 : 0) as PlayerIndex;
    const source = place(game, owner, "hand", "BP01-028");
    const ownBase = place(game, owner, "base", "OWN-BASE", { level: 3 });
    place(game, enemy, "base", "ENEMY-BASE");
    const infiltrate = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "behind-enemy-lines-infiltrate")!;
    const placed = applyAtomicOperationsV2(game, infiltrate.buildOperations(game, owner, source, []));
    expect(placed.state.players[enemy].baseCards).toContain(source);
    const trigger = collectTriggeredEffectsV2(placed.state, placed.events).find((item) => item.effectId === "behind-enemy-lines-retreat")!;
    expect(trigger.controller).toBe(enemy);
    expect(trigger.targeting?.choices).toContain(ownBase);
  });

  it("掩护作战同步侧翼 R；加杠杆把 Lv1 红色宿主的 Lv 替换为 6", () => {
    const game = state(); const actor = game.activePlayer;
    place(game, actor, "base", "BP01-029");
    const left = place(game, actor, "flankLeft", "LEFT", { level: 3, range: 1 });
    const right = place(game, actor, "flankRight", "RIGHT", { level: 3, range: 4 });
    expect(effectiveValueV2(game, left, "range")).toBe(2);
    expect(effectiveValueV2(game, right, "range")).toBe(2);
    const leverage = place(game, actor, "hand", "BP01-030");
    const host = place(game, actor, "vanguard", "RED-LV1", { level: 1, attribute: 1 });
    const attach = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "add-leverage-attach")!;
    const resolved = applyAtomicOperationsV2(game, attach.buildOperations(game, actor, leverage, [host])).state;
    expect(effectiveValueV2(resolved, host, "level")).toBe(6);
  });

  it("奥创智慧诅咒强化机械侧翼；不再孤独按其他黄色角色数获得战力", () => {
    const game = state(); const actor = game.activePlayer;
    place(game, actor, "rear", "BP01-031");
    const ultron = place(game, actor, "flankLeft", "ULTRON", { name: "奥创·分身", power: 2000, range: 1, features: ["机械"] });
    const machine = place(game, actor, "flankRight", "MACHINE", { power: 1500, features: ["机械"] });
    expect(effectiveValueV2(game, ultron, "power")).toBe(3000);
    expect(effectiveValueV2(game, ultron, "range")).toBe(2);
    expect(effectiveValueV2(game, machine, "power")).toBe(2500);
    const hulk = place(game, actor, "vanguard", "BP01-036", { power: 4000 });
    game.cards[ultron].attribute = 2; game.cards[machine].attribute = 2;
    expect(effectiveValueV2(game, hulk, "power")).toBe(6000);
  });

  it("多重打击在黄色角色相杀时从手牌降临；援护射击在后卫响应复仇者攻击", () => {
    const game = state(); const actor = game.activePlayer; const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const panther = place(game, actor, "hand", "BP01-032");
    const yellow = place(game, actor, "vanguard", "YELLOW", { attribute: 2 });
    const tied = place(game, enemy, "vanguard", "TIED", { power: 3000 });
    const battle = { type: "CHARACTER_BATTLE_RESOLVED" as const, attackerId: yellow, targetId: tied, winnerCardId: null, defeatedCardIds: [yellow, tied], tied: true };
    const arrival = collectTriggeredEffectsV2(game, [battle]).find((item) => item.effectId === "multiple-strikes-panther")!;
    expect(arrival.optional).toBe(true);
    const rear = place(game, actor, "rear", "BP01-033");
    const avenger = place(game, actor, "flankLeft", "AVENGER", { features: ["复仇者联盟"] });
    const attack = { type: "ATTACK_DECLARED" as const, actor, attackerId: avenger, target: { kind: "character" as const, cardId: tied } };
    expect(collectTriggeredEffectsV2(game, [attack]).some((item) => item.sourceCardId === rear && item.effectId === "covering-fire-war-machine")).toBe(true);
  });

  it("MK44 战术特化结附后让宿主选择空战区移动", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "rear", "BP01-035");
    const host = place(game, actor, "vanguard", "HOST");
    const attach = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "mk44-tactical-attach")!;
    const attached = applyAtomicOperationsV2(game, attach.buildOperations(game, actor, source, [host]));
    const move = collectTriggeredEffectsV2(attached.state, attached.events).find((item) => item.effectId === "mk44-tactical-move")!;
    expect(move.optional).toBe(true);
    const moveDef = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "mk44-tactical-move")!;
    const moved = applyAtomicOperationsV2(attached.state, moveDef.buildOperations(attached.state, actor, source, ["zone:flankLeft"])).state;
    expect(moved.players[actor].field.flankLeft).toEqual([host]);
  });
});

describe("BP01-037～045 黄色体系效果", () => {
  it("9 张卡均有实施记录，12 个分段效果全部进入注册表", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-0(?:3[7-9]|4[0-5])$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:0[1-9]|[1-3][0-9]|4[0-5])$/.test(item.cardNo))).toHaveLength(45);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:3[7-9]|4[0-5])$/.test(item.cardNo))).toHaveLength(12);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-0(?:0[1-9]|[1-3][0-9]|4[0-5])$/.test(item.cardNo))).toHaveLength(45);
  });

  it("眷族号召可把低阶奥创放进基地；家族誓盟只把低阶黄色角色放进战区", () => {
    const game = state(); const actor = game.activePlayer;
    const ultronSource = place(game, actor, "vanguard", "BP01-037");
    const lowUltron = place(game, actor, "retreat", "LOW-ULTRON", { name: "奥创·眷族", level: 2 });
    const summon = { type: "CHARACTER_SUMMONED" as const, actor, cardId: ultronSource, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const ultronEffect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "kin-summon-ultron")!;
    const ultronCandidate = collectTriggeredEffectsV2(game, [summon]).find((item) => item.effectId === "kin-summon-ultron")!;
    expect(ultronCandidate.optional).toBe(true);
    expect(ultronCandidate.targeting?.choices).toContain("zone:base");
    const returned = applyAtomicOperationsV2(game, ultronEffect.buildOperations(game, actor, ultronSource, [lowUltron, "zone:base"]), ultronSource).state;
    expect(returned.players[actor].baseCards).toContain(lowUltron);

    const widow = place(returned, actor, "rear", "BP01-042");
    const yellow = place(returned, actor, "retreat", "LOW-YELLOW", { level: 2, attribute: 2 });
    const widowEvent = { ...summon, cardId: widow, destination: "rear" as const };
    const widowEffect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "family-oath-widow")!;
    const deployed = applyAtomicOperationsV2(returned, widowEffect.buildOperations(returned, actor, widow, [yellow, "zone:flankLeft"]), widow).state;
    expect(deployed.players[actor].field.flankLeft).toEqual([yellow]);
  });

  it("蜂回路转只在敌方回合开始替换先锋，并让黄蜂女本回合 +2500", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const source = place(game, actor, "rear", "BP01-038", { name: "黄蜂女", power: 500 });
    const vanguard = place(game, actor, "vanguard", "YELLOW-VANGUARD", { name: "雷神", attribute: 2, power: 3000 });
    const event = { type: "TURN_CARDS_DRAWN" as const, actor: enemy, cardIds: [] as string[] };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "wasp-circuit-swap")!;
    expect(candidate.optional).toBe(true);
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "wasp-circuit-swap")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [vanguard]), source).state;
    expect(resolved.players[actor].field.vanguard).toEqual([source]);
    expect(resolved.players[actor].field.rear).toEqual([vanguard]);
    expect(effectiveValueV2(resolved, source, "power")).toBe(3000);
  });

  it("导电窜流检查三张黄色战区角色；死与新生要求三张不同名机械并可放基地", () => {
    const game = state(); const actor = game.activePlayer;
    place(game, actor, "vanguard", "YELLOW-A", { attribute: 2 });
    place(game, actor, "flankLeft", "YELLOW-B", { attribute: 2 });
    place(game, actor, "flankRight", "YELLOW-C", { attribute: 2 });
    const thor = place(game, actor, "hand", "BP01-039");
    const thorEffect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "conductive-surge-thor")!;
    expect(thorEffect.canActivate?.(game, actor, thor)).toBe(true);
    const thorPlaced = applyAtomicOperationsV2(game, thorEffect.buildOperations(game, actor, thor, ["zone:rear"]), thor).state;
    expect(thorPlaced.players[actor].field.rear).toEqual([thor]);

    const ultron = place(thorPlaced, actor, "hand", "BP01-040");
    const costs = [
      place(thorPlaced, actor, "retreat", "MECH-A", { name: "机械甲", features: ["机械"] }),
      place(thorPlaced, actor, "retreat", "MECH-B", { name: "机械乙", features: ["机械"] }),
      place(thorPlaced, actor, "retreat", "MECH-C", { name: "机械丙", features: ["机械"] }),
    ];
    const ultronEffect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "death-rebirth-ultron")!;
    expect(ultronEffect.canActivate?.(thorPlaced, actor, ultron)).toBe(true);
    expect(ultronEffect.validateTargets?.(thorPlaced, actor, ultron, [...costs, "zone:base"])).toBeNull();
    const reborn = applyAtomicOperationsV2(thorPlaced, ultronEffect.buildOperations(thorPlaced, actor, ultron, [...costs, "zone:base"]), ultron).state;
    expect(reborn.players[actor].void).toEqual(expect.arrayContaining(costs));
    expect(reborn.players[actor].baseCards).toContain(ultron);
  });

  it("影舞仅响应自身成功攻击破绽，并严格按抽 1 后舍弃 1 的事件链结算", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const source = place(game, actor, "vanguard", "BP01-041");
    const handBefore = game.players[actor].hand.length;
    const breach = { type: "BREACH_HIT" as const, attacker: actor, attackerCardId: source, defender: enemy, rushCardId: game.players[actor].rushDeck[0] };
    const draw = collectTriggeredEffectsV2(game, [breach]).find((item) => item.effectId === "shadow-dance-draw")!;
    const drawn = applyAtomicOperationsV2(game, draw.operations, source);
    expect(drawn.state.players[actor].hand).toHaveLength(handBefore + 1);
    const discard = collectTriggeredEffectsV2(drawn.state, drawn.events).find((item) => item.effectId === "shadow-dance-discard")!;
    const discardEffect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "shadow-dance-discard")!;
    const discarded = applyAtomicOperationsV2(drawn.state, discardEffect.buildOperations(drawn.state, actor, source, [drawn.state.players[actor].hand[0]]), source).state;
    expect(discarded.players[actor].hand).toHaveLength(handBefore);
  });

  it("卸载重装按撤退奥创→抽牌→可选机械入场分段，第二段可放入基地", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "BP01-043");
    const ultron = place(game, actor, "base", "ALLY-ULTRON", { name: "奥创·盟友" });
    const machine = place(game, actor, "hand", "LOW-MACHINE", { level: 3, features: ["机械"] });
    const event = { type: "CHARACTER_SUMMONED" as const, actor, cardId: source, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const first = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "unload-rearm-vision")!;
    const firstEffect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "unload-rearm-vision")!;
    const drew = applyAtomicOperationsV2(game, firstEffect.buildOperations(game, actor, source, [ultron]), source);
    expect(drew.state.players[actor].retreat).toContain(ultron);
    expect(drew.events.some((item) => item.type === "CARDS_RETREATED" && item.sourceCardId === source)).toBe(true);
    const second = collectTriggeredEffectsV2(drew.state, drew.events).find((item) => item.effectId === "unload-rearm-place")!;
    expect(second.optional).toBe(true);
    expect(second.targeting?.choices).toContain("zone:base");
    const secondEffect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "unload-rearm-place")!;
    const placed = applyAtomicOperationsV2(drew.state, secondEffect.buildOperations(drew.state, actor, source, [machine, "zone:base"]), source).state;
    expect(placed.players[actor].baseCards).toContain(machine);
  });

  it("脱离掩护只接续自身撤退事件，随后可把手牌钢铁侠与先锋互换", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const source = place(game, actor, "rear", "BP01-044");
    const vanguard = place(game, actor, "vanguard", "OLD-VANGUARD");
    const ironMan = place(game, actor, "hand", "IRON-MAN", { name: "钢铁侠 MK", level: 4 });
    const enemyRole = place(game, enemy, "vanguard", "ENEMY-ROLE");
    const event = { type: "CHARACTER_PLACED" as const, actor: enemy, cardId: enemyRole, destination: "vanguard" as const, placementKind: "effect" as const };
    const retreat = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "leave-cover-retreat")!;
    const retreated = applyAtomicOperationsV2(game, retreat.operations, source);
    const retreatEvent = retreated.events.find((item) => item.type === "CARDS_RETREATED")!;
    expect(retreatEvent).toMatchObject({ sourceCardId: source, cardIds: [source] });
    const swap = collectTriggeredEffectsV2(retreated.state, retreated.events).find((item) => item.effectId === "leave-cover-swap")!;
    expect(swap.optional).toBe(true);
    const swapEffect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "leave-cover-swap")!;
    const swapped = applyAtomicOperationsV2(retreated.state, swapEffect.buildOperations(retreated.state, actor, source, [ironMan, vanguard]), source).state;
    expect(swapped.players[actor].field.vanguard).toEqual([ironMan]);
    expect(swapped.players[actor].hand).toContain(vanguard);
    const unrelated = { type: "CARDS_RETREATED" as const, cardIds: [source], reason: "effect" as const, sourceCardId: "OTHER" };
    expect(collectTriggeredEffectsV2(retreated.state, [unrelated]).some((item) => item.effectId === "leave-cover-swap")).toBe(false);
  });

  it("心灵投影把单次战力增量原样传给另一机械，并在本回合只触发一次", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "BP01-045", { power: 2500, features: ["机械"] });
    const target = place(game, actor, "rear", "ALLY-MACHINE", { power: 1500, features: ["机械"] });
    const booster = place(game, actor, "base", "BOOSTER");
    const increased = applyAtomicOperationsV2(game, [{ kind: "ADD_MODIFIER", modifier: { id: "external-boost", sourceCardId: booster, targetCardId: source, type: "power", value: 1500, mode: "delta", duration: "turn" } }]);
    const candidate = collectTriggeredEffectsV2(increased.state, increased.events).find((item) => item.effectId === "mind-projection-vision")!;
    expect(candidate.optional).not.toBe(true);
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "mind-projection-vision")!;
    const projected = applyAtomicOperationsV2(increased.state, effect.buildOperations(increased.state, actor, source, [target], { triggerEvent: candidate.triggerEvent }), source);
    expect(effectiveValueV2(projected.state, target, "power")).toBe(3000);
    expect(collectTriggeredEffectsV2(projected.state, increased.events).some((item) => item.effectId === "mind-projection-vision")).toBe(false);
  });
});

describe("BP01-046～054 黄色战术效果", () => {
  it("9 张卡均有实施记录，本段 8 个起动/触发效果进入注册表", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-0(?:4[6-9]|5[0-4])$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:0[1-9]|[1-4][0-9]|5[0-4])$/.test(item.cardNo))).toHaveLength(53);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:4[6-9]|5[0-4])$/.test(item.cardNo))).toHaveLength(8);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-0(?:0[1-9]|[1-4][0-9]|5[0-4])$/.test(item.cardNo))).toHaveLength(53);
  });

  it("班纳同化在手牌按场上复仇者数量降低 Lv；私人恩怨仅在己方回合把双方指定距离改为 1", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const banner = place(game, actor, "hand", "BP01-046", { level: 6 });
    place(game, actor, "base", "AVENGER-A", { features: ["复仇者联盟"] });
    place(game, actor, "vanguard", "AVENGER-B", { features: ["人类", "复仇者联盟"] });
    expect(effectiveValueV2(game, banner, "level")).toBe(4);

    const hulk = place(game, actor, "rear", "BP01-049", { range: 4 });
    const enemyRear = place(game, enemy, "rear", "ENEMY-REAR", { range: 3 });
    expect(effectiveValueV2(game, hulk, "range")).toBe(1);
    expect(effectiveValueV2(game, enemyRear, "range")).toBe(1);
    game.activePlayer = enemy;
    expect(effectiveValueV2(game, hulk, "range")).toBe(4);
    expect(effectiveValueV2(game, enemyRear, "range")).toBe(3);
  });

  it("中控系统把反浩克装甲直接解除至空战区，增幅后仍不产生角色当回合进场限制", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "base", "BP01-047");
    const host = place(game, actor, "vanguard", "HOST");
    const armor = place(game, actor, "hand", "ARMOR", { name: "反浩克装甲·追迹", power: 2500 });
    const attached = applyAtomicOperationsV2(game, [{ kind: "ATTACH", cardId: armor, hostCardId: host, sourceCardId: source }], source).state;
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "central-control-hulkbuster")!;
    expect(effect.canActivate?.(attached, actor, source)).toBe(true);
    const detached = applyAtomicOperationsV2(attached, effect.buildOperations(attached, actor, source, [armor, "zone:rear"]), source);
    expect(detached.state.players[actor].field.rear).toEqual([armor]);
    expect(effectiveValueV2(detached.state, armor, "power")).toBe(3500);
    expect(detached.state.usage.enteredThisTurn).not.toContain(armor);
    expect(detached.events).toContainEqual(expect.objectContaining({ type: "CARD_DETACHED", cardId: armor, destination: "rear" }));
  });

  it("特工预感公开卡组顶 3 张，并按玩家给出的顶底分界及各自顺序重排", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "BP01-048");
    const shown = game.players[actor].deck.slice(0, 3);
    const reveal = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "agent-foresight-reveal")!;
    const revealed = applyAtomicOperationsV2(game, reveal.buildOperations(game, actor, source, []), source);
    const reorderCandidate = collectTriggeredEffectsV2(revealed.state, revealed.events).find((item) => item.effectId === "agent-foresight-reorder")!;
    expect(reorderCandidate.targeting?.choiceKind).toBe("deck_reorder");
    expect(reorderCandidate.targeting?.choices).toEqual(expect.arrayContaining([...shown, "split:0", "split:1", "split:2", "split:3"]));
    const reorder = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "agent-foresight-reorder")!;
    const ordered = [shown[2], shown[0], shown[1], "split:1"];
    expect(reorder.validateTargets?.(revealed.state, actor, source, ordered, { triggerEvent: reorderCandidate.triggerEvent })).toBeNull();
    const resolved = applyAtomicOperationsV2(revealed.state, reorder.buildOperations(revealed.state, actor, source, ordered, { triggerEvent: reorderCandidate.triggerEvent }), source).state;
    expect(resolved.players[actor].deck[0]).toBe(shown[2]);
    expect(resolved.players[actor].deck.slice(-2)).toEqual([shown[0], shown[1]]);
  });

  it("超导感电记录独立移动禁令，并同时拦截后续效果战基移动", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const source = place(game, actor, "vanguard", "BP01-050");
    const target = place(game, enemy, "vanguard", "TARGET");
    const event = { type: "CHARACTER_SUMMONED" as const, actor, cardId: source, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "superconductive-shock")!;
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "superconductive-shock")!;
    const locked = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target]), source);
    expect(locked.state.usage.movementBlockedCardIds).toContain(target);
    const move = applyAtomicOperationsV2(locked.state, [{ kind: "MOVE_BATTLE_BASE", cardId: target, destination: "base" }]);
    expect(move.trace[0].succeeded).toBe(false);
    expect(move.state.players[enemy].field.vanguard).toEqual([target]);
    expect(candidate.targeting?.choices).toContain(target);
  });

  it("援助打击仅在自身作为号召素材撤退时，为我方场上黄色角色 +2000", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "retreat", "BP01-051");
    const yellow = place(game, actor, "base", "YELLOW", { attribute: 2, power: 2000 });
    const event = { type: "CARDS_RETREATED" as const, cardIds: [source], reason: "summon_payment" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "support-strike-widow")!;
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "support-strike-widow")!;
    const boosted = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [yellow]), source).state;
    expect(effectiveValueV2(boosted, yellow, "power")).toBe(4000);
    expect(candidate.optional).toBe(false);
  });

  it("追迹者响应高阶机械入场且场上无同名角色，可由玩家选择放进基地", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "hand", "BP01-052", { name: "反浩克装甲·追迹者" });
    const machine = place(game, actor, "vanguard", "HIGH-MACHINE", { level: 4, features: ["机械"] });
    const event = { type: "CHARACTER_PLACED" as const, actor, cardId: machine, destination: "vanguard" as const, placementKind: "effect" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "tracker-hulkbuster")!;
    expect(candidate.optional).toBe(true);
    expect(candidate.targeting?.choices).toContain("zone:base");
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "tracker-hulkbuster")!;
    const placed = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, ["zone:base"]), source).state;
    expect(placed.players[actor].baseCards).toContain(source);
  });

  it("下克上只在攻击 Lv4+ 角色时增幅自身；眷族重塑支付机械手牌后回收高阶奥创", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const armor = place(game, actor, "vanguard", "BP01-053", { power: 3000 });
    const high = place(game, enemy, "vanguard", "HIGH", { level: 4 });
    const attack = { type: "ATTACK_DECLARED" as const, actor, attackerId: armor, target: { kind: "character" as const, cardId: high } };
    const boost = collectTriggeredEffectsV2(game, [attack]).find((item) => item.effectId === "underdog-hulkbuster")!;
    const boosted = applyAtomicOperationsV2(game, boost.operations, armor).state;
    expect(effectiveValueV2(boosted, armor, "power")).toBe(4500);

    const source = place(boosted, actor, "rear", "BP01-054");
    const cost = place(boosted, actor, "hand", "MECH-COST", { features: ["机械"] });
    const ultron = place(boosted, actor, "retreat", "HIGH-ULTRON", { name: "奥创·重塑", level: 4 });
    const remodel = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "kin-remodel-ultron")!;
    const resolved = applyAtomicOperationsV2(boosted, remodel.buildOperations(boosted, actor, source, [cost, ultron]), source).state;
    expect(resolved.players[actor].retreat).toContain(cost);
    expect(resolved.players[actor].hand).toContain(ultron);
  });
});

describe("BP01-055～063 蓝黄战术效果", () => {
  it("9 张卡均有实施记录，本段 6 个起动/触发效果进入注册表", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-0(?:5[5-9]|6[0-3])$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:0[1-9]|[1-5][0-9]|6[0-3])$/.test(item.cardNo))).toHaveLength(59);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:5[5-9]|6[0-3])$/.test(item.cardNo))).toHaveLength(6);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-0(?:0[1-9]|[1-5][0-9]|6[0-3])$/.test(item.cardNo))).toHaveLength(59);
  });

  it("另辟蹊径、短兵相接与超频加载按实时敌方战区信息结算常驻数值", () => {
    const waspGame = state(); const actor = waspGame.activePlayer; const enemy = opponent(actor);
    const wasp = place(waspGame, actor, "vanguard", "BP01-055", { range: 1 });
    place(waspGame, enemy, "vanguard", "ENEMY-POWER", { power: 6500 });
    expect(effectiveValueV2(waspGame, wasp, "range")).toBe(3);

    const thorGame = state(); const thorActor = thorGame.activePlayer; const thorEnemy = opponent(thorActor);
    const thor = place(thorGame, thorActor, "vanguard", "BP01-056", { power: 2500 });
    place(thorGame, thorEnemy, "vanguard", "ENEMY-R1", { range: 1 });
    expect(effectiveValueV2(thorGame, thor, "power")).toBe(4000);

    const ironGame = state(); const ironActor = ironGame.activePlayer; const ironEnemy = opponent(ironActor);
    const ironMan = place(ironGame, ironActor, "rear", "BP01-058", { power: 3000 });
    place(ironGame, ironEnemy, "vanguard", "ENEMY-R2", { range: 2 });
    place(ironGame, ironEnemy, "rear", "ENEMY-R1", { range: 1 });
    expect(effectiveValueV2(ironGame, ironMan, "power")).toBe(6500);
  });

  it("交叉常驻依赖使用显式值作为循环回退，不会递归卡死", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const wasp = place(game, actor, "vanguard", "BP01-055", { range: 1 });
    const thor = place(game, enemy, "vanguard", "BP01-056", { power: 2500 });
    expect(Number.isFinite(effectiveValueV2(game, wasp, "range"))).toBe(true);
    expect(Number.isFinite(effectiveValueV2(game, thor, "power"))).toBe(true);
  });

  it("残械组装在号召入场后把撤退区 Lv1 机械正面放进基地", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "BP01-057");
    const machine = place(game, actor, "retreat", "LV1-MACHINE", { level: 1, features: ["机械"] });
    const event = { type: "CHARACTER_SUMMONED" as const, actor, cardId: source, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "remnant-assembly-vision")!;
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "remnant-assembly-vision")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [machine]), source).state;
    expect(candidate.optional).not.toBe(true);
    expect(resolved.players[actor].baseCards).toContain(machine);
    expect(resolved.players[actor].retreat).not.toContain(machine);
  });

  it("狩猎本能只在本回合授予自身强袭；反坦克压制敌方先锋 1000", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const panther = place(game, actor, "flankLeft", "BP01-059");
    const vanguard = place(game, enemy, "vanguard", "ENEMY-VANGUARD", { power: 3500 });
    const event = { type: "CHARACTER_SUMMONED" as const, actor, cardId: panther, destination: "flankLeft" as const, paymentCardIds: [], summonKind: "action" as const };
    const assault = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "hunting-instinct-panther")!;
    const granted = applyAtomicOperationsV2(game, assault.operations, panther).state;
    expect(granted.keywordGrants).toContainEqual(expect.objectContaining({ sourceCardId: panther, targetCardId: panther, keyword: "assault", duration: "turn" }));

    const warMachine = place(granted, actor, "rear", "BP01-060");
    const summon = { type: "CHARACTER_SUMMONED" as const, actor, cardId: warMachine, destination: "rear" as const, paymentCardIds: [], summonKind: "action" as const };
    const antiTank = collectTriggeredEffectsV2(granted, [summon]).find((item) => item.effectId === "anti-tank-war-machine")!;
    const reduced = applyAtomicOperationsV2(granted, antiTank.operations, warMachine).state;
    expect(effectiveValueV2(reduced, vanguard, "power")).toBe(2500);
  });

  it("如影随形严格支付 2 张基地卡，再把手牌新黑豹与合法蓝色高阶角色互换", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "hand", "BP01-061", { name: "新黑豹·追影" });
    const baseA = place(game, actor, "base", "BASE-A");
    const baseB = place(game, actor, "covered", "BASE-B");
    const target = place(game, actor, "flankRight", "BLUE-HIGH", { name: "蓝色高阶角色", level: 4, attribute: 3 });
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "shadowing-panther")!;
    expect(effect.canActivate?.(game, actor, source)).toBe(true);
    expect(effect.validateTargets?.(game, actor, source, [baseA, baseB, target])).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [baseA, baseB, target]), source).state;
    expect(resolved.players[actor].retreat).toEqual(expect.arrayContaining([baseA, baseB]));
    expect(resolved.players[actor].field.flankRight).toEqual([source]);
    expect(resolved.players[actor].hand).toContain(target);
  });

  it("自由意志一次完成自身战基移动和战区增幅，且在基地免疫 Lv4 或以下外部角色效果", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const captain = place(game, actor, "base", "BP01-062", { level: 3, power: 2500 });
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "free-will-captain")!;
    expect(effect.canActivate?.(game, actor, captain)).toBe(true);
    const moved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, captain, ["zone:rear", captain]), captain).state;
    expect(moved.players[actor].field.rear).toEqual([captain]);
    expect(effectiveValueV2(moved, captain, "power")).toBe(3500);
    expect(effect.canActivate?.(moved, actor, captain)).toBe(false);

    const protectedGame = state(); const protectedActor = protectedGame.activePlayer; const protectedEnemy = opponent(protectedActor);
    const protectedCaptain = place(protectedGame, protectedActor, "base", "BP01-062", { level: 3, power: 2500 });
    const lowSource = place(protectedGame, protectedEnemy, "vanguard", "LOW-SOURCE", { level: 4 });
    const blocked = applyAtomicOperationsV2(protectedGame, [{ kind: "ADD_MODIFIER", modifier: { id: "blocked", sourceCardId: lowSource, targetCardId: protectedCaptain, type: "power", value: -1000, duration: "turn" } }], lowSource);
    expect(blocked.trace[0].succeeded).toBe(false);
    expect(effectiveValueV2(blocked.state, protectedCaptain, "power")).toBe(2500);
    const highSource = place(blocked.state, protectedEnemy, "rear", "HIGH-SOURCE", { level: 5 });
    const applied = applyAtomicOperationsV2(blocked.state, [{ kind: "ADD_MODIFIER", modifier: { id: "applied", sourceCardId: highSource, targetCardId: protectedCaptain, type: "power", value: -1000, duration: "turn" } }], highSource).state;
    expect(effectiveValueV2(applied, protectedCaptain, "power")).toBe(1500);
  });

  it("时间诱拐只响应我方战区减力，裁剪手牌自身后再裁剪敌方 3500 以下角色", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const loki = place(game, actor, "hand", "BP01-063");
    const ally = place(game, actor, "vanguard", "ALLY", { power: 3500 });
    const enemyRole = place(game, enemy, "vanguard", "ENEMY-LOW", { power: 3000 });
    const reducer = place(game, enemy, "rear", "REDUCER", { level: 5 });
    const reduction = applyAtomicOperationsV2(game, [{ kind: "ADD_MODIFIER", modifier: { id: "external-reduction", sourceCardId: reducer, targetCardId: ally, type: "power", value: -500, duration: "turn" } }], reducer);
    const candidate = collectTriggeredEffectsV2(reduction.state, reduction.events).find((item) => item.effectId === "time-abduction-loki")!;
    expect(candidate.optional).toBe(true);
    expect(candidate.targeting?.choices).toContain(enemyRole);
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "time-abduction-loki")!;
    const resolved = applyAtomicOperationsV2(reduction.state, effect.buildOperations(reduction.state, actor, loki, [enemyRole]), loki).state;
    expect(resolved.players[actor].void).toContain(loki);
    expect(resolved.players[enemy].void).toContain(enemyRole);
  });
});

describe("BP01-064～072 蓝色战术效果", () => {
  it("9 张卡均有实施记录，本段 7 个起动/触发效果进入注册表", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-0(?:6[4-9]|7[0-2])$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:0[1-9]|[1-6][0-9]|7[0-2])$/.test(item.cardNo))).toHaveLength(66);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:6[4-9]|7[0-2])$/.test(item.cardNo))).toHaveLength(7);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-0(?:0[1-9]|[1-6][0-9]|7[0-2])$/.test(item.cardNo))).toHaveLength(66);
  });

  it("量子核心只在战斗阶段且有另一蓝色战区角色时增幅；移形换影随所在战区改变数值", () => {
    const game = state(); const actor = game.activePlayer;
    const antMan = place(game, actor, "vanguard", "BP01-064", { power: 4000 });
    place(game, actor, "rear", "BLUE-ALLY", { attribute: 3 });
    expect(effectiveValueV2(game, antMan, "power")).toBe(4000);
    game.flow = { kind: "BATTLE_NEXT", actor };
    expect(effectiveValueV2(game, antMan, "power")).toBe(6500);

    const vanguardPanther = place(game, actor, "flankLeft", "BP01-071", { power: 4000, range: 1 });
    expect(effectiveValueV2(game, vanguardPanther, "range")).toBe(3);
    game.players[actor].field.flankLeft = [];
    game.players[actor].field.vanguard = [vanguardPanther];
    expect(effectiveValueV2(game, vanguardPanther, "power")).toBe(5000);
    expect(effectiveValueV2(game, vanguardPanther, "range")).toBe(1);
  });

  it("物资装填仅在自身战败后依次把卡组顶 2 张盖放进基地", () => {
    const game = state(); const actor = game.activePlayer;
    const falcon = place(game, actor, "retreat", "BP01-065");
    const top = game.players[actor].deck.slice(0, 2);
    const event = { type: "CHARACTER_BATTLE_RESOLVED" as const, attackerId: "ATTACKER", targetId: falcon, winnerCardId: "ATTACKER", defeatedCardIds: [falcon], tied: false };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "supply-loading-falcon")!;
    const resolved = applyAtomicOperationsV2(game, candidate.operations, falcon).state;
    expect(resolved.players[actor].baseCovered).toEqual(expect.arrayContaining(top));
    expect(resolved.players[actor].deck).not.toEqual(expect.arrayContaining(top));
  });

  it("力挽狂澜响应我方低阶人类战败，确认发动后无需选择并直接返回原战区", () => {
    const game = state(); const actor = game.activePlayer;
    const captain = place(game, actor, "hand", "BP01-066");
    const human = place(game, actor, "retreat", "HUMAN", { level: 4, features: ["人类"] });
    const event = { type: "CARDS_RETREATED" as const, cardIds: [human], reason: "battle" as const, fromFieldCardIds: [human], fromFieldZones: { [human]: "rear" as const } };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "turn-the-tide-captain")!;
    expect(candidate.targeting).toBeUndefined();
    const resolved = applyAtomicOperationsV2(game, candidate.operations, captain).state;
    expect(resolved.players[actor].void).toContain(captain);
    expect(resolved.players[actor].field.rear).toEqual([human]);
  });

  it("力挽狂澜能从敌方效果原子自动识别刚撤退角色，不依赖每张卡重复填写目标或来源", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const captain = place(game, actor, "hand", "BP01-066");
    const human = place(game, actor, "rear", "HUMAN", { level: 4, features: ["人类"] });
    const enemySource = place(game, enemy, "vanguard", "ENEMY-SOURCE");
    const retreated = applyAtomicOperationsV2(game, [{ kind: "RETREAT", cardIds: [human] }], enemySource);
    expect(retreated.events).toContainEqual(expect.objectContaining({
      type: "CARDS_RETREATED",
      sourceCardId: enemySource,
      fromFieldZones: { [human]: "rear" },
    }));
    const candidate = collectTriggeredEffectsV2(retreated.state, retreated.events).find((item) => item.effectId === "turn-the-tide-captain")!;
    expect(candidate.targeting).toBeUndefined();
    const resolved = applyAtomicOperationsV2(retreated.state, candidate.operations, captain).state;
    expect(resolved.players[actor].field.rear).toEqual([human]);
    expect(resolved.players[actor].void).toContain(captain);
  });

  it("敌意焦点复用统一攻击规则，在应对中把当前攻击变更为另一合法目标并记录回合次数", () => {
    const game = state(); const attackerSeat = game.activePlayer; const defender = opponent(attackerSeat);
    const attacker = place(game, attackerSeat, "vanguard", "ATTACKER", { range: 5 });
    const original = place(game, defender, "vanguard", "ORIGINAL");
    const alternate = place(game, defender, "rear", "ALTERNATE");
    const winterSoldier = place(game, defender, "base", "BP01-067");
    game.flow = { kind: "BATTLE_RESPONSE", actor: attackerSeat, priority: defender };
    game.battle = { order: ["vanguard", "flankLeft", "flankRight", "rear"], cursor: 0, attackerId: attacker, target: { kind: "character", cardId: original }, attackedCardIds: [attacker], priorityPlayer: defender, consecutivePasses: 0, responseSummoned: [false, false] };
    const event = { type: "ATTACK_DECLARED" as const, actor: attackerSeat, attackerId: attacker, target: { kind: "character" as const, cardId: original } };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "hostility-focus-winter-soldier")!;
    expect(candidate.targeting?.choices).toContain(alternate);
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "hostility-focus-winter-soldier")!;
    const redirected = applyAtomicOperationsV2(game, effect.buildOperations(game, defender, winterSoldier, [alternate]), winterSoldier);
    expect(redirected.state.battle?.target).toEqual({ kind: "character", cardId: alternate });
    expect(redirected.events).toContainEqual(expect.objectContaining({ type: "ATTACK_TARGET_REDIRECTED", attackerId: attacker, sourceCardId: winterSoldier }));
    expect(redirected.state.usage.effectUseKeysThisTurn).toContain(`${winterSoldier}:hostility-focus-winter-soldier`);
  });

  it("瓦坎达万岁在自身战败且胜者为人类时撤退胜者", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const panther = place(game, actor, "retreat", "BP01-068");
    const winner = place(game, enemy, "vanguard", "HUMAN-WINNER", { features: ["人类"] });
    const event = { type: "CHARACTER_BATTLE_RESOLVED" as const, attackerId: winner, targetId: panther, winnerCardId: winner, defeatedCardIds: [panther], tied: false };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "wakanda-forever-panther")!;
    const resolved = applyAtomicOperationsV2(game, candidate.operations, panther).state;
    expect(resolved.players[enemy].retreat).toContain(winner);
  });

  it("神奇呼唤校验恰好高 1 Lv 的替换，成功后抽牌并把霹雳火移至卡组底", () => {
    const game = state(); const actor = game.activePlayer;
    const torch = place(game, actor, "base", "BP01-069");
    const target = place(game, actor, "vanguard", "LV2-TARGET", { level: 2 });
    const hand = place(game, actor, "hand", "LV3-HAND", { level: 3 });
    const handCount = game.players[actor].hand.length;
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "fantastic-call-torch")!;
    expect(effect.validateTargets?.(game, actor, torch, [hand, target])).toBeNull();
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, torch, [hand, target]), torch).state;
    expect(resolved.players[actor].field.vanguard).toEqual([hand]);
    expect(resolved.players[actor].hand).toContain(target);
    expect(resolved.players[actor].hand).toHaveLength(handCount + 1);
    expect(resolved.players[actor].deck.at(-1)).toBe(torch);
  });

  it("时间引导响应蓝色角色放置且回合一次；防护力场完成裁剪、回收与敌方减 R", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const loki = place(game, actor, "base", "BP01-070");
    const blue = place(game, actor, "vanguard", "BLUE", { attribute: 3 });
    const top = game.players[actor].deck[0];
    const placed = { type: "CHARACTER_PLACED" as const, actor, cardId: blue, destination: "vanguard" as const, placementKind: "effect" as const };
    const guidance = collectTriggeredEffectsV2(game, [placed]).find((item) => item.effectId === "time-guidance-loki")!;
    const covered = applyAtomicOperationsV2(game, guidance.operations, loki).state;
    expect(covered.players[actor].baseCovered).toContain(top);
    expect(covered.usage.effectUseKeysThisTurn).toContain(`${loki}:time-guidance-loki`);

    const invisible = place(covered, actor, "hand", "BP01-072");
    const recovered = place(covered, actor, "retreat", "RECOVER", { name: "神奇先生" });
    const enemyRole = place(covered, enemy, "vanguard", "ENEMY", { range: 3 });
    const attack = { type: "ATTACK_DECLARED" as const, actor: enemy, attackerId: enemyRole, target: { kind: "breach" as const, zone: "rear" as const } };
    const field = collectTriggeredEffectsV2(covered, [attack]).find((item) => item.effectId === "protective-field-invisible-woman")!;
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "protective-field-invisible-woman")!;
    const resolved = applyAtomicOperationsV2(covered, effect.buildOperations(covered, actor, invisible, [recovered, enemyRole]), invisible).state;
    expect(field.optional).toBe(true);
    expect(resolved.players[actor].void).toContain(invisible);
    expect(resolved.players[actor].deck.at(-1)).toBe(recovered);
    expect(effectiveValueV2(resolved, enemyRole, "range")).toBe(1);
  });
});

describe("BP01-073～081 神奇四侠与复仇者效果", () => {
  it("9 张卡均有实施记录，本段 6 个起动/触发效果进入注册表", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-0(?:7[3-9]|8[0-1])$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:0[1-9]|[1-7][0-9]|8[0-1])$/.test(item.cardNo))).toHaveLength(72);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:7[3-9]|8[0-1])$/.test(item.cardNo))).toHaveLength(6);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-0(?:0[1-9]|[1-7][0-9]|8[0-1])$/.test(item.cardNo))).toHaveLength(72);
  });

  it("神奇灌注只响应己方卡牌回底一次，并按己方场上神奇四侠卡牌数增幅", () => {
    const game = state(); const actor = game.activePlayer;
    const torch = place(game, actor, "vanguard", "BP01-073", { power: 4000, range: 2, features: ["神奇四侠"] });
    place(game, actor, "base", "FANTASTIC-ALLY", { features: ["人类", "神奇四侠"] });
    const moved = place(game, actor, "retreat", "MOVED");
    const movement = applyAtomicOperationsV2(game, [{ kind: "MOVE_TO_DECK_BOTTOM", cardId: moved }], torch);
    const candidate = collectTriggeredEffectsV2(movement.state, movement.events).find((item) => item.effectId === "fantastic-infusion-torch")!;
    const boosted = applyAtomicOperationsV2(movement.state, candidate.operations, torch).state;
    expect(effectiveValueV2(boosted, torch, "range")).toBe(3);
    expect(effectiveValueV2(boosted, torch, "power")).toBe(6000);
    expect(collectTriggeredEffectsV2(boosted, movement.events).some((item) => item.effectId === "fantastic-infusion-torch")).toBe(false);
  });

  it("智慧诅咒在恰好 4 手牌时放置 Lv4，否则回收撤退区角色", () => {
    const game = state(); const actor = game.activePlayer;
    game.players[actor].deck.unshift(...game.players[actor].hand); game.players[actor].hand = [];
    const source = place(game, actor, "rear", "BP01-074");
    const lv4 = place(game, actor, "hand", "LV4", { level: 4 });
    place(game, actor, "hand", "H2"); place(game, actor, "hand", "H3"); place(game, actor, "hand", "H4");
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "wisdom-curse-mister-fantastic")!;
    const placed = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [lv4, "zone:vanguard"]), source).state;
    expect(placed.players[actor].field.vanguard).toEqual([lv4]);

    const fallback = state(); const fallbackActor = fallback.activePlayer;
    const fallbackSource = place(fallback, fallbackActor, "rear", "BP01-074");
    const retreat = place(fallback, fallbackActor, "retreat", "RETREAT");
    const returned = applyAtomicOperationsV2(fallback, effect.buildOperations(fallback, fallbackActor, fallbackSource, [retreat]), fallbackSource).state;
    expect(returned.players[fallbackActor].deck.at(-1)).toBe(retreat);
  });

  it("力量承托降低手牌神奇四侠 Lv；时间尽头按撤退区洛基数增幅；鹰之俯瞰增强后卫 R", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    place(game, actor, "base", "BP01-075");
    const fantastic = place(game, actor, "hand", "FANTASTIC", { level: 4, features: ["神奇四侠"] });
    const loki = place(game, actor, "vanguard", "BP01-076", { power: 500 });
    place(game, actor, "retreat", "LOKI-A", { name: "洛基 A" }); place(game, actor, "retreat", "LOKI-B", { name: "洛基 B" });
    place(game, actor, "base", "BP01-079");
    const rear = place(game, actor, "rear", "REAR", { range: 1 });
    place(game, enemy, "vanguard", "BIG", { power: 5000 });
    expect(effectiveValueV2(game, fantastic, "level")).toBe(3);
    expect(effectiveValueV2(game, loki, "power")).toBe(2500);
    expect(effectiveValueV2(game, rear, "range")).toBe(2);
  });

  it("我需要你先抽 1 张再把新的卡组顶盖放基地；殊死空投展示并放置合法 Lv4 蓝色角色", () => {
    const game = state(); const actor = game.activePlayer;
    const captain = place(game, actor, "vanguard", "BP01-077");
    const drawn = game.players[actor].deck[0]; const covered = game.players[actor].deck[1];
    const summon = { type: "CHARACTER_SUMMONED" as const, actor, cardId: captain, destination: "vanguard" as const, paymentCardIds: [], summonKind: "action" as const };
    const need = collectTriggeredEffectsV2(game, [summon]).find((item) => item.effectId === "i-need-you-captain")!;
    const supplied = applyAtomicOperationsV2(game, need.operations, captain).state;
    expect(supplied.players[actor].hand).toContain(drawn);
    expect(supplied.players[actor].baseCovered).toContain(covered);

    const falcon = place(supplied, actor, "retreat", "BP01-078");
    const top = supplied.players[actor].deck[0]; Object.assign(supplied.cards[top], { level: 4, attribute: 3 });
    const battle = { type: "CHARACTER_BATTLE_RESOLVED" as const, attackerId: "A", targetId: falcon, winnerCardId: "A", defeatedCardIds: [falcon], tied: false };
    const airDrop = collectTriggeredEffectsV2(supplied, [battle]).find((item) => item.effectId === "desperate-airdrop-falcon")!;
    const landed = applyAtomicOperationsV2(supplied, airDrop.operations, falcon).state;
    expect(landed.players[actor].baseCards).toContain(top);
  });

  it("杀身成仁仅在等级总和落后时裁剪自身并撤退敌方 Lv3 攻击者", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const captain = place(game, actor, "hand", "BP01-080");
    place(game, actor, "vanguard", "OWN", { level: 1 });
    const attacker = place(game, enemy, "vanguard", "ATTACKER", { level: 3 });
    const event = { type: "ATTACK_DECLARED" as const, actor: enemy, attackerId: attacker, target: { kind: "breach" as const, zone: "rear" as const } };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "self-sacrifice-captain")!;
    const resolved = applyAtomicOperationsV2(game, candidate.operations, captain).state;
    expect(resolved.players[actor].void).toContain(captain);
    expect(resolved.players[enemy].retreat).toContain(attacker);
  });

  it("量子纠缠在蓝色角色被攻击时结附攻击者，并把该攻击者 R 变更为 1", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const antMan = place(game, actor, "hand", "BP01-081");
    const blue = place(game, actor, "vanguard", "BLUE", { attribute: 3 });
    const attacker = place(game, enemy, "vanguard", "ATTACKER", { range: 4 });
    const event = { type: "ATTACK_DECLARED" as const, actor: enemy, attackerId: attacker, target: { kind: "character" as const, cardId: blue } };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "quantum-entanglement-ant-man")!;
    const attached = applyAtomicOperationsV2(game, candidate.operations, antMan).state;
    expect(attached.attachments[attacker]).toContain(antMan);
    expect(effectiveValueV2(attached, attacker, "range")).toBe(1);
  });
});

describe("BP01-082～090 蓝色控制效果", () => {
  it("9 张卡均有实施记录，本段 4 个起动/触发效果进入注册表", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-0(?:8[2-9]|90)$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:0[1-9]|[1-8][0-9]|90)$/.test(item.cardNo))).toHaveLength(76);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:8[2-9]|90)$/.test(item.cardNo))).toHaveLength(4);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-0(?:0[1-9]|[1-8][0-9]|90)$/.test(item.cardNo))).toHaveLength(76);
  });

  it("感官剥离、战术传授、自由视野与雷达感官统一按实时战区条件结算", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const human = place(game, actor, "vanguard", "HUMAN", { power: 3000, range: 1, features: ["人类"] });
    place(game, enemy, "rear", "BP01-082");
    expect(effectiveValueV2(game, human, "power")).toBe(2500);
    place(game, actor, "base", "BP01-086");
    expect(effectiveValueV2(game, human, "power")).toBe(3000);
    place(game, actor, "rear", "BP01-084");
    place(game, enemy, "vanguard", "BIG", { power: 5000 });
    expect(effectiveValueV2(game, human, "range")).toBe(2);
    const radar = place(game, actor, "flankLeft", "BP01-088", { range: 1 });
    expect(effectiveValueV2(game, radar, "range")).toBe(4);
  });

  it("量子领域在敌方战区只有 1 张 Lv6 时同时改变双方 R", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const antMan = place(game, actor, "vanguard", "BP01-089", { range: 1 });
    const lv6 = place(game, enemy, "vanguard", "LV6", { level: 6, range: 3 });
    expect(effectiveValueV2(game, antMan, "range")).toBe(2);
    expect(effectiveValueV2(game, lv6, "range")).toBe(2);
  });

  it("虚空放逐只在我方回合结束触发，先裁剪撤退角色再选择合法战基移动", () => {
    const game = state(); const actor = game.activePlayer;
    const witch = place(game, actor, "base", "BP01-085");
    const cost = place(game, actor, "retreat", "COST");
    const mover = place(game, actor, "vanguard", "MOVER");
    const end = { type: "END_TRIGGERS_PROCESSED" as const, actor };
    const banish = collectTriggeredEffectsV2(game, [end]).find((item) => item.effectId === "void-exile-witch-banish")!;
    const banished = applyAtomicOperationsV2(game, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "void-exile-witch-banish")!.buildOperations(game, actor, witch, [cost]), witch);
    const move = collectTriggeredEffectsV2(banished.state, banished.events).find((item) => item.effectId === "void-exile-witch-move")!;
    const moved = applyAtomicOperationsV2(banished.state, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "void-exile-witch-move")!.buildOperations(banished.state, actor, witch, [mover, "zone:base"]), witch).state;
    expect(banish.optional).toBe(true);
    expect(move.targeting?.choices).toEqual(expect.arrayContaining([witch, mover]));
    expect(move.targeting?.choices).toContain("zone:base");
    expect(move.targeting?.prompt).toContain("我方 1 张可移动角色");
    expect(moved.players[actor].baseCards).toEqual(expect.arrayContaining([witch, mover]));
  });

  it("闪光箭支付复仇者手牌后压制敌方角色并记录回合一次", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const hawkeye = place(game, actor, "vanguard", "BP01-087");
    const cost = place(game, actor, "hand", "AVENGER", { features: ["复仇者联盟"] });
    const target = place(game, enemy, "vanguard", "TARGET", { power: 3000 });
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "flash-arrow-hawkeye")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, hawkeye, [cost, target]), hawkeye).state;
    expect(resolved.players[actor].retreat).toContain(cost);
    expect(effectiveValueV2(resolved, target, "power")).toBe(2000);
    expect(effect.canActivate?.(resolved, actor, hawkeye)).toBe(false);
  });

  it("自由裁决裁剪自身、按己方战力合计压制，并令结束行动直接跳过战斗阶段", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    game.turnNumber = 2;
    const captain = place(game, actor, "hand", "BP01-090");
    place(game, actor, "vanguard", "OWN-A", { power: 2000 }); place(game, actor, "rear", "OWN-B", { power: 1500 });
    const target = place(game, enemy, "vanguard", "TARGET", { power: 5000 });
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "freedom-judgment-captain")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, captain, [target]), captain).state;
    expect(resolved.usage.battlePhaseSkippedThisTurn).toBe(true);
    expect(effectiveValueV2(resolved, target, "power")).toBe(1500);
    const ended = executeCommandV2(resolved, { actor, expectedRevision: resolved.revision, command: { type: "END_ACTION_PHASE" } });
    expect(ended.ok).toBe(true);
    if (ended.ok) expect(ended.state.flow.kind).toBe("TURN_RESPONSE_START");
  });
});

describe("BP01-091～099 绿色控制效果", () => {
  it("9 张卡均有实施记录，本段 9 个起动/触发效果进入注册表", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-09[1-9]$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-0(?:0[1-9]|[1-9][0-9])$/.test(item.cardNo))).toHaveLength(85);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-09[1-9]$/.test(item.cardNo))).toHaveLength(9);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-0(?:0[1-9]|[1-9][0-9])$/.test(item.cardNo))).toHaveLength(85);
  });

  it("黑客箭在纯绿色场面支付 1 手牌后撤退敌方 2 张基地盖卡", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const source = place(game, actor, "vanguard", "BP01-091", { attribute: 4 });
    const cost = place(game, actor, "hand", "COST");
    const coverA = place(game, enemy, "covered", "COVER-A"); const coverB = place(game, enemy, "covered", "COVER-B");
    const event = { type: "CARDS_PLACED_IN_BASE" as const, actor: enemy, cardIds: [coverB], face: "down" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "hacker-arrow-hawkeye")!;
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "hacker-arrow-hawkeye")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [cost, coverA, coverB]), source).state;
    expect(candidate.optional).toBe(true);
    expect(resolved.players[actor].retreat).toContain(cost);
    expect(resolved.players[enemy].retreat).toEqual(expect.arrayContaining([coverA, coverB]));
  });

  it("量子叠加从场上撤退后先裁剪自身，基地达到 4 张时再可选复仇者入基地", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "retreat", "BP01-092");
    for (let i = 0; i < 4; i += 1) place(game, actor, "covered", `BASE-${i}`);
    const avenger = place(game, actor, "hand", "AVENGER", { features: ["复仇者联盟"] });
    const retreated = { type: "CARDS_RETREATED" as const, cardIds: [source], reason: "battle" as const, fromFieldCardIds: [source] };
    const banish = collectTriggeredEffectsV2(game, [retreated]).find((item) => item.effectId === "quantum-superposition-banish")!;
    const banished = applyAtomicOperationsV2(game, banish.operations, source);
    const placeCandidate = collectTriggeredEffectsV2(banished.state, banished.events).find((item) => item.effectId === "quantum-superposition-place")!;
    const placed = applyAtomicOperationsV2(banished.state, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "quantum-superposition-place")!.buildOperations(banished.state, actor, source, [avenger]), source).state;
    expect(placeCandidate.optional).toBe(true);
    expect(placed.players[actor].void).toContain(source);
    expect(placed.players[actor].baseCards).toContain(avenger);
  });

  it("雷霆知音承接另一侧翼战力并禁止其攻击；故事之神按未攻击数选择合法撤退对象", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const thor = place(game, actor, "flankLeft", "BP01-093", { power: 3500 });
    const ally = place(game, actor, "flankRight", "ALLY", { power: 3000 });
    const target = place(game, enemy, "vanguard", "TARGET", { level: 1 });
    const attack = { type: "ATTACK_DECLARED" as const, actor, attackerId: thor, target: { kind: "character" as const, cardId: target } };
    const boost = collectTriggeredEffectsV2(game, [attack]).find((item) => item.effectId === "thunder-confidant-mighty-thor")!;
    const boosted = applyAtomicOperationsV2(game, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "thunder-confidant-mighty-thor")!.buildOperations(game, actor, thor, [ally]), thor).state;
    expect(effectiveValueV2(boosted, thor, "power")).toBe(6500);
    expect(boosted.usage.attackBlockedCardIds).toContain(ally);
    expect(boost.targeting?.choices).toContain(ally);

    const loki = place(boosted, actor, "base", "BP01-094");
    boosted.usage.attackedCardIdsByPlayer[actor] = [thor];
    const end = { type: "END_TRIGGERS_PROCESSED" as const, actor };
    const story = collectTriggeredEffectsV2(boosted, [end]).find((item) => item.effectId === "god-of-stories-loki")!;
    expect(story.targeting?.choices).toContain(target);
    const cleared = applyAtomicOperationsV2(boosted, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "god-of-stories-loki")!.buildOperations(boosted, actor, loki, [target]), loki).state;
    expect(cleared.players[enemy].retreat).toContain(target);
  });

  it("原初变种把先锋 R 变为 3；混沌灵视结附后只允许攻击敌方 Lv6 角色", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const attacker = place(game, actor, "vanguard", "ATTACKER", { range: 4 });
    place(game, actor, "rear", "BP01-097");
    expect(effectiveValueV2(game, attacker, "range")).toBe(3);
    const witch = place(game, enemy, "retreat", "BP01-098");
    const lv5 = place(game, enemy, "vanguard", "LV5", { level: 5 });
    const lv6 = place(game, enemy, "rear", "LV6", { level: 6 });
    const attached = applyAtomicOperationsV2(game, [{ kind: "ATTACH", cardId: witch, hostCardId: attacker, sourceCardId: witch }], witch).state;
    attached.flow = { kind: "BATTLE_ATTACK", actor, zone: "vanguard", attackerId: attacker };
    attached.battle = { order: ["vanguard", "flankLeft", "flankRight", "rear"], cursor: 0, attackerId: attacker, target: null, attackedCardIds: [], priorityPlayer: null, consecutivePasses: 0, responseSummoned: [false, false] };
    const blocked = executeCommandV2(attached, { actor, expectedRevision: attached.revision, command: { type: "DECLARE_ATTACK", attackerId: attacker, target: { kind: "character", cardId: lv5 } } });
    const allowed = executeCommandV2(attached, { actor, expectedRevision: attached.revision, command: { type: "DECLARE_ATTACK", attackerId: attacker, target: { kind: "character", cardId: lv6 } } });
    expect(blocked.ok).toBe(false);
    expect(allowed.ok).toBe(true);
  });

  it("舍身取义、我身作盾与皮姆箭按各自支付链完整处理", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const sacrifice = place(game, actor, "retreat", "BP01-095");
    const low = place(game, enemy, "vanguard", "LOW", { level: 3 });
    const discarded = { type: "CARDS_DISCARDED" as const, cardIds: [sacrifice] };
    const sacrificeCandidate = collectTriggeredEffectsV2(game, [discarded]).find((item) => item.effectId === "sacrifice-for-justice-captain")!;
    const moved = applyAtomicOperationsV2(game, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "sacrifice-for-justice-captain")!.buildOperations(game, actor, sacrifice, [low]), sacrifice).state;
    expect(sacrificeCandidate.optional).toBe(true);
    expect(moved.players[enemy].baseCards).toContain(low);

    const shield = place(moved, actor, "base", "BP01-096");
    const captain = place(moved, actor, "vanguard", "CAPTAIN", { name: "美国队长·同伴" });
    const handCost = place(moved, actor, "hand", "HAND-COST");
    const shieldEffect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "body-as-shield-captain")!;
    const swapped = applyAtomicOperationsV2(moved, shieldEffect.buildOperations(moved, actor, shield, [handCost, captain]), shield).state;
    expect(swapped.players[actor].field.vanguard).toEqual([shield]);
    expect(swapped.players[actor].baseCards).toContain(captain);

    const arrow = place(swapped, actor, "rear", "BP01-099");
    const costA = place(swapped, actor, "hand", "COST-A"); const costB = place(swapped, actor, "hand", "COST-B");
    const enemyTarget = place(swapped, enemy, "rear", "ENEMY-TARGET", { level: 4 });
    const arrowEffect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "pym-arrow-hawkeye")!;
    const banished = applyAtomicOperationsV2(swapped, arrowEffect.buildOperations(swapped, actor, arrow, [costA, costB, enemyTarget]), arrow).state;
    expect(banished.players[actor].void).toContain(arrow);
    expect(banished.players[enemy].void).toContain(enemyTarget);
  });
});

describe("BP01-100～108 绿色战术效果", () => {
  it("9 张卡均有实施记录，本段 12 个起动/触发效果进入注册表", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-10[0-8]$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-(?:0(?:0[1-9]|[1-9][0-9])|10[0-8])$/.test(item.cardNo))).toHaveLength(97);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-10[0-8]$/.test(item.cardNo))).toHaveLength(12);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-(?:0(?:0[1-9]|[1-9][0-9])|10[0-8])$/.test(item.cardNo))).toHaveLength(97);
  });

  it("听声缴械应对入场后令敌方场上角色本回合 R-1", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const source = place(game, actor, "vanguard", "BP01-100");
    const target = place(game, enemy, "base", "TARGET", { range: 3 });
    const event = { type: "CHARACTER_PLACED" as const, actor, cardId: source, destination: "vanguard" as const, placementKind: "summon" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "sound-disarm-daredevil")!;
    const resolved = applyAtomicOperationsV2(game, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "sound-disarm-daredevil")!.buildOperations(game, actor, source, [target]), source).state;
    expect(candidate.targeting?.choices).toContain(target);
    expect(effectiveValueV2(resolved, target, "range")).toBe(2);
  });

  it("分导箭以撤退基地卡数量作为原本 Lv，随后可选手牌角色直接放进空战区", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const source = place(game, actor, "rear", "BP01-101");
    const baseA = place(game, actor, "base", "BASE-A"); const baseB = place(game, actor, "covered", "BASE-B");
    const role = place(game, actor, "hand", "ORIGINAL-LV2", { level: 2 });
    const attack = { type: "ATTACK_DECLARED" as const, actor: enemy, attackerId: "ATTACKER", target: { kind: "breach" as const, zone: "vanguard" as const } };
    const costCandidate = collectTriggeredEffectsV2(game, [attack]).find((item) => item.effectId === "split-arrow-retreat-base")!;
    const retreated = applyAtomicOperationsV2(game, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "split-arrow-retreat-base")!.buildOperations(game, actor, source, [baseA, baseB]), source);
    const placeCandidate = collectTriggeredEffectsV2(retreated.state, retreated.events).find((item) => item.effectId === "split-arrow-place")!;
    const placed = applyAtomicOperationsV2(retreated.state, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "split-arrow-place")!.buildOperations(retreated.state, actor, source, [role, "zone:vanguard"]), source).state;
    expect(costCandidate.optional).toBe(true);
    expect(placeCandidate.targeting?.choices).toContain(role);
    expect(placed.players[actor].field.vanguard).toEqual([role]);
  });

  it("量子坍塌先裁剪自身再裁剪敌方低阶基地角色；战术恐吓响应自身战基移动", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const antMan = place(game, actor, "retreat", "BP01-102");
    const lowBase = place(game, enemy, "base", "LOW-BASE", { level: 3 });
    const retreat = { type: "CARDS_RETREATED" as const, cardIds: [antMan], reason: "battle" as const, fromFieldCardIds: [antMan] };
    const self = collectTriggeredEffectsV2(game, [retreat]).find((item) => item.effectId === "quantum-collapse-self")!;
    const banishedSelf = applyAtomicOperationsV2(game, self.operations, antMan);
    const collapse = collectTriggeredEffectsV2(banishedSelf.state, banishedSelf.events).find((item) => item.effectId === "quantum-collapse-enemy-base")!;
    const collapsed = applyAtomicOperationsV2(banishedSelf.state, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "quantum-collapse-enemy-base")!.buildOperations(banishedSelf.state, actor, antMan, [lowBase]), antMan).state;
    expect(collapsed.players[actor].void).toContain(antMan);
    expect(collapsed.players[enemy].void).toContain(lowBase);

    const soldier = place(collapsed, actor, "base", "BP01-103");
    const enemyVanguard = place(collapsed, enemy, "vanguard", "ENEMY-VANGUARD");
    const moveEvent = { type: "BATTLE_BASE_MOVED" as const, actor, cardId: soldier, from: "vanguard" as const, destination: "base" as const };
    const intimidate = collectTriggeredEffectsV2(collapsed, [moveEvent]).find((item) => item.effectId === "tactical-intimidation-winter-soldier")!;
    const moved = applyAtomicOperationsV2(collapsed, intimidate.operations, soldier).state;
    expect(moved.players[enemy].field.rear).toEqual([enemyVanguard]);
  });

  it("时光倒流把双方同 Lv 角色移回各自卡组顶，另一起动可将撤退角色回底", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const witch = place(game, actor, "retreat", "BP01-104");
    const own = place(game, actor, "vanguard", "OWN", { level: 4 }); const enemyRole = place(game, enemy, "vanguard", "ENEMY", { level: 4 });
    const discard = { type: "CARDS_DISCARDED" as const, cardIds: [witch] };
    const candidate = collectTriggeredEffectsV2(game, [discard]).find((item) => item.effectId === "rewind-witch-pair")!;
    const rewound = applyAtomicOperationsV2(game, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "rewind-witch-pair")!.buildOperations(game, actor, witch, [own, enemyRole]), witch).state;
    expect(candidate.optional).toBe(true);
    expect(rewound.players[actor].deck[0]).toBe(own);
    expect(rewound.players[enemy].deck[0]).toBe(enemyRole);

    const fieldWitch = place(rewound, actor, "rear", "BP01-104"); const retreatCard = place(rewound, actor, "retreat", "RETREAT-CARD");
    const bottom = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "rewind-witch-bottom")!;
    const returned = applyAtomicOperationsV2(rewound, bottom.buildOperations(rewound, actor, fieldWitch, [retreatCard]), fieldWitch).state;
    expect(returned.players[actor].deck.at(-1)).toBe(retreatCard);
  });

  it("精神同步增幅攻击者；搜寻战友支付绿色手牌后抽 2", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const panther = place(game, actor, "base", "BP01-105");
    const attacker = place(game, actor, "vanguard", "ATTACKER", { power: 3000 }); const target = place(game, enemy, "vanguard", "TARGET", { power: 5000 });
    const attack = { type: "ATTACK_DECLARED" as const, actor, attackerId: attacker, target: { kind: "character" as const, cardId: target } };
    const sync = collectTriggeredEffectsV2(game, [attack]).find((item) => item.effectId === "mind-sync-panther")!;
    const boosted = applyAtomicOperationsV2(game, sync.operations, panther).state;
    expect(effectiveValueV2(boosted, attacker, "power")).toBe(4000);

    const falcon = place(boosted, actor, "rear", "BP01-106"); const green = place(boosted, actor, "hand", "GREEN", { attribute: 4 });
    const handBefore = boosted.players[actor].hand.length;
    const search = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "search-comrade-falcon")!;
    const drawn = applyAtomicOperationsV2(boosted, search.buildOperations(boosted, actor, falcon, [green]), falcon).state;
    expect(drawn.players[actor].retreat).toContain(green);
    expect(drawn.players[actor].hand).toHaveLength(handBefore + 1);
  });

  it("自由威光同时提供敌方压制与自身盖放；安全气囊箭支付后盖放卡组顶 2 张", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const captain = place(game, actor, "vanguard", "BP01-107", { attribute: 4, power: 9000 });
    const enemyRole = place(game, enemy, "vanguard", "ENEMY", { level: 4, power: 3000 });
    expect(effectiveValueV2(game, enemyRole, "power")).toBe(2500);
    game.players[actor].field.vanguard = []; game.players[actor].retreat.push(captain);
    const discarded = { type: "CARDS_DISCARDED" as const, cardIds: [captain] };
    const cover = collectTriggeredEffectsV2(game, [discarded]).find((item) => item.effectId === "freedom-glory-cover")!;
    const covered = applyAtomicOperationsV2(game, cover.operations, captain).state;
    expect(covered.players[actor].baseCovered).toContain(captain);

    const arrow = place(covered, actor, "base", "BP01-108"); const cost = place(covered, actor, "hand", "AVENGER", { features: ["复仇者联盟"] });
    const top = covered.players[actor].deck.slice(0, 2);
    const airbag = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "airbag-arrow-hawkeye")!;
    const supplied = applyAtomicOperationsV2(covered, airbag.buildOperations(covered, actor, arrow, [cost]), arrow).state;
    expect(supplied.players[actor].baseCovered).toEqual(expect.arrayContaining([captain, ...top]));
  });
});

describe("BP01-109～117 绿色位移效果", () => {
  it("9 张卡均有实施记录，本段 8 个起动/触发效果进入注册表", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-1(?:0[9]|1[0-7])$/.test(item.cardNo))).toHaveLength(9);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-(?:0\d\d|1(?:0\d|1[0-7]))$/.test(item.cardNo))).toHaveLength(105);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-1(?:0[9]|1[0-7])$/.test(item.cardNo))).toHaveLength(8);
    expect(effectRegistrySnapshotV2().filter((item) => /^BP01-(?:0\d\d|1(?:0\d|1[0-7]))$/.test(item.cardNo))).toHaveLength(105);
  });

  it("听声辨位由敌方本人选择其手牌盖放，而效果归属仍保持来源控制者", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const source = place(game, actor, "vanguard", "BP01-109");
    const enemyHand = game.players[enemy].hand[0];
    const event = { type: "CHARACTER_PLACED" as const, actor, cardId: source, destination: "vanguard" as const, placementKind: "effect" as const };
    const candidates = collectTriggeredEffectsV2(game, [event]).filter((item) => item.effectId === "sound-location-daredevil");
    const prepared = prepareEffectResolutionV2(game, candidates);
    expect(candidates[0].controller).toBe(actor);
    expect(prepared.state.decision?.actor).toBe(enemy);
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "sound-location-daredevil")!;
    const covered = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [enemyHand]), source).state;
    expect(covered.players[enemy].baseCovered).toContain(enemyHand);
  });

  it("谎言之神空战区时基地 Lv 变为 5；诡计之神降低敌方后卫 Lv；先祖赐福按颜色增 R", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const loki = place(game, actor, "base", "BP01-110", { level: 1 });
    expect(effectiveValueV2(game, loki, "level")).toBe(5);
    place(game, actor, "base", "BP01-115");
    const rear = place(game, enemy, "rear", "ENEMY-REAR", { level: 4 });
    expect(effectiveValueV2(game, rear, "level")).toBe(2);
    const blessing = place(game, actor, "flankLeft", "BP01-117", { attribute: 4 });
    const ownVanguard = place(game, actor, "vanguard", "OWN-VANGUARD", { range: 1 });
    place(game, enemy, "vanguard", "ENEMY-VANGUARD", { attribute: 1 });
    expect(blessing).toBeTruthy();
    expect(effectiveValueV2(game, ownVanguard, "range")).toBe(2);
  });

  it("量子门从场上撤退后裁剪自身，再让我方角色进行一次合法战基移动", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "retreat", "BP01-111");
    const mover = place(game, actor, "vanguard", "MOVER");
    const event = { type: "CARDS_RETREATED" as const, cardIds: [source], reason: "battle" as const, fromFieldCardIds: [source] };
    const banish = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "quantum-gate-banish")!;
    const banished = applyAtomicOperationsV2(game, banish.operations, source);
    const move = collectTriggeredEffectsV2(banished.state, banished.events).find((item) => item.effectId === "quantum-gate-move")!;
    const moved = applyAtomicOperationsV2(banished.state, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "quantum-gate-move")!.buildOperations(banished.state, actor, source, [mover, "zone:base"]), source).state;
    expect(move.targeting?.choices).toContain("zone:base");
    expect(moved.players[actor].void).toContain(source);
    expect(moved.players[actor].baseCards).toContain(mover);
  });

  it("漆黑笼罩撤退敌方盖卡；突如其来在敌方后卫攻击时移动自身", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const daredevil = place(game, actor, "vanguard", "BP01-112");
    const covered = place(game, enemy, "covered", "COVER");
    const placedEvent = { type: "CHARACTER_PLACED" as const, actor, cardId: daredevil, destination: "vanguard" as const, placementKind: "effect" as const };
    const shroud = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "black-shroud-daredevil")!;
    const retreated = applyAtomicOperationsV2(game, shroud.buildOperations(game, actor, daredevil, [covered]), daredevil).state;
    expect(retreated.players[enemy].retreat).toContain(covered);

    const falcon = place(retreated, actor, "base", "BP01-113");
    const enemyRear = place(retreated, enemy, "rear", "ENEMY-REAR");
    const attack = { type: "ATTACK_DECLARED" as const, actor: enemy, attackerId: enemyRear, target: { kind: "breach" as const, zone: "rear" as const } };
    const sudden = collectTriggeredEffectsV2(retreated, [attack]).find((item) => item.effectId === "sudden-falcon")!;
    const moved = applyAtomicOperationsV2(retreated, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "sudden-falcon")!.buildOperations(retreated, actor, falcon, ["zone:rear"]), falcon).state;
    expect(sudden.optional).toBe(true);
    expect(moved.players[actor].field.rear).toEqual([falcon]);
  });

  it("打带跑响应自身战基移动压制敌方角色", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const soldier = place(game, actor, "rear", "BP01-114");
    const target = place(game, enemy, "vanguard", "TARGET", { power: 3000 });
    const event = { type: "BATTLE_BASE_MOVED" as const, actor, cardId: soldier, from: "base" as const, destination: "rear" as const };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "hit-and-run-winter-soldier")!;
    const reduced = applyAtomicOperationsV2(game, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "hit-and-run-winter-soldier")!.buildOperations(game, actor, soldier, [target]), soldier).state;
    expect(candidate.targeting?.choices).toContain(target);
    expect(effectiveValueV2(reduced, target, "power")).toBe(2000);
  });

  it("殿后撤离先把我方角色移入基地，再通过来源事件让猎鹰完成战基移动", () => {
    const game = state(); const actor = game.activePlayer; const enemy = opponent(actor);
    const falcon = place(game, actor, "base", "BP01-116");
    const ally = place(game, actor, "vanguard", "ALLY");
    const enemyFlank = place(game, enemy, "flankLeft", "ENEMY-FLANK");
    const attack = { type: "ATTACK_DECLARED" as const, actor: enemy, attackerId: enemyFlank, target: { kind: "breach" as const, zone: "flankLeft" as const } };
    const first = collectTriggeredEffectsV2(game, [attack]).find((item) => item.effectId === "rear-guard-evacuation-base")!;
    const based = applyAtomicOperationsV2(game, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "rear-guard-evacuation-base")!.buildOperations(game, actor, falcon, [ally]), falcon);
    const second = collectTriggeredEffectsV2(based.state, based.events).find((item) => item.effectId === "rear-guard-evacuation-move")!;
    const moved = applyAtomicOperationsV2(based.state, PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "rear-guard-evacuation-move")!.buildOperations(based.state, actor, falcon, ["zone:vanguard"]), falcon).state;
    expect(first.optional).toBe(true);
    expect(second.targeting?.choices).toContain("zone:vanguard");
    expect(moved.players[actor].field.vanguard).toEqual([falcon]);
    expect(moved.players[actor].baseCards).toContain(ally);
  });
});

describe("BP01-118～120 终批移动与区域效果", () => {
  it("3 张卡均有实施记录，新增 5 个触发效果并完成 BP01 全注册", () => {
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^BP01-1(?:18|19|20)$/.test(item.cardNo))).toHaveLength(3);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2.filter((item) => /^BP01-1(?:18|19|20)$/.test(item.cardNo))).toHaveLength(5);
    expect(PROMO_EFFECT_DEFINITIONS_BP01_V2).toHaveLength(110);
    expect(effectRegistrySnapshotV2()).toHaveLength(110);
  });

  it("「跑带搜」完成战基移动后抽 1 张，再明确选择 1 张手牌舍弃", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "vanguard", "BP01-118");
    const event = { type: "BATTLE_BASE_MOVED" as const, actor, cardId: source, from: "base" as const, destination: "vanguard" as const };
    const draw = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "run-search-draw")!;
    const drew = applyAtomicOperationsV2(game, draw.operations, source);
    const followup = collectTriggeredEffectsV2(drew.state, drew.events).find((item) => item.effectId === "run-search-discard")!;
    const discardedCard = followup.targeting!.choices[0];
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "run-search-discard")!;
    const resolved = applyAtomicOperationsV2(drew.state, effect.buildOperations(drew.state, actor, source, [discardedCard]), source).state;
    expect(resolved.players[actor].retreat).toContain(discardedCard);
  });

  it("「公平正义」被效果舍弃后，可与场上 Lv6 角色互换位置", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "retreat", "BP01-119");
    const target = place(game, actor, "vanguard", "LV6", { level: 6 });
    const event = { type: "CARDS_DISCARDED" as const, cardIds: [source] };
    const candidate = collectTriggeredEffectsV2(game, [event]).find((item) => item.effectId === "fair-justice-captain")!;
    const effect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "fair-justice-captain")!;
    const resolved = applyAtomicOperationsV2(game, effect.buildOperations(game, actor, source, [target]), source).state;
    expect(candidate.optional).toBe(true);
    expect(resolved.players[actor].field.vanguard).toEqual([source]);
    expect(resolved.players[actor].retreat).toContain(target);
  });

  it("「量子隧穿」从场上撤退后先裁剪自身，再将虚空中原本 Lv3 的非蚁人角色放回卡组顶", () => {
    const game = state(); const actor = game.activePlayer;
    const source = place(game, actor, "retreat", "BP01-120");
    const target = place(game, actor, "void", "OTHER-LV3", { name: "黄蜂女", level: 3 });
    const retreatEvent = { type: "CARDS_RETREATED" as const, cardIds: [source], reason: "effect" as const, fromFieldCardIds: [source] };
    const banish = collectTriggeredEffectsV2(game, [retreatEvent]).find((item) => item.effectId === "quantum-tunneling-banish")!;
    const banished = applyAtomicOperationsV2(game, banish.operations, source);
    const returnEffect = PROMO_EFFECT_DEFINITIONS_BP01_V2.find((item) => item.effectId === "quantum-tunneling-return")!;
    const returned = applyAtomicOperationsV2(banished.state, returnEffect.buildOperations(banished.state, actor, source, [target]), source).state;
    expect(banished.state.players[actor].void).toContain(source);
    expect(returned.players[actor].deck[0]).toBe(target);
  });
});

function opponent(actor: PlayerIndex): PlayerIndex { return actor === 0 ? 1 : 0; }
