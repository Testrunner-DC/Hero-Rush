import { otherPlayerV2 } from "../invariants";
import { starterContinuousDeltaV2, starterContinuousReplacementV2 } from "../cards/starterContinuous";
import { promoAttackTargetRestrictionV2, promoContinuousDeltaV2, promoContinuousReplacementV2, promoPowerReductionMitigationV2, promoPowerReductionMultiplierV2 } from "../cards/promoContinuous";
import { effectiveKeywordsV2 } from "./keywords";
import { isCardProtectedFromCharacterEffectV2 } from "./suppression";
import { nextRandom } from "../random";
import { legalAttackTargetsV2 } from "../battleTargetRules";
import type {
  AtomicOperationV2,
  AtomicOperationKindV2,
  CardInstanceIdV2,
  GameEventV2,
  GameStateV2,
  ModifierStateV2,
  PlayerIndex,
  PlayerStateV2,
} from "../model";

export interface AtomicOperationDescriptorV2 {
  kind: AtomicOperationKindV2;
  label: string;
  category: "卡牌移动" | "数值" | "区域" | "附着" | "能力";
  description: string;
  stateCheckAfter: true;
}

export interface AtomicExecutionTraceV2 {
  index: number;
  kind: AtomicOperationKindV2;
  validationIssues: string[];
  emittedEvents: GameEventV2["type"][];
  gameFinished: boolean;
  succeeded: boolean;
}

export const ATOMIC_OPERATION_CATALOG_V2: readonly AtomicOperationDescriptorV2[] = [
  { kind: "DRAW", label: "抽牌", category: "卡牌移动", description: "从主卡组顶移动指定数量卡牌到手牌。", stateCheckAfter: true },
  { kind: "DISCARD", label: "舍弃卡牌", category: "卡牌移动", description: "把指定手牌或牌库卡牌移动到拥有者撤退区。", stateCheckAfter: true },
  { kind: "DISCARD_DECK_TOP", label: "舍弃牌库顶", category: "卡牌移动", description: "按顺序把主卡组顶指定数量卡牌移动到撤退区。", stateCheckAfter: true },
  { kind: "BANISH_DECK_TOP", label: "裁剪卡组顶", category: "卡牌移动", description: "按顺序把主卡组顶指定数量卡牌移动到虚空区。", stateCheckAfter: true },
  { kind: "REVEAL_RANDOM_HAND", label: "随机展示手牌", category: "卡牌移动", description: "使用对局确定性随机状态，从指定玩家手牌中随机展示指定数量卡牌。", stateCheckAfter: true },
  { kind: "RETREAT_RANDOM_BASE_COVERED", label: "随机撤退基地盖卡", category: "卡牌移动", description: "使用对局确定性随机状态，从指定玩家基地盖卡中随机撤退 1 张。", stateCheckAfter: true },
  { kind: "COVER_RANDOM_HAND", label: "随机盖放手牌", category: "卡牌移动", description: "使用对局确定性随机状态，从指定玩家手牌中随机选择 1 张盖放进其基地。", stateCheckAfter: true },
  { kind: "RETREAT", label: "撤退", category: "卡牌移动", description: "将角色及其结附链移动到拥有者撤退区。", stateCheckAfter: true },
  { kind: "BANISH", label: "裁剪", category: "卡牌移动", description: "把指定卡牌移动到拥有者虚空区；宿主的结附卡按规则进入撤退区。", stateCheckAfter: true },
  { kind: "MOVE_TO_BASE", label: "放置进基地", category: "区域", description: "把卡牌正面放置或背面盖放进拥有者基地。", stateCheckAfter: true },
  { kind: "PLACE_FIELD", label: "放置进战区", category: "区域", description: "把卡牌正面放置进指定空战区；这不是号召。", stateCheckAfter: true },
  { kind: "COVER", label: "盖伏", category: "区域", description: "刷新场上卡牌状态并把它作为盖卡放进基地。", stateCheckAfter: true },
  { kind: "REVEAL", label: "展示", category: "卡牌移动", description: "向双方公开指定卡牌正面信息，但不改变所在区域。", stateCheckAfter: true },
  { kind: "FLIP_BASE_FACE_UP", label: "翻开基地盖卡", category: "区域", description: "把基地盖卡翻为正面角色并恢复卡牌信息。", stateCheckAfter: true },
  { kind: "MOVE_TO_DECK_BOTTOM", label: "移至卡组底", category: "卡牌移动", description: "把指定卡牌移动到拥有者主卡组底。", stateCheckAfter: true },
  { kind: "MOVE_TO_DECK_TOP", label: "移至卡组顶", category: "卡牌移动", description: "把指定卡牌移动到拥有者主卡组顶。", stateCheckAfter: true },
  { kind: "MOVE_FIELD", label: "场上移动", category: "区域", description: "在四个战区之间移动一名角色。", stateCheckAfter: true },
  { kind: "MOVE_BATTLE_BASE", label: "效果战基移动", category: "区域", description: "由效果使角色在战区与基地之间进行一次合法战基移动。", stateCheckAfter: true },
  { kind: "RETURN_TO_HAND", label: "移回手牌", category: "卡牌移动", description: "把指定卡牌及应跟随宿主的结附链移回各自拥有者手牌。", stateCheckAfter: true },
  { kind: "MOVE_TO_HAND", label: "加入手牌", category: "卡牌移动", description: "把效果指定的卡牌从当前区域移动到拥有者手牌。", stateCheckAfter: true },
  { kind: "SWAP_POSITIONS", label: "互相替换", category: "区域", description: "依来源区域同时交换两张卡的位置，并分别判定移动或放置。", stateCheckAfter: true },
  { kind: "ADD_MODIFIER", label: "添加数值修正", category: "数值", description: "添加战力、距离或等级的替换/增减修正。", stateCheckAfter: true },
  { kind: "REMOVE_MODIFIER", label: "移除数值修正", category: "数值", description: "按稳定标识移除一个数值修正。", stateCheckAfter: true },
  { kind: "GRANT_KEYWORD", label: "获得关键词", category: "能力", description: "向角色授予有明确期限的 1.02 官方关键词能力。", stateCheckAfter: true },
  { kind: "REMOVE_KEYWORD", label: "移除关键词", category: "能力", description: "按稳定标识移除动态关键词；印刷【唯一】永远不会因此失去。", stateCheckAfter: true },
  { kind: "ATTACH", label: "结附", category: "附着", description: "将一张卡从原区域移出并结附到宿主。", stateCheckAfter: true },
  { kind: "DETACH", label: "解除结附", category: "附着", description: "解除结附并移动到手牌、撤退区、基地或指定空战区。", stateCheckAfter: true },
  { kind: "MARK_EFFECT_USED", label: "记录回合一次", category: "能力", description: "记录稳定效果键，直到当前玩家下个回合重置。", stateCheckAfter: true },
  { kind: "FORBID_SUMMON_PAYMENT", label: "禁止作为号召素材", category: "能力", description: "本回合禁止指定角色因支付号召费用而撤退。", stateCheckAfter: true },
  { kind: "FORBID_HIGH_LEVEL_SUMMON_PAYMENT", label: "禁止高等级号召素材", category: "能力", description: "本回合禁止指定玩家撤退达到等级阈值的角色进行号召。", stateCheckAfter: true },
  { kind: "FORBID_MOVE", label: "禁止战基移动", category: "能力", description: "本回合禁止指定角色在战区与基地之间移动。", stateCheckAfter: true },
  { kind: "REORDER_DECK_CARDS", label: "重排卡组顶底", category: "卡牌移动", description: "把已查看的卡牌按玩家指定顺序分别放回主卡组顶和卡组底。", stateCheckAfter: true },
  { kind: "GRANT_COPIED_EFFECTS", label: "获得卡牌效果", category: "能力", description: "使目标卡在指定期间获得另一张卡的已登记效果与印刷关键词。", stateCheckAfter: true },
  { kind: "GRANT_ADDITIONAL_CHARACTER_ATTACK", label: "获得限定额外攻击", category: "能力", description: "使角色本回合获得第 2 次攻击机会，且该次机会只能攻击敌方角色。", stateCheckAfter: true },
  { kind: "REDIRECT_ATTACK_TARGET", label: "变更攻击目标", category: "能力", description: "在战斗应对中把当前攻击变更到另一个仍符合攻击规则的目标。", stateCheckAfter: true },
  { kind: "SKIP_BATTLE_PHASE", label: "跳过战斗阶段", category: "能力", description: "记录指定回合玩家在本回合结束行动后直接进入回合应对。", stateCheckAfter: true },
  { kind: "FORBID_ATTACK", label: "禁止本回合攻击", category: "能力", description: "使指定战区角色在本回合不再获得攻击机会。", stateCheckAfter: true },
] as const;

