import { otherPlayerV2 } from "../invariants";
import { starterContinuousDeltaV2, starterContinuousReplacementV2 } from "../cards/starterContinuous";
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
  { kind: "RETREAT", label: "撤退", category: "卡牌移动", description: "将角色及其结附链移动到拥有者撤退区。", stateCheckAfter: true },
  { kind: "BANISH", label: "裁剪", category: "卡牌移动", description: "把指定卡牌移动到拥有者虚空区；宿主的结附卡按规则进入撤退区。", stateCheckAfter: true },
  { kind: "MOVE_TO_BASE", label: "放置进基地", category: "区域", description: "把卡牌正面放置或背面盖放进拥有者基地。", stateCheckAfter: true },
  { kind: "PLACE_FIELD", label: "放置进战区", category: "区域", description: "把卡牌正面放置进指定空战区；这不是号召。", stateCheckAfter: true },
  { kind: "COVER", label: "盖伏", category: "区域", description: "刷新场上卡牌状态并把它作为盖卡放进基地。", stateCheckAfter: true },
  { kind: "REVEAL", label: "展示", category: "卡牌移动", description: "向双方公开指定卡牌正面信息，但不改变所在区域。", stateCheckAfter: true },
  { kind: "FLIP_BASE_FACE_UP", label: "翻开基地盖卡", category: "区域", description: "把基地盖卡翻为正面角色并恢复卡牌信息。", stateCheckAfter: true },
  { kind: "MOVE_TO_DECK_BOTTOM", label: "移至卡组底", category: "卡牌移动", description: "把指定卡牌移动到拥有者主卡组底。", stateCheckAfter: true },
  { kind: "MOVE_FIELD", label: "场上移动", category: "区域", description: "在四个战区之间移动一名角色。", stateCheckAfter: true },
  { kind: "MOVE_BATTLE_BASE", label: "效果战基移动", category: "区域", description: "由效果使角色在战区与基地之间进行一次合法战基移动。", stateCheckAfter: true },
  { kind: "RETURN_TO_HAND", label: "移回手牌", category: "卡牌移动", description: "把指定卡牌及应跟随宿主的结附链移回各自拥有者手牌。", stateCheckAfter: true },
  { kind: "SWAP_POSITIONS", label: "互相替换", category: "区域", description: "依来源区域同时交换两张卡的位置，并分别判定移动或放置。", stateCheckAfter: true },
  { kind: "ADD_MODIFIER", label: "添加数值修正", category: "数值", description: "添加战力、距离或等级的替换/增减修正。", stateCheckAfter: true },
  { kind: "REMOVE_MODIFIER", label: "移除数值修正", category: "数值", description: "按稳定标识移除一个数值修正。", stateCheckAfter: true },
  { kind: "GRANT_KEYWORD", label: "获得关键词", category: "能力", description: "向角色授予有明确期限的 1.02 官方关键词能力。", stateCheckAfter: true },
  { kind: "REMOVE_KEYWORD", label: "移除关键词", category: "能力", description: "按稳定标识移除动态关键词；印刷【唯一】永远不会因此失去。", stateCheckAfter: true },
  { kind: "ATTACH", label: "结附", category: "附着", description: "将一张卡从原区域移出并结附到宿主。", stateCheckAfter: true },
  { kind: "DETACH", label: "解除结附", category: "附着", description: "解除结附并移动到手牌或撤退区。", stateCheckAfter: true },
  { kind: "MARK_EFFECT_USED", label: "记录回合一次", category: "能力", description: "记录稳定效果键，直到当前玩家下个回合重置。", stateCheckAfter: true },
] as const;

