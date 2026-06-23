/**
 * SD01 卡牌效果定义
 *
 * SD01 全部 19 张卡牌（SD01-001 ~ SD01-018 角色 + SD01-019 冲击卡）。
 * 无效果的卡（SD01-012, SD01-013）不注册效果。
 *
 * T03 修正摘要：
 * - 移除 genId()，staticModifier 使用确定性 ID `static-${cardNo}-${effectId}`
 * - 回合1次限制：新增 `once: true`（SD01-001/002/003/016）
 * - 应对·起动标识：新增 `isCounterActive: true`（SD01-002/016）
 * - 连击关键词：新增 `keywords: ["combo"]`（SD01-017）
 * - 条件修正：SD01-004 增加敌方回合检查，SD01-008 修正双方 Lv4+ 检查逻辑
 * - 撤退逻辑修正：SD01-002 改为撤退1张其他结附卡
 * - SD01-016 activeSource 从 "hand" 改为 "field"，更新 execute 为转移结附逻辑
 * - 选发效果标注 `// TODO: 选发确认`
 */

import type { CardEffect, EffectContext, Modifier } from "./types";
import { registerEffects, triggerEffectsByTiming } from "./registry";
import * as H from "./helpers";
import * as C from "./conditions";

// ============================================================
// 辅助函数
// ============================================================

/** 生成确定性 staticModifier ID */
function staticModId(cardNo: string, effectId: string): string {
  return `static-${cardNo}-${effectId}`;
}

/** 获取 EffectContext 中的卡牌 */
function getCardFromCtx(ctx: EffectContext) {
  return ctx.db.cards.find((c) => c.id === ctx.cardId);
}

// ============================================================
// SD01-001: 被结附时若敌方有Lv5+角色：可撤退所有结附卡，裁剪敌方1张Lv<=X角色
// T03修正：新增 once:true；裁剪目标改为最低Lv；标注选发
// ============================================================
const sd01_001: CardEffect = {
  id: "SD01-001-0",
  cardNo: "SD01-001",
  category: "trigger",
  trigger: "onAttached",
  once: true,
  label: "反浩克装甲·裁剪",
  triggerCondition: (ctx: EffectContext): boolean => {
    // 被结附时且敌方有 Lv5+ 角色
    const attachments = ctx.state.attachments[ctx.cardId] ?? [];
    if (attachments.length === 0) return false;
    return C.getOpponentFieldCardsWithMinLv(ctx.state, ctx.playerIdx, ctx.db, 5).length > 0;
  },
  execute: (ctx: EffectContext) => {
    // TODO: 选发确认 — 玩家可选择是否执行此效果
    // 简化版：自动执行
    let state = ctx.state;
    const attachments = state.attachments[ctx.cardId] ?? [];
    const totalAttachLv = attachments.reduce((s, id) => s + C.getCardLevel(ctx.db, id), 0);

    // 撤退所有结附卡
    for (const aid of attachments) {
      state = H.retreatCard(state, aid, ctx.playerIdx, ctx.db);
    }

    // 裁剪敌方 1 张 Lv <= totalAttachLv 的角色（选择最低Lv的）
    const targets = C.getOpponentFieldCardsWithMaxLv(state, ctx.playerIdx, ctx.db, totalAttachLv);
    if (targets.length > 0) {
      // 按 Lv 升序排列，选择最低Lv的
      const sorted = targets.sort((a, b) => C.getCardLevel(ctx.db, a.id) - C.getCardLevel(ctx.db, b.id));
      state = H.trimCard(state, sorted[0].id, 1 - ctx.playerIdx, ctx.db);
    }

    return state;
  },
};

