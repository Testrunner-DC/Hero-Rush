/**
 * SD02 卡牌效果定义
 *
 * SD02 全部 19 张卡牌（SD02-001 ~ SD02-018 角色 + SD02-019 冲击卡）。
 * 无效果的卡（SD02-012, SD02-013）不注册效果。
 *
 * T04 修正摘要：
 * - 移除 genId()，staticModifier 使用确定性 ID `static-${cardNo}-${effectId}`
 * - 唯一性：新增 `isUnique: true`（SD02-001/002）
 * - 回合1次限制：新增 `once: true`（SD02-005/006_active/008/009/011）
 * - 盖伏后起动：新增 `faceDownAfterActive: true`（SD02-005/008/009）
 * - antiMutualKill 关键词：新增 `keywords: ["antiMutualKill"]`（SD02-003_vanguard）
 * - 强袭能力：SD02-016 设置 `temporaryAbilities[cardId] = ["assault"]`
 * - 选发效果已接入 `optional: true` 确认机制（SD02-006_summon/010/015/017）
 * - 需选目标的效果已接入 pendingTargetSelection 挂起机制
 * - SD02-006_active 增加 Lv1 过滤
 */

import type { BattleState } from "../state";
import type { CardEffect, EffectContext, Modifier } from "./types";
import { registerEffects, triggerEffectsByTiming } from "./registry";
import * as H from "./helpers";
import * as C from "./conditions";
import { getEffectiveR } from "../cardUtils";

/**
 * SD02-010/015 共用：从撤退区选 1 张 Lv1 机械角色盖放进基地
 *
 * 多候选（去重后）时挂起目标选择；唯一候选自动选定。
 */
function mechRetreatToBase(ctx: EffectContext, effectId: string): BattleState {
  const state = ctx.state;
  const p = state.players[ctx.playerIdx];
  if (p.baseCards.length + p.baseCovered.length >= 6) return state;

  const mechCards = p.retreat.filter((id) => {
    const card = ctx.db.cards.find((c) => c.id === id);
    return card && card.cost === 1 && C.hasFeature(card, 3);
  });
  const unique = [...new Set(mechCards)];
  if (unique.length === 0) return state;

  let target = ctx.targets?.cardId ?? null;
  if (!target) {
    if (unique.length === 1) {
      target = unique[0];
    } else {
      return H.requestTargetSelection(state, {
        effectCardId: ctx.cardId,
        effectId,
        availableTargets: unique,
        minTargets: 1,
        maxTargets: 1,
        targetPlayerIdx: ctx.playerIdx,
        prompt: "选择要从撤退区盖放进基地的 Lv1 机械角色",
        triggerInfo: ctx.triggerInfo,
      });
    }
  }
  return H.moveToBase(state, target, ctx.playerIdx, true);
}

// ============================================================
// 辅助函数
// ============================================================

/** 生成确定性 staticModifier ID */
function staticModId(cardNo: string, effectId: string): string {
  return `static-${cardNo}-${effectId}`;
}

// ============================================================
// SD02-001: static×2 — 唯一。战力+X000(X=基地盖卡数)。
//           若撤退区>=9张黄色角色：我方Lv1机械角色战力+X000
// T04修正：新增 isUnique:true；staticModifier 使用确定性 ID
// ============================================================
const sd02_001_power: CardEffect = {
  id: "SD02-001-0",
  cardNo: "SD02-001",
  category: "static",
  isUnique: true,
  label: "基地联动战力",
  execute: (ctx: EffectContext) => ctx.state,
  staticModifier: (ctx: EffectContext): Modifier | null => {
    const baseCount = C.baseFaceDownCount(ctx.state, ctx.playerIdx);
    if (baseCount === 0) return null;
    return {
      id: staticModId("SD02-001", "0"),
      targetCardId: ctx.cardId,
      type: "power",
      value: baseCount * 1000,
      duration: "turn",
      sourceCardId: ctx.cardId,
    };
  },
};

