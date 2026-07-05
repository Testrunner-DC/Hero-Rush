/**
 * 效果系统原子操作函数
 *
 * 每个函数接收当前状态和参数，返回新的 BattleState（不可变更新）。
 * 被 sd01.ts/sd02.ts 的效果定义调用，也可被引擎直接调用。
 */

import type { BattleState, Zone, PlayerState } from "../state";
import type { CardDatabase } from "../../types/card";
import type { Modifier } from "./types";
import { triggerEffectsByTiming } from "./registry";

/** 战区列表 */
const ZONE_LIST: Zone[] = ["vanguard", "flankLeft", "flankRight", "rear"];

/** 生成唯一 ID */
let modIdCounter = 0;
export function genModifierId(): string {
  modIdCounter++;
  return `mod-${Date.now()}-${modIdCounter}`;
}

// ============================================================
// 目标选择挂起（suspension）
// ============================================================

/** requestTargetSelection 的参数 */
export interface TargetSelectionRequest {
  /** 效果来源卡 ID */
  effectCardId: string;
  /** 效果 ID */
  effectId: string;
  /** 可选目标：cardId[] 或 targetKind="zone" 时的战区 ID 列表 */
  availableTargets: string[];
  minTargets: number;
  maxTargets: number;
  /** 目标所属玩家 idx */
  targetPlayerIdx: number;
  targetKind?: "card" | "zone";
  /** 多阶段选择时，之前阶段已确认的目标 */
  collectedTargets?: string[];
  /** 给 UI 的提示文案 */
  prompt?: string;
  /** 触发型效果的触发信息（挂起后重入时恢复） */
  triggerInfo?: {
    event: string;
    sourceCardId?: string;
    sourcePlayerIdx?: number;
  };
}

/**
 * 挂起效果执行，等待玩家选择目标
 *
 * 卡效 execute 内调用：当 ctx.targets 缺少所需目标时，返回本函数的结果并直接 return。
 * 玩家通过 SELECT_TARGETS 确认后，引擎会带上 targets 重新调用 execute。
 * 多阶段选择：把已确认的目标放进 collectedTargets，重入时它们会出现在 ctx.targets.cardIds 前部。
 */
export function requestTargetSelection(
  state: BattleState,
  req: TargetSelectionRequest
): BattleState {
  return {
    ...state,
    pendingTargetSelection: {
      effectCardId: req.effectCardId,
      effectId: req.effectId,
      availableTargets: req.availableTargets,
      minTargets: req.minTargets,
      maxTargets: req.maxTargets,
      targetPlayerIdx: req.targetPlayerIdx,
      selectionType: "effect_target",
      selectedTargetIds: [],
      targetKind: req.targetKind ?? "card",
      collectedTargets: req.collectedTargets ?? [],
      prompt: req.prompt,
      triggerInfo: req.triggerInfo,
    },
  };
}

// ============================================================
// 抽卡
// ============================================================

/**
 * 从卡组抽 N 张牌到手牌
 * @param state 当前状态
 * @param playerIdx 玩家 index
 * @param count 抽牌数
 * @param db 卡牌数据库
 * @returns 新状态
 */
export function drawCards(
  state: BattleState,
  playerIdx: number,
  count: number,
  db: CardDatabase
): BattleState {
  const p = state.players[playerIdx];
  const deck = [...p.deck];
  const drawCount = Math.min(count, deck.length);
  const drawn = deck.splice(0, drawCount);
  const hand = [...p.hand, ...drawn];

  const np = [...state.players] as typeof state.players;
  np[playerIdx] = { ...p, deck, hand };

  const drawnNames = drawn
    .map((id) => db.cards.find((c) => c.id === id)?.name ?? id)
    .join(", ");

  return {
    ...state,
    players: np,
    log: [
      ...state.log,
      `📥 抽${drawCount}张牌: ${drawnNames}`,
    ],
  };
}

// ============================================================
// 撤退
// ============================================================

/**
 * 将场上角色或基地盖卡移至撤退区
 *
 * 如果被撤退的卡有结附卡，结附卡一并进入撤退区。
 * 同时移除该卡相关的所有修改器。
 *
 * @param state 当前状态
 * @param cardId 要撤退的卡牌 ID
 * @param playerIdx 卡牌所属玩家
 * @param db 卡牌数据库
 * @returns 新状态
 */