export function validateAtomicOperationV2(state: GameStateV2, operation: AtomicOperationV2): string[] {
  const issues: string[] = [];
  if (operation.kind === "DRAW") {
    if (!Number.isInteger(operation.count) || operation.count <= 0) issues.push("抽牌数量必须是正整数");
  } else if (operation.kind === "DISCARD" || operation.kind === "BANISH") {
    if (operation.cardIds.length === 0) issues.push(`${operation.kind === "DISCARD" ? "舍弃" : "裁剪"}原子至少需要一张卡`);
    if (operation.cardIds.some((id) => !state.cards[id])) issues.push("卡牌移动目标包含不存在的实体");
  } else if (operation.kind === "DISCARD_DECK_TOP" || operation.kind === "BANISH_DECK_TOP" || operation.kind === "REVEAL_RANDOM_HAND") {
    if (!Number.isInteger(operation.count) || operation.count <= 0) issues.push("牌库顶舍弃数量必须是正整数");
  } else if (operation.kind === "RETREAT_RANDOM_BASE_COVERED") {
    if (state.players[operation.actor].baseCovered.length === 0) issues.push("随机撤退需要至少 1 张基地盖卡");
  } else if (operation.kind === "COVER_RANDOM_HAND") {
    if (state.players[operation.actor].hand.length === 0) issues.push("随机盖放需要至少 1 张手牌");
    if (state.players[operation.actor].baseCards.length + state.players[operation.actor].baseCovered.length >= 6) issues.push("随机盖放玩家的基地已满");
  } else if (operation.kind === "RETREAT") {
    if (operation.cardIds.length === 0) issues.push("撤退原子至少需要一张卡");
    if (operation.cardIds.some((id) => !state.cards[id])) issues.push("撤退目标包含不存在的卡牌实例");
  } else if (operation.kind === "MOVE_FIELD" || operation.kind === "MOVE_BATTLE_BASE" || operation.kind === "MOVE_TO_BASE" || operation.kind === "PLACE_FIELD" || operation.kind === "COVER" || operation.kind === "FLIP_BASE_FACE_UP" || operation.kind === "MOVE_TO_DECK_BOTTOM" || operation.kind === "MOVE_TO_DECK_TOP") {
    if (!state.cards[operation.cardId]) issues.push("移动目标不存在");
    if (operation.kind === "PLACE_FIELD" && operation.controller !== undefined && operation.controller !== 0 && operation.controller !== 1) issues.push("放置控制者非法");
    if (operation.kind === "MOVE_TO_BASE" && operation.controller !== undefined && operation.controller !== 0 && operation.controller !== 1) issues.push("基地放置控制者非法");
    if (operation.kind === "MOVE_TO_BASE" && operation.face === "down" && operation.controller !== undefined && operation.controller !== state.cards[operation.cardId]?.owner) issues.push("不能把卡牌盖放进非拥有者基地");
  } else if (operation.kind === "RETURN_TO_HAND" || operation.kind === "MOVE_TO_HAND") {
    if (operation.cardIds.length === 0) issues.push("回手原子至少需要一张卡");
    if (operation.cardIds.some((id) => !state.cards[id])) issues.push("回手目标包含不存在的卡牌");
  } else if (operation.kind === "SWAP_POSITIONS") {
    if (operation.cardIds[0] === operation.cardIds[1]) issues.push("互相替换需要两张不同卡牌");
    if (operation.cardIds.some((id) => !state.cards[id])) issues.push("互相替换目标包含不存在的卡牌");
  } else if (operation.kind === "REVEAL") {
    if (operation.cardIds.length === 0) issues.push("展示原子至少需要一张卡");
    if (operation.cardIds.some((id) => !state.cards[id])) issues.push("展示目标包含不存在的卡牌");
  } else if (operation.kind === "ADD_MODIFIER") {
    if (!state.cards[operation.modifier.sourceCardId]) issues.push("数值修正来源不存在");
    if (!state.cards[operation.modifier.targetCardId]) issues.push("数值修正目标不存在");
    if (!Number.isFinite(operation.modifier.value)) issues.push("数值修正必须是有限数值");
  } else if (operation.kind === "REMOVE_MODIFIER") {
    if (!operation.modifierId.trim()) issues.push("数值修正标识不能为空");
  } else if (operation.kind === "GRANT_KEYWORD") {
    if (!state.cards[operation.grant.sourceCardId]) issues.push("关键词来源不存在");
    if (!state.cards[operation.grant.targetCardId]) issues.push("关键词目标不存在");
    if (!operation.grant.id.trim()) issues.push("关键词授予标识不能为空");
    if (operation.grant.keyword === "unique") {
      const target = state.cards[operation.grant.targetCardId];
      if (target) {
        const player = state.players[target.owner];
        const onField = [
          ...player.baseCards,
          ...Object.values(player.field).flat(),
          ...Object.values(state.attachments).flat().filter((id) => state.cards[id]?.owner === target.owner),
        ];
        if (onField.some((id) => id !== operation.grant.targetCardId && state.cards[id]?.cardNo === target.cardNo)) {
          issues.push("不能向存在同名场上卡牌的角色授予【唯一】");
        }
      }
    }
  } else if (operation.kind === "REMOVE_KEYWORD") {
    if (!operation.grantId.trim()) issues.push("关键词授予标识不能为空");
    if ((state.keywordGrants ?? []).find((grant) => grant.id === operation.grantId)?.keyword === "unique") issues.push("【唯一】能力不能失去");
  } else if (operation.kind === "ATTACH") {
    if (!state.cards[operation.cardId] || !state.cards[operation.hostCardId]) issues.push("结附卡或宿主不存在");
    if (operation.cardId === operation.hostCardId) issues.push("卡牌不能结附到自身");
  } else if (operation.kind === "DETACH") {
    if (!state.cards[operation.cardId]) issues.push("解除结附目标不存在");
    if (!Object.values(state.attachments).some((ids) => ids.includes(operation.cardId))) issues.push("解除目标当前不是结附卡");
    if (operation.destination === "base") {
      const owner = state.cards[operation.cardId]?.owner;
      if (owner !== undefined && state.players[owner].baseCards.length + state.players[owner].baseCovered.length >= 6) issues.push("解除目标的基地已满");
    } else if (["vanguard", "flankLeft", "flankRight", "rear"].includes(operation.destination)) {
      const owner = state.cards[operation.cardId]?.owner;
      if (owner !== undefined && state.players[owner].field[operation.destination as keyof PlayerStateV2["field"]].length > 0) issues.push("解除目标战区已有角色");
    }
  } else if (operation.kind === "MARK_EFFECT_USED") {
    if (!operation.key.trim()) issues.push("回合一次效果键不能为空");
  } else if (operation.kind === "FORBID_SUMMON_PAYMENT") {
    if (!state.cards[operation.cardId]) issues.push("禁止号召支付的角色不存在");
  } else if (operation.kind === "FORBID_HIGH_LEVEL_SUMMON_PAYMENT") {
    if (!Number.isInteger(operation.minimumLevel) || operation.minimumLevel < 1) issues.push("禁止号召支付的等级阈值必须为正整数");
  } else if (operation.kind === "FORBID_MOVE") {
    if (!state.cards[operation.cardId]) issues.push("禁止移动目标不存在");
  } else if (operation.kind === "REORDER_DECK_CARDS") {
    const all = [...operation.topCardIds, ...operation.bottomCardIds];
    if (operation.inspectedCardIds.length === 0) issues.push("重排卡组至少需要 1 张已查看卡牌");
    if (new Set(operation.inspectedCardIds).size !== operation.inspectedCardIds.length || new Set(all).size !== all.length) issues.push("重排卡组不能包含重复卡牌");
    if (all.length !== operation.inspectedCardIds.length || all.some((id) => !operation.inspectedCardIds.includes(id))) issues.push("卡组顶与卡组底分组必须完整覆盖已查看卡牌");
    if (operation.inspectedCardIds.some((id) => !state.players[operation.actor].deck.includes(id))) issues.push("已查看卡牌必须仍在该玩家主卡组中");
  } else if (operation.kind === "GRANT_COPIED_EFFECTS") {
    if (!state.cards[operation.grant.sourceCardId] || !state.cards[operation.grant.targetCardId] || !state.cards[operation.grant.copiedFromCardId]) issues.push("效果复制来源、目标或被复制卡不存在");
    if (!operation.grant.id.trim() || !operation.grant.copiedCardNo.trim()) issues.push("效果复制标识与卡号不能为空");
  } else if (operation.kind === "GRANT_ADDITIONAL_CHARACTER_ATTACK") {
    if (!state.cards[operation.cardId]) issues.push("额外攻击机会目标不存在");
  } else if (operation.kind === "REDIRECT_ATTACK_TARGET") {
    const attackerId = state.battle?.attackerId;
    if (!attackerId || !state.battle?.target) issues.push("当前没有可变更目标的攻击");
    else {
      const legal = legalAttackTargetsV2(state, state.activePlayer, attackerId, (id) => effectiveValueV2(state, id, "range"), (id, keyword) => effectiveKeywordsV2(state, id).includes(keyword), (id, candidate) => promoAttackTargetRestrictionV2(state, id, candidate, (cardId) => effectiveValueV2(state, cardId, "level")));
      if (!legal.some((target) => JSON.stringify(target) === JSON.stringify(operation.target))) issues.push("新目标不符合当前攻击规则");
      if (JSON.stringify(state.battle.target) === JSON.stringify(operation.target)) issues.push("新目标必须与当前目标不同");
    }
  } else if (operation.kind === "SKIP_BATTLE_PHASE") {
    if (operation.actor !== state.activePlayer) issues.push("只能令当前回合玩家跳过战斗阶段");
  } else if (operation.kind === "FORBID_ATTACK") {
    if (!state.cards[operation.cardId]) issues.push("禁止攻击目标不存在");
  }
  return issues;
}