// ============================================================
// SD01-002: 舍弃手牌->结附我方角色，撤退宿主1张其他结附卡。static: 宿主R+2, 战力+2500
// T03修正：新增 isCounterActive:true, once:true；撤退逻辑改为1张其他结附卡
// ============================================================
const sd01_002_attach: CardEffect = {
  id: "SD01-002-0",
  cardNo: "SD01-002",
  category: "active",
  activeSource: "hand",
  isCounterActive: true,
  once: true,
  label: "反浩克装甲·结附",
  cost: (ctx: EffectContext): boolean => {
    // 需要有我方场上角色可结附
    return C.fieldCount(ctx.state, ctx.playerIdx) > 0;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    // TODO: 完整实现需要玩家选择宿主目标
    // 简化版：结附到第一个我方场上角色
    const p = state.players[ctx.playerIdx];
    let hostId: string | null = null;
    for (const z of ["vanguard", "flankLeft", "flankRight", "rear"] as const) {
      if (p.field[z].length > 0) {
        hostId = p.field[z][0];
        break;
      }
    }
    if (!hostId) return state;

    // 撤退宿主的1张其他结附卡（非全部）
    const existingAttachments = state.attachments[hostId] ?? [];
    if (existingAttachments.length > 0) {
      state = H.retreatCard(state, existingAttachments[0], ctx.playerIdx, ctx.db);
    }

    // 结附
    state = H.attachCard(state, ctx.cardId, hostId, ctx.playerIdx, ctx.db);

    // 添加常驻修改器：R+2, 战力+2500
    state = H.createModifier(state, hostId, "r", 2, "permanent", ctx.cardId, ctx.db);
    state = H.createModifier(state, hostId, "power", 2500, "permanent", ctx.cardId, ctx.db);

    return {
      ...state,
      log: [...state.log, `🛡️ 反浩克装甲结附 → R+2, 战力+2500`],
    };
  },
};

const sd01_002_static: CardEffect = {
  id: "SD01-002-1",
  cardNo: "SD01-002",
  category: "static",
  label: "反浩克装甲·常驻 buff",
  condition: (ctx: EffectContext): boolean => {
    // 此卡已结附于某角色
    return C.hasAttachment(ctx.state, ctx.cardId);
  },
  execute: (ctx: EffectContext) => ctx.state,
  staticModifier: (ctx: EffectContext): Modifier | null => {
    // staticModifier 在 getEffectivePower 中被调用时，
    // ctx.cardId 是宿主卡（被查询的卡），需要检查是否有此卡的结附
    const attachments = C.getAttachmentIds(ctx.state, ctx.cardId);
    const hasThisCard = attachments.some((aid) => {
      const card = ctx.db.cards.find((c) => c.id === aid);
      return card?.card_no === "SD01-002";
    });
    if (!hasThisCard) return null;
    // 返回 null，修改器已在 attachCard 时通过 createModifier 添加
    return null;
  },
};

// ============================================================
// SD01-003: 我方角色R或战力增加时：敌方战区1张角色本回合战力-1000
// T03修正：新增 once:true
// ============================================================
const sd01_003: CardEffect = {
  id: "SD01-003-0",
  cardNo: "SD01-003",
  category: "trigger",
  trigger: "onStatChange",
  once: true,
  label: "战力削弱",
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    // TODO: 完整实现需要玩家选择目标
    // 简化版：降低敌方第一个场上角色本回合战力 -1000
    const targets = C.getOpponentFieldCardsWithMaxLv(state, ctx.playerIdx, ctx.db, 99);
    if (targets.length > 0) {
      state = H.createModifier(state, targets[0].id, "power", -1000, "turn", ctx.cardId, ctx.db);
      const card = ctx.db.cards.find((c) => c.id === targets[0].id);
      state = {
        ...state,
        log: [...state.log, `⬇️ 「${card?.name ?? targets[0].id}」本回合战力-1000`],
      };
    }
    return state;
  },
};

// ============================================================
// SD01-004: 敌方战斗阶段：此卡战力+X000(X=敌方战区角色数)
// T03修正：condition 增加敌方回合检查；staticModifier 使用确定性 ID
// ============================================================
const sd01_004: CardEffect = {
  id: "SD01-004-0",
  cardNo: "SD01-004",
  category: "static",
  label: "敌方战斗阶段战力提升",
  condition: (ctx: EffectContext): boolean => {
    // 敌方回合的冲突阶段
    return ctx.state.turnPhase === "CONFLICT" &&
      ctx.state.activePlayerIndex !== ctx.playerIdx;
  },
  execute: (ctx: EffectContext) => ctx.state,
  staticModifier: (ctx: EffectContext): Modifier | null => {
    if (ctx.state.turnPhase !== "CONFLICT") return null;
    if (ctx.state.activePlayerIndex === ctx.playerIdx) return null;
    const enemyCount = C.opponentFieldCount(ctx.state, ctx.playerIdx);
    if (enemyCount === 0) return null;
    return {
      id: staticModId("SD01-004", "0"),
      targetCardId: ctx.cardId,
      type: "power",
      value: enemyCount * 1000,
      duration: "turn",
      sourceCardId: ctx.cardId,
    };
  },
};

