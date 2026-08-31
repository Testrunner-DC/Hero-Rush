import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Card } from "../../types/card";
import {
  applyAtomicOperationsV2,
  CARD_IMPLEMENTATIONS_V2,
  clearEffectRegistryForTestsV2,
  collectTriggeredEffectsV2,
  createGameV2,
  effectiveKeywordsV2,
  effectiveValueV2,
  effectRegistrySnapshotV2,
  executeAuthoritativeCommandV2,
  getEffectV2,
  hashStateV2,
  prepareEffectResolutionV2,
  preventsTieRetreatV2,
  projectBattleViewV2,
  registerStarterEffectsV2,
  STARTER_EFFECT_DEFINITIONS_V2,
} from "../index";
import type { CreateGameInputV2, FieldZoneV2, GameCommandV2, GameStateV2, PlayerIndex } from "../index";

function definition(id: string, type: 1 | 2): Card {
  return {
    id, card_no: id, name: id, card_type: type, card_type_name: "测试", cost: 1, cost_name: "Lv1",
    attribute: 1, attribute_name: "红", attribute_color: "#d33", pp_value: null, dp_value: null,
    power: type === 1 ? "1000" : null, signal_color: null, signal_color_text: null,
    feature: null, feature_text: null, effect: "", package: "TEST", package_short: "T",
    rarity: 1, rarity_code: "C", rarity_cn: "普通", rarity_color: "#000", image_url: `/cards/${id}.png`, r: 1,
  };
}

function fixtureInput(): CreateGameInputV2 {
  const main0 = Array.from({ length: 50 }, (_, index) => `A-${index}`);
  const main1 = Array.from({ length: 50 }, (_, index) => `B-${index}`);
  const rush0 = Array.from({ length: 9 }, (_, index) => `AR-${index}`);
  const rush1 = Array.from({ length: 9 }, (_, index) => `BR-${index}`);
  return {
    matchId: "starter-effects", seed: "starter-effects",
    cardDefinitions: [...main0.map((id) => definition(id, 1)), ...main1.map((id) => definition(id, 1)), ...rush0.map((id) => definition(id, 2)), ...rush1.map((id) => definition(id, 2))],
    players: [{ name: "A", mainDeck: main0, rushDeck: rush0 }, { name: "B", mainDeck: main1, rushDeck: rush1 }],
  };
}

function submit(state: GameStateV2, actor: PlayerIndex, command: GameCommandV2) {
  return executeAuthoritativeCommandV2(state, { actor, commandId: `starter-${state.revision}`, expectedRevision: state.revision, command });
}

function actionState(): GameStateV2 {
  let state = createGameV2(fixtureInput());
  for (let index = 0; index < 2; index += 1) {
    const actor = state.decision?.actor;
    if (actor === undefined) throw new Error("missing mulligan");
    const result = submit(state, actor, { type: "SUBMIT_MULLIGAN", cardIds: [] });
    if (!result.ok) throw new Error(result.message);
    state = result.state;
  }
  return structuredClone(state);
}

type Zone = "hand" | "base" | "covered" | "retreat" | FieldZoneV2;

function place(state: GameStateV2, actor: PlayerIndex, zone: Zone, cardNo: string, options: Partial<{ level: number; range: number; power: number; attribute: number; features: string[] }> = {}): string {
  const player = state.players[actor];
  const id = player.deck.shift();
  if (!id) throw new Error("test deck exhausted");
  Object.assign(state.cards[id], { cardNo, ...options });
  if (zone === "hand") player.hand.push(id);
  else if (zone === "base") player.baseCards.push(id);
  else if (zone === "covered") player.baseCovered.push(id);
  else if (zone === "retreat") player.retreat.push(id);
  else player.field[zone].push(id);
  return id;
}

function attach(state: GameStateV2, actor: PlayerIndex, host: string, cardNo: string, options: Partial<{ level: number; range: number; power: number; attribute: number; features: string[] }> = {}): string {
  const id = state.players[actor].deck.shift();
  if (!id) throw new Error("test deck exhausted");
  Object.assign(state.cards[id], { cardNo, ...options });
  state.attachments[host] = [...(state.attachments[host] ?? []), id];
  return id;
}

beforeEach(() => {
  clearEffectRegistryForTestsV2();
  registerStarterEffectsV2();
});
afterEach(() => clearEffectRegistryForTestsV2());