export function validateAtomicOperationsV2(state: GameStateV2, operations: readonly AtomicOperationV2[]): string[] {
  return operations.flatMap((operation, index) => validateAtomicOperationV2(state, operation).map((issue) => `原子 ${index + 1}（${operation.kind}）：${issue}`));
}

const effectiveValueEvaluationStackV2 = new WeakMap<GameStateV2, Set<string>>();

function explicitValueV2(
  state: GameStateV2,
  cardId: CardInstanceIdV2,
  type: ModifierStateV2["type"],
): number {
  const card = state.cards[cardId];
  if (!card) return 0;
  const base = type === "power" ? card.power : type === "range" ? card.range : card.level;
  const modifiers = state.modifiers.filter((modifier) => modifier.targetCardId === cardId && modifier.type === type);
  const replaced = modifiers.reduce((value, modifier) => modifier.mode === "replace" ? modifier.value : value, base);
  const delta = modifiers
    .filter((modifier) => (modifier.mode ?? "delta") === "delta")
    .reduce((sum, modifier) => sum + modifier.value, 0);
  return Math.max(0, replaced + delta);
}

export function effectiveValueV2(
  state: GameStateV2,
  cardId: CardInstanceIdV2,
  type: ModifierStateV2["type"],
): number {
  const card = state.cards[cardId];
  if (!card) return 0;
  const evaluationKey = `${cardId}:${type}`;
  const activeEvaluations = effectiveValueEvaluationStackV2.get(state) ?? new Set<string>();
  if (activeEvaluations.has(evaluationKey)) return explicitValueV2(state, cardId, type);
  if (!effectiveValueEvaluationStackV2.has(state)) effectiveValueEvaluationStackV2.set(state, activeEvaluations);
  activeEvaluations.add(evaluationKey);
  try {
    const base = type === "power" ? card.power : type === "range" ? card.range : card.level;
    const modifiers = state.modifiers.filter((modifier) => modifier.targetCardId === cardId && modifier.type === type);
    const explicitReplacement = modifiers.reduce((value, modifier) => modifier.mode === "replace" ? modifier.value : value, base);
    const replaced = starterContinuousReplacementV2(state, cardId, type)
      ?? promoContinuousReplacementV2(state, cardId, type, (id) => effectiveValueV2(state, id, "range"))
      ?? explicitReplacement;
    const deltas = modifiers.filter((modifier) => (modifier.mode ?? "delta") === "delta").map((modifier) => modifier.value);
    const positiveDelta = deltas.filter((value) => value >= 0).reduce((sum, value) => sum + value, 0);
    const negativeDelta = deltas.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
    const continuousDelta = starterContinuousDeltaV2(state, cardId, type, (id, valueType) => effectiveValueV2(state, id, valueType))
      + promoContinuousDeltaV2(state, cardId, type, (id) => effectiveKeywordsV2(state, id).length, (id) => effectiveValueV2(state, id, "level"), (id) => effectiveValueV2(state, id, "range"), (id) => effectiveValueV2(state, id, "power"));
    const reductionMultiplier = type === "power" ? promoPowerReductionMultiplierV2(state, cardId) : 1;
    const totalDelta = positiveDelta + negativeDelta * reductionMultiplier + (continuousDelta < 0 ? continuousDelta * reductionMultiplier : continuousDelta);
    const mitigation = type === "power" && totalDelta < 0
      ? Math.min(-totalDelta, promoPowerReductionMitigationV2(state, cardId))
      : 0;
    return Math.max(0, replaced + totalDelta + mitigation);
  } finally {
    activeEvaluations.delete(evaluationKey);
    if (activeEvaluations.size === 0) effectiveValueEvaluationStackV2.delete(state);
  }
}

function faceUpCharacterIdsV2(state: GameStateV2): string[] {
  return [...new Set(state.players.flatMap((player) => [
    ...player.baseCards,
    ...Object.values(player.field).flat(),
    ...Object.values(state.attachments).flat(),
  ]))];
}

function valueSnapshotV2(state: GameStateV2): Map<string, { power: number; range: number }> {
  return new Map(faceUpCharacterIdsV2(state).map((id) => [id, {
    power: effectiveValueV2(state, id, "power"),
    range: effectiveValueV2(state, id, "range"),
  }]));
}

function operationSourceCardIdV2(operation: AtomicOperationV2): string | null {
  if (operation.kind === "ADD_MODIFIER") return operation.modifier.sourceCardId;
  if (operation.kind === "GRANT_KEYWORD") return operation.grant.sourceCardId;
  if ("sourceCardId" in operation && operation.sourceCardId) return operation.sourceCardId;
  if ("cardId" in operation) return operation.cardId;
  return null;
}

function filterCharacterEffectImmuneTargetsV2(
  state: GameStateV2,
  operation: AtomicOperationV2,
  effectSourceCardId?: CardInstanceIdV2,
): AtomicOperationV2 | null {
  if (!effectSourceCardId || !state.cards[effectSourceCardId]) return operation;
  const sourceLevel = effectiveValueV2(state, effectSourceCardId, "level");
  const protectedTarget = (cardId: string): boolean => isCardProtectedFromCharacterEffectV2(state, cardId, effectSourceCardId, sourceLevel);

  if (operation.kind === "DISCARD" || operation.kind === "RETREAT" || operation.kind === "BANISH" || operation.kind === "REVEAL" || operation.kind === "RETURN_TO_HAND" || operation.kind === "MOVE_TO_HAND") {
    const cardIds = operation.cardIds.filter((id) => !protectedTarget(id));
    return cardIds.length > 0 ? { ...operation, cardIds } as AtomicOperationV2 : null;
  }
  if (operation.kind === "SWAP_POSITIONS") return operation.cardIds.some(protectedTarget) ? null : operation;
  if (operation.kind === "ADD_MODIFIER") return protectedTarget(operation.modifier.targetCardId) ? null : operation;
  if (operation.kind === "REMOVE_MODIFIER") {
    const target = state.modifiers.find((item) => item.id === operation.modifierId)?.targetCardId;
    return target && protectedTarget(target) ? null : operation;
  }
  if (operation.kind === "GRANT_KEYWORD") return protectedTarget(operation.grant.targetCardId) ? null : operation;
  if (operation.kind === "GRANT_COPIED_EFFECTS") return protectedTarget(operation.grant.targetCardId) ? null : operation;
  if (operation.kind === "REMOVE_KEYWORD") {
    const target = (state.keywordGrants ?? []).find((item) => item.id === operation.grantId)?.targetCardId;
    return target && protectedTarget(target) ? null : operation;
  }
  if (operation.kind === "ATTACH") return protectedTarget(operation.cardId) || protectedTarget(operation.hostCardId) ? null : operation;
  if (operation.kind === "MOVE_TO_BASE" || operation.kind === "PLACE_FIELD" || operation.kind === "COVER" || operation.kind === "FLIP_BASE_FACE_UP" || operation.kind === "MOVE_TO_DECK_BOTTOM" || operation.kind === "MOVE_TO_DECK_TOP" || operation.kind === "MOVE_FIELD" || operation.kind === "MOVE_BATTLE_BASE" || operation.kind === "DETACH" || operation.kind === "FORBID_SUMMON_PAYMENT" || operation.kind === "FORBID_MOVE" || operation.kind === "FORBID_ATTACK" || operation.kind === "GRANT_ADDITIONAL_CHARACTER_ATTACK") {
    return protectedTarget(operation.cardId) ? null : operation;
  }
  return operation;
}