export function validateAtomicOperationV2(state: GameStateV2, operation: AtomicOperationV2): string[] {
  const issues: string[] = [];
  if (operation.kind === "DRAW") {
    if (!Number.isInteger(operation.count) || operation.count <= 0) issues.push("抽牌数量必须是正整数");
  } else if (operation.kind === "DISCARD" || operation.kind === "BANISH") {
    if (operation.cardIds.length === 0) issues.push(`${operation.kind === "DISCARD" ? "舍弃" : "裁剪"}原子至少需要一张卡`);
    if (operation.cardIds.some((id) => !state.cards[id])) issues.push("卡牌移动目标包含不存在的实体");
  } else if (operation.kind === "DISCARD_DECK_TOP") {
    if (!Number.isInteger(operation.count) || operation.count <= 0) issues.push("牌库顶舍弃数量必须是正整数");
  } else if (operation.kind === "RETREAT") {
    if (operation.cardIds.length === 0) issues.push("撤退原子至少需要一张卡");
    if (operation.cardIds.some((id) => !state.cards[id])) issues.push("撤退目标包含不存在的卡牌实例");
  } else if (operation.kind === "MOVE_FIELD" || operation.kind === "MOVE_BATTLE_BASE" || operation.kind === "MOVE_TO_BASE" || operation.kind === "PLACE_FIELD" || operation.kind === "COVER" || operation.kind === "FLIP_BASE_FACE_UP" || operation.kind === "MOVE_TO_DECK_BOTTOM") {
    if (!state.cards[operation.cardId]) issues.push("移动目标不存在");
  } else if (operation.kind === "RETURN_TO_HAND") {
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
  } else if (operation.kind === "MARK_EFFECT_USED") {
    if (!operation.key.trim()) issues.push("回合一次效果键不能为空");
  } else if (!state.cards[operation.cardId]) {
    issues.push("解除结附目标不存在");
  }
  return issues;
}

export function validateAtomicOperationsV2(state: GameStateV2, operations: readonly AtomicOperationV2[]): string[] {
  return operations.flatMap((operation, index) => validateAtomicOperationV2(state, operation).map((issue) => `原子 ${index + 1}（${operation.kind}）：${issue}`));
}