// ============================================================
// SD01-005: 号召进场时：可撤退我方基地2张卡。若均为红色(attribute=1)，抽2张
// T03修正：标注选发
// ============================================================
const sd01_005: CardEffect = {
  id: "SD01-005-0",
  cardNo: "SD01-005",
  category: "trigger",
  trigger: "onSummon",
  label: "基地撤退+抽卡",
  triggerCondition: (ctx: EffectContext): boolean => {
    return ctx.state.players[ctx.playerIdx].base.length >= 2;
  },
  execute: (ctx: EffectContext) => {
    // TODO: 选发确认 — 玩家可选择是否执行此效果
    // TODO: 完整实现需要玩家选择 2 张基地卡
    // 简化版：撤退前2张基地卡
    let state = ctx.state;
    const p = state.players[ctx.playerIdx];
    const baseCards = [...p.base];
    const retreated = baseCards.splice(0, 2);

    let allRed = true;
    for (const id of retreated) {
      const card = ctx.db.cards.find((c) => c.id === id);
      if (card?.attribute !== 1) allRed = false;
      state = H.retreatCard(state, id, ctx.playerIdx, ctx.db);
    }

    // 若均为红色(attribute=1)，抽2张
    if (allRed && retreated.length === 2) {
      state = H.drawCards(state, ctx.playerIdx, 2, ctx.db);
    }

    return state;
  },
};

// ============================================================
// SD01-006: 舍弃手牌的此卡：撤退我方战区1角色+我方基地1卡+敌方战区1张Lv5以下角色
// ============================================================
const sd01_006: CardEffect = {
  id: "SD01-006-0",
  cardNo: "SD01-006",
  category: "active",
  activeSource: "hand",
  label: "全面撤退",
  cost: (ctx: EffectContext): boolean => {
    const p = ctx.state.players[ctx.playerIdx];
    const hasMyField = C.fieldCount(ctx.state, ctx.playerIdx) > 0;
    const hasMyBase = p.base.length > 0;
    return hasMyField && hasMyBase;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    // 舍弃此卡（从手牌移至撤退区）
    state = H.discardFromHandToRetreat(state, ctx.cardId, ctx.playerIdx);

    // TODO: 完整实现需要玩家选择目标
    // 简化版：自动选择
    // 1. 撤退我方战区第一个角色
    const p = state.players[ctx.playerIdx];
    let myFieldCard: string | null = null;
    for (const z of ["vanguard", "flankLeft", "flankRight", "rear"] as const) {
      if (p.field[z].length > 0) {
        myFieldCard = p.field[z][0];
        break;
      }
    }
    if (myFieldCard) {
      state = H.retreatCard(state, myFieldCard, ctx.playerIdx, ctx.db);
    }

    // 2. 撤退我方基地第一张
    if (state.players[ctx.playerIdx].base.length > 0) {
      state = H.retreatCard(state, state.players[ctx.playerIdx].base[0], ctx.playerIdx, ctx.db);
    }

    // 3. 撤退敌方战区1张Lv5以下角色
    const targets = C.getOpponentFieldCardsWithMaxLv(state, ctx.playerIdx, ctx.db, 5);
    if (targets.length > 0) {
      state = H.retreatCard(state, targets[0].id, 1 - ctx.playerIdx, ctx.db);
    }

    return state;
  },
};