export function retreatCard(
  state: BattleState,
  cardId: string,
  playerIdx: number,
  db: CardDatabase
): BattleState {
  const p = state.players[playerIdx];
  const np = [...state.players] as typeof state.players;
  let npP: PlayerState = { ...p };
  let newField = { ...npP.field };
  for (const z of ZONE_LIST) newField[z] = [...npP.field[z]];
  let newBaseCards = [...npP.baseCards];
  let newBaseCovered = [...npP.baseCovered];
  let newRetreat = [...npP.retreat];
  const card = db.cards.find((c) => c.id === cardId);
  let found = false;

  // 从战区移除
  for (const z of ZONE_LIST) {
    if (newField[z].includes(cardId)) {
      newField[z] = newField[z].filter((id) => id !== cardId);
      found = true;
      break;
    }
  }

  // 从基地移除（检查正面和背面）
  if (!found && newBaseCards.includes(cardId)) {
    newBaseCards = newBaseCards.filter((id) => id !== cardId);
    found = true;
  }
  if (!found && newBaseCovered.includes(cardId)) {
    newBaseCovered = newBaseCovered.filter((id) => id !== cardId);
    found = true;
  }

  if (!found) return state;

  newRetreat.push(cardId);

  // 处理结附卡：一并进入撤退区
  const attachments = state.attachments[cardId] ?? [];
  for (const attachId of attachments) {
    newRetreat.push(attachId);
  }

  npP = { ...npP, field: newField, baseCards: newBaseCards, baseCovered: newBaseCovered, retreat: newRetreat };
  np[playerIdx] = npP;

  // 移除该卡的所有修改器
  const newModifiers = state.modifiers.filter(
    (m) => m.sourceCardId !== cardId && m.targetCardId !== cardId
  );

  // 移除结附关系
  const newAttachments = { ...state.attachments };
  delete newAttachments[cardId];

  // 清除该卡的临时能力（本回合获得的关键词能力在撤退时消失）
  let newTemporaryAbilities = state.temporaryAbilities;
  if (newTemporaryAbilities && newTemporaryAbilities[cardId]) {
    newTemporaryAbilities = { ...newTemporaryAbilities };
    delete newTemporaryAbilities[cardId];
  }

  // Q6 修正：清除该卡的所有附加状态
  // 1. conflictAttackCount 中删除该卡的计数
  let newConflictAttackCount = state.conflictAttackCount;
  if (newConflictAttackCount && newConflictAttackCount[cardId] !== undefined) {
    newConflictAttackCount = { ...newConflictAttackCount };
    delete newConflictAttackCount[cardId];
  }

  // 2. interceptUsedThisTurn 中删除该卡
  let newInterceptUsedThisTurn = state.interceptUsedThisTurn;
  if (newInterceptUsedThisTurn && newInterceptUsedThisTurn.includes(cardId)) {
    newInterceptUsedThisTurn = newInterceptUsedThisTurn.filter((id) => id !== cardId);
  }

  // 3. 清除作为结附卡的关系（此卡结附在其他宿主上时）
  const newAttachmentsForRetreat = { ...newAttachments };
  for (const [hostId, attachIds] of Object.entries(newAttachmentsForRetreat)) {
    if (attachIds.includes(cardId)) {
      const filtered = attachIds.filter((id) => id !== cardId);
      if (filtered.length > 0) {
        newAttachmentsForRetreat[hostId] = filtered;
      } else {
        delete newAttachmentsForRetreat[hostId];
      }
    }
  }

  return {
    ...state,
    players: np,
    modifiers: newModifiers,
    attachments: newAttachmentsForRetreat,
    temporaryAbilities: newTemporaryAbilities,
    conflictAttackCount: newConflictAttackCount,
    interceptUsedThisTurn: newInterceptUsedThisTurn,
    log: [
      ...state.log,
      `📍 「${card?.name ?? cardId}」撤退至撤退区${attachments.length > 0 ? ` (结附卡${attachments.length}张一并撤退)` : ""}`,
    ],
  };
}

// ============================================================
// 裁剪（trim）
// ============================================================

/**
 * 裁剪：将场上角色直接移至撤退区（不经过战斗判定）
 *
 * 与 retreatCard 的区别：trimCard 仅处理战区角色，不处理基地卡。
 * 结附卡同样一并进入撤退区。
 *
 * @param state 当前状态
 * @param cardId 要裁剪的卡牌 ID
 * @param playerIdx 卡牌所属玩家
 * @param db 卡牌数据库
 * @returns 新状态
 */
