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
  executeAuthoritativeCommandV2,
  executeCommandV2,
  prepareEffectResolutionV2,
  projectBattleViewV2,
  registerStarterEffectsSd03Sd04V2,
  registerStarterEffectsV2,
  STARTER_EFFECT_DEFINITIONS_SD03_SD04_V2,
} from "../index";
import type { CreateGameInputV2, FieldZoneV2, GameStateV2, PlayerIndex } from "../index";

function definition(id: string, type: 1 | 2): Card {
  return { id, card_no: id, name: id, card_type: type, card_type_name: "测试", cost: 1, cost_name: "Lv1", attribute: 1, attribute_name: "红", attribute_color: "#d33", pp_value: null, dp_value: null, power: type === 1 ? "1000" : null, signal_color: null, signal_color_text: null, feature: null, feature_text: null, effect: "", package: "TEST", package_short: "T", rarity: 1, rarity_code: "C", rarity_cn: "普通", rarity_color: "#000", image_url: `/cards/${id}.png`, r: 1 };
}

function fixtureInput(): CreateGameInputV2 {
  const main0 = Array.from({ length: 50 }, (_, i) => `A-${i}`);
  const main1 = Array.from({ length: 50 }, (_, i) => `B-${i}`);
  const rush0 = Array.from({ length: 9 }, (_, i) => `AR-${i}`);
  const rush1 = Array.from({ length: 9 }, (_, i) => `BR-${i}`);
  return { matchId: "sd03-sd04", seed: "sd03-sd04", cardDefinitions: [...main0.map((id) => definition(id, 1)), ...main1.map((id) => definition(id, 1)), ...rush0.map((id) => definition(id, 2)), ...rush1.map((id) => definition(id, 2))], players: [{ name: "A", mainDeck: main0, rushDeck: rush0 }, { name: "B", mainDeck: main1, rushDeck: rush1 }] };
}

function state(): GameStateV2 {
  const result = createGameV2(fixtureInput());
  return { ...structuredClone(result), status: "playing", flow: { kind: "ACTION", actor: result.firstPlayer }, decision: null };
}

type Zone = "hand" | "base" | "covered" | "retreat" | FieldZoneV2;
function place(s: GameStateV2, actor: PlayerIndex, zone: Zone, cardNo: string, options: Partial<{ level: number; range: number; power: number; attribute: number; features: string[] }> = {}): string {
  const cardId = s.players[actor].deck.shift()!;
  Object.assign(s.cards[cardId], { cardNo, ...options });
  if (zone === "hand") s.players[actor].hand.push(cardId);
  else if (zone === "base") s.players[actor].baseCards.push(cardId);
  else if (zone === "covered") s.players[actor].baseCovered.push(cardId);
  else if (zone === "retreat") s.players[actor].retreat.push(cardId);
  else s.players[actor].field[zone].push(cardId);
  return cardId;
}

beforeEach(() => {
  clearEffectRegistryForTestsV2();
  registerStarterEffectsV2();
  registerStarterEffectsSd03Sd04V2();
});
afterEach(() => clearEffectRegistryForTestsV2());