function valueChangeEventsV2(before: ReadonlyMap<string, { power: number; range: number }>, state: GameStateV2, sourceCardId: string | null): GameEventV2[] {
  const after = valueSnapshotV2(state);
  const events: GameEventV2[] = [];
  for (const [targetCardId, previous] of before) {
    const current = after.get(targetCardId);
    if (!current) continue;
    const source = sourceCardId ?? targetCardId;
    if (current.power !== previous.power) events.push({ type: "CARD_VALUE_CHANGED", sourceCardId: source, targetCardId, valueType: "power", delta: current.power - previous.power });
    if (current.range !== previous.range) events.push({ type: "CARD_VALUE_CHANGED", sourceCardId: source, targetCardId, valueType: "range", delta: current.range - previous.range });
  }
  return events;
}

/** Detects continuous/replacement value changes caused by non-atomic rules transitions. */
export function detectValueChangeEventsV2(before: GameStateV2, after: GameStateV2, sourceCardId: string | null = null): GameEventV2[] {
  return valueChangeEventsV2(valueSnapshotV2(before), after, sourceCardId);
}

function removeFromFieldAndBase(player: PlayerStateV2, cardIds: ReadonlySet<string>): PlayerStateV2 {
  return {
    ...player,
    baseCards: player.baseCards.filter((id) => !cardIds.has(id)),
    baseCovered: player.baseCovered.filter((id) => !cardIds.has(id)),
    field: {
      vanguard: player.field.vanguard.filter((id) => !cardIds.has(id)),
      flankLeft: player.field.flankLeft.filter((id) => !cardIds.has(id)),
      flankRight: player.field.flankRight.filter((id) => !cardIds.has(id)),
      rear: player.field.rear.filter((id) => !cardIds.has(id)),
    },
  };
}

function attachmentClosure(state: GameStateV2, cardIds: readonly string[]): Set<string> {
  const selected = new Set(cardIds);
  const pending = [...cardIds];
  while (pending.length > 0) {
    const host = pending.pop()!;
    for (const attached of state.attachments[host] ?? []) {
      if (!selected.has(attached)) {
        selected.add(attached);
        pending.push(attached);
      }
    }
  }
  return selected;
}

export function retreatClosureCardIdsV2(state: GameStateV2, cardIds: readonly string[]): string[] {
  return [...attachmentClosure(state, cardIds)];
}

function followedAttachmentCardIdsV2(state: GameStateV2, cardIds: readonly string[]): string[] {
  const roots = new Set(cardIds);
  return retreatClosureCardIdsV2(state, cardIds).filter((id) => !roots.has(id));
}

function removeFromAllPlayerZones(player: PlayerStateV2, cardIds: ReadonlySet<string>): PlayerStateV2 {
  const without = removeFromFieldAndBase(player, cardIds);
  return {
    ...without,
    deck: without.deck.filter((id) => !cardIds.has(id)),
    rushDeck: without.rushDeck.filter((id) => !cardIds.has(id)),
    hand: without.hand.filter((id) => !cardIds.has(id)),
    timeline: without.timeline.filter((id) => !cardIds.has(id)),
    retreat: without.retreat.filter((id) => !cardIds.has(id)),
    void: without.void.filter((id) => !cardIds.has(id)),
  };
}

export function retreatCardsV2(state: GameStateV2, cardIds: readonly string[]): GameStateV2 {
  const selected = attachmentClosure(state, cardIds);
  const players = state.players.map((player, seat) => {
    const without = removeFromAllPlayerZones(player, selected);
    const owned = [...selected].filter((id) => state.cards[id]?.owner === seat);
    return { ...without, retreat: [...without.retreat, ...owned.filter((id) => !without.retreat.includes(id))] };
  }) as GameStateV2["players"];
  const attachments = Object.fromEntries(
    Object.entries(state.attachments)
      .filter(([host]) => !selected.has(host))
      .map(([host, attached]) => [host, attached.filter((id) => !selected.has(id))])
      .filter(([, attached]) => attached.length > 0),
  );
  return { ...state, players, attachments };
}

function moveCardsToOwnerZoneV2(state: GameStateV2, cardIds: readonly string[], zone: "retreat" | "void"): GameStateV2 {
  const selected = new Set(cardIds);
  const players = state.players.map((player, seat) => {
    const without = removeFromAllPlayerZones(player, selected);
    const owned = [...selected].filter((id) => state.cards[id]?.owner === seat);
    return { ...without, [zone]: [...without[zone], ...owned.filter((id) => !without[zone].includes(id))] };
  }) as GameStateV2["players"];
  const attachments = Object.fromEntries(
    Object.entries(state.attachments).map(([host, cards]) => [host, cards.filter((id) => !selected.has(id))]).filter(([, cards]) => cards.length > 0),
  );
  return { ...state, players, attachments };
}

function moveCardsToOwnerHandsV2(state: GameStateV2, cardIds: readonly string[]): GameStateV2 {
  const selected = attachmentClosure(state, cardIds);
  const players = state.players.map((player, seat) => {
    const without = removeFromAllPlayerZones(player, selected);
    const owned = [...selected].filter((id) => state.cards[id]?.owner === seat);
    return { ...without, hand: [...without.hand, ...owned.filter((id) => !without.hand.includes(id))] };
  }) as GameStateV2["players"];
  const attachments = Object.fromEntries(
    Object.entries(state.attachments)
      .filter(([host]) => !selected.has(host))
      .map(([host, cards]) => [host, cards.filter((id) => !selected.has(id))])
      .filter(([, cards]) => cards.length > 0),
  );
  return { ...state, players, attachments };
}

function fieldLocationV2(state: GameStateV2, cardId: string): { owner: PlayerIndex; zone: keyof PlayerStateV2["field"] } | null {
  const owner = state.cards[cardId]?.owner;
  if (owner === undefined) return null;
  const zone = (Object.keys(state.players[owner].field) as Array<keyof PlayerStateV2["field"]>)
    .find((item) => state.players[owner].field[item].includes(cardId));
  return zone ? { owner, zone } : null;
}

function coverCardV2(state: GameStateV2, cardId: string): GameStateV2 {
  const owner = state.cards[cardId]?.owner;
  if (owner === undefined) return state;
  const attachments = state.attachments[cardId] ?? [];
  let next = attachments.length ? retreatCardsV2(state, attachments) : state;
  const selected = new Set([cardId]);
  const players = next.players.map((player, seat) => {
    const without = removeFromAllPlayerZones(player, selected);
    return seat === owner ? { ...without, baseCovered: [...without.baseCovered, cardId] } : without;
  }) as GameStateV2["players"];
  const nextAttachments = Object.fromEntries(Object.entries(next.attachments).filter(([host]) => host !== cardId));
  return {
    ...next,
    players,
    attachments: nextAttachments,
    modifiers: next.modifiers.filter((modifier) => modifier.targetCardId !== cardId),
    keywordGrants: next.keywordGrants.filter((grant) => grant.targetCardId !== cardId),
    // 官方裁定：盖卡不再是此前的角色，因此清除“该角色当回合进场”状态。
    // 之后翻开只恢复为角色卡，不会重新产生一次角色进场事件。
    usage: {
      ...next.usage,
      enteredThisTurn: next.usage.enteredThisTurn.filter((id) => id !== cardId),
    },
  };
}