export function trimCard(
  state: BattleState,
  cardId: string,
  playerIdx: number,
  db: CardDatabase
): BattleState {
  // trimCard 本质与 retreatCard 相同（都是从场上移到撤退区）
  // 语义上 trim 强调"不经过战斗判定"，但实现一致
  const result = retreatCard(state, cardId, playerIdx, db);
  // 覆盖日志
  const card = db.cards.find((c) => c.id === cardId);
  return {
    ...result,
    log: [
      ...result.log.slice(0, -1),
      `✂️ 裁剪「${card?.name ?? cardId}」→ 撤退区`,
    ],
  };
}

// ============================================================
// 结附
// ============================================================

/**
 * 将手牌中的卡牌结附到场上角色
 *
 * 从手牌移除结附卡，添加到 attachments[hostId]。
 *
 * @param state 当前状态
 * @param attachmentId 结附卡 ID
 * @param hostId 宿主卡 ID
 * @param playerIdx 玩家 index
 * @returns 新状态
 */
export function attachCard(
  state: BattleState,
  attachmentId: string,
  hostId: string,
  playerIdx: number,
  db: CardDatabase
): BattleState {
  const p = state.players[playerIdx];
  const np = [...state.players] as typeof state.players;
  np[playerIdx] = { ...p, hand: p.hand.filter((id) => id !== attachmentId) };

  const existingAttachments = state.attachments[hostId] ?? [];
  const newAttachments = {
    ...state.attachments,
    [hostId]: [...existingAttachments, attachmentId],
  };

  let result: BattleState = {
    ...state,
    players: np,
    attachments: newAttachments,
    log: [
      ...state.log,
      `📎 结附卡贴至宿主`,
    ],
  };

  // Bug 3 修正：结附后触发宿主的 onAttached 效果（SD01-001 依赖此触发）
  result = triggerEffectsByTiming(result, hostId, "onAttached", db);

  return result;
}

/**
 * 解除结附：将结附卡从宿主移至基地
 *
 * @param state 当前状态
 * @param attachmentId 结附卡 ID
 * @param hostId 宿主卡 ID
 * @param playerIdx 玩家 index
 * @returns 新状态
 */
export function detachCard(
  state: BattleState,
  attachmentId: string,
  hostId: string,
  playerIdx: number
): BattleState {
  const existingAttachments = state.attachments[hostId] ?? [];
  const newAttachmentList = existingAttachments.filter((id) => id !== attachmentId);

  const newAttachments = { ...state.attachments };
  if (newAttachmentList.length > 0) {
    newAttachments[hostId] = newAttachmentList;
  } else {
    delete newAttachments[hostId];
  }

  const p = state.players[playerIdx];
  const np = [...state.players] as typeof state.players;
  np[playerIdx] = { ...p, baseCovered: [...p.baseCovered, attachmentId] };

  // 移除结附卡提供的修改器
  const newModifiers = state.modifiers.filter(
    (m) => m.sourceCardId !== attachmentId
  );

  return {
    ...state,
    players: np,
    attachments: newAttachments,
    modifiers: newModifiers,
    log: [
      ...state.log,
      `📤 解除结附 → 基地`,
    ],
  };
}

// ============================================================
// 修改器
// ============================================================

/**
 * 添加修改器
 * @param state 当前状态
 * @param modifier 修改器
 * @returns 新状态
 */
export function addModifier(state: BattleState, modifier: Modifier): BattleState {
  return {
    ...state,
    modifiers: [...state.modifiers, modifier],
  };
}

/**
 * 创建并添加一个修改器（便捷方法）
 *
 * Bug 3 修正：新增可选 db 参数。当传入 db 且 value > 0 且 type 为 power/r 时，
 * 触发目标卡牌的 onStatChange 效果（SD01-003 依赖此触发）。
 *
 * @param state 当前状态
 * @param targetCardId 目标卡牌
 * @param type 修改类型
 * @param value 修改值
 * @param duration 持续时间
 * @param sourceCardId 来源卡牌
 * @param db 卡牌数据库（可选，传入时启用 onStatChange 触发）
 * @returns 新状态
 */
export function createModifier(
  state: BattleState,
  targetCardId: string,
  type: "power" | "r" | "cost",
  value: number,
  duration: "turn" | "permanent",
  sourceCardId: string,
  db?: CardDatabase
): BattleState {
  const modifier: Modifier = {
    id: genModifierId(),
    targetCardId,
    type,
    value,
    duration,
    sourceCardId,
  };
  let result = addModifier(state, modifier);

  // Bug 3 修正：当战力或R值增加时，触发 onStatChange 效果
  if (db && value > 0 && (type === "power" || type === "r")) {
    result = triggerEffectsByTiming(result, targetCardId, "onStatChange", db);
  }

  return result;
}