const sd02_001_mech: CardEffect = {
  id: "SD02-001-1",
  cardNo: "SD02-001",
  category: "static",
  isUnique: true,
  label: "机械强化",
  condition: (ctx: EffectContext): boolean => {
    // 撤退区 >= 9 张黄色(attribute=2)角色
    return C.retreatCount(ctx.state, ctx.playerIdx, ctx.db, { attribute: 2 }) >= 9;
  },
  execute: (ctx: EffectContext) => ctx.state,
  staticModifier: (ctx: EffectContext): Modifier[] | null => {
    if (C.retreatCount(ctx.state, ctx.playerIdx, ctx.db, { attribute: 2 }) < 9) return null;
    const baseCount = C.baseFaceDownCount(ctx.state, ctx.playerIdx);
    if (baseCount === 0) return null;
    // 作用于所有我方 Lv1 机械(feature=3)角色
    const targets = C.getMyFieldCardsWithFeature(ctx.state, ctx.playerIdx, ctx.db, 3)
      .filter((t) => C.getCardLevel(ctx.db, t.id) === 1);
    if (targets.length === 0) return null;
    return targets.map((t) => ({
      id: `${staticModId("SD02-001", "1")}-${t.id}`,
      targetCardId: t.id,
      type: "power" as const,
      value: baseCount * 1000,
      duration: "turn" as const,
      sourceCardId: ctx.cardId,
    }));
  },
};

// ============================================================
// SD02-002: static + trigger(onAllyDefeated) — 唯一。R+X(X=基地盖卡数)。
//           机械角色战败进撤退区时->盖放进基地
// T04修正：新增 isUnique:true；staticModifier 使用确定性 ID
// ============================================================
const sd02_002_r: CardEffect = {
  id: "SD02-002-0",
  cardNo: "SD02-002",
  category: "static",
  isUnique: true,
  label: "基地联动R",
  execute: (ctx: EffectContext) => ctx.state,
  staticModifier: (ctx: EffectContext): Modifier | null => {
    const baseCount = C.baseFaceDownCount(ctx.state, ctx.playerIdx);
    if (baseCount === 0) return null;
    return {
      id: staticModId("SD02-002", "0"),
      targetCardId: ctx.cardId,
      type: "r",
      value: baseCount,
      duration: "turn",
      sourceCardId: ctx.cardId,
    };
  },
};

const sd02_002_ally: CardEffect = {
  id: "SD02-002-1",
  cardNo: "SD02-002",
  category: "trigger",
  trigger: "onAllyDefeated",
  isUnique: true,
  label: "机械回收",
  triggerCondition: (ctx: EffectContext): boolean => {
    // 被战败的是我方机械(feature含3)角色
    const defeatedCardId = ctx.triggerInfo?.sourceCardId;
    if (!defeatedCardId) return false;
    const card = ctx.db.cards.find((c) => c.id === defeatedCardId);
    return C.hasFeature(card, 3);
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    const defeatedCardId = ctx.triggerInfo?.sourceCardId;
    if (!defeatedCardId) return state;

    // 将战败的机械角色从撤退区移至基地
    const p = state.players[ctx.playerIdx];
    if (p.retreat.includes(defeatedCardId) && (p.baseCards.length + p.baseCovered.length) < 6) {
      const np = [...state.players] as typeof state.players;
      np[ctx.playerIdx] = {
        ...p,
        retreat: p.retreat.filter((id) => id !== defeatedCardId),
        baseCovered: [...p.baseCovered, defeatedCardId],
      };
      state = { ...state, players: np };
    }
    return state;
  },
};

// ============================================================
// SD02-003: static×2 — 先锋时不会因相杀撤退。后卫时敌方先锋角色战力-500
// T04修正：vanguard 新增 keywords:["antiMutualKill"]；rear staticModifier 使用确定性 ID
// ============================================================
const sd02_003_vanguard: CardEffect = {
  id: "SD02-003-0",
  cardNo: "SD02-003",
  category: "static",
  keywords: ["antiMutualKill"],
  label: "先锋坚守",
  condition: (ctx: EffectContext): boolean => {
    // 此卡在先锋区
    return ctx.state.players[ctx.playerIdx].field.vanguard.includes(ctx.cardId);
  },
  execute: (ctx: EffectContext) => ctx.state,
  // antiMutualKill 关键词通过 hasKeyword() 检查
  // 引擎在战斗判定中检查此关键词，不执行相杀撤退
};