export function applyStateBasedActionsV2(
  input: GameStateV2,
  sourceCardId: string | null = null,
): { state: GameStateV2; events: GameEventV2[] } {
  let state = input;
  const events: GameEventV2[] = [];
  const zeroPower = state.players.flatMap((player) => [...player.baseCards, ...Object.values(player.field).flat()])
    .filter((id) => effectiveValueV2(state, id, "power") === 0);
  if (zeroPower.length > 0) {
    const retreated = retreatClosureCardIdsV2(state, zeroPower);
    const followedAttachmentCardIds = followedAttachmentCardIdsV2(state, zeroPower);
    state = retreatCardsV2(state, zeroPower);
    events.push({ type: "CARDS_RETREATED", cardIds: retreated, reason: "state", ...(followedAttachmentCardIds.length ? { followedAttachmentCardIds } : {}), ...(sourceCardId ? { sourceCardId } : {}) });
    events.push({ type: "STATE_BASED_RETREAT", cardIds: retreated });
  }
  const presentSources = new Set(state.players.flatMap((player) => [
    ...player.baseCards,
    ...Object.values(player.field).flat(),
    ...Object.values(state.attachments).flat(),
  ]));
  state = {
    ...state,
    modifiers: state.modifiers.filter((modifier) => modifier.duration !== "while_source_present" || presentSources.has(modifier.sourceCardId)),
    keywordGrants: (state.keywordGrants ?? []).filter((grant) => grant.duration !== "while_source_present" || presentSources.has(grant.sourceCardId)),
  };
  if (state.status === "playing") {
    let winner: PlayerIndex | null = null;
    let reason: "timeline" | "deck_empty" | null = null;
    for (const defender of [0, 1] as const) {
      if (state.players[defender].timeline.length >= 9) {
        winner = otherPlayerV2(defender);
        reason = "timeline";
        break;
      }
      if (state.players[defender].deck.length === 0) {
        winner = otherPlayerV2(defender);
        reason = "deck_empty";
        break;
      }
    }
    if (winner !== null && reason) {
      state = {
        ...state,
        status: "finished",
        flow: { kind: "FINISHED", actor: winner },
        battle: null,
        turnResponse: null,
        decision: null,
        winner,
      };
      events.push({ type: "GAME_WON", winner, reason });
    }
  }
  return { state, events };
}