/**
 * 移除来源卡的所有修改器
 * @param state 当前状态
 * @param sourceCardId 来源卡牌 ID
 * @returns 新状态
 */
export function removeModifier(state: BattleState, sourceCardId: string): BattleState {
  return {
    ...state,
    modifiers: state.modifiers.filter((m) => m.sourceCardId !== sourceCardId),
  };
}

// ============================================================
// 基地操作
// ============================================================

/**
 * 将卡牌移至基地
 * @param state 当前状态
 * @param cardId 卡牌 ID
 * @param playerIdx 玩家 index
 * @param faceDown 是否盖放（当前所有基地卡都是盖放）
 * @returns 新状态
 */
export function moveToBase(
  state: BattleState,
  cardId: string,
  playerIdx: number,
  _faceDown: boolean = true
): BattleState {
  const p = state.players[playerIdx];
  if ((p.baseCards.length + p.baseCovered.length) >= 6) return state;

  const np = [...state.players] as typeof state.players;
  let npP = { ...p };

  // 尝试从战区移除
  let newField = { ...npP.field };
  for (const z of ZONE_LIST) newField[z] = [...npP.field[z]];
  let found = false;
  for (const z of ZONE_LIST) {
    if (newField[z].includes(cardId)) {
      newField[z] = newField[z].filter((id) => id !== cardId);
      found = true;
      break;
    }
  }

  // 尝试从撤退区移除
  let newRetreat = [...npP.retreat];
  if (!found && newRetreat.includes(cardId)) {
    newRetreat = newRetreat.filter((id) => id !== cardId);
    found = true;
  }

  if (!found) return state;

  npP = { ...npP, field: newField, retreat: newRetreat, baseCovered: [...npP.baseCovered, cardId] };
  np[playerIdx] = npP;

  return {
    ...state,
    players: np,
    log: [...state.log, `🏠 卡牌移至基地`],
  };
}

// ============================================================
// 从撤退区号召
// ============================================================

/**
 * 从撤退区号召卡牌到场上
 * @param state 当前状态
 * @param cardId 卡牌 ID
 * @param playerIdx 玩家 index
 * @param zone 目标区域
 * @returns 新状态
 */
export function summonFromRetreat(
  state: BattleState,
  cardId: string,
  playerIdx: number,
  zone: Zone
): BattleState {
  const p = state.players[playerIdx];
  if (!p.retreat.includes(cardId)) return state;
  if (p.field[zone].length >= 1) return state;

  const np = [...state.players] as typeof state.players;
  np[playerIdx] = {
    ...p,
    retreat: p.retreat.filter((id) => id !== cardId),
    field: { ...p.field, [zone]: [...p.field[zone], cardId] },
  };

  return {
    ...state,
    players: np,
    log: [...state.log, `♻️ 从撤退区号召至${zone}`],
  };
}

// ============================================================
// 从手牌弃至虚空区
// ============================================================

/**
 * 从手牌弃至虚空区
 * @param state 当前状态
 * @param cardId 卡牌 ID
 * @param playerIdx 玩家 index
 * @returns 新状态
 */
export function discardFromHand(
  state: BattleState,
  cardId: string,
  playerIdx: number
): BattleState {
  const p = state.players[playerIdx];
  if (!p.hand.includes(cardId)) return state;

  const np = [...state.players] as typeof state.players;
  np[playerIdx] = {
    ...p,
    hand: p.hand.filter((id) => id !== cardId),
    void: [...p.void, cardId],
  };

  return {
    ...state,
    players: np,
    log: [...state.log, `🗑️ 手牌弃至虚空区`],
  };
}

/**
 * 从手牌弃至撤退区（部分效果要求"舍弃手牌"）
 * @param state 当前状态
 * @param cardId 卡牌 ID
 * @param playerIdx 玩家 index
 * @returns 新状态
 */
export function discardFromHandToRetreat(
  state: BattleState,
  cardId: string,
  playerIdx: number
): BattleState {
  const p = state.players[playerIdx];
  if (!p.hand.includes(cardId)) return state;

  const np = [...state.players] as typeof state.players;
  np[playerIdx] = {
    ...p,
    hand: p.hand.filter((id) => id !== cardId),
    retreat: [...p.retreat, cardId],
  };

  return {
    ...state,
    players: np,
    log: [...state.log, `📍 手牌弃至撤退区`],
  };
}

