/**
 * 引擎增量功能测试 — 覆盖 T01-T05 新增功能
 *
 * 测试范围：
 * 1. 开局调度（Mulligan）流程
 * 2. 应对阶段（Counter Phase）
 * 3. 关键词能力（Combo/Assault/Unique/AirRaid）
 * 4. 起动效果（Activate Effect）
 * 5. 回合结束重置
 * 6. SD01/SD02 卡效抽检
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameReducer } from "../engine";
import { hasKeyword } from "../cardUtils";
import {
  getEffectsByCardNo,
  getActiveEffects,
  getCounterActiveEffects,
  registerEffect,
  EFFECT_REGISTRY,
} from "../effects/registry";
import { registerAllEffects } from "../effects";
import { shuffleDeck, moveHandCardsToDeckBottom } from "../effects/helpers";
import type { BattleState, PlayerState, Zone } from "../../types/game";
import type { Card, CardDatabase } from "../../types/card";
import type { CardEffect } from "../effects/types";

// ============================================================
// Mock 卡牌数据
// ============================================================

function makeCard(overrides: Partial<Card> & { id: string; card_no: string }): Card {
  return {
    name: overrides.card_no,
    card_type: 1,
    card_type_name: "角色",
    cost: 1,
    cost_name: "Lv1",
    attribute: 1,
    attribute_name: "科技",
    attribute_color: "red",
    pp_value: null,
    dp_value: null,
    power: "1000",
    signal_color: null,
    signal_color_text: null,
    feature: null,
    feature_text: null,
    effect: "",
    package: "SD01",
    package_short: "SD01",
    rarity: 1,
    rarity_code: "C",
    rarity_cn: "普通",
    rarity_color: "gray",
    image_url: "",
    r: 1,
    ...overrides,
  };
}

// SD01 卡牌
const sd01_002_card = makeCard({
  id: "SD01-002-C",
  card_no: "SD01-002",
  name: "反浩克装甲",
  cost: 1,
  power: null,
  card_type: 2,
  card_type_name: "支援",
});
const sd01_011_card = makeCard({
  id: "SD01-011-C",
  card_no: "SD01-011",
  name: "应对者",
  cost: 1,
  power: "1500",
});
const sd01_017_card = makeCard({
  id: "SD01-017-C",
  card_no: "SD01-017",
  name: "孤军战士",
  cost: 2,
  power: "2000",
});
const sd01_generic_1 = makeCard({
  id: "GEN-001",
  card_no: "GEN-001",
  name: "杂兵A",
  cost: 1,
  power: "1000",
});
const sd01_generic_2 = makeCard({
  id: "GEN-002",
  card_no: "GEN-002",
  name: "杂兵B",
  cost: 2,
  power: "2000",
});
const sd01_generic_3 = makeCard({
  id: "GEN-003",
  card_no: "GEN-003",
  name: "杂兵C",
  cost: 3,
  power: "3000",
});

// SD02 卡牌
const sd02_001_card = makeCard({
  id: "SD02-001-C",
  card_no: "SD02-001",
  name: "机甲指挥官",
  cost: 4,
  power: "3000",
  package: "SD02",
  package_short: "SD02",
  attribute: 2,
  attribute_name: "正义",
  attribute_color: "yellow",
});
const sd02_004_card = makeCard({
  id: "SD02-004-C",
  card_no: "SD02-004",
  name: "应对者2",
  cost: 1,
  power: "1200",
  package: "SD02",
  package_short: "SD02",
});
const sd02_016_card = makeCard({
  id: "SD02-016-C",
  card_no: "SD02-016",
  name: "强袭战士",
  cost: 3,
  power: "2500",
  package: "SD02",
  package_short: "SD02",
});

// 测试用通用卡牌
const attacker_card = makeCard({
  id: "ATK-001",
  card_no: "ATK-001",
  name: "攻击者",
  cost: 1,
  power: "3000",
});
const defender_card = makeCard({
  id: "DEF-001",
  card_no: "DEF-001",
  name: "防守者",
  cost: 1,
  power: "1000",
});

// 构建 mock CardDatabase
const mockDb: CardDatabase = {
  total_cards: 10,
  total_variants: 10,
  packages: ["SD01", "SD02"],
  attributes: {
    "1": { name: "科技", color: "red", en: "Tech" },
    "2": { name: "正义", color: "yellow", en: "Justice" },
  },
  rarities: {
    "1": { code: "C", cn: "普通", color: "gray" },
  },
  cards: [
    sd01_002_card,
    sd01_011_card,
    sd01_017_card,
    sd01_generic_1,
    sd01_generic_2,
    sd01_generic_3,
    sd02_001_card,
    sd02_004_card,
    sd02_016_card,
    attacker_card,
    defender_card,
  ],
  card_groups: {},
};

// ============================================================
// Mock BattleState 工厂
// ============================================================

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 1,
    name: "Player1",
    deck: [],
    rushDeck: [],
    hand: [],
    baseCards: [],
    baseCovered: [],
    field: {
      vanguard: [],
      flankLeft: [],
      flankRight: [],
      rear: [],
    },
    timeline: [],
    retreat: [],
    void: [],
    isFirstPlayer: true,
    ...overrides,
  };
}

function makeBattleState(overrides: Partial<BattleState> = {}): BattleState {
  return {
    isSetup: false,
    setupPhase: "DONE",
    turnPhase: "ACTION",
    players: [makePlayer({ id: 1, name: "Player1", isFirstPlayer: true }), makePlayer({ id: 2, name: "Player2", isFirstPlayer: false })],
    activePlayerIndex: 0,
    turnNumber: 1,
    remainingSummons: 3,
    baseDeployedThisTurn: false,
    baseMovesUsed: {},
    conflictZonesCompleted: [],
    conflictAttackedCards: [],
    log: [],
    isGameOver: false,
    winner: null,
    conflictSubPhase: "adjust",
    conflictMovesUsed: 0,
    currentAttackZone: null,
    pendingAttack: null,
    eventListeners: [],
    registeredAbilities: [],
    pendingSummon: null,
    modifiers: [],
    attachments: {},
    pendingCounter: null,
    counterUsedThisTurn: [false, false],
    counterPassCount: 0,
    conflictAttackCount: {},
    temporaryAbilities: {},
    interceptUsedThisTurn: [],
    effectUsedThisTurn: [],
    activatedEffectsThisTurn: [],
    mulliganSelected: [],
    enteredThisTurn: [],
    ...overrides,
  };
}

const ZONE_LIST: Zone[] = ["vanguard", "flankLeft", "flankRight", "rear"];

// ============================================================
// 初始化效果注册表（在所有测试前）
// ============================================================

// 注册自定义测试效果（用于 active effect 测试）
function registerTestEffects() {
  // 注册一个自定义 active 效果用于 ACTIVATE_EFFECT 测试
  const testActiveEffect: CardEffect = {
    id: "ATK-001-0",
    cardNo: "ATK-001",
    category: "active",
    activeSource: "field",
    label: "测试起动效果",
    execute: (ctx) => {
      return {
        ...ctx.state,
        log: [...ctx.state.log, "测试起动效果已执行"],
      };
    },
  };
  registerEffect(testActiveEffect);
}

// 确保 SD01/SD02 效果已注册
registerAllEffects(mockDb);
registerTestEffects();

// ============================================================
// 测试套件
// ============================================================

describe("1. 开局调度（Mulligan）测试", () => {
  let reducer: ReturnType<typeof createGameReducer>;

  beforeEach(() => {
    reducer = createGameReducer(mockDb);
  });

  it("SETUP_DRAW_HANDS 正确返回传入的状态", () => {
    const setupState = makeBattleState({
      isSetup: true,
      setupPhase: "DRAW_HANDS",
      turnPhase: "TURN_START",
      players: [
        makePlayer({ id: 1, name: "P1", hand: ["GEN-001", "GEN-002", "GEN-003"], deck: Array(47).fill("GEN-001") }),
        makePlayer({ id: 2, name: "P2", hand: ["GEN-001", "GEN-002"], deck: Array(47).fill("GEN-001") }),
      ],
    });

    const result = reducer(null, { type: "SETUP_DRAW_HANDS", state: setupState });
    expect(result).not.toBeNull();
    expect(result!.isSetup).toBe(true);
    expect(result!.setupPhase).toBe("DRAW_HANDS");
  });

  it("MULLIGAN_SELECT 正确更新 mulliganSelected", () => {
    const state = makeBattleState({
      isSetup: true,
      setupPhase: "MULLIGAN_P1",
      players: [
        makePlayer({ id: 1, name: "P1", hand: ["GEN-001", "GEN-002", "GEN-003"], deck: [] }),
        makePlayer({ id: 2, name: "P2", hand: [], deck: [] }),
      ],
      mulliganSelected: [],
    });

    const result = reducer(state, {
      type: "MULLIGAN_SELECT",
      playerIdx: 0,
      cardIds: ["GEN-001"],
    });

    expect(result).not.toBeNull();
    expect(result!.mulliganSelected).toEqual(["GEN-001"]);
  });

  it("MULLIGAN_CONFIRM 正确执行放回→抽等量→推进阶段", () => {
    const handCards = ["GEN-001", "GEN-002", "GEN-003"];
    const deckCards = ["ATK-001", "DEF-001", "GEN-001", "GEN-002"];
    const state = makeBattleState({
      isSetup: true,
      setupPhase: "MULLIGAN_P1",
      players: [
        makePlayer({ id: 1, name: "P1", hand: [...handCards], deck: [...deckCards] }),
        makePlayer({ id: 2, name: "P2", hand: [], deck: [] }),
      ],
      mulliganSelected: ["GEN-001"],
    });

    // shuffledDeck 模拟 UI 层洗混后的卡组（含放回的 GEN-001）
    // 注意：GEN-001 不在顶部，避免被立即抽回
    const shuffledDeck = ["ATK-001", "DEF-001", "GEN-001", "GEN-002"];

    const result = reducer(state, {
      type: "MULLIGAN_CONFIRM",
      playerIdx: 0,
      shuffledDeck,
    });

    expect(result).not.toBeNull();
    expect(result!.setupPhase).toBe("MULLIGAN_P2");
    expect(result!.mulliganSelected).toEqual([]);

    // 手牌应移除了 GEN-001，并从 shuffledDeck 抽了1张（ATK-001）
    const p1Hand = result!.players[0].hand;
    expect(p1Hand).not.toContain("GEN-001");
    expect(p1Hand.length).toBe(3); // 原始3张 - 1放回 + 1抽 = 3
    // 抽到的第一张应该是 shuffledDeck[0] = "ATK-001"
    expect(p1Hand).toContain("ATK-001");
  });

  it("先攻玩家完成后切换到后攻玩家（MULLIGAN_P1 → MULLIGAN_P2）", () => {
    const state = makeBattleState({
      isSetup: true,
      setupPhase: "MULLIGAN_P1",
      players: [
        makePlayer({ id: 1, name: "P1", hand: ["GEN-001"], deck: ["ATK-001"] }),
        makePlayer({ id: 2, name: "P2", hand: ["GEN-002"], deck: [] }),
      ],
      mulliganSelected: [],
    });

    const result = reducer(state, {
      type: "MULLIGAN_CONFIRM",
      playerIdx: 0,
      shuffledDeck: ["ATK-001"],
    });

    expect(result!.setupPhase).toBe("MULLIGAN_P2");
    expect(result!.isSetup).toBe(true);
  });

  it("双方完成后进入游戏（isSetup=false, turnPhase=TURN_START）", () => {
    const fillerDeck = Array(40).fill("GEN-001");
    const state = makeBattleState({
      isSetup: true,
      setupPhase: "MULLIGAN_P2",
      players: [
        makePlayer({ id: 1, name: "P1", hand: ["GEN-001"], deck: [...fillerDeck] }),
        makePlayer({ id: 2, name: "P2", hand: ["GEN-002"], deck: [...fillerDeck] }),
      ],
      mulliganSelected: [],
    });

    const result = reducer(state, {
      type: "MULLIGAN_CONFIRM",
      playerIdx: 1,
      shuffledDeck: [...fillerDeck],
    });

    expect(result!.isSetup).toBe(false);
    expect(result!.setupPhase).toBe("DONE");
    expect(result!.turnPhase).toBe("TURN_START");
  });
});

describe("2. 应对阶段（Counter Phase）测试", () => {
  let reducer: ReturnType<typeof createGameReducer>;

  beforeEach(() => {
    reducer = createGameReducer(mockDb);
  });

  it("handleSummonToField 行动阶段号召不开启应对窗口", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      remainingSummons: 3,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: ["GEN-001"],
          deck: Array(40).fill("GEN-001"),
          field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2", hand: [], deck: [], field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] } }),
      ],
    });

    const result = reducer(state, {
      type: "SUMMON_TO_FIELD",
      playerIdx: 0,
      handIndex: 0,
      zone: "vanguard",
    });

    expect(result).not.toBeNull();
    // 行动阶段号召不应设置 pendingCounter（应对窗口已移除）
    expect(result!.pendingCounter).toBeNull();
    // 卡牌应成功号召到战区
    expect(result!.players[0].hand).not.toContain("GEN-001");
    expect(result!.players[0].field.vanguard).toContain("GEN-001");
    // remainingSummons 应减1
    expect(result!.remainingSummons).toBe(2);
    // enteredThisTurn 应包含该卡牌
    expect(result!.enteredThisTurn).toContain("GEN-001");
  });

  it("TRIGGER_COUNTER 正确号召【应对】角色", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: ["GEN-001"],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({
          id: 2,
          name: "P2",
          hand: ["SD01-011-C"], // 拥有 counter 效果的卡
          field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
        }),
      ],
      pendingCounter: {
        summoningPlayerIdx: 0,
        summoningCardId: "GEN-001",
        summoningZone: "vanguard",
      },
      counterUsedThisTurn: [false, false],
      counterPassCount: 0,
    });

    const result = reducer(state, {
      type: "TRIGGER_COUNTER",
      playerIdx: 1,
      cardId: "SD01-011-C",
      handIndex: 0,
    });

    expect(result).not.toBeNull();
    // 应对角色应从手牌移到场上
    expect(result!.players[1].hand).not.toContain("SD01-011-C");
    // 应对角色应在场上某个区域
    const p2Field = ZONE_LIST.flatMap((z) => result!.players[1].field[z]);
    expect(p2Field).toContain("SD01-011-C");
    // counterUsedThisTurn 应标记
    expect(result!.counterUsedThisTurn![1]).toBe(true);
    // counterPassCount 应重置
    expect(result!.counterPassCount).toBe(0);
  });

  it("PASS_COUNTER 计数累加", () => {
    const state = makeBattleState({
      pendingCounter: {
        summoningPlayerIdx: 0,
        summoningCardId: "GEN-001",
        summoningZone: "vanguard",
      },
      counterPassCount: 0,
    });

    const result = reducer(state, {
      type: "PASS_COUNTER",
      playerIdx: 1,
    });

    expect(result!.counterPassCount).toBe(1);
    expect(result!.pendingCounter).not.toBeNull(); // 还未关闭
  });

  it("连续两次 PASS_COUNTER 后 pendingCounter 清空", () => {
    let state = makeBattleState({
      pendingCounter: {
        summoningPlayerIdx: 0,
        summoningCardId: "GEN-001",
        summoningZone: "vanguard",
      },
      counterPassCount: 0,
    });

    // 第一次 pass
    state = reducer(state, { type: "PASS_COUNTER", playerIdx: 1 })!;
    expect(state.counterPassCount).toBe(1);
    expect(state.pendingCounter).not.toBeNull();

    // 第二次 pass
    state = reducer(state, { type: "PASS_COUNTER", playerIdx: 0 })!;
    expect(state.counterPassCount).toBe(2);
    expect(state.pendingCounter).toBeNull(); // 应对窗口关闭
  });

  it("counterUsedThisTurn 防止重复应对", () => {
    const state = makeBattleState({
      pendingCounter: {
        summoningPlayerIdx: 0,
        summoningCardId: "GEN-001",
        summoningZone: "vanguard",
      },
      counterUsedThisTurn: [false, true], // P2 已经用过应对
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: [],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({
          id: 2,
          name: "P2",
          hand: ["SD01-011-C"],
          field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
        }),
      ],
    });

    const result = reducer(state, {
      type: "TRIGGER_COUNTER",
      playerIdx: 1,
      cardId: "SD01-011-C",
      handIndex: 0,
    });

    // 应该被拒绝（返回原状态，卡牌仍在手牌）
    expect(result).toBe(state);
    expect(result!.players[1].hand).toContain("SD01-011-C");
  });
});

describe("3. 关键词能力（Keyword Abilities）测试", () => {
  let reducer: ReturnType<typeof createGameReducer>;

  beforeEach(() => {
    reducer = createGameReducer(mockDb);
  });

  it("hasKeyword 检查 temporaryAbilities", () => {
    const state = makeBattleState({
      temporaryAbilities: { "ATK-001": ["assault"] },
    });

    expect(hasKeyword(state, "ATK-001", "assault", mockDb)).toBe(true);
    expect(hasKeyword(state, "ATK-001", "combo", mockDb)).toBe(false);
  });

  it("hasKeyword 检查效果注册表 keywords 字段", () => {
    // SD01-017 拥有 keywords:["combo"]，但需要 condition 满足（fieldCount===1）
    const state = makeBattleState({
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: [],
          field: { vanguard: ["SD01-017-C"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2", hand: [], field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] } }),
      ],
    });

    // 只有一张场上角色时，combo 应该生效
    expect(hasKeyword(state, "SD01-017-C", "combo", mockDb)).toBe(true);

    // 有两张场上角色时，combo 不应该生效
    const state2 = makeBattleState({
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: [],
          field: { vanguard: ["SD01-017-C"], flankLeft: ["GEN-001"], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2", hand: [], field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] } }),
      ],
    });
    expect(hasKeyword(state2, "SD01-017-C", "combo", mockDb)).toBe(false);
  });

  it("连击：有 combo 关键词的卡可攻击2次（conflictAttackCount 追踪）", () => {
    // 先在场上放 SD01-017（只有一张场上角色时拥有 combo）
    const state = makeBattleState({
      turnPhase: "CONFLICT",
      conflictSubPhase: "attack",
      activePlayerIndex: 0,
      currentAttackZone: "vanguard",
      conflictZonesCompleted: [],
      conflictAttackedCards: [],
      conflictAttackCount: {},
      pendingAttack: null,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: [],
          rushDeck: [],
          field: { vanguard: ["SD01-017-C"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({
          id: 2,
          name: "P2",
          hand: [],
          rushDeck: ["DEF-001"],
          field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
        }),
      ],
    });

    // 第一次攻击（直接攻击破绽）
    let result = reducer(state, {
      type: "START_ATTACK",
      playerIdx: 0,
      zone: "vanguard",
      cardId: "SD01-017-C",
    });
    expect(result!.pendingAttack).not.toBeNull();

    result = reducer(result!, {
      type: "CONFIRM_ATTACK",
      targetPlayerIdx: 1,
      targetZone: "vanguard",
    });
    // conflictAttackCount 应递增到1
    expect(result!.conflictAttackCount!["SD01-017-C"]).toBe(1);
    // 有 combo 时 maxAttacks=2，attackCount=1 < 2，应该还能攻击
    const maxAttacks = hasKeyword(result!, "SD01-017-C", "combo", mockDb) ? 2 : 1;
    expect(1 < maxAttacks).toBe(true);
  });

  it("强袭：攻击者胜利时检查 assault 关键词", () => {
    const state = makeBattleState({
      turnPhase: "CONFLICT",
      conflictSubPhase: "attack",
      activePlayerIndex: 0,
      currentAttackZone: "vanguard",
      conflictZonesCompleted: [],
      conflictAttackedCards: [],
      conflictAttackCount: {},
      pendingAttack: null,
      temporaryAbilities: { "ATK-001": ["assault"] },
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: [],
          field: { vanguard: ["ATK-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({
          id: 2,
          name: "P2",
          hand: [],
          field: { vanguard: ["DEF-001"], flankLeft: [], flankRight: [], rear: [] },
          rushDeck: ["GEN-002"], // 冲击卡组有卡
          timeline: [],
        }),
      ],
    });

    // 发起攻击
    let result = reducer(state, {
      type: "START_ATTACK",
      playerIdx: 0,
      zone: "vanguard",
      cardId: "ATK-001",
    });
    expect(result!.pendingAttack).not.toBeNull();

    // 确认攻击防守者（攻击者3000 > 防守者1000，攻击者胜利）
    result = reducer(result!, {
      type: "CONFIRM_ATTACK",
      targetPlayerIdx: 1,
      targetZone: "vanguard",
      targetCardId: "DEF-001",
    });

    // 攻击者胜利 + 强袭：冲击卡应进入时间线
    expect(result!.players[1].timeline.length).toBe(1);
    expect(result!.players[1].rushDeck.length).toBe(0); // 消耗了1张
    // 防守者应撤退
    expect(result!.players[1].retreat).toContain("DEF-001");
  });

  it("唯一性：号召同名牌时被阻止（isUnique 检查）", () => {
    // SD02-001 拥有 isUnique:true
    // 先在场上放一张 SD02-001
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      remainingSummons: 3,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: ["SD02-001-C"], // 手牌中还有一张同名牌
          field: { vanguard: ["SD02-001-C"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2", hand: [], field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] } }),
      ],
    });

    // 注意：手牌和场上是同一个 id，实际场景中应该是不同变体但同名
    // 让我调整：场上放一个不同 id 但同名的卡
    const sd02_001_variant2 = makeCard({
      id: "SD02-001-R",
      card_no: "SD02-001",
      name: "机甲指挥官",
      cost: 4,
      power: "3000",
    });
    // 将 variant2 加入 db.cards（运行时修改 mockDb）
    const dbWithVariant = { ...mockDb, cards: [...mockDb.cards, sd02_001_variant2] };
    const testReducer = createGameReducer(dbWithVariant);

    const state2 = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      remainingSummons: 3,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: ["SD02-001-R"],
          field: { vanguard: ["SD02-001-C"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2", hand: [], field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] } }),
      ],
    });

    const result = testReducer(state2, {
      type: "SUMMON_TO_FIELD",
      playerIdx: 0,
      handIndex: 0,
      zone: "flankLeft",
    });

    // 应该被阻止（返回原状态或带错误日志）
    // 检查日志中是否有阻止信息
    const lastLog = result!.log[result!.log.length - 1];
    expect(lastLog).toContain("唯一");
    // 卡牌应该仍在手牌
    expect(result!.players[0].hand).toContain("SD02-001-R");
  });
});

describe("4. 起动效果（Activate Effect）测试", () => {
  let reducer: ReturnType<typeof createGameReducer>;

  beforeEach(() => {
    reducer = createGameReducer(mockDb);
  });

  it("ACTIVATE_EFFECT 正确执行 active 效果", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: [],
          field: { vanguard: ["ATK-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2", hand: [], field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] } }),
      ],
    });

    const result = reducer(state, {
      type: "ACTIVATE_EFFECT",
      playerIdx: 0,
      cardId: "ATK-001",
      effectId: "ATK-001-0",
    });

    expect(result).not.toBeNull();
    // 日志中应有效果执行记录
    expect(result!.log.some((l) => l.includes("测试起动效果已执行"))).toBe(true);
    // activatedEffectsThisTurn 应记录
    expect(result!.activatedEffectsThisTurn).toContain("ATK-001-ATK-001-0");
  });

  it("once:true 效果本回合不可重复起动", () => {
    // 注册一个 once:true 的测试效果
    const onceEffect: CardEffect = {
      id: "GEN-002-0",
      cardNo: "GEN-002",
      category: "active",
      activeSource: "field",
      once: true,
      label: "一次性测试效果",
      execute: (ctx) => ({
        ...ctx.state,
        log: [...ctx.state.log, "一次性效果已执行"],
      }),
    };
    registerEffect(onceEffect);
    const testReducer = createGameReducer(mockDb);

    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: [],
          field: { vanguard: ["GEN-002"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2", hand: [], field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] } }),
      ],
    });

    // 第一次起动
    const result1 = testReducer(state, {
      type: "ACTIVATE_EFFECT",
      playerIdx: 0,
      cardId: "GEN-002",
      effectId: "GEN-002-0",
    });
    expect(result1!.log.some((l) => l.includes("一次性效果已执行"))).toBe(true);
    expect(result1!.effectUsedThisTurn).toContain("GEN-002-GEN-002-0");

    // 第二次起动（应被拒绝）
    const result2 = testReducer(result1!, {
      type: "ACTIVATE_EFFECT",
      playerIdx: 0,
      cardId: "GEN-002",
      effectId: "GEN-002-0",
    });
    // 效果不应重复执行（日志中不应有第二条"一次性效果已执行"）
    const execCount = result2!.log.filter((l) => l.includes("一次性效果已执行")).length;
    expect(execCount).toBe(1);
  });

  it("faceDownAfterActive 效果执行后卡牌盖伏（移至基地）", () => {
    // 注册一个 faceDownAfterActive 的测试效果
    const fdEffect: CardEffect = {
      id: "GEN-003-0",
      cardNo: "GEN-003",
      category: "active",
      activeSource: "field",
      faceDownAfterActive: true,
      label: "盖伏测试效果",
      execute: (ctx) => ({
        ...ctx.state,
        log: [...ctx.state.log, "盖伏效果已执行"],
      }),
    };
    registerEffect(fdEffect);
    const testReducer = createGameReducer(mockDb);

    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: [],
          baseCovered: [],
          field: { vanguard: ["GEN-003"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2", hand: [], field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] } }),
      ],
    });

    const result = testReducer(state, {
      type: "ACTIVATE_EFFECT",
      playerIdx: 0,
      cardId: "GEN-003",
      effectId: "GEN-003-0",
    });

    // 效果应执行
    expect(result!.log.some((l) => l.includes("盖伏效果已执行"))).toBe(true);
    // 卡牌应从场上移至基地
    const p1Field = ZONE_LIST.flatMap((z) => result!.players[0].field[z]);
    expect(p1Field).not.toContain("GEN-003");
    expect(result!.players[0].baseCovered).toContain("GEN-003");
  });

  it("activeSource 与卡牌区域不匹配时拒绝执行", () => {
    // ATK-001-0 效果的 activeSource 是 "field"
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: ["ATK-001"], // 卡在手牌中
          baseCovered: [],
          field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2", hand: [], field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] } }),
      ],
    });

    const result = reducer(state, {
      type: "ACTIVATE_EFFECT",
      playerIdx: 0,
      cardId: "ATK-001",
      effectId: "ATK-001-0",
    });

    // 效果应被拒绝（日志中不应有执行记录）
    expect(result!.log.some((l) => l.includes("测试起动效果已执行"))).toBe(false);
    // 卡牌应仍在手牌
    expect(result!.players[0].hand).toContain("ATK-001");
  });
});

describe("5. 回合结束重置测试", () => {
  let reducer: ReturnType<typeof createGameReducer>;

  beforeEach(() => {
    reducer = createGameReducer(mockDb);
  });

  it("handleEndTurn 重置所有新增计数器", () => {
    const state = makeBattleState({
      turnPhase: "END_PHASE",
      activePlayerIndex: 0,
      turnNumber: 1,
      remainingSummons: 0,
      baseDeployedThisTurn: true,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: ["GEN-001"],
          deck: Array(40).fill("GEN-001"),
          isFirstPlayer: true,
        }),
        makePlayer({
          id: 2,
          name: "P2",
          hand: [],
          deck: Array(40).fill("GEN-001"),
          isFirstPlayer: false,
        }),
      ],
      // 设置一些"脏"状态
      counterUsedThisTurn: [true, true],
      counterPassCount: 1,
      conflictAttackCount: { "GEN-001": 2 },
      temporaryAbilities: { "GEN-001": ["assault"] },
      interceptUsedThisTurn: ["GEN-001"],
      effectUsedThisTurn: ["SD01-001-0"],
      activatedEffectsThisTurn: ["SD01-002-0"],
      pendingCounter: {
        summoningPlayerIdx: 0,
        summoningCardId: "GEN-001",
        summoningZone: "vanguard",
      },
    });

    const result = reducer(state, { type: "END_TURN" });

    expect(result).not.toBeNull();
    // 应切换到玩家2
    expect(result!.activePlayerIndex).toBe(1);
    // 回合数不变（P1→P2 不递增）
    expect(result!.turnNumber).toBe(1);
    // turnPhase 应为 TURN_START
    expect(result!.turnPhase).toBe("TURN_START");

    // 所有新增计数器应重置
    expect(result!.counterUsedThisTurn).toEqual([false, false]);
    expect(result!.counterPassCount).toBe(0);
    expect(result!.conflictAttackCount).toEqual({});
    expect(result!.temporaryAbilities).toEqual({});
    expect(result!.interceptUsedThisTurn).toEqual([]);
    expect(result!.effectUsedThisTurn).toEqual([]);
    expect(result!.activatedEffectsThisTurn).toEqual([]);
    expect(result!.pendingCounter).toBeNull();

    // 其他常规字段也应重置
    expect(result!.remainingSummons).toBe(3); // P2 不是先攻首回
    expect(result!.baseDeployedThisTurn).toBe(false);
  });
});

describe("6. SD01/SD02 卡效抽检", () => {
  it("SD01-002 的 isCounterActive 标记正确", () => {
    const effects = getEffectsByCardNo("SD01-002");
    expect(effects.length).toBeGreaterThan(0);

    // 找到 active 类型的效果
    const activeEffects = effects.filter((e) => e.category === "active");
    expect(activeEffects.length).toBeGreaterThan(0);

    // SD01-002 的 attach 效果应有 isCounterActive:true
    const counterActiveEffect = activeEffects.find((e) => e.isCounterActive === true);
    expect(counterActiveEffect).toBeDefined();
    expect(counterActiveEffect!.isCounterActive).toBe(true);

    // 也应有 once:true
    expect(counterActiveEffect!.once).toBe(true);
  });

  it("SD01-002 的 isCounterActive 效果可通过 getCounterActiveEffects 查询", () => {
    const counterActiveEffects = getCounterActiveEffects("SD01-002");
    expect(counterActiveEffects.length).toBeGreaterThan(0);
    expect(counterActiveEffects[0].isCounterActive).toBe(true);
  });

  it("SD01-002 的 isCounterActive 效果不包含在 getActiveEffects 中", () => {
    const activeEffects = getActiveEffects("SD01-002");
    // getActiveEffects 排除 isCounterActive=true 的效果
    expect(activeEffects.every((e) => e.isCounterActive !== true)).toBe(true);
  });

  it("SD01-017 的 keywords:[\"combo\"] 标记正确", () => {
    const effects = getEffectsByCardNo("SD01-017");
    expect(effects.length).toBeGreaterThan(0);

    // 找到拥有 keywords:["combo"] 的效果
    const comboEffect = effects.find((e) => e.keywords?.includes("combo"));
    expect(comboEffect).toBeDefined();
    expect(comboEffect!.keywords).toContain("combo");
  });

  it("SD02-001 的 isUnique:true 标记正确", () => {
    const effects = getEffectsByCardNo("SD02-001");
    expect(effects.length).toBeGreaterThan(0);

    // 所有 SD02-001 的效果都应有 isUnique:true
    const uniqueEffects = effects.filter((e) => e.isUnique === true);
    expect(uniqueEffects.length).toBe(effects.length);
  });

  it("SD02-016 的 temporaryAbilities 设置（onSummon 触发设置 assault）", () => {
    const effects = getEffectsByCardNo("SD02-016");
    expect(effects.length).toBeGreaterThan(0);

    // 找到 onSummon 触发效果
    const summonEffect = effects.find((e) => e.category === "trigger" && e.trigger === "onSummon");
    expect(summonEffect).toBeDefined();

    // 执行该效果应设置 temporaryAbilities
    const mockCtx = {
      state: makeBattleState(),
      cardId: "SD02-016-C",
      playerIdx: 0,
      db: mockDb,
    };
    const result = summonEffect!.execute(mockCtx);
    expect(result.temporaryAbilities).toBeDefined();
    expect(result.temporaryAbilities!["SD02-016-C"]).toContain("assault");
  });

  it("getActiveEffects 正确返回非应对型 active 效果", () => {
    // SD01-002 有一个 isCounterActive:true 的 active 效果和一个 static 效果
    // getActiveEffects 应返回空（因为唯一的 active 效果是 isCounterActive）
    const activeEffects = getActiveEffects("SD01-002");
    // SD01-002 的 active 效果是 isCounterActive，所以 getActiveEffects 返回空
    expect(activeEffects.length).toBe(0);
  });

  it("getCounterActiveEffects 正确返回应对型 active 效果", () => {
    const counterActiveEffects = getCounterActiveEffects("SD01-002");
    expect(counterActiveEffects.length).toBe(1);
    expect(counterActiveEffects[0].id).toBe("SD01-002-0");
    expect(counterActiveEffects[0].isCounterActive).toBe(true);
  });
});

describe("附加测试：不可变更新验证", () => {
  it("reducer 不修改原始状态", () => {
    const reducer = createGameReducer(mockDb);
    const originalState = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      remainingSummons: 3,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: ["GEN-001"],
          deck: Array(40).fill("GEN-001"),
        }),
        makePlayer({ id: 2, name: "P2", hand: [], deck: [] }),
      ],
    });

    // 深拷贝原始状态用于比较
    const originalSnapshot = JSON.parse(JSON.stringify(originalState));

    // 执行号召
    reducer(originalState, {
      type: "SUMMON_TO_FIELD",
      playerIdx: 0,
      handIndex: 0,
      zone: "vanguard",
    });

    // 原始状态不应被修改
    expect(JSON.stringify(originalState)).toBe(JSON.stringify(originalSnapshot));
  });
});

describe("7. 战基移动（MOVE_CARD）测试", () => {
  let reducer: ReturnType<typeof createGameReducer>;

  beforeEach(() => {
    reducer = createGameReducer(mockDb);
  });

  it("战区→基地移动成功", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: [],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "vanguard",
      cardId: "GEN-001",
      toLoc: "base",
    });

    expect(result).not.toBeNull();
    // 卡牌从战区移除
    expect(result!.players[0].field.vanguard).not.toContain("GEN-001");
    // 卡牌出现在基地
    expect(result!.players[0].baseCovered).toContain("GEN-001");
  });

  it("基地→战区移动成功", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: ["GEN-001"],
          field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "base",
      cardId: "GEN-001",
      toLoc: "flankLeft",
    });

    expect(result).not.toBeNull();
    // 卡牌从基地移除
    expect(result!.players[0].baseCovered).not.toContain("GEN-001");
    // 卡牌出现在目标战区
    expect(result!.players[0].field.flankLeft).toContain("GEN-001");
  });

  it("移动后卡牌不在原位置", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: [],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "vanguard",
      cardId: "GEN-001",
      toLoc: "base",
    });

    expect(result!.players[0].field.vanguard).not.toContain("GEN-001");
    expect(result!.players[0].field.vanguard.length).toBe(0);
  });

  it("移动后卡牌在目标位置", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: ["GEN-001"],
          field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "base",
      cardId: "GEN-001",
      toLoc: "vanguard",
    });

    expect(result!.players[0].field.vanguard).toContain("GEN-001");
    expect(result!.players[0].field.vanguard.length).toBe(1);
  });

  it("同位置移动拒绝（战区→同一战区）", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "vanguard",
      cardId: "GEN-001",
      toLoc: "vanguard",
    });

    // 应返回原状态（不变）
    expect(result).toBe(state);
    expect(result!.players[0].field.vanguard).toContain("GEN-001");
  });

  it("同位置移动拒绝（基地→基地）", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: ["GEN-001"],
          field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "base",
      cardId: "GEN-001",
      toLoc: "base",
    });

    expect(result).toBe(state);
  });

  it("基地满(6张)时拒绝移入", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: ["GEN-001", "GEN-002", "GEN-003", "ATK-001", "DEF-001", "SD01-011-C"],
          field: { vanguard: ["SD01-017-C"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "vanguard",
      cardId: "SD01-017-C",
      toLoc: "base",
    });

    // 应返回原状态
    expect(result).toBe(state);
    expect(result!.players[0].field.vanguard).toContain("SD01-017-C");
    expect(result!.players[0].baseCovered.length).toBe(6);
  });

  it("战区已有卡牌时拒绝移入", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: ["GEN-001"],
          field: { vanguard: ["SD01-017-C"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "base",
      cardId: "GEN-001",
      toLoc: "vanguard",
    });

    // 应返回原状态（战区已有卡牌）
    expect(result).toBe(state);
    expect(result!.players[0].baseCovered).toContain("GEN-001");
    expect(result!.players[0].field.vanguard).toContain("SD01-017-C");
  });

  it("非活跃玩家移动被拒绝", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0, // P1 活跃
      players: [
        makePlayer({ id: 1, name: "P1" }),
        makePlayer({
          id: 2,
          name: "P2",
          baseCovered: [],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 1, // P2 不是活跃玩家
      fromLoc: "vanguard",
      cardId: "GEN-001",
      toLoc: "base",
    });

    expect(result).toBe(state);
  });

  it("错误阶段拒绝（TURN_START 不可移动）", () => {
    const state = makeBattleState({
      turnPhase: "TURN_START",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: [],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "vanguard",
      cardId: "GEN-001",
      toLoc: "base",
    });

    expect(result).toBe(state);
  });

  it("CONFLICT-adjust 阶段可以移动", () => {
    const state = makeBattleState({
      turnPhase: "CONFLICT",
      conflictSubPhase: "adjust",
      activePlayerIndex: 0,
      conflictMovesUsed: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: [],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "vanguard",
      cardId: "GEN-001",
      toLoc: "base",
    });

    expect(result).not.toBe(state);
    expect(result!.players[0].baseCovered).toContain("GEN-001");
    expect(result!.players[0].field.vanguard).not.toContain("GEN-001");
  });

  it("冲突调整阶段移动增加 conflictMovesUsed", () => {
    const state = makeBattleState({
      turnPhase: "CONFLICT",
      conflictSubPhase: "adjust",
      activePlayerIndex: 0,
      conflictMovesUsed: 1,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: [],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "vanguard",
      cardId: "GEN-001",
      toLoc: "base",
    });

    expect(result!.conflictMovesUsed).toBe(2);
  });

  it("冲突调整阶段 conflictMovesUsed>=4 拒绝移动", () => {
    const state = makeBattleState({
      turnPhase: "CONFLICT",
      conflictSubPhase: "adjust",
      activePlayerIndex: 0,
      conflictMovesUsed: 4,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: [],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "vanguard",
      cardId: "GEN-001",
      toLoc: "base",
    });

    expect(result).toBe(state);
    expect(result!.conflictMovesUsed).toBe(4);
  });

  it("本回合进场卡牌不能移动（enteredThisTurn）", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      enteredThisTurn: ["GEN-001"],
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: [],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "vanguard",
      cardId: "GEN-001",
      toLoc: "base",
    });

    expect(result).toBe(state);
    expect(result!.players[0].field.vanguard).toContain("GEN-001");
  });

  it("卡牌不在来源位置时拒绝移动", () => {
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          baseCovered: [],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2" }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "flankLeft",
      cardId: "GEN-001", // GEN-001 在 vanguard 而非 flankLeft
      toLoc: "base",
    });

    expect(result).toBe(state);
  });

  it("移动日志正确记录", () => {
    const fillerDeck = Array(40).fill("GEN-001");
    const state = makeBattleState({
      turnPhase: "ACTION",
      activePlayerIndex: 0,
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          deck: [...fillerDeck],
          baseCovered: [],
          field: { vanguard: ["GEN-001"], flankLeft: [], flankRight: [], rear: [] },
        }),
        makePlayer({ id: 2, name: "P2", deck: [...fillerDeck] }),
      ],
    });

    const result = reducer(state, {
      type: "MOVE_CARD",
      playerIdx: 0,
      fromLoc: "vanguard",
      cardId: "GEN-001",
      toLoc: "base",
    });

    const lastLog = result!.log[result!.log.length - 1];
    expect(lastLog).toContain("杂兵A");
    expect(lastLog).toContain("先锋");
    expect(lastLog).toContain("基地");
    expect(lastLog).toContain("🔄");
  });
});

describe("附加测试：辅助函数", () => {
  it("shuffleDeck 返回相同元素的新数组", () => {
    const deck = ["A", "B", "C", "D", "E"];
    const shuffled = shuffleDeck(deck);
    expect(shuffled.length).toBe(deck.length);
    expect(shuffled.sort()).toEqual(deck.sort());
    // 原数组不应被修改
    expect(deck).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("moveHandCardsToDeckBottom 正确将手牌移至卡组底", () => {
    const state = makeBattleState({
      players: [
        makePlayer({
          id: 1,
          name: "P1",
          hand: ["A", "B", "C"],
          deck: ["D", "E"],
        }),
        makePlayer({ id: 2, name: "P2", hand: [], deck: [] }),
      ],
    });

    const result = moveHandCardsToDeckBottom(state, 0, ["A", "C"]);
    expect(result.players[0].hand).toEqual(["B"]);
    expect(result.players[0].deck).toEqual(["D", "E", "A", "C"]);
  });
});