export function applyAtomicOperationsV2(
  input: GameStateV2,
  operations: readonly AtomicOperationV2[],
  effectSourceCardId?: CardInstanceIdV2,
): { state: GameStateV2; events: GameEventV2[]; trace: AtomicExecutionTraceV2[] } {
  let state = input;
  const events: GameEventV2[] = [];
  const trace: AtomicExecutionTraceV2[] = [];
  let previousSucceeded = true;
  for (const [index, requestedOperation] of operations.entries()) {
    const eventOffset = events.length;
    if (requestedOperation.requiresPreviousSuccess && !previousSucceeded) {
      trace.push({ index, kind: requestedOperation.kind, validationIssues: ["前段未完整成功，依照『如此做后』不处理本原子"], emittedEvents: [], gameFinished: state.status === "finished", succeeded: false });
      previousSucceeded = false;
      continue;
    }
    const operation = filterCharacterEffectImmuneTargetsV2(state, requestedOperation, effectSourceCardId);
    if (!operation) {
      trace.push({ index, kind: requestedOperation.kind, validationIssues: ["目标免疫该角色卡效果"], emittedEvents: [], gameFinished: state.status === "finished", succeeded: false });
      previousSucceeded = false;
      continue;
    }
    const validationIssues = validateAtomicOperationV2(state, operation);
    if (validationIssues.length > 0) {
      trace.push({ index, kind: operation.kind, validationIssues, emittedEvents: [], gameFinished: state.status === "finished", succeeded: false });
      previousSucceeded = false;
      continue;
    }
    const valuesBefore = valueSnapshotV2(state);
    let operationSucceeded = true;
    if (operation.kind === "DRAW") {
      const player = state.players[operation.actor];
      const drawn = player.deck.slice(0, operation.count);
      const nextPlayer = { ...player, deck: player.deck.slice(drawn.length), hand: [...player.hand, ...drawn] };
      const players: GameStateV2["players"] = operation.actor === 0
        ? [nextPlayer, state.players[1]]
        : [state.players[0], nextPlayer];
      state = { ...state, players };
      events.push({ type: "TURN_CARDS_DRAWN", actor: operation.actor, count: drawn.length, ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}), ...(operation.contextValue !== undefined ? { contextValue: operation.contextValue } : {}) });
      operationSucceeded = drawn.length === operation.count;
    } else if (operation.kind === "DISCARD") {
      const legal = operation.cardIds.every((id) => {
        const owner = state.cards[id]?.owner;
        return owner !== undefined && (state.players[owner].hand.includes(id) || state.players[owner].deck.includes(id));
      });
      operationSucceeded = legal;
      if (legal) {
        state = moveCardsToOwnerZoneV2(state, operation.cardIds, "retreat");
        events.push({ type: "CARDS_DISCARDED", cardIds: [...operation.cardIds] });
      }
    } else if (operation.kind === "DISCARD_DECK_TOP") {
      const player = state.players[operation.actor];
      const discarded = player.deck.slice(0, operation.count);
      const nextPlayer = { ...player, deck: player.deck.slice(discarded.length), retreat: [...player.retreat, ...discarded] };
      state = { ...state, players: operation.actor === 0 ? [nextPlayer, state.players[1]] : [state.players[0], nextPlayer] };
      events.push({ type: "CARDS_DISCARDED", cardIds: discarded });
      operationSucceeded = discarded.length === operation.count;
    } else if (operation.kind === "BANISH_DECK_TOP") {
      const player = state.players[operation.actor];
      const banished = player.deck.slice(0, operation.count);
      const nextPlayer = { ...player, deck: player.deck.slice(banished.length), void: [...player.void, ...banished] };
      state = { ...state, players: operation.actor === 0 ? [nextPlayer, state.players[1]] : [state.players[0], nextPlayer] };
      events.push({ type: "CARDS_BANISHED", cardIds: banished, ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
      operationSucceeded = banished.length === operation.count;
    } else if (operation.kind === "REVEAL_RANDOM_HAND") {
      const hand = [...state.players[operation.actor].hand];
      const selected: string[] = [];
      let randomState = state.randomState;
      while (selected.length < operation.count && hand.length > 0) {
        const next = nextRandom(randomState);
        randomState = next.state;
        selected.push(...hand.splice(Math.floor(next.value * hand.length), 1));
      }
      state = { ...state, randomState };
      events.push({ type: "CARDS_REVEALED", cards: selected.map((instanceId) => ({ instanceId, definitionId: state.cards[instanceId].definitionId })), ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
      operationSucceeded = selected.length === operation.count;
    } else if (operation.kind === "RETREAT_RANDOM_BASE_COVERED") {
      const covered = state.players[operation.actor].baseCovered;
      if (covered.length === 0) operationSucceeded = false;
      else {
        const next = nextRandom(state.randomState);
        const cardId = covered[Math.floor(next.value * covered.length)];
        state = { ...retreatCardsV2(state, [cardId]), randomState: next.state };
        events.push({ type: "CARDS_RETREATED", cardIds: [cardId], reason: "effect", ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
      }
    } else if (operation.kind === "COVER_RANDOM_HAND") {
      const hand = state.players[operation.actor].hand;
      if (hand.length === 0 || state.players[operation.actor].baseCards.length + state.players[operation.actor].baseCovered.length >= 6) operationSucceeded = false;
      else {
        const next = nextRandom(state.randomState);
        const cardId = hand[Math.floor(next.value * hand.length)];
        state = { ...coverCardV2(state, cardId), randomState: next.state };
        events.push({ type: "CARDS_PLACED_IN_BASE", actor: operation.actor, cardIds: [cardId], face: "down", ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
      }
    } else if (operation.kind === "RETREAT") {
      const fromFieldCardIds = operation.cardIds.filter((id) => Boolean(fieldLocationV2(state, id)));
      const retreated = retreatClosureCardIdsV2(state, operation.cardIds);
      const followedAttachmentCardIds = followedAttachmentCardIdsV2(state, operation.cardIds);
      operationSucceeded = operation.cardIds.every((id) => {
        const owner = state.cards[id]?.owner;
        return owner !== undefined && (state.players[owner].baseCards.includes(id) || state.players[owner].baseCovered.includes(id) || Object.values(state.players[owner].field).flat().includes(id) || Object.values(state.attachments).flat().includes(id));
      });
      if (operationSucceeded) {
        state = retreatCardsV2(state, operation.cardIds);
        events.push({ type: "CARDS_RETREATED", cardIds: retreated, reason: "effect", fromFieldCardIds, ...(followedAttachmentCardIds.length ? { followedAttachmentCardIds } : {}), ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
      }
    } else if (operation.kind === "BANISH") {
      const fromRetreatCardIds = operation.cardIds.filter((id) => {
        const owner = state.cards[id]?.owner;
        return owner !== undefined && state.players[owner].retreat.includes(id);
      });
      const attached = operation.cardIds.flatMap((id) => state.attachments[id] ?? []);
      if (attached.length) {
        const retreated = retreatClosureCardIdsV2(state, attached);
        state = retreatCardsV2(state, attached);
        events.push({ type: "CARDS_RETREATED", cardIds: retreated, reason: "effect", followedAttachmentCardIds: retreated });
      }
      state = moveCardsToOwnerZoneV2(state, operation.cardIds, "void");
      events.push({ type: "CARDS_BANISHED", cardIds: [...operation.cardIds], ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}), ...(fromRetreatCardIds.length ? { fromRetreatCardIds } : {}) });
    } else if (operation.kind === "MOVE_TO_BASE") {
      const owner = state.cards[operation.cardId]?.owner;
      const controller = operation.controller ?? owner;
      const isPlacement = owner !== undefined && !state.players.some((player) => Object.values(player.field).flat().includes(operation.cardId) || player.baseCards.includes(operation.cardId) || player.baseCovered.includes(operation.cardId));
      if (owner !== undefined && controller !== undefined && state.players[controller].baseCards.length + state.players[controller].baseCovered.length < 6) {
        if (operation.face === "down") {
          const attached = retreatClosureCardIdsV2(state, state.attachments[operation.cardId] ?? []);
          state = coverCardV2(state, operation.cardId);
          if (attached.length) events.push({ type: "CARDS_RETREATED", cardIds: attached, reason: "effect" });
        }
        else {
          const selected = new Set([operation.cardId]);
          const players = state.players.map((player, seat) => {
            const without = removeFromAllPlayerZones(player, selected);
            return seat === controller ? { ...without, baseCards: [...without.baseCards, operation.cardId] } : without;
          }) as GameStateV2["players"];
          state = { ...state, players };
        }
        events.push({ type: "CARDS_PLACED_IN_BASE", actor: controller, cardIds: [operation.cardId], face: operation.face, ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
        if (operation.face === "up" && isPlacement && state.cards[operation.cardId]?.deckKind === "main") {
          events.push({ type: "CHARACTER_PLACED", actor: controller, cardId: operation.cardId, destination: "base", placementKind: "effect" });
        }
      } else operationSucceeded = false;
    } else if (operation.kind === "PLACE_FIELD") {
      const owner = state.cards[operation.cardId]?.owner;
      const controller = operation.controller ?? owner;
      if (owner !== undefined && controller !== undefined && state.players[controller].field[operation.destination].length === 0) {
        const ownerPlayer = state.players[owner];
        const fromZone = ownerPlayer.hand.includes(operation.cardId) ? "hand"
          : ownerPlayer.retreat.includes(operation.cardId) ? "retreat"
            : ownerPlayer.void.includes(operation.cardId) ? "void"
              : ownerPlayer.baseCards.includes(operation.cardId) || ownerPlayer.baseCovered.includes(operation.cardId) ? "base"
                : ownerPlayer.deck.includes(operation.cardId) ? "deck"
                  : Object.values(state.players).some((player) => Object.values(player.field).flat().includes(operation.cardId)) ? "field"
                    : Object.values(state.attachments).flat().includes(operation.cardId) ? "attachment"
                      : "unknown";
        const selected = new Set([operation.cardId]);
        const players = state.players.map((player, seat) => {
          const without = removeFromAllPlayerZones(player, selected);
          return seat === controller ? { ...without, field: { ...without.field, [operation.destination]: [operation.cardId] } } : without;
        }) as GameStateV2["players"];
        state = { ...state, players, usage: { ...state.usage, enteredThisTurn: [...state.usage.enteredThisTurn, operation.cardId] } };
        events.push({ type: "CARD_PLACED_FIELD_BY_EFFECT", actor: controller, cardId: operation.cardId, destination: operation.destination, fromZone, ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
        events.push({ type: "CHARACTER_PLACED", actor: controller, cardId: operation.cardId, destination: operation.destination, placementKind: "effect" });
      } else operationSucceeded = false;
    } else if (operation.kind === "COVER") {
      const owner = state.cards[operation.cardId]?.owner;
      const alreadyInBase = owner !== undefined && state.players[owner].baseCards.includes(operation.cardId);
      if (owner !== undefined && (alreadyInBase || state.players[owner].baseCards.length + state.players[owner].baseCovered.length < 6)) {
        const attached = retreatClosureCardIdsV2(state, state.attachments[operation.cardId] ?? []);
        state = coverCardV2(state, operation.cardId);
        if (attached.length) events.push({ type: "CARDS_RETREATED", cardIds: attached, reason: "effect" });
        events.push({ type: "CARDS_COVERED", cardIds: [operation.cardId] });
      } else operationSucceeded = false;
    } else if (operation.kind === "REVEAL") {
      events.push({ type: "CARDS_REVEALED", cards: operation.cardIds.map((instanceId) => ({ instanceId, definitionId: state.cards[instanceId].definitionId })), ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
    } else if (operation.kind === "FLIP_BASE_FACE_UP") {
      const owner = state.cards[operation.cardId]?.owner;
      if (owner !== undefined && state.players[owner].baseCovered.includes(operation.cardId)) {
        const player = state.players[owner];
        const nextPlayer = { ...player, baseCovered: player.baseCovered.filter((id) => id !== operation.cardId), baseCards: [...player.baseCards, operation.cardId] };
        state = { ...state, players: owner === 0 ? [nextPlayer, state.players[1]] : [state.players[0], nextPlayer] };
        events.push({ type: "BASE_CARD_FLIPPED", actor: owner, cardId: operation.cardId });
      } else operationSucceeded = false;
    } else if (operation.kind === "MOVE_TO_DECK_BOTTOM") {
      const owner = state.cards[operation.cardId]?.owner;
      if (owner !== undefined) {
        const selected = new Set([operation.cardId]);
        const players = state.players.map((player, seat) => {
          const without = removeFromAllPlayerZones(player, selected);
          return seat === owner ? { ...without, deck: [...without.deck, operation.cardId] } : without;
        }) as GameStateV2["players"];
        state = { ...state, players };
        events.push({ type: "CARD_MOVED_TO_DECK_BOTTOM", actor: owner, cardId: operation.cardId });
      } else operationSucceeded = false;
    } else if (operation.kind === "MOVE_TO_DECK_TOP") {
      const owner = state.cards[operation.cardId]?.owner;
      if (owner !== undefined) {
        const selected = new Set([operation.cardId]);
        const players = state.players.map((player, seat) => {
          const without = removeFromAllPlayerZones(player, selected);
          return seat === owner ? { ...without, deck: [operation.cardId, ...without.deck] } : without;
        }) as GameStateV2["players"];
        state = { ...state, players };
        events.push({ type: "CARD_MOVED_TO_DECK_TOP", actor: owner, cardId: operation.cardId, ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
      } else operationSucceeded = false;
    } else if (operation.kind === "MOVE_FIELD") {
      const owner = state.cards[operation.cardId]?.owner;
      if (owner !== undefined) {
        const player = state.players[owner];
        const from = (Object.keys(player.field) as Array<keyof typeof player.field>)
          .find((zone) => player.field[zone].includes(operation.cardId));
        if (from && from !== operation.destination && player.field[operation.destination].length === 0) {
          const nextPlayer: PlayerStateV2 = {
            ...player,
            field: {
              ...player.field,
              [from]: player.field[from].filter((id) => id !== operation.cardId),
              [operation.destination]: [operation.cardId],
            },
          };
          const players: GameStateV2["players"] = owner === 0
            ? [nextPlayer, state.players[1]]
            : [state.players[0], nextPlayer];
          state = { ...state, players };
          events.push({ type: "CARD_MOVED_BY_EFFECT", actor: owner, cardId: operation.cardId, from, destination: operation.destination });
        } else operationSucceeded = false;
      } else operationSucceeded = false;
    } else if (operation.kind === "MOVE_BATTLE_BASE") {
      const owner = state.cards[operation.cardId]?.owner;
      const fromField = fieldLocationV2(state, operation.cardId);
      const fromBase = owner !== undefined && state.players[owner].baseCards.includes(operation.cardId);
      const destinationIsBase = operation.destination === "base";
      const blockedByUsage = state.usage.enteredThisTurn.includes(operation.cardId) || state.usage.movedCardIds.includes(operation.cardId) || state.usage.movementBlockedCardIds.includes(operation.cardId);
      if (owner === undefined || blockedByUsage || (destinationIsBase ? !fromField : !fromBase)) {
        operationSucceeded = false;
      } else if (destinationIsBase) {
        const player = state.players[owner];
        if (player.baseCards.length + player.baseCovered.length >= 6) operationSucceeded = false;
        else {
          const nextPlayer = removeFromFieldAndBase(player, new Set([operation.cardId]));
          const updated = { ...nextPlayer, baseCards: [...nextPlayer.baseCards, operation.cardId] };
          state = {
            ...state,
            players: owner === 0 ? [updated, state.players[1]] : [state.players[0], updated],
            usage: { ...state.usage, movedCardIds: [...state.usage.movedCardIds, operation.cardId] },
          };
          events.push({ type: "BATTLE_BASE_MOVED", actor: owner, cardId: operation.cardId, from: fromField!.zone, destination: "base" });
        }
      } else {
        const player = state.players[owner];
        const destination = operation.destination as keyof PlayerStateV2["field"];
        if (player.field[destination].length > 0) operationSucceeded = false;
        else {
          const nextPlayer = removeFromFieldAndBase(player, new Set([operation.cardId]));
          const updated = { ...nextPlayer, field: { ...nextPlayer.field, [destination]: [operation.cardId] } };
          state = {
            ...state,
            players: owner === 0 ? [updated, state.players[1]] : [state.players[0], updated],
            usage: { ...state.usage, movedCardIds: [...state.usage.movedCardIds, operation.cardId] },
          };
          events.push({ type: "BATTLE_BASE_MOVED", actor: owner, cardId: operation.cardId, from: "base", destination });
        }
      }
    } else if (operation.kind === "RETURN_TO_HAND") {
      const movable = operation.cardIds.every((id) => {
        const owner = state.cards[id]?.owner;
        return owner !== undefined && !state.players[owner].hand.includes(id) && !state.players[owner].deck.includes(id) && !state.players[owner].rushDeck.includes(id);
      });
      operationSucceeded = movable;
      if (movable) {
        const moved = [...attachmentClosure(state, operation.cardIds)];
        state = moveCardsToOwnerHandsV2(state, operation.cardIds);
        events.push({ type: "CARDS_RETURNED_TO_HAND", cardIds: moved });
      }
    } else if (operation.kind === "MOVE_TO_HAND") {
      const movable = operation.cardIds.every((id) => Boolean(state.cards[id]) && !state.players[state.cards[id].owner].hand.includes(id));
      operationSucceeded = movable;
      if (movable) {
        const moved = [...attachmentClosure(state, operation.cardIds)];
        state = moveCardsToOwnerHandsV2(state, operation.cardIds);
        events.push({ type: "CARDS_RETURNED_TO_HAND", cardIds: moved });
      }
    } else if (operation.kind === "SWAP_POSITIONS") {
      const [firstId, secondId] = operation.cardIds;
      const firstField = fieldLocationV2(state, firstId);
      const secondField = fieldLocationV2(state, secondId);
      const firstOwner = state.cards[firstId]?.owner;
      const secondOwner = state.cards[secondId]?.owner;
      const firstRetreat = firstOwner !== undefined && state.players[firstOwner].retreat.includes(firstId);
      const secondRetreat = secondOwner !== undefined && state.players[secondOwner].retreat.includes(secondId);
      const firstHand = firstOwner !== undefined && state.players[firstOwner].hand.includes(firstId);
      const secondHand = secondOwner !== undefined && state.players[secondOwner].hand.includes(secondId);
      const firstHost = Object.entries(state.attachments).find(([, cards]) => cards.includes(firstId))?.[0];
      const secondHost = Object.entries(state.attachments).find(([, cards]) => cards.includes(secondId))?.[0];
      if ((firstHost === secondId && secondField) || (secondHost === firstId && firstField)) {
        const attachedId = firstHost === secondId ? firstId : secondId;
        const hostId = attachedId === firstId ? secondId : firstId;
        const hostField = fieldLocationV2(state, hostId)!;
        const otherAttachments = (state.attachments[hostId] ?? []).filter((id) => id !== attachedId);
        const selected = new Set([attachedId, hostId]);
        const players = state.players.map((player, seat) => {
          const without = removeFromAllPlayerZones(player, selected);
          return seat === hostField.owner ? { ...without, field: { ...without.field, [hostField.zone]: [attachedId] } } : without;
        }) as GameStateV2["players"];
        const attachments = Object.fromEntries(Object.entries(state.attachments)
          .filter(([host]) => host !== hostId && host !== attachedId)
          .map(([host, cards]) => [host, cards.filter((id) => id !== attachedId && id !== hostId)]));
        attachments[attachedId] = [hostId, ...otherAttachments];
        state = { ...state, players, attachments, usage: { ...state.usage, enteredThisTurn: [...state.usage.enteredThisTurn, attachedId] } };
        events.push(
          { type: "CARD_PLACED_FIELD_BY_EFFECT", actor: hostField.owner, cardId: attachedId, destination: hostField.zone, fromZone: "attachment", ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) },
          { type: "CHARACTER_PLACED", actor: hostField.owner, cardId: attachedId, destination: hostField.zone, placementKind: "effect" },
          { type: "CARD_ATTACHED", cardId: hostId, hostCardId: attachedId, ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) },
        );
      } else if (firstField && secondField && firstField.owner === secondField.owner) {
        const owner = firstField.owner;
        const player = state.players[owner];
        const updated = { ...player, field: { ...player.field, [firstField.zone]: [secondId], [secondField.zone]: [firstId] } };
        state = { ...state, players: owner === 0 ? [updated, state.players[1]] : [state.players[0], updated] };
        events.push(
          { type: "CARD_MOVED_BY_EFFECT", actor: owner, cardId: firstId, from: firstField.zone, destination: secondField.zone },
          { type: "CARD_MOVED_BY_EFFECT", actor: owner, cardId: secondId, from: secondField.zone, destination: firstField.zone },
        );
      } else {
        const incomingId = (firstRetreat || firstHand) && secondField ? firstId : (secondRetreat || secondHand) && firstField ? secondId : null;
        const outgoingId = incomingId === firstId ? secondId : incomingId === secondId ? firstId : null;
        const outgoingField = outgoingId ? fieldLocationV2(state, outgoingId) : null;
        const incomingOwner = incomingId ? state.cards[incomingId]?.owner : undefined;
        const incomingFromHand = incomingId === firstId ? firstHand : incomingId === secondId ? secondHand : false;
        if (!incomingId || !outgoingId || !outgoingField || incomingOwner !== outgoingField.owner) operationSucceeded = false;
        else {
          const outgoingClosure = retreatClosureCardIdsV2(state, [outgoingId]);
          let swapped = incomingFromHand ? moveCardsToOwnerHandsV2(state, [outgoingId]) : retreatCardsV2(state, [outgoingId]);
          const selected = new Set([incomingId]);
          const players = swapped.players.map((player, seat) => {
            const without = removeFromAllPlayerZones(player, selected);
            return seat === incomingOwner ? { ...without, field: { ...without.field, [outgoingField.zone]: [incomingId] } } : without;
          }) as GameStateV2["players"];
          state = { ...swapped, players, usage: { ...swapped.usage, enteredThisTurn: [...swapped.usage.enteredThisTurn, incomingId] } };
          if (incomingFromHand) events.push({ type: "CARDS_RETURNED_TO_HAND", cardIds: outgoingClosure });
          else events.push({ type: "CARDS_RETREATED", cardIds: outgoingClosure, reason: "effect", fromFieldCardIds: [outgoingId], followedAttachmentCardIds: outgoingClosure.filter((id) => id !== outgoingId) });
          events.push(
            { type: "CARD_PLACED_FIELD_BY_EFFECT", actor: incomingOwner, cardId: incomingId, destination: outgoingField.zone, fromZone: incomingFromHand ? "hand" : "retreat", ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) },
            { type: "CHARACTER_PLACED", actor: incomingOwner, cardId: incomingId, destination: outgoingField.zone, placementKind: "effect" },
          );
        }
      }
    } else if (operation.kind === "ADD_MODIFIER") {
      state = {
        ...state,
        modifiers: [...state.modifiers.filter((item) => item.id !== operation.modifier.id), operation.modifier],
      };
    } else if (operation.kind === "REMOVE_MODIFIER") {
      state = { ...state, modifiers: state.modifiers.filter((item) => item.id !== operation.modifierId) };
    } else if (operation.kind === "GRANT_KEYWORD") {
      state = {
        ...state,
        keywordGrants: [...(state.keywordGrants ?? []).filter((item) => item.id !== operation.grant.id), operation.grant],
      };
      events.push({ type: "KEYWORD_GRANTED", sourceCardId: operation.grant.sourceCardId, targetCardId: operation.grant.targetCardId, keyword: operation.grant.keyword, grantId: operation.grant.id });
    } else if (operation.kind === "REMOVE_KEYWORD") {
      const grant = (state.keywordGrants ?? []).find((item) => item.id === operation.grantId);
      if (grant && grant.keyword !== "unique") {
        state = { ...state, keywordGrants: (state.keywordGrants ?? []).filter((item) => item.id !== operation.grantId) };
        events.push({ type: "KEYWORD_REMOVED", grantId: operation.grantId, keyword: grant.keyword });
      } else operationSucceeded = false;
    } else if (operation.kind === "ATTACH") {
      const hostIsFaceUp = state.players.some((player) => player.baseCards.includes(operation.hostCardId) || Object.values(player.field).flat().includes(operation.hostCardId));
      if (hostIsFaceUp && !Object.values(state.attachments).flat().includes(operation.hostCardId)) {
        const selected = new Set([operation.cardId]);
        const players = state.players.map((player) => removeFromAllPlayerZones(player, selected)) as GameStateV2["players"];
        const attachments = Object.fromEntries(
          Object.entries(state.attachments).map(([host, cards]) => [host, cards.filter((id) => id !== operation.cardId)]),
        );
        attachments[operation.hostCardId] = [...(attachments[operation.hostCardId] ?? []), operation.cardId];
        state = { ...state, players, attachments };
        events.push({ type: "CARD_ATTACHED", cardId: operation.cardId, hostCardId: operation.hostCardId, ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
      } else operationSucceeded = false;
    } else if (operation.kind === "DETACH") {
      const playerIndex = state.cards[operation.cardId]?.owner;
      if (playerIndex !== undefined) {
        const attached = Object.values(state.attachments).some((ids) => ids.includes(operation.cardId));
        const fieldDestination = (["vanguard", "flankLeft", "flankRight", "rear"] as const).find((zone) => zone === operation.destination);
        const capacity = operation.destination !== "base" || state.players[playerIndex].baseCards.length + state.players[playerIndex].baseCovered.length < 6;
        const destinationOpen = !fieldDestination || state.players[playerIndex].field[fieldDestination].length === 0;
        if (!attached || !capacity || !destinationOpen) {
          operationSucceeded = false;
        } else {
        const player = state.players[playerIndex];
        const destination = operation.destination;
        const nextPlayer: PlayerStateV2 = destination === "base"
          ? { ...player, baseCards: [...player.baseCards, operation.cardId] }
          : fieldDestination
            ? { ...player, field: { ...player.field, [fieldDestination]: [operation.cardId] } }
            : { ...player, [destination]: [...player[destination as "hand" | "retreat"], operation.cardId] };
        const players: GameStateV2["players"] = playerIndex === 0 ? [nextPlayer, state.players[1]] : [state.players[0], nextPlayer];
        const attachments = Object.fromEntries(
          Object.entries(state.attachments).map(([host, cards]) => [host, cards.filter((id) => id !== operation.cardId)]),
        );
        state = { ...state, players, attachments };
        events.push({ type: "CARD_DETACHED", cardId: operation.cardId, destination: operation.destination });
        }
      } else operationSucceeded = false;
    } else if (operation.kind === "MARK_EFFECT_USED") {
      state = { ...state, usage: { ...state.usage, effectUseKeysThisTurn: [...new Set([...(state.usage.effectUseKeysThisTurn ?? []), operation.key])] } };
      events.push({ type: "EFFECT_USE_MARKED", key: operation.key });
    } else if (operation.kind === "FORBID_SUMMON_PAYMENT") {
      state = { ...state, usage: { ...state.usage, summonPaymentBlockedCardIds: [...new Set([...(state.usage.summonPaymentBlockedCardIds ?? []), operation.cardId])] } };
      events.push({ type: "SUMMON_PAYMENT_FORBIDDEN", cardId: operation.cardId });
    } else if (operation.kind === "FORBID_HIGH_LEVEL_SUMMON_PAYMENT") {
      const blocked: [number | null, number | null] = [...state.usage.minimumSummonPaymentLevelBlockedThisTurn];
      blocked[operation.actor] = blocked[operation.actor] === null ? operation.minimumLevel : Math.min(blocked[operation.actor]!, operation.minimumLevel);
      state = { ...state, usage: { ...state.usage, minimumSummonPaymentLevelBlockedThisTurn: blocked } };
      events.push({ type: "HIGH_LEVEL_SUMMON_PAYMENT_FORBIDDEN", actor: operation.actor, minimumLevel: operation.minimumLevel });
    } else if (operation.kind === "FORBID_MOVE") {
      state = { ...state, usage: { ...state.usage, movementBlockedCardIds: [...new Set([...(state.usage.movementBlockedCardIds ?? []), operation.cardId])] } };
      events.push({ type: "CARD_MOVE_FORBIDDEN", cardId: operation.cardId, ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
    } else if (operation.kind === "REORDER_DECK_CARDS") {
      const inspected = new Set(operation.inspectedCardIds);
      const player = state.players[operation.actor];
      const nextPlayer: PlayerStateV2 = { ...player, deck: [...operation.topCardIds, ...player.deck.filter((id) => !inspected.has(id)), ...operation.bottomCardIds] };
      state = { ...state, players: operation.actor === 0 ? [nextPlayer, state.players[1]] : [state.players[0], nextPlayer] };
      events.push({ type: "DECK_CARDS_REORDERED", actor: operation.actor, topCardIds: [...operation.topCardIds], bottomCardIds: [...operation.bottomCardIds], ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
    } else if (operation.kind === "GRANT_COPIED_EFFECTS") {
      state = { ...state, effectCopies: [...(state.effectCopies ?? []).filter((item) => item.id !== operation.grant.id), operation.grant] };
      events.push({ type: "CARD_EFFECTS_COPIED", sourceCardId: operation.grant.sourceCardId, targetCardId: operation.grant.targetCardId, copiedFromCardId: operation.grant.copiedFromCardId, copiedCardNo: operation.grant.copiedCardNo, grantId: operation.grant.id });
    } else if (operation.kind === "GRANT_ADDITIONAL_CHARACTER_ATTACK") {
      state = { ...state, usage: { ...state.usage, characterOnlyAdditionalAttackCardIds: [...new Set([...(state.usage.characterOnlyAdditionalAttackCardIds ?? []), operation.cardId])] } };
      events.push({ type: "ADDITIONAL_CHARACTER_ATTACK_GRANTED", cardId: operation.cardId });
    } else if (operation.kind === "REDIRECT_ATTACK_TARGET") {
      const attackerId = state.battle?.attackerId;
      const previousTarget = state.battle?.target;
      if (!attackerId || !previousTarget) operationSucceeded = false;
      else {
        state = {
          ...state,
          battle: { ...state.battle!, target: operation.target, consecutivePasses: 0 },
          usage: operation.target.kind === "character"
            ? { ...state.usage, attackedTargetCardIdsThisTurn: [...(state.usage.attackedTargetCardIdsThisTurn ?? []), operation.target.cardId] }
            : state.usage,
        };
        events.push({ type: "ATTACK_TARGET_REDIRECTED", sourceCardId: operation.sourceCardId, attackerId, previousTarget, target: operation.target });
      }
    } else if (operation.kind === "SKIP_BATTLE_PHASE") {
      state = { ...state, usage: { ...state.usage, battlePhaseSkippedThisTurn: true } };
      events.push({ type: "BATTLE_PHASE_SKIP_MARKED", actor: operation.actor, sourceCardId: operation.sourceCardId });
    } else if (operation.kind === "FORBID_ATTACK") {
      state = { ...state, usage: { ...state.usage, attackBlockedCardIds: [...new Set([...(state.usage.attackBlockedCardIds ?? []), operation.cardId])] } };
      events.push({ type: "CARD_ATTACK_FORBIDDEN", cardId: operation.cardId, ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
    }
    if (operationSucceeded) events.push(...valueChangeEventsV2(valuesBefore, state, operationSourceCardIdV2(operation)));
    const checked = applyStateBasedActionsV2(state, operationSourceCardIdV2(operation));
      state = checked.state;
    events.push(...checked.events);
    trace.push({
      index,
      kind: operation.kind,
      validationIssues,
      emittedEvents: events.slice(eventOffset).map((event) => event.type),
      gameFinished: state.status === "finished",
      succeeded: operationSucceeded,
    });
    previousSucceeded = operationSucceeded;
    if (state.status === "finished") break;
  }
  return { state, events, trace };
}