// ============================================================
// SD01-007: 号召进场时：可舍弃1张手牌->敌方战区1张Lv5以下角色本回合战力-2000
// T03修正：标注选发
// ============================================================
const sd01_007: CardEffect = {
  id: "SD01-007-0",
  cardNo: "SD01-007",
  category: "trigger",
  trigger: "onSummon",
  label: "战力削弱",
  triggerCondition: (ctx: EffectContext): boolean => {
    return ctx.state.players[ctx.playerIdx].hand.length > 1 &&
      C.getOpponentFieldCardsWithMaxLv(ctx.state, ctx.playerIdx, ctx.db, 5).length > 0;
  },
  execute: (ctx: EffectContext) => {
    // TODO: 选发确认 — 玩家可选择是否执行此效果
    // TODO: 完整实现需要玩家选择手牌和目标
    // 简化版：舍弃手牌中第一张非此卡的牌
    let state = ctx.state;
    const p = state.players[ctx.playerIdx];
    const discardTarget = p.hand.find((id) => id !== ctx.cardId);
    if (!discardTarget) return state;

    state = H.discardFromHandToRetreat(state, discardTarget, ctx.playerIdx);

    // 降低敌方 Lv5 以下第一张角色战力 -2000
    const targets = C.getOpponentFieldCardsWithMaxLv(state, ctx.playerIdx, ctx.db, 5);
    if (targets.length > 0) {
      state = H.createModifier(state, targets[0].id, "power", -2000, "turn", ctx.cardId, ctx.db);
    }

    return state;
  },
};

// ============================================================
// SD01-008: static(手牌) — 若双方场上均无Lv4+角色，此卡Lv-2（即cost-2）
// T03修正：修正 condition 逻辑（原代码误用 getOpponentFieldCardsWithMinLv 检查我方）；
//          staticModifier 不再硬编码 false，使用确定性 ID
// ============================================================
const sd01_008: CardEffect = {
  id: "SD01-008-0",
  cardNo: "SD01-008",
  category: "static",
  label: "条件降费",
  condition: (ctx: EffectContext): boolean => {
    // 双方场上均无 Lv4+ 角色
    // 检查我方
    const myFieldCards = C.getMyFieldCards(ctx.state, ctx.playerIdx);
    const myHasLv4 = myFieldCards.some((fc) => C.getCardLevel(ctx.db, fc.id) >= 4);
    if (myHasLv4) return false;

    // 检查敌方
    const enemyHasLv4 = C.getOpponentFieldCardsWithMinLv(ctx.state, ctx.playerIdx, ctx.db, 4).length > 0;
    return !enemyHasLv4;
  },
  execute: (ctx: EffectContext) => ctx.state,
  staticModifier: (ctx: EffectContext): Modifier | null => {
    // 重新检查条件（幂等性：每次调用都重新计算）
    const myFieldCards = C.getMyFieldCards(ctx.state, ctx.playerIdx);
    const myHasLv4 = myFieldCards.some((fc) => C.getCardLevel(ctx.db, fc.id) >= 4);
    const enemyHasLv4 = C.getOpponentFieldCardsWithMinLv(ctx.state, ctx.playerIdx, ctx.db, 4).length > 0;
    if (myHasLv4 || enemyHasLv4) return null;

    return {
      id: staticModId("SD01-008", "0"),
      targetCardId: ctx.cardId,
      type: "cost",
      value: -2,
      duration: "turn",
      sourceCardId: ctx.cardId,
    };
  },
};

// ============================================================
// SD01-009: active(hand) + trigger(onRetreat)
// 舍弃1张其他手牌->结附我方角色。撤退时：展示基地1张盖卡，撤退区2张同Lv角色盖放进基地
// ============================================================
const sd01_009_attach: CardEffect = {
  id: "SD01-009-0",
  cardNo: "SD01-009",
  category: "active",
  activeSource: "hand",
  label: "结附",
  cost: (ctx: EffectContext): boolean => {
    return ctx.state.players[ctx.playerIdx].hand.length > 1 &&
      C.fieldCount(ctx.state, ctx.playerIdx) > 0;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    // 舍弃1张其他手牌
    const p = state.players[ctx.playerIdx];
    const discardTarget = p.hand.find((id) => id !== ctx.cardId);
    if (!discardTarget) return state;
    state = H.discardFromHandToRetreat(state, discardTarget, ctx.playerIdx);

    // 结附到我方第一个场上角色
    let hostId: string | null = null;
    for (const z of ["vanguard", "flankLeft", "flankRight", "rear"] as const) {
      if (state.players[ctx.playerIdx].field[z].length > 0) {
        hostId = state.players[ctx.playerIdx].field[z][0];
        break;
      }
    }
    if (!hostId) return state;
    state = H.attachCard(state, ctx.cardId, hostId, ctx.playerIdx, ctx.db);
    return state;
  },
};