// ============================================================
// 卡组顶/底操作
// ============================================================

/**
 * 将卡组顶 1 张牌盖放进基地
 * @param state 当前状态
 * @param playerIdx 玩家 index
 * @returns 新状态
 */
export function deckTopToBase(state: BattleState, playerIdx: number): BattleState {
  const p = state.players[playerIdx];
  if (p.deck.length === 0) return state;
  if ((p.baseCards.length + p.baseCovered.length) >= 6) return state;

  const deck = [...p.deck];
  const cardId = deck.shift()!;

  const np = [...state.players] as typeof state.players;
  np[playerIdx] = { ...p, deck, baseCovered: [...p.baseCovered, cardId] };

  return {
    ...state,
    players: np,
    log: [...state.log, `🏠 卡组顶1张盖放进基地`],
  };
}

/**
 * 将卡牌放回卡组底
 * @param state 当前状态
 * @param cardId 卡牌 ID
 * @param playerIdx 玩家 index
 * @param fromZone 来源（"field" | "retreat"）
 * @returns 新状态
 */
export function moveToDeckBottom(
  state: BattleState,
  cardId: string,
  playerIdx: number,
  fromZone: "field" | "retreat"
): BattleState {
  const p = state.players[playerIdx];
  const np = [...state.players] as typeof state.players;
  let npP = { ...p };

  if (fromZone === "field") {
    let newField = { ...npP.field };
    for (const z of ZONE_LIST) newField[z] = [...npP.field[z]];
    for (const z of ZONE_LIST) {
      if (newField[z].includes(cardId)) {
        newField[z] = newField[z].filter((id) => id !== cardId);
        npP = { ...npP, field: newField };
        break;
      }
    }
  } else if (fromZone === "retreat") {
    npP = { ...npP, retreat: npP.retreat.filter((id) => id !== cardId) };
  }

  npP = { ...npP, deck: [...npP.deck, cardId] };
  np[playerIdx] = npP;

  // 移除相关修改器
  const newModifiers = state.modifiers.filter(
    (m) => m.sourceCardId !== cardId && m.targetCardId !== cardId
  );

  return {
    ...state,
    players: np,
    modifiers: newModifiers,
    log: [...state.log, `📦 卡牌放回卡组底`],
  };
}

/**
 * 舍弃卡组顶 N 张牌
 * @param state 当前状态
 * @param playerIdx 玩家 index
 * @param count 舍弃数量
 * @returns 新状态
 */
export function millDeck(
  state: BattleState,
  playerIdx: number,
  count: number
): BattleState {
  const p = state.players[playerIdx];
  const deck = [...p.deck];
  const millCount = Math.min(count, deck.length);
  const milled = deck.splice(0, millCount);

  const np = [...state.players] as typeof state.players;
  np[playerIdx] = { ...p, deck };

  return {
    ...state,
    players: np,
    log: [...state.log, `📜 舍弃卡组顶${millCount}张`],
  };
}

// ============================================================
// 卡组洗牌与手牌操作（T02 新增）
// ============================================================

/**
 * 洗混卡组（Fisher-Yates 洗牌算法）
 *
 * 非纯函数（使用 Math.random），但与 GameSetup.tsx 中的 shuffleArray 保持一致。
 * 引擎本身不执行洗牌（保持与现有架构一致），此函数供 UI 层调用。
 *
 * @param deck 卡牌 ID 数组
 * @returns 洗混后的新数组（不修改原数组）
 */
export function shuffleDeck(deck: string[]): string[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 将手牌中指定卡牌放回卡组底，返回新状态（不可变更新）
 *
 * 用于开局调度：玩家选择要调整的手牌，放回卡组底后再洗混抽等量。
 *
 * @param state 当前状态
 * @param playerIdx 玩家 index
 * @param cardIds 要放回卡组底的手牌 ID 列表
 * @returns 新状态
 */
export function moveHandCardsToDeckBottom(
  state: BattleState,
  playerIdx: number,
  cardIds: string[]
): BattleState {
  const p = state.players[playerIdx];
  const np = [...state.players] as typeof state.players;
  np[playerIdx] = {
    ...p,
    hand: p.hand.filter((id) => !cardIds.includes(id)),
    deck: [...p.deck, ...cardIds],
  };

  return {
    ...state,
    players: np,
  };
}