describe("SD03/SD04 规则 1.02 卡效", () => {
  it("36 张角色逐卡建立完整记录，28 个非纯持续效果进入注册表", () => {
    const records = CARD_IMPLEMENTATIONS_V2.filter((item) => /^SD0[34]-/.test(item.cardNo));
    expect(records).toHaveLength(36);
    expect(new Set(records.map((item) => item.cardNo)).size).toBe(36);
    expect(records.every((item) => item.ruleRefs.length > 0 && item.effectIds.length > 0 && item.tests.includes("starter-effects-sd03-sd04.test.ts"))).toBe(true);
    expect(STARTER_EFFECT_DEFINITIONS_SD03_SD04_V2).toHaveLength(28);
    expect(effectRegistrySnapshotV2().filter((item) => /^SD0[34]-/.test(item.cardNo))).toHaveLength(28);
  });

  it("SD03/SD04 常驻替换和增减按实时场面重算", () => {
    const s = state();
    const actor = s.activePlayer;
    const enemy = (actor === 0 ? 1 : 0) as PlayerIndex;
    const rear = place(s, actor, "rear", "SD03-004", { level: 3, range: 1 });
    expect(effectiveValueV2(s, rear, "range")).toBe(3);
    s.players[actor].field.rear = [];
    s.players[actor].baseCards.push(rear);
    expect(effectiveValueV2(s, rear, "level")).toBe(4);

    const host = place(s, actor, "vanguard", "HOST", { range: 5, power: 2000 });
    const entangle = place(s, actor, "hand", "SD03-016");
    s.players[actor].hand = s.players[actor].hand.filter((id) => id !== entangle);
    s.attachments[host] = [entangle];
    expect(effectiveValueV2(s, host, "range")).toBe(1);
    const loki = place(s, actor, "hand", "SD04-001");
    s.players[actor].hand = s.players[actor].hand.filter((id) => id !== loki);
    s.attachments[host].push(loki);
    expect(effectiveValueV2(s, host, "range")).toBe(0);
    expect(effectiveValueV2(s, host, "power")).toBe(3000);

    const enemyRear = place(s, enemy, "rear", "ENEMY", { level: 4 });
    place(s, actor, "base", "SD04-016");
    expect(effectiveValueV2(s, enemyRear, "level")).toBe(2);
  });

  it("高等级号召支付统一读取素材有效等级，基地的「壁影寒光」按 Lv4 支付", () => {
    const s = state();
    const actor = s.activePlayer;
    const panther = place(s, actor, "base", "SD03-004", { level: 3 });
    const summon = place(s, actor, "hand", "LV4-SUMMON", { level: 4 });
    expect(effectiveValueV2(s, panther, "level")).toBe(4);
    const requested = executeCommandV2(s, { actor, commandId: "summon-effective-payment", expectedRevision: s.revision, command: { type: "SUMMON_CHARACTER", cardId: summon, destination: "rear" } });
    expect(requested.ok).toBe(true);
    if (!requested.ok || requested.state.decision?.kind !== "SUMMON_PAYMENT") return;
    expect(requested.state.decision.choices).toContain(panther);
    const paid = executeCommandV2(requested.state, { actor, commandId: "pay-effective-level", expectedRevision: requested.state.revision, command: { type: "ANSWER_DECISION", decisionId: requested.state.decision.id, cardIds: [panther] } });
    expect(paid.ok).toBe(true);
    if (!paid.ok || paid.state.decision?.kind !== "SUMMON_DESTINATION") return;
    expect(paid.state.players[actor].baseCards).not.toContain(panther);
    expect(paid.state.decision.choices).toContain("zone:rear");
    const placed = executeCommandV2(paid.state, { actor, commandId: "place-effective-level", expectedRevision: paid.state.revision, command: { type: "ANSWER_DECISION", decisionId: paid.state.decision.id, cardIds: ["zone:rear"] } });
    expect(placed.ok).toBe(true);
    if (placed.ok) expect(placed.state.players[actor].field.rear).toContain(summon);
  });

  it("「天降正义」确认发动后只选择战区，点击位置立即入场", () => {
    const s = state();
    const actor = s.activePlayer;
    const source = place(s, actor, "hand", "SD03-010", { level: 6 });
    const effect = STARTER_EFFECT_DEFINITIONS_SD03_SD04_V2.find((item) => item.effectId === "justice-from-above")!;
    const targeting = effect.targeting!(s, actor, source);
    expect(targeting.choiceKind).toBe("field_location");
    expect(targeting.min).toBe(1);
    expect(targeting.choices).not.toContain(source);
    expect(targeting.choices).toContain("zone:rear");
    expect(effect.validateTargets?.(s, actor, source, ["zone:rear"])).toBeNull();
    const placed = applyAtomicOperationsV2(s, effect.buildOperations(s, actor, source, ["zone:rear"]));
    expect(placed.state.players[actor].field.rear).toContain(source);
    expect(placed.state.players[actor].hand).not.toContain(source);
  });

  it("共用原子支持回手、效果战基移动和场上/撤退区替换", () => {
    let s = state();
    const actor = s.activePlayer;
    const baseRole = place(s, actor, "base", "MOVER");
    const moved = applyAtomicOperationsV2(s, [{ kind: "MOVE_BATTLE_BASE", cardId: baseRole, destination: "rear" }]);
    expect(moved.trace[0].succeeded).toBe(true);
    expect(moved.state.players[actor].field.rear).toEqual([baseRole]);
    expect(moved.state.usage.enteredThisTurn).not.toContain(baseRole);
    expect(moved.state.usage.movedCardIds).toContain(baseRole);

    s = moved.state;
    const host = place(s, actor, "vanguard", "HOST");
    const attached = place(s, actor, "hand", "ATTACHED");
    s.players[actor].hand = s.players[actor].hand.filter((id) => id !== attached);
    s.attachments[host] = [attached];
    const returned = applyAtomicOperationsV2(s, [{ kind: "RETURN_TO_HAND", cardIds: [host] }]);
    expect(returned.state.players[actor].hand).toEqual(expect.arrayContaining([host, attached]));

    s = returned.state;
    const incoming = place(s, actor, "retreat", "SD04-014");
    const outgoing = place(s, actor, "flankLeft", "LV6", { level: 6 });
    const swapped = applyAtomicOperationsV2(s, [{ kind: "SWAP_POSITIONS", cardIds: [incoming, outgoing] }]);
    expect(swapped.state.players[actor].field.flankLeft).toEqual([incoming]);
    expect(swapped.state.players[actor].retreat).toContain(outgoing);
    expect(swapped.state.usage.enteredThisTurn).toContain(incoming);
  });

  it("SD03-008 精确允许每回合两次并分别记录", () => {
    let s = state();
    const actor = s.activePlayer;
    const source = place(s, actor, "vanguard", "SD03-008");
    const target = place(s, actor, "rear", "TARGET", { power: 1000 });
    const firstBase = place(s, actor, "covered", "BASE-1");
    const secondBase = place(s, actor, "covered", "BASE-2");
    const effect = STARTER_EFFECT_DEFINITIONS_SD03_SD04_V2.find((item) => item.effectId === "freedom-inspiration")!;
    s = applyAtomicOperationsV2(s, effect.buildOperations(s, actor, source, [firstBase, target])).state;
    expect(effect.canActivate?.(s, actor, source)).toBe(true);
    s = applyAtomicOperationsV2(s, effect.buildOperations(s, actor, source, [secondBase, target])).state;
    expect(effect.canActivate?.(s, actor, source)).toBe(false);
    expect(effectiveValueV2(s, target, "power")).toBe(2000);
  });

  it("应对·起动在自己的行动阶段与应对时机共用同一效果入口", () => {
    const s = state();
    const actor = s.activePlayer;
    const source = place(s, actor, "hand", "SD04-001");
    place(s, actor, "vanguard", "HUMAN", { features: ["人类"] });
    const result = executeCommandV2(s, {
      actor,
      commandId: "response-in-action",
      expectedRevision: s.revision,
      command: { type: "ACTIVATE_EFFECT", sourceCardId: source, effectId: "mischief-attach" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.decision?.kind).toBe("EFFECT_TARGETS");
  });

  it("SD03-017「闪光箭」在攻击宣告后的战斗应对窗口可起动并完整处理代价与目标", () => {
    const s = state();
    const attacker = s.activePlayer;
    const responder = (attacker === 0 ? 1 : 0) as PlayerIndex;
    const attackingCard = place(s, attacker, "vanguard", "ATTACKER", { power: 3500 });
    const flashArrow = place(s, responder, "rear", "SD03-017", { power: 500 });
    const avenger = place(s, responder, "hand", "AVENGER", { features: ["人类", "复仇者联盟"] });
    s.flow = { kind: "BATTLE_RESPONSE", actor: attacker, priority: responder };
    s.battle = {
      order: ["flankLeft", "vanguard", "flankRight", "rear"],
      cursor: 1,
      attackerId: attackingCard,
      target: { kind: "breach", zone: "vanguard" },
      attackedCardIds: [attackingCard],
      priorityPlayer: responder,
      consecutivePasses: 0,
      responseSummoned: [false, false],
    };

    const responderView = projectBattleViewV2(s, responder, "flash-arrow-response");
    expect(responderView.legalActions).toContainEqual({
      type: "ACTIVATE_EFFECT",
      sourceCardId: flashArrow,
      effectIds: ["flash-arrow"],
    });

    const activated = executeCommandV2(s, {
      actor: responder,
      commandId: "flash-arrow-activate",
      expectedRevision: s.revision,
      command: { type: "ACTIVATE_EFFECT", sourceCardId: flashArrow, effectId: "flash-arrow" },
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok || activated.state.decision?.kind !== "EFFECT_TARGETS") return;
    expect(activated.state.decision.choices).toEqual(expect.arrayContaining([avenger, attackingCard]));

    const resolved = executeCommandV2(activated.state, {
      actor: responder,
      commandId: "flash-arrow-targets",
      expectedRevision: activated.state.revision,
      command: { type: "ANSWER_DECISION", decisionId: activated.state.decision.id, cardIds: [avenger, attackingCard] },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.players[responder].retreat).toContain(avenger);
    expect(effectiveValueV2(resolved.state, attackingCard, "power")).toBe(2500);
    expect(resolved.state.flow).toEqual({ kind: "BATTLE_RESPONSE", actor: attacker, priority: attacker });
  });

  it("SD04-018 先抽牌，再从包含新抽卡的完整手牌中发起舍弃选择", () => {
    const s = state();
    const actor = s.activePlayer;
    const source = place(s, actor, "vanguard", "SD04-018");
    const oldHand = [...s.players[actor].hand];
    const top = s.players[actor].deck[0];
    const candidates = collectTriggeredEffectsV2(s, [{ type: "BATTLE_BASE_MOVED", actor, cardId: source, from: "base", destination: "vanguard" }]);
    const drawn = prepareEffectResolutionV2(s, candidates);
    expect(drawn.state.players[actor].hand).toContain(top);
    const followups = collectTriggeredEffectsV2(drawn.state, drawn.events);
    expect(followups).toHaveLength(1);
    expect(followups[0].effectId).toBe("run-and-search-discard");
    expect(followups[0].targeting?.choices).toEqual(expect.arrayContaining([...oldHand, top]));
  });

  it("SD03-018 先从撤退区裁剪角色，再单独选择场上角色进行战基移动", () => {
    const s = state();
    const actor = s.activePlayer;
    place(s, actor, "vanguard", "SD03-018");
    const retreatRole = place(s, actor, "retreat", "RETREAT-ROLE");
    const mover = place(s, actor, "base", "MOVER");
    const candidates = collectTriggeredEffectsV2(s, [{ type: "END_TRIGGERS_PROCESSED", actor }]);
    expect(candidates.map((item) => item.effectId)).toEqual(["void-exile-banish"]);
    let current = prepareEffectResolutionV2(s, candidates).state;
    expect(current.decision?.kind).toBe("OPTIONAL_EFFECT");
    if (current.decision?.kind !== "OPTIONAL_EFFECT") return;

    let result = executeAuthoritativeCommandV2(current, { actor, commandId: "void-exile-resolve", expectedRevision: current.revision, command: { type: "ANSWER_DECISION", decisionId: current.decision.id, cardIds: ["resolve"] } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    current = result.state;
    expect(current.decision?.kind).toBe("EFFECT_TARGETS");
    if (current.decision?.kind !== "EFFECT_TARGETS") return;
    expect(current.decision.choices).toEqual([retreatRole]);
    expect(current.decision.prompt).toContain("打开撤退区");

    result = executeAuthoritativeCommandV2(current, { actor, commandId: "void-exile-banish", expectedRevision: current.revision, command: { type: "ANSWER_DECISION", decisionId: current.decision.id, cardIds: [retreatRole] } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    current = result.state;
    expect(current.players[actor].void).toContain(retreatRole);
    expect(current.decision?.kind).toBe("EFFECT_TARGETS");
    if (current.decision?.kind !== "EFFECT_TARGETS") return;
    expect(current.decision.choices).toContain(mover);
    expect(current.decision.choices).toContain("zone:rear");
    expect(current.decision.choices).not.toContain(retreatRole);

    result = executeAuthoritativeCommandV2(current, { actor, commandId: "void-exile-move", expectedRevision: current.revision, command: { type: "ANSWER_DECISION", decisionId: current.decision.id, cardIds: [mover, "zone:rear"] } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[actor].field.rear).toContain(mover);
    expect(result.state.decision).toBeNull();
  });
});