const sd01_009_retreat: CardEffect = {
  id: "SD01-009-1",
  cardNo: "SD01-009",
  category: "trigger",
  trigger: "onRetreat",
  label: "撤退时回收",
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    // Q1 修正：展示基地1张盖卡，"同Lv"指被展示的那张盖卡的 Lv
    const p = state.players[ctx.playerIdx];
    if (p.retreat.length < 2) return state;

    // 展示基地第一张盖卡
    if (p.base.length === 0) return state;
    const revealedBaseCardId = p.base[0];
    const baseCard = ctx.db.cards.find((c) => c.id === revealedBaseCardId);
    const revealedLv = baseCard?.cost ?? 1;

    state = {
      ...state,
      log: [...state.log, `🔍 展示基地盖卡「${baseCard?.name ?? "?"}」(Lv${revealedLv})`],
    };

    // 从撤退区找2张与展示盖卡同Lv的角色
    const sameLvCards = p.retreat.filter((id) => {
      const card = ctx.db.cards.find((c) => c.id === id);
      return card && card.cost === revealedLv && id !== ctx.cardId;
    });

    for (let i = 0; i < Math.min(2, sameLvCards.length); i++) {
      state = H.moveToBase(state, sameLvCards[i], ctx.playerIdx, true);
    }

    return state;
  },
};

// ============================================================
// SD01-010: active(hand) + static — 结附我方【人类】角色。static: 宿主R+1
// ============================================================
const sd01_010_attach: CardEffect = {
  id: "SD01-010-0",
  cardNo: "SD01-010",
  category: "active",
  activeSource: "hand",
  label: "结附人类角色",
  cost: (ctx: EffectContext): boolean => {
    // 我方场上有【人类】角色
    return C.getMyFieldCardsWithFeature(ctx.state, ctx.playerIdx, ctx.db, 1).length > 0;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    // 结附到第一个我方【人类】角色
    const targets = C.getMyFieldCardsWithFeature(state, ctx.playerIdx, ctx.db, 1);
    if (targets.length === 0) return state;

    const hostId = targets[0].id;
    state = H.attachCard(state, ctx.cardId, hostId, ctx.playerIdx, ctx.db);

    // 添加常驻修改器：R+1
    state = H.createModifier(state, hostId, "r", 1, "permanent", ctx.cardId, ctx.db);

    return {
      ...state,
      log: [...state.log, `📎 结附人类角色 → R+1`],
    };
  },
};

// ============================================================
// SD01-011: counter(summon) — 可应对号召
// T03修正：按应对规则处理（设置 pendingCounter 状态由引擎层管理）
// ============================================================
const sd01_011: CardEffect = {
  id: "SD01-011-0",
  cardNo: "SD01-011",
  category: "counter",
  counterTarget: "summon",
  label: "应对号召",
  condition: (ctx: EffectContext): boolean => {
    // 应对条件：存在待处理的号召且此卡在手牌中
    return ctx.state.pendingCounter != null;
  },
  execute: (ctx: EffectContext) => {
    // 应对执行：取消正在进行的号召
    // 引擎层在 TRIGGER_COUNTER action 中处理：
    // 1. 将此卡作为应对号召进场
    // 2. 取消原号召
    // 3. 设置 counterUsedThisTurn
    let state = ctx.state;
    if (state.pendingCounter) {
      const summonCard = ctx.db.cards.find((c) => c.id === state.pendingCounter!.summoningCardId);
      state = {
        ...state,
        pendingCounter: null,
        log: [...state.log, `🛡️ 应对号召！取消「${summonCard?.name ?? "?"}」的号召`],
      };
    }
    return state;
  },
};