describe("SD01/SD02 规则 1.02 卡效", () => {
  it("每个非纯持续效果都以稳定 ID、规则依据和合法区域登记", () => {
    const expected = {
      "SD01-001": ["attachment-self-destruct"],
      "SD01-002": ["remote-specialization-attach"],
      "SD01-003": ["coordinated-fire"],
      "SD01-005": ["full-call"],
      "SD01-006": ["widows-bite"],
      "SD01-007": ["fire-support"],
      "SD01-009": ["pulse-specialization-attach", "pulse-specialization-recovery", "pulse-specialization-recover-pair"],
      "SD01-010": ["red-room-attach"],
      "SD01-014": ["equal-strike"],
      "SD01-015": ["tear-everything"],
      "SD01-016": ["melee-specialization-attach"],
      "SD01-018": ["farewell-gift"],
      "SD02-002": ["computing-recycle"],
      "SD02-005": ["machine-tide"],
      "SD02-006": ["equivalent-exchange-attach", "equivalent-exchange-detach"],
      "SD02-007": ["rage-out-of-control"],
      "SD02-008": ["machine-load"],
      "SD02-009": ["machine-detonation"],
      "SD02-010": ["machine-recycle"],
      "SD02-011": ["thunder-resonance"],
      "SD02-014": ["underdog"],
      "SD02-015": ["machine-remains-assembly"],
      "SD02-016": ["hunting-instinct"],
      "SD02-017": ["anti-tank"],
    } as const;
    const snapshot = effectRegistrySnapshotV2();
    expect(CARD_IMPLEMENTATIONS_V2.filter((item) => /^SD0[12]-/.test(item.cardNo)).map((item) => item.cardNo).sort()).toEqual([
      ...Array.from({ length: 18 }, (_, index) => `SD01-${String(index + 1).padStart(3, "0")}`),
      ...Array.from({ length: 18 }, (_, index) => `SD02-${String(index + 1).padStart(3, "0")}`),
    ]);
    expect(STARTER_EFFECT_DEFINITIONS_V2).toHaveLength(Object.values(expected).flat().length);
    for (const [cardNo, effectIds] of Object.entries(expected)) {
      expect(snapshot.filter((item) => item.cardNo === cardNo).map((item) => item.effectId).sort()).toEqual([...effectIds].sort());
      expect(snapshot.filter((item) => item.cardNo === cardNo).every((item) => item.ruleRefs.length > 0 && item.sourceZones.length > 0)).toBe(true);
    }
  });

  it("同类持续数值统一实时重算，不缓存过期结果", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const enemy: PlayerIndex = actor === 0 ? 1 : 0;
    const host = place(state, actor, "vanguard", "HOST", { power: 1000, range: 1 });
    attach(state, actor, host, "SD01-002", { level: 1 });
    attach(state, actor, host, "SD01-010", { level: 1 });
    attach(state, actor, host, "SD01-016", { level: 1 });
    expect(effectiveValueV2(state, host, "power")).toBe(4500);
    expect(effectiveValueV2(state, host, "range")).toBe(4);

    const handHulk = place(state, actor, "hand", "SD01-008", { level: 5 });
    expect(effectiveValueV2(state, handHulk, "level")).toBe(3);
    place(state, enemy, "base", "ENEMY-LV4", { level: 4 });
    expect(effectiveValueV2(state, handHulk, "level")).toBe(5);

    const drive = place(state, actor, "rear", "SD02-002", { range: 1 });
    place(state, actor, "covered", "COVER-A");
    place(state, actor, "covered", "COVER-B");
    expect(effectiveValueV2(state, drive, "range")).toBe(3);

    const closeCombat = place(state, actor, "flankLeft", "SD02-018", { power: 4000 });
    const enemyVanguard = place(state, enemy, "vanguard", "ENEMY-VANGUARD", { range: 1 });
    expect(effectiveValueV2(state, closeCombat, "power")).toBe(5500);
    state.cards[enemyVanguard].range = 2;
    expect(effectiveValueV2(state, closeCombat, "power")).toBe(4000);
  });

  it("SD01-008 在手牌成为 Lv3 后按普通 Lv3 直接号召", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const hulk = place(state, actor, "hand", "SD01-008", { level: 5, power: 3500 });
    expect(effectiveValueV2(state, hulk, "level")).toBe(3);

    const summoned = submit(state, actor, { type: "SUMMON_CHARACTER", cardId: hulk, destination: "vanguard" });

    expect(summoned.ok).toBe(true);
    if (!summoned.ok) return;
    expect(summoned.state.decision).toBeNull();
    expect(summoned.state.players[actor].field.vanguard).toContain(hulk);
    expect(summoned.events).toContainEqual(expect.objectContaining({
      type: "CHARACTER_SUMMONED",
      cardId: hulk,
      paymentCardIds: [],
    }));
    expect(effectiveValueV2(summoned.state, hulk, "level")).toBe(5);
  });

  it("SD01-017 连击和 SD02-003 相杀保护均复用官方关键词/判定层", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const thor = place(state, actor, "vanguard", "SD01-017", { power: 5000 });
    expect(effectiveKeywordsV2(state, thor)).toContain("combo");
    expect(projectBattleViewV2(state, actor, hashStateV2(state)).players[actor].field.vanguard[0].gainedKeywords).toContain("combo");
    place(state, actor, "rear", "ALLY");
    expect(effectiveKeywordsV2(state, thor)).not.toContain("combo");

    const panther = place(state, actor, "flankLeft", "SD02-003", { power: 6000 });
    expect(preventsTieRetreatV2(state, panther)).toBe(false);
    state.players[actor].field.flankLeft = [];
    state.players[actor].field.vanguard = [panther];
    expect(preventsTieRetreatV2(state, panther)).toBe(true);
  });

  it("『如此做后』由原子成功门控，前段失败不会错误执行后段", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const source = place(state, actor, "vanguard", "SOURCE");
    const target = place(state, actor, "rear", "TARGET", { power: 2000 });
    const result = applyAtomicOperationsV2(state, [
      { kind: "DISCARD", cardIds: [source] },
      { kind: "ADD_MODIFIER", modifier: { id: "must-not-apply", sourceCardId: source, targetCardId: target, type: "power", value: 1000, duration: "turn" }, requiresPreviousSuccess: true },
    ]);
    expect(result.trace[0].succeeded).toBe(false);
    expect(result.trace[1].succeeded).toBe(false);
    expect(effectiveValueV2(result.state, target, "power")).toBe(2000);
  });

  it("SD01-005 充盈呼唤只允许从己方基地区选择 2 张卡", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const source = place(state, actor, "vanguard", "SD01-005", { attribute: 1 });
    const faceUpBase = place(state, actor, "base", "BASE-UP", { attribute: 1 });
    const coveredBase = place(state, actor, "covered", "BASE-DOWN", { attribute: 1 });
    const battlefield = place(state, actor, "rear", "FIELD-NOT-A-TARGET", { attribute: 1 });
    const effect = getEffectV2("SD01-005", "full-call");
    const targeting = effect?.targeting?.(state, actor, source);
    expect(targeting).toEqual(expect.objectContaining({
      choices: [faceUpBase, coveredBase],
      min: 2,
      max: 2,
      prompt: "选择己方基地 2 张卡撤退",
    }));
    expect(targeting?.choices).not.toContain(battlefield);
  });

  it("同时效果令后续目标失效时会重新计算并跳过，不能留下无解决策", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const source = place(state, actor, "vanguard", "SD01-005", { level: 3 });
    place(state, actor, "base", "BASE-A");
    const removedBeforeResolution = place(state, actor, "base", "BASE-B");
    const candidates = collectTriggeredEffectsV2(state, [{ type: "CHARACTER_SUMMONED", actor, cardId: source, destination: "vanguard", paymentCardIds: [], summonKind: "action" }]);
    expect(candidates.map((item) => item.effectId)).toContain("full-call");
    state.players[actor].baseCards = state.players[actor].baseCards.filter((id) => id !== removedBeforeResolution);
    state.players[actor].retreat.push(removedBeforeResolution);
    const prepared = prepareEffectResolutionV2(state, candidates);
    expect(prepared.state.decision).toBeNull();
  });

  it("结附导致的常驻 R/战力增加会产生数值事件，回合一次效果不会重复排队", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const host = place(state, actor, "vanguard", "HOST", { power: 1000, range: 1 });
    const watcher = place(state, actor, "rear", "SD01-003");
    place(state, actor === 0 ? 1 : 0, "vanguard", "ENEMY");
    const attachment = place(state, actor, "hand", "SD01-002", { power: 2500, range: 1 });
    const changed = applyAtomicOperationsV2(state, [{ kind: "ATTACH", cardId: attachment, hostCardId: host }]);
    const valueEvents = changed.events.filter((event) => event.type === "CARD_VALUE_CHANGED");
    expect(valueEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetCardId: host, valueType: "power", delta: 2500 }),
      expect.objectContaining({ targetCardId: host, valueType: "range", delta: 2 }),
    ]));
    const candidates = collectTriggeredEffectsV2(changed.state, valueEvents);
    expect(candidates.filter((effect) => effect.sourceCardId === watcher && effect.effectId === "coordinated-fire")).toHaveLength(1);
  });

  it("SD02-007 选择实际场上位置，不以固定首个空位代替玩家决定", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const source = place(state, actor, "hand", "SD02-007", { level: 6, attribute: 2 });
    for (let index = 0; index < 9; index += 1) place(state, actor, "retreat", `YELLOW-${index}`, { attribute: 2 });
    const requested = submit(state, actor, { type: "ACTIVATE_EFFECT", sourceCardId: source, effectId: "rage-out-of-control" });
    expect(requested.ok).toBe(true);
    if (!requested.ok || requested.state.decision?.kind !== "EFFECT_TARGETS") return;
    expect(requested.state.decision.choiceKind).toBe("field_location");
    expect(requested.state.decision.choices).toContain("zone:rear");
    const placed = submit(requested.state, actor, { type: "ANSWER_DECISION", decisionId: requested.state.decision.id, cardIds: ["zone:rear"] });
    expect(placed.ok).toBe(true);
    if (placed.ok) expect(placed.state.players[actor].field.rear).toEqual([source]);
  });

  it("SD02-005 严格按舍弃顶 3、抽 1、盖伏、记录回合一次的顺序结算", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const source = place(state, actor, "base", "SD02-005", { level: 1, attribute: 2, features: ["机械"] });
    const oldDeck = [...state.players[actor].deck];
    const oldHand = state.players[actor].hand.length;
    const result = submit(state, actor, { type: "ACTIVATE_EFFECT", sourceCardId: source, effectId: "machine-tide" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[actor].retreat.slice(-3)).toEqual(oldDeck.slice(0, 3));
    expect(result.state.players[actor].hand).toHaveLength(oldHand + 1);
    expect(result.state.players[actor].baseCovered).toContain(source);
    expect(result.state.usage.effectUseKeysThisTurn).toContain(`${source}:machine-tide`);
  });

  it("展示与翻开是不同原子；盖卡展示不会自行变为正面角色", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const covered = place(state, actor, "covered", "COVERED", { level: 2 });
    const shown = applyAtomicOperationsV2(state, [{ kind: "REVEAL", cardIds: [covered] }]);
    expect(shown.events).toContainEqual({ type: "CARDS_REVEALED", cards: [{ instanceId: covered, definitionId: state.cards[covered].definitionId }] });
    expect(shown.state.players[actor].baseCovered).toContain(covered);
    const flipped = applyAtomicOperationsV2(shown.state, [{ kind: "FLIP_BASE_FACE_UP", cardId: covered }]);
    expect(flipped.state.players[actor].baseCovered).not.toContain(covered);
    expect(flipped.state.players[actor].baseCards).toContain(covered);
  });

  it("SD01-009 先在场面选择盖卡展示，再打开撤退区选择同 Lv 的两张角色", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const source = place(state, actor, "retreat", "SD01-009", { level: 4 });
    const covered = place(state, actor, "covered", "COVERED-LV2", { level: 2 });
    const first = place(state, actor, "retreat", "RETREAT-LV2-A", { level: 2 });
    const second = place(state, actor, "retreat", "RETREAT-LV2-B", { level: 2 });
    place(state, actor, "retreat", "RETREAT-LV3", { level: 3 });
    const candidates = collectTriggeredEffectsV2(state, [{ type: "CARDS_RETREATED", cardIds: [source], reason: "effect" }]);
    expect(candidates.map((item) => item.effectId)).toEqual(["pulse-specialization-recovery"]);
    let current = prepareEffectResolutionV2(state, candidates).state;
    expect(current.decision?.kind).toBe("EFFECT_TARGETS");
    if (current.decision?.kind !== "EFFECT_TARGETS") return;
    expect(current.decision.choices).toEqual([covered]);
    let answered = submit(current, actor, { type: "ANSWER_DECISION", decisionId: current.decision.id, cardIds: [covered] });
    expect(answered.ok).toBe(true);
    if (!answered.ok || answered.state.decision?.kind !== "EFFECT_TARGETS") return;
    expect(answered.state.decision.choices).toEqual(expect.arrayContaining([first, second]));
    expect(answered.state.decision.choices).not.toContain(covered);
    answered = submit(answered.state, actor, { type: "ANSWER_DECISION", decisionId: answered.state.decision.id, cardIds: [first, second] });
    expect(answered.ok).toBe(true);
    if (!answered.ok) return;
    expect(answered.state.players[actor].baseCovered).toEqual(expect.arrayContaining([covered, first, second]));
    expect(answered.state.decision).toBeNull();
  });

  it("高风险复合效果的目标约束不允许跨区域伪造", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const enemy: PlayerIndex = actor === 0 ? 1 : 0;
    const widow = place(state, actor, "hand", "SD01-006", { level: 5 });
    const ownBattle = place(state, actor, "vanguard", "OWN-BATTLE");
    const ownBase = place(state, actor, "covered", "OWN-BASE");
    const enemyBattle = place(state, enemy, "vanguard", "ENEMY-BATTLE", { level: 5 });
    const definition = getEffectV2("SD01-006", "widows-bite");
    expect(definition?.validateTargets?.(state, actor, widow, [ownBattle, ownBase, enemyBattle])).toBeNull();
    expect(definition?.validateTargets?.(state, actor, widow, [ownBattle, enemyBattle, widow])).toMatch(/三个指定区域/);
  });
});