export function effectiveValueV2(
  state: GameStateV2,
  cardId: CardInstanceIdV2,
  type: ModifierStateV2["type"],
): number {
  const card = state.cards[cardId];
  if (!card) return 0;
  const base = type === "power" ? card.power : type === "range" ? card.range : card.level;
  const modifiers = state.modifiers.filter((modifier) => modifier.targetCardId === cardId && modifier.type === type);
  const explicitReplacement = modifiers.reduce((value, modifier) => modifier.mode === "replace" ? modifier.value : value, base);
  const replaced = starterContinuousReplacementV2(state, cardId, type) ?? explicitReplacement;
  const delta = modifiers.filter((modifier) => (modifier.mode ?? "delta") === "delta").reduce((sum, modifier) => sum + modifier.value, 0);
  const explicitValue = Math.max(0, replaced + delta);
  const continuousDelta = starterContinuousDeltaV2(state, cardId, type, (id, valueType) => effectiveValueV2(state, id, valueType));
  return Math.max(0, explicitValue + continuousDelta);
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
  if ("cardId" in operation) return operation.cardId;
  return null;
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
): { state: GameStateV2; events: GameEventV2[] } {
  let state = input;
  const events: GameEventV2[] = [];
  const zeroPower = state.players.flatMap((player) => Object.values(player.field).flat())
    .filter((id) => effectiveValueV2(state, id, "power") === 0);
  if (zeroPower.length > 0) {
    const retreated = retreatClosureCardIdsV2(state, zeroPower);
    state = retreatCardsV2(state, zeroPower);
    events.push({ type: "CARDS_RETREATED", cardIds: retreated, reason: "state" });
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
): { state: GameStateV2; events: GameEventV2[]; trace: AtomicExecutionTraceV2[] } {
  let state = input;
  const events: GameEventV2[] = [];
  const trace: AtomicExecutionTraceV2[] = [];
  let previousSucceeded = true;
  for (const [index, operation] of operations.entries()) {
    const eventOffset = events.length;
    if (operation.requiresPreviousSuccess && !previousSucceeded) {
      trace.push({ index, kind: operation.kind, validationIssues: ["前段未完整成功，依照『如此做后』不处理本原子"], emittedEvents: [], gameFinished: state.status === "finished", succeeded: false });
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
      events.push({ type: "TURN_CARDS_DRAWN", actor: operation.actor, count: drawn.length, ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
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
    } else if (operation.kind === "RETREAT") {
      const fromFieldCardIds = operation.cardIds.filter((id) => Boolean(fieldLocationV2(state, id)));
      const retreated = retreatClosureCardIdsV2(state, operation.cardIds);
      operationSucceeded = operation.cardIds.every((id) => {
        const owner = state.cards[id]?.owner;
        return owner !== undefined && (state.players[owner].baseCards.includes(id) || state.players[owner].baseCovered.includes(id) || Object.values(state.players[owner].field).flat().includes(id) || Object.values(state.attachments).flat().includes(id));
      });
      if (operationSucceeded) {
        state = retreatCardsV2(state, operation.cardIds);
        events.push({ type: "CARDS_RETREATED", cardIds: retreated, reason: "effect", fromFieldCardIds });
      }
    } else if (operation.kind === "BANISH") {
      const attached = operation.cardIds.flatMap((id) => state.attachments[id] ?? []);
      if (attached.length) {
        const retreated = retreatClosureCardIdsV2(state, attached);
        state = retreatCardsV2(state, attached);
        events.push({ type: "CARDS_RETREATED", cardIds: retreated, reason: "effect" });
      }
      state = moveCardsToOwnerZoneV2(state, operation.cardIds, "void");
      events.push({ type: "CARDS_BANISHED", cardIds: [...operation.cardIds], ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}) });
    } else if (operation.kind === "MOVE_TO_BASE") {
      const owner = state.cards[operation.cardId]?.owner;
      const isPlacement = owner !== undefined && !Object.values(state.players[owner].field).flat().includes(operation.cardId)
        && !state.players[owner].baseCards.includes(operation.cardId)
        && !state.players[owner].baseCovered.includes(operation.cardId);
      if (owner !== undefined && state.players[owner].baseCards.length + state.players[owner].baseCovered.length < 6) {
        if (operation.face === "down") {
          const attached = retreatClosureCardIdsV2(state, state.attachments[operation.cardId] ?? []);
          state = coverCardV2(state, operation.cardId);
          if (attached.length) events.push({ type: "CARDS_RETREATED", cardIds: attached, reason: "effect" });
        }
        else {
          const selected = new Set([operation.cardId]);
          const players = state.players.map((player, seat) => {
            const without = removeFromAllPlayerZones(player, selected);
            return seat === owner ? { ...without, baseCards: [...without.baseCards, operation.cardId] } : without;
          }) as GameStateV2["players"];
          state = { ...state, players };
        }
        events.push({ type: "CARDS_PLACED_IN_BASE", actor: owner, cardIds: [operation.cardId], face: operation.face });
        if (operation.face === "up" && isPlacement && state.cards[operation.cardId]?.deckKind === "main") {
          events.push({ type: "CHARACTER_PLACED", actor: owner, cardId: operation.cardId, destination: "base", placementKind: "effect" });
        }
      } else operationSucceeded = false;
    } else if (operation.kind === "PLACE_FIELD") {
      const owner = state.cards[operation.cardId]?.owner;
      if (owner !== undefined && state.players[owner].field[operation.destination].length === 0) {
        const selected = new Set([operation.cardId]);
        const players = state.players.map((player, seat) => {
          const without = removeFromAllPlayerZones(player, selected);
          return seat === owner ? { ...without, field: { ...without.field, [operation.destination]: [operation.cardId] } } : without;
        }) as GameStateV2["players"];
        state = { ...state, players, usage: { ...state.usage, enteredThisTurn: [...state.usage.enteredThisTurn, operation.cardId] } };
        events.push({ type: "CARD_PLACED_FIELD_BY_EFFECT", actor: owner, cardId: operation.cardId, destination: operation.destination });
        events.push({ type: "CHARACTER_PLACED", actor: owner, cardId: operation.cardId, destination: operation.destination, placementKind: "effect" });
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
      const blockedByUsage = state.usage.enteredThisTurn.includes(operation.cardId) || state.usage.movedCardIds.includes(operation.cardId);
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
    } else if (operation.kind === "SWAP_POSITIONS") {
      const [firstId, secondId] = operation.cardIds;
      const firstField = fieldLocationV2(state, firstId);
      const secondField = fieldLocationV2(state, secondId);
      const firstOwner = state.cards[firstId]?.owner;
      const secondOwner = state.cards[secondId]?.owner;
      const firstRetreat = firstOwner !== undefined && state.players[firstOwner].retreat.includes(firstId);
      const secondRetreat = secondOwner !== undefined && state.players[secondOwner].retreat.includes(secondId);
      if (firstField && secondField && firstField.owner === secondField.owner) {
        const owner = firstField.owner;
        const player = state.players[owner];
        const updated = { ...player, field: { ...player.field, [firstField.zone]: [secondId], [secondField.zone]: [firstId] } };
        state = { ...state, players: owner === 0 ? [updated, state.players[1]] : [state.players[0], updated] };
        events.push(
          { type: "CARD_MOVED_BY_EFFECT", actor: owner, cardId: firstId, from: firstField.zone, destination: secondField.zone },
          { type: "CARD_MOVED_BY_EFFECT", actor: owner, cardId: secondId, from: secondField.zone, destination: firstField.zone },
        );
      } else {
        const incomingId = firstRetreat && secondField ? firstId : secondRetreat && firstField ? secondId : null;
        const outgoingId = incomingId === firstId ? secondId : incomingId === secondId ? firstId : null;
        const outgoingField = outgoingId ? fieldLocationV2(state, outgoingId) : null;
        const incomingOwner = incomingId ? state.cards[incomingId]?.owner : undefined;
        if (!incomingId || !outgoingId || !outgoingField || incomingOwner !== outgoingField.owner) operationSucceeded = false;
        else {
          const retreated = retreatClosureCardIdsV2(state, [outgoingId]);
          let swapped = retreatCardsV2(state, [outgoingId]);
          const selected = new Set([incomingId]);
          const players = swapped.players.map((player, seat) => {
            const without = removeFromAllPlayerZones(player, selected);
            return seat === incomingOwner ? { ...without, field: { ...without.field, [outgoingField.zone]: [incomingId] } } : without;
          }) as GameStateV2["players"];
          state = { ...swapped, players, usage: { ...swapped.usage, enteredThisTurn: [...swapped.usage.enteredThisTurn, incomingId] } };
          events.push(
            { type: "CARDS_RETREATED", cardIds: retreated, reason: "effect", fromFieldCardIds: [outgoingId] },
            { type: "CARD_PLACED_FIELD_BY_EFFECT", actor: incomingOwner, cardId: incomingId, destination: outgoingField.zone },
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
      const hostOwner = state.cards[operation.hostCardId]?.owner;
      const hostIsFaceUp = hostOwner !== undefined && (state.players[hostOwner].baseCards.includes(operation.hostCardId) || Object.values(state.players[hostOwner].field).flat().includes(operation.hostCardId));
      if (hostIsFaceUp && !Object.values(state.attachments).flat().includes(operation.hostCardId)) {
        const selected = new Set([operation.cardId]);
        const players = state.players.map((player) => removeFromAllPlayerZones(player, selected)) as GameStateV2["players"];
        const attachments = Object.fromEntries(
          Object.entries(state.attachments).map(([host, cards]) => [host, cards.filter((id) => id !== operation.cardId)]),
        );
        attachments[operation.hostCardId] = [...(attachments[operation.hostCardId] ?? []), operation.cardId];
        state = { ...state, players, attachments };
        events.push({ type: "CARD_ATTACHED", cardId: operation.cardId, hostCardId: operation.hostCardId });
      } else operationSucceeded = false;
    } else if (operation.kind === "DETACH") {
      const playerIndex = state.cards[operation.cardId]?.owner;
      if (playerIndex !== undefined) {
        const attached = Object.values(state.attachments).some((ids) => ids.includes(operation.cardId));
        const capacity = operation.destination !== "base" || state.players[playerIndex].baseCards.length + state.players[playerIndex].baseCovered.length < 6;
        if (!attached || !capacity) {
          operationSucceeded = false;
        } else {
        const player = state.players[playerIndex];
        const destination = operation.destination;
        const nextPlayer = {
          ...player,
          ...(destination === "base" ? { baseCards: [...player.baseCards, operation.cardId] } : { [destination]: [...player[destination], operation.cardId] }),
        };
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
    }
    if (operationSucceeded) events.push(...valueChangeEventsV2(valuesBefore, state, operationSourceCardIdV2(operation)));
    const checked = applyStateBasedActionsV2(state);
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