// SD01-012: 无效果，不注册
// SD01-013: 无效果，不注册

// ============================================================
// SD01-014: trigger(onSummon) — 号召进场时若我方战区角色数<=敌方：敌方战区1张Lv3以下角色本回合战力-2000
// T03修正：标注选发
// ============================================================
const sd01_014: CardEffect = {
  id: "SD01-014-0",
  cardNo: "SD01-014",
  category: "trigger",
  trigger: "onSummon",
  label: "战力削弱",
  triggerCondition: (ctx: EffectContext): boolean => {
    return C.fieldCount(ctx.state, ctx.playerIdx) <= C.opponentFieldCount(ctx.state, ctx.playerIdx);
  },
  execute: (ctx: EffectContext) => {
    // TODO: 选发确认 — 玩家可选择是否执行此效果
    let state = ctx.state;
    const targets = C.getOpponentFieldCardsWithMaxLv(state, ctx.playerIdx, ctx.db, 3);
    if (targets.length > 0) {
      state = H.createModifier(state, targets[0].id, "power", -2000, "turn", ctx.cardId, ctx.db);
    }
    return state;
  },
};

// ============================================================
// SD01-015: trigger(onSummon) — 号召进场时：裁剪我方撤退区1张红色角色。抽1张
// ============================================================
const sd01_015: CardEffect = {
  id: "SD01-015-0",
  cardNo: "SD01-015",
  category: "trigger",
  trigger: "onSummon",
  label: "裁剪+抽卡",
  triggerCondition: (ctx: EffectContext): boolean => {
    // 撤退区有红色(attribute=1)角色
    return C.retreatCount(ctx.state, ctx.playerIdx, ctx.db, { attribute: 1 }) > 0;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    const p = state.players[ctx.playerIdx];
    // 找第一张红色角色
    const redCard = p.retreat.find((id) => {
      const card = ctx.db.cards.find((c) => c.id === id);
      return card?.attribute === 1;
    });
    if (redCard) {
      // 裁剪：从撤退区移至虚空区
      const np = [...state.players] as typeof state.players;
      np[ctx.playerIdx] = {
        ...p,
        retreat: p.retreat.filter((id) => id !== redCard),
        void: [...p.void, redCard],
      };
      state = { ...state, players: np };

      // 抽1张
      state = H.drawCards(state, ctx.playerIdx, 1, ctx.db);
    }
    return state;
  },
};

// ============================================================
// SD01-016: 应对·起动【场上/回合1次】— 结附我方角色，撤退该角色所有其他结附卡
// T03修正：新增 isCounterActive:true, once:true；activeSource 从 "hand" 改为 "field"；
//          execute 改为转移结附逻辑（此卡已在场上作为结附卡，可转移至其他角色）
// ============================================================
const sd01_016_attach: CardEffect = {
  id: "SD01-016-0",
  cardNo: "SD01-016",
  category: "active",
  activeSource: "field",
  isCounterActive: true,
  once: true,
  label: "结附转移+清除",
  cost: (ctx: EffectContext): boolean => {
    // 此卡已在场上（结附于某角色），且有其他我方角色可转移
    let isAttached = false;
    for (const attachIds of Object.values(ctx.state.attachments)) {
      if (attachIds.includes(ctx.cardId)) {
        isAttached = true;
        break;
      }
    }
    if (!isAttached) return false;
    // 至少有2个我方场上角色（当前宿主 + 新宿主）
    return C.fieldCount(ctx.state, ctx.playerIdx) >= 2;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;

    // 找到当前宿主
    let currentHostId: string | null = null;
    for (const [hostId, attachIds] of Object.entries(state.attachments)) {
      if (attachIds.includes(ctx.cardId)) {
        currentHostId = hostId;
        break;
      }
    }
    if (!currentHostId) return state;

    // 找到新宿主（第一个非当前宿主的我方场上角色）
    const p = state.players[ctx.playerIdx];
    let newHostId: string | null = null;
    for (const z of ["vanguard", "flankLeft", "flankRight", "rear"] as const) {
      for (const id of p.field[z]) {
        if (id !== currentHostId) {
          newHostId = id;
          break;
        }
      }
      if (newHostId) break;
    }
    if (!newHostId) return state;

    // 从当前宿主移除此卡
    const currentAttachments = state.attachments[currentHostId] ?? [];
    const newAttachmentsObj = { ...state.attachments };
    const updatedCurrent = currentAttachments.filter((id) => id !== ctx.cardId);
    if (updatedCurrent.length > 0) {
      newAttachmentsObj[currentHostId] = updatedCurrent;
    } else {
      delete newAttachmentsObj[currentHostId];
    }
    state = { ...state, attachments: newAttachmentsObj };

    // 撤退新宿主的所有其他结附卡
    const existingAttachments = state.attachments[newHostId] ?? [];
    for (const aid of existingAttachments) {
      state = H.retreatCard(state, aid, ctx.playerIdx, ctx.db);
    }

    // 结附到新宿主
    const existingAfterRetreat = state.attachments[newHostId] ?? [];
    state = {
      ...state,
      attachments: {
        ...state.attachments,
        [newHostId]: [...existingAfterRetreat, ctx.cardId],
      },
    };

    // 更新修改器：移除旧修改器，为新宿主添加
    state = H.removeModifier(state, ctx.cardId);
    state = H.createModifier(state, newHostId, "power", 1000, "permanent", ctx.cardId, ctx.db);

    // Bug 3 修正：手动结附后触发新宿主的 onAttached 效果
    state = triggerEffectsByTiming(state, newHostId, "onAttached", ctx.db);

    return {
      ...state,
      log: [...state.log, `📎 转移结附至新宿主 → 战力+1000`],
    };
  },
};