const sd02_003_rear: CardEffect = {
  id: "SD02-003-1",
  cardNo: "SD02-003",
  category: "static",
  label: "后卫削弱",
  condition: (ctx: EffectContext): boolean => {
    // 此卡在后卫区
    return ctx.state.players[ctx.playerIdx].field.rear.includes(ctx.cardId);
  },
  execute: (ctx: EffectContext) => ctx.state,
  staticModifier: (ctx: EffectContext): Modifier | null => {
    if (!ctx.state.players[ctx.playerIdx].field.rear.includes(ctx.cardId)) return null;
    // 敌方先锋角色战力-500
    const oppVanguard = ctx.state.players[1 - ctx.playerIdx].field.vanguard;
    if (oppVanguard.length === 0) return null;
    return {
      id: staticModId("SD02-003", "1"),
      targetCardId: oppVanguard[0],
      type: "power",
      value: -500,
      duration: "turn",
      sourceCardId: ctx.cardId,
    };
  },
};

// ============================================================
// SD02-004: counter(summon) — 可应对号召
// ============================================================
const sd02_004: CardEffect = {
  id: "SD02-004-0",
  cardNo: "SD02-004",
  category: "counter",
  counterTarget: "summon",
  label: "应对号召",
  condition: (ctx: EffectContext): boolean => {
    return ctx.state.pendingCounter != null;
  },
  execute: (ctx: EffectContext) => {
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

// ============================================================
// SD02-005: active(base) — 舍弃卡组顶3张->抽1张->盖伏此卡
// T04修正：新增 once:true, faceDownAfterActive:true
// ============================================================
const sd02_005: CardEffect = {
  id: "SD02-005-0",
  cardNo: "SD02-005",
  category: "active",
  activeSource: "base",
  once: true,
  faceDownAfterActive: true,
  label: "卡组操作",
  cost: (ctx: EffectContext): boolean => {
    return ctx.state.players[ctx.playerIdx].deck.length >= 3;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    // 舍弃卡组顶3张
    state = H.millDeck(state, ctx.playerIdx, 3);
    // 抽1张
    state = H.drawCards(state, ctx.playerIdx, 1, ctx.db);
    // 此卡已在基地，盖伏状态不变（faceDownAfterActive 由引擎层处理）
    return state;
  },
};

// ============================================================
// SD02-006: trigger(onSummon) + active(field)
//           号召进场时：可从撤退区结附2张Lv1机械角色。起动：1张Lv1结附卡解除至基地
// T04修正：summon 标注选发；active 新增 once:true，增加 Lv1 过滤
// ============================================================
const sd02_006_summon: CardEffect = {
  id: "SD02-006-0",
  cardNo: "SD02-006",
  category: "trigger",
  trigger: "onSummon",
  optional: true,
  label: "机械结附",
  triggerCondition: (ctx: EffectContext): boolean => {
    // 撤退区有 >=2 张 Lv1 机械角色
    return C.retreatCount(ctx.state, ctx.playerIdx, ctx.db, { maxLevel: 1, feature: 3 }) >= 2;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    const p = state.players[ctx.playerIdx];

    // 从撤退区找Lv1机械角色（同名重复卡去重后供选择）
    const mechCards = p.retreat.filter((id) => {
      const card = ctx.db.cards.find((c) => c.id === id);
      return card && card.cost === 1 && C.hasFeature(card, 3);
    });
    const uniqueMechs = [...new Set(mechCards)];

    // 确定结附目标：玩家选择 2 张（候选恰好可全选时自动选定）
    let toAttach = ctx.targets?.cardIds ?? null;
    if (!toAttach || toAttach.length < 2) {
      if (uniqueMechs.length > 2) {
        return H.requestTargetSelection(state, {
          effectCardId: ctx.cardId,
          effectId: "SD02-006-0",
          availableTargets: uniqueMechs,
          minTargets: 2,
          maxTargets: 2,
          targetPlayerIdx: ctx.playerIdx,
          prompt: "选择要从撤退区结附的 2 张 Lv1 机械角色",
          triggerInfo: ctx.triggerInfo,
        });
      }
      toAttach = mechCards.slice(0, Math.min(2, mechCards.length));
    }
    for (const id of toAttach) {
      // 从撤退区移除
      const np = [...state.players] as typeof state.players;
      np[ctx.playerIdx] = {
        ...state.players[ctx.playerIdx],
        retreat: state.players[ctx.playerIdx].retreat.filter((rid) => rid !== id),
      };
      state = { ...state, players: np };

      // 结附到此卡
      const existing = state.attachments[ctx.cardId] ?? [];
      state = {
        ...state,
        attachments: { ...state.attachments, [ctx.cardId]: [...existing, id] },
      };
    }

    // Bug 3 修正：手动结附后触发此卡（宿主）的 onAttached 效果
    state = triggerEffectsByTiming(state, ctx.cardId, "onAttached", ctx.db);

    return {
      ...state,
      log: [...state.log, `🤖 从撤退区结附${toAttach.length}张Lv1机械角色`],
    };
  },
};

const sd02_006_active: CardEffect = {
  id: "SD02-006-1",
  cardNo: "SD02-006",
  category: "active",
  activeSource: "field",
  once: true,
  label: "解除结附",
  cost: (ctx: EffectContext): boolean => {
    // 需要有 Lv1 机械结附卡
    const attachments = ctx.state.attachments[ctx.cardId] ?? [];
    return attachments.some((aid) => {
      const card = ctx.db.cards.find((c) => c.id === aid);
      return card && card.cost === 1 && C.hasFeature(card, 3);
    });
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    const attachments = state.attachments[ctx.cardId] ?? [];

    // 解除第一张 Lv1 机械结附卡至基地
    const toDetach = attachments.find((aid) => {
      const card = ctx.db.cards.find((c) => c.id === aid);
      return card && card.cost === 1 && C.hasFeature(card, 3);
    });
    if (!toDetach) return state;

    state = H.detachCard(state, toDetach, ctx.cardId, ctx.playerIdx);
    return state;
  },
};

// ============================================================
// SD02-007: active(hand) — 若撤退区只存在黄色角色且>=9张：把手牌的此卡放置进场
// ============================================================
const sd02_007: CardEffect = {
  id: "SD02-007-0",
  cardNo: "SD02-007",
  category: "active",
  activeSource: "hand",
  label: "特殊进场",
  cost: (ctx: EffectContext): boolean => {
    const p = ctx.state.players[ctx.playerIdx];
    if (p.retreat.length < 9) return false;
    // 撤退区全部为黄色(attribute=2)
    return p.retreat.every((id) => {
      const card = ctx.db.cards.find((c) => c.id === id);
      return card?.attribute === 2;
    });
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    const p = state.players[ctx.playerIdx];
    const emptyZones = (["vanguard", "flankLeft", "flankRight", "rear"] as const)
      .filter((z) => p.field[z].length === 0);
    if (emptyZones.length === 0) return state;

    // 确定放置区域：玩家选择（唯一空位时自动选定）
    let targetZone = (ctx.targets?.cardId ?? null) as (typeof emptyZones)[number] | null;
    if (!targetZone || !emptyZones.includes(targetZone)) {
      if (emptyZones.length === 1) {
        targetZone = emptyZones[0];
      } else {
        return H.requestTargetSelection(state, {
          effectCardId: ctx.cardId,
          effectId: "SD02-007-0",
          availableTargets: [...emptyZones],
          minTargets: 1,
          maxTargets: 1,
          targetPlayerIdx: ctx.playerIdx,
          targetKind: "zone",
          prompt: "选择「特殊进场」的放置战区",
        });
      }
    }

    const np = [...state.players] as typeof state.players;
    np[ctx.playerIdx] = {
      ...p,
      hand: p.hand.filter((id) => id !== ctx.cardId),
      field: { ...p.field, [targetZone]: [...p.field[targetZone], ctx.cardId] },
    };
    state = { ...state, players: np };
    return {
      ...state,
      log: [...state.log, `✨ 特殊进场！`],
    };
  },
};

// ============================================================
// SD02-008: active(base) — 我方战区1张角色本回合R+1->盖伏此卡
// T04修正：新增 once:true, faceDownAfterActive:true
// ============================================================
const sd02_008: CardEffect = {
  id: "SD02-008-0",
  cardNo: "SD02-008",
  category: "active",
  activeSource: "base",
  once: true,
  faceDownAfterActive: true,
  label: "R值强化",
  cost: (ctx: EffectContext): boolean => {
    return C.fieldCount(ctx.state, ctx.playerIdx) > 0;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    const candidates = C.getMyFieldCards(state, ctx.playerIdx).map((t) => t.id);
    if (candidates.length === 0) return state;

    let targetId = ctx.targets?.cardId ?? null;
    if (!targetId) {
      if (candidates.length === 1) {
        targetId = candidates[0];
      } else {
        return H.requestTargetSelection(state, {
          effectCardId: ctx.cardId,
          effectId: "SD02-008-0",
          availableTargets: candidates,
          minTargets: 1,
          maxTargets: 1,
          targetPlayerIdx: ctx.playerIdx,
          prompt: "选择 R+1 的我方角色（本回合）",
        });
      }
    }

    state = H.createModifier(state, targetId, "r", 1, "turn", ctx.cardId, ctx.db);
    return {
      ...state,
      log: [...state.log, `⬆️ 我方角色R+1（本回合）`],
    };
  },
};

// ============================================================
// SD02-009: active(base) — 敌方战区1张角色本回合战力-1000->盖伏此卡
// T04修正：新增 once:true, faceDownAfterActive:true
// ============================================================
const sd02_009: CardEffect = {
  id: "SD02-009-0",
  cardNo: "SD02-009",
  category: "active",
  activeSource: "base",
  once: true,
  faceDownAfterActive: true,
  label: "战力削弱",
  cost: (ctx: EffectContext): boolean => {
    return C.opponentFieldCount(ctx.state, ctx.playerIdx) > 0;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    const candidates = C.getMyFieldCards(state, 1 - ctx.playerIdx).map((t) => t.id);
    if (candidates.length === 0) return state;

    let targetId = ctx.targets?.cardId ?? null;
    if (!targetId) {
      if (candidates.length === 1) {
        targetId = candidates[0];
      } else {
        return H.requestTargetSelection(state, {
          effectCardId: ctx.cardId,
          effectId: "SD02-009-0",
          availableTargets: candidates,
          minTargets: 1,
          maxTargets: 1,
          targetPlayerIdx: 1 - ctx.playerIdx,
          prompt: "选择要削弱的敌方角色（本回合战力 -1000）",
        });
      }
    }

    state = H.createModifier(state, targetId, "power", -1000, "turn", ctx.cardId, ctx.db);
    return {
      ...state,
      log: [...state.log, `⬇️ 敌方角色战力-1000（本回合）`],
    };
  },
};

// ============================================================
// SD02-010: trigger(onSummon) — 号召进场时：撤退区1张Lv1机械角色->基地
// T04修正：标注选发
// ============================================================
const sd02_010: CardEffect = {
  id: "SD02-010-0",
  cardNo: "SD02-010",
  category: "trigger",
  trigger: "onSummon",
  optional: true,
  label: "机械回收",
  triggerCondition: (ctx: EffectContext): boolean => {
    return C.retreatCount(ctx.state, ctx.playerIdx, ctx.db, { maxLevel: 1, feature: 3 }) > 0;
  },
  execute: (ctx: EffectContext) =>
    mechRetreatToBase(ctx, "SD02-010-0"),
};

// ============================================================
// SD02-011: trigger(onAllyDefeated, 后卫时) — 我方Lv3以下角色战败时：展示基地1张盖卡，若同Lv则翻开
// T04修正：新增 once:true
// ============================================================
const sd02_011: CardEffect = {
  id: "SD02-011-0",
  cardNo: "SD02-011",
  category: "trigger",
  trigger: "onAllyDefeated",
  once: true,
  label: "基地翻卡",
  triggerCondition: (ctx: EffectContext): boolean => {
    // 此卡在后卫区
    if (!ctx.state.players[ctx.playerIdx].field.rear.includes(ctx.cardId)) return false;
    // 被战败的是我方 Lv3 以下角色
    const defeatedCardId = ctx.triggerInfo?.sourceCardId;
    if (!defeatedCardId) return false;
    return C.getCardLevel(ctx.db, defeatedCardId) <= 3;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    const p = state.players[ctx.playerIdx];
    if (p.baseCovered.length === 0) return state;

    const defeatedCardId = ctx.triggerInfo?.sourceCardId;
    if (!defeatedCardId) return state;
    const defeatedLv = C.getCardLevel(ctx.db, defeatedCardId);

    const chosen = ctx.targets?.cardIds ?? [];

    // 阶段1：选择展示哪张基地盖卡（唯一时自动选定）
    let baseCardId = chosen[0] ?? null;
    if (!baseCardId) {
      if (p.baseCovered.length === 1) {
        baseCardId = p.baseCovered[0];
      } else {
        return H.requestTargetSelection(state, {
          effectCardId: ctx.cardId,
          effectId: "SD02-011-0",
          availableTargets: [...p.baseCovered],
          minTargets: 1,
          maxTargets: 1,
          targetPlayerIdx: ctx.playerIdx,
          prompt: "选择要展示的基地盖卡（与战败角色同 Lv 则翻开进场）",
          triggerInfo: ctx.triggerInfo,
        });
      }
    }

    const baseCard = ctx.db.cards.find((c) => c.id === baseCardId);
    const baseLv = baseCard?.cost ?? 0;

    // 若不同 Lv：仅展示
    if (baseLv !== defeatedLv) {
      return {
        ...state,
        log: [...state.log, `🔍 展示基地盖卡「${baseCard?.name ?? "?"}」(Lv${baseLv})，与战败角色不同Lv`],
      };
    }

    // 同 Lv：阶段2 选择放置区域（唯一空位时自动选定；无空位则仅展示）
    const emptyZones = (["vanguard", "flankLeft", "flankRight", "rear"] as const)
      .filter((z) => p.field[z].length === 0);
    let targetZone = (chosen[1] ?? null) as (typeof emptyZones)[number] | null;
    if (!targetZone || !emptyZones.includes(targetZone)) {
      if (emptyZones.length === 0) {
        return {
          ...state,
          log: [...state.log, `🔍 展示基地盖卡「${baseCard?.name ?? "?"}」(Lv${baseLv})，但战区已满无法进场`],
        };
      }
      if (emptyZones.length === 1) {
        targetZone = emptyZones[0];
      } else {
        return H.requestTargetSelection(state, {
          effectCardId: ctx.cardId,
          effectId: "SD02-011-0",
          availableTargets: [...emptyZones],
          minTargets: 1,
          maxTargets: 1,
          targetPlayerIdx: ctx.playerIdx,
          targetKind: "zone",
          collectedTargets: [baseCardId],
          prompt: `「${baseCard?.name ?? "?"}」同 Lv！选择翻开进场的战区`,
          triggerInfo: ctx.triggerInfo,
        });
      }
    }

    const np = [...state.players] as typeof state.players;
    np[ctx.playerIdx] = {
      ...p,
      baseCovered: p.baseCovered.filter((id) => id !== baseCardId),
      field: { ...p.field, [targetZone]: [...p.field[targetZone], baseCardId] },
    };
    state = { ...state, players: np };
    return {
      ...state,
      log: [...state.log, `🔍 展示基地盖卡「${baseCard?.name ?? "?"}」(Lv${baseLv})，同Lv翻开进场！`],
    };
  },
};

// SD02-012: 无效果，不注册
// SD02-013: 无效果，不注册

// ============================================================
// SD02-014: trigger(onAttack) — 攻击时若目标Lv4+：本回合战力+1500
// ============================================================
const sd02_014: CardEffect = {
  id: "SD02-014-0",
  cardNo: "SD02-014",
  category: "trigger",
  trigger: "onAttack",
  label: "对强敌强化",
  triggerCondition: (ctx: EffectContext): boolean => {
    // 目标 Lv4+（从 triggerInfo 或 targets 获取目标）
    const targetCardId = ctx.targets?.cardId ?? ctx.triggerInfo?.sourceCardId;
    if (!targetCardId) return false;
    return C.getCardLevel(ctx.db, targetCardId) >= 4;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    state = H.createModifier(state, ctx.cardId, "power", 1500, "turn", ctx.cardId, ctx.db);
    return {
      ...state,
      log: [...state.log, `⬆️ 攻击强敌！本回合战力+1500`],
    };
  },
};

// ============================================================
// SD02-015: trigger(onSummon) — 号召进场时：撤退区1张Lv1机械角色->基地
// T04修正：标注选发
// ============================================================
const sd02_015: CardEffect = {
  id: "SD02-015-0",
  cardNo: "SD02-015",
  category: "trigger",
  trigger: "onSummon",
  optional: true,
  label: "机械回收",
  triggerCondition: (ctx: EffectContext): boolean => {
    return C.retreatCount(ctx.state, ctx.playerIdx, ctx.db, { maxLevel: 1, feature: 3 }) > 0;
  },
  execute: (ctx: EffectContext) =>
    mechRetreatToBase(ctx, "SD02-015-0"),
};

// ============================================================
// SD02-016: trigger(onSummon) — 号召进场时：本回合获【强袭】
// T04修正：实际设置 temporaryAbilities[cardId] = ["assault"]
//          hasKeyword() 通过 temporaryAbilities 检查强袭能力
// ============================================================
const sd02_016: CardEffect = {
  id: "SD02-016-0",
  cardNo: "SD02-016",
  category: "trigger",
  trigger: "onSummon",
  label: "强袭",
  execute: (ctx: EffectContext) => {
    // 设置本回合临时能力：强袭
    const tempAbilities = { ...(ctx.state.temporaryAbilities ?? {}) };
    const existing = tempAbilities[ctx.cardId] ?? [];
    if (!existing.includes("assault")) {
      tempAbilities[ctx.cardId] = [...existing, "assault"];
    }

    return {
      ...ctx.state,
      temporaryAbilities: tempAbilities,
      log: [...ctx.state.log, `💪 「${ctx.db.cards.find((c) => c.id === ctx.cardId)?.name ?? "?"}」获得强袭能力（本回合）`],
    };
  },
};

// ============================================================
// SD02-017: trigger(onSummon) — 号召进场时：敌方先锋角色本回合战力-1000
// T04修正：标注选发
// ============================================================
const sd02_017: CardEffect = {
  id: "SD02-017-0",
  cardNo: "SD02-017",
  category: "trigger",
  trigger: "onSummon",
  optional: true,
  label: "先锋削弱",
  triggerCondition: (ctx: EffectContext): boolean => {
    // 敌方先锋区有角色
    return ctx.state.players[1 - ctx.playerIdx].field.vanguard.length > 0;
  },
  execute: (ctx: EffectContext) => {
    let state = ctx.state;
    const oppVanguard = state.players[1 - ctx.playerIdx].field.vanguard;
    if (oppVanguard.length > 0) {
      state = H.createModifier(state, oppVanguard[0], "power", -1000, "turn", ctx.cardId, ctx.db);
    }
    return state;
  },
};

// ============================================================
// SD02-018: static — 若敌方先锋角色R=1：此卡战力+1500
// Q2 确认：R=1 指当前有效R值（含修改器），使用 getEffectiveR
// ============================================================
const sd02_018: CardEffect = {
  id: "SD02-018-0",
  cardNo: "SD02-018",
  category: "static",
  label: "对弱者强化",
  condition: (ctx: EffectContext): boolean => {
    const oppVanguard = ctx.state.players[1 - ctx.playerIdx].field.vanguard;
    if (oppVanguard.length === 0) return false;
    // Q2 修正：使用当前有效R值（含修改器）
    const effectiveR = getEffectiveR(ctx.state, oppVanguard[0], ctx.db);
    return effectiveR === 1;
  },
  execute: (ctx: EffectContext) => ctx.state,
  staticModifier: (ctx: EffectContext): Modifier | null => {
    const oppVanguard = ctx.state.players[1 - ctx.playerIdx].field.vanguard;
    if (oppVanguard.length === 0) return null;
    // Q2 修正：使用当前有效R值（含修改器）
    const effectiveR = getEffectiveR(ctx.state, oppVanguard[0], ctx.db);
    if (effectiveR !== 1) return null;
    return {
      id: staticModId("SD02-018", "0"),
      targetCardId: ctx.cardId,
      type: "power",
      value: 1500,
      duration: "turn",
      sourceCardId: ctx.cardId,
    };
  },
};

// ============================================================
// 注册所有 SD02 效果
// ============================================================

/** SD02 所有卡牌效果定义 */
export const SD02_EFFECTS: CardEffect[] = [
  sd02_001_power,
  sd02_001_mech,
  sd02_002_r,
  sd02_002_ally,
  sd02_003_vanguard,
  sd02_003_rear,
  sd02_004,
  sd02_005,
  sd02_006_summon,
  sd02_006_active,
  sd02_007,
  sd02_008,
  sd02_009,
  sd02_010,
  sd02_011,
  sd02_014,
  sd02_015,
  sd02_016,
  sd02_017,
  sd02_018,
];

/** 注册 SD02 所有效果 */
export function registerSD02Effects(): void {
  registerEffects(SD02_EFFECTS);
}