// ============================================================
// SD01-017: static — 若我方战区只存在此卡：获【连击】
// T03修正：新增 keywords:["combo"]；移除 staticModifier 中的 null 返回
//          连击能力通过 hasKeyword(state, cardId, "combo", db) 检查
// ============================================================
const sd01_017: CardEffect = {
  id: "SD01-017-0",
  cardNo: "SD01-017",
  category: "static",
  keywords: ["combo"],
  label: "孤军连击",
  condition: (ctx: EffectContext): boolean => {
    // 我方战区只有此卡
    return C.fieldCount(ctx.state, ctx.playerIdx) === 1;
  },
  execute: (ctx: EffectContext) => ctx.state,
  // staticModifier 不需要返回修改器，连击能力通过 keywords 字段标记
  // hasKeyword() 会检查 condition 是否满足
};

// ============================================================
// SD01-018: trigger(onRetreat) — 撤退时：可把卡组顶1张卡盖放进基地。把此卡移回卡组底
// T03修正：标注选发
// ============================================================
const sd01_018: CardEffect = {
  id: "SD01-018-0",
  cardNo: "SD01-018",
  category: "trigger",
  trigger: "onRetreat",
  label: "撤退回收",
  execute: (ctx: EffectContext) => {
    // TODO: 选发确认 — 玩家可选择是否执行此效果
    let state = ctx.state;
    const p = state.players[ctx.playerIdx];

    // 把卡组顶1张卡盖放进基地
    if (p.deck.length > 0 && p.base.length < 6) {
      state = H.deckTopToBase(state, ctx.playerIdx);
    }

    // 把此卡移回卡组底
    state = H.moveToDeckBottom(state, ctx.cardId, ctx.playerIdx, "retreat");

    return state;
  },
};

// ============================================================
// 注册所有 SD01 效果
// ============================================================

/** SD01 所有卡牌效果定义 */
export const SD01_EFFECTS: CardEffect[] = [
  sd01_001,
  sd01_002_attach,
  sd01_002_static,
  sd01_003,
  sd01_004,
  sd01_005,
  sd01_006,
  sd01_007,
  sd01_008,
  sd01_009_attach,
  sd01_009_retreat,
  sd01_010_attach,
  sd01_011,
  sd01_014,
  sd01_015,
  sd01_016_attach,
  sd01_017,
  sd01_018,
];

/** 注册 SD01 所有效果 */
export function registerSD01Effects(): void {
  registerEffects(SD01_EFFECTS);
}
