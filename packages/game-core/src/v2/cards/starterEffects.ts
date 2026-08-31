import type { AtomicOperationV2, FieldZoneV2, GameEventV2, GameStateV2, PlayerIndex } from "../model";
import { effectiveValueV2 } from "../effects/atomicOps";
import { registerEffectV2, type EffectContextV2, type EffectDefinitionV2 } from "../effects/registry";

const fieldZones: readonly FieldZoneV2[] = ["vanguard", "flankLeft", "flankRight", "rear"];

function opponentOf(actor: PlayerIndex): PlayerIndex {
  return actor === 0 ? 1 : 0;
}

function battleRoles(state: GameStateV2, actor: PlayerIndex): string[] {
  return fieldZones.flatMap((zone) => state.players[actor].field[zone]);
}

function faceUpRoles(state: GameStateV2, actor: PlayerIndex): string[] {
  return [...battleRoles(state, actor), ...state.players[actor].baseCards];
}

function baseCards(state: GameStateV2, actor: PlayerIndex): string[] {
  return [...state.players[actor].baseCards, ...state.players[actor].baseCovered];
}

function hasFeature(state: GameStateV2, cardId: string, feature: string): boolean {
  return state.cards[cardId]?.features.some((value) => value.includes(feature)) ?? false;
}

function usedKey(sourceCardId: string, effectId: string): string {
  return `${sourceCardId}:${effectId}`;
}

function unusedThisTurn(state: GameStateV2, sourceCardId: string, effectId: string): boolean {
  return !(state.usage.effectUseKeysThisTurn ?? []).includes(usedKey(sourceCardId, effectId));
}

function markUsed(sourceCardId: string, effectId: string, gated = true): AtomicOperationV2 {
  return { kind: "MARK_EFFECT_USED", key: usedKey(sourceCardId, effectId), requiresPreviousSuccess: gated };
}

function modifier(sourceCardId: string, targetCardId: string, type: "power" | "range", value: number, suffix: string): AtomicOperationV2 {
  return {
    kind: "ADD_MODIFIER",
    modifier: {
      id: `starter:${sourceCardId}:${suffix}:${targetCardId}`,
      sourceCardId,
      targetCardId,
      type,
      value,
      duration: "turn",
    },
  };
}

function triggerEvent<T extends GameEventV2["type"]>(context: EffectContextV2 | undefined, type: T): Extract<GameEventV2, { type: T }> | null {
  const event = context?.triggerEvent;
  return event?.type === type ? event as Extract<GameEventV2, { type: T }> : null;
}

function selfSummoned(context: EffectContextV2 | undefined, sourceCardId: string): boolean {
  return triggerEvent(context, "CHARACTER_SUMMONED")?.cardId === sourceCardId;
}

function exactlyOneFrom(selected: readonly string[], candidates: readonly string[]): boolean {
  const allowed = new Set(candidates);
  return selected.filter((id) => allowed.has(id)).length === 1;
}

const definitions: EffectDefinitionV2[] = [
  {
    cardNo: "SD01-001",
    effectId: "attachment-self-destruct",
    label: "被结附时自毁",
    trigger: "CARD_ATTACHED",
    sourceZones: ["field"],
    optional: true,
    usage: "turn_once",
    ruleRefs: ["301.25", "301.32", "304.1"],
    eventFilter: (state, actor, source, context) => triggerEvent(context, "CARD_ATTACHED")?.hostCardId === source
      && state.attachments[source]?.length > 0
      && battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") >= 5),
    condition: (state, _actor, source) => unusedThisTurn(state, source, "attachment-self-destruct"),
    targeting: (state, actor, source) => {
      const sum = (state.attachments[source] ?? []).reduce((total, id) => total + effectiveValueV2(state, id, "level"), 0);
      const choices = faceUpRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= sum);
      return { choices, min: choices.length > 0 ? 1 : 0, max: choices.length > 0 ? 1 : 0, prompt: choices.length > 0 ? `选择敌方场上 1 张 Lv${sum} 或以下的角色裁剪` : "当前没有 Lv 合法目标；仍可撤退全部结附卡，后段不处理" };
    },
    buildOperations: (state, _actor, source, targets) => [
      { kind: "RETREAT", cardIds: [...(state.attachments[source] ?? [])] },
      ...(targets[0] ? [{ kind: "BANISH" as const, cardIds: [targets[0]], requiresPreviousSuccess: true }] : []),
      markUsed(source, "attachment-self-destruct"),
    ],
  },
  {
    cardNo: "SD01-002",
    effectId: "remote-specialization-attach",
    label: "远程特化结附",
    activation: "response",
    usage: "turn_once",
    sourceZones: ["field", "base"],
    ruleRefs: ["301.25", "301.32", "304.2"],
    canActivate: (state, actor, source) => unusedThisTurn(state, source, "remote-specialization-attach") && faceUpRoles(state, actor).some((id) => id !== source),
    targeting: (state, actor, source) => {
      const hosts = faceUpRoles(state, actor).filter((id) => id !== source);
      const attached = hosts.flatMap((id) => state.attachments[id] ?? []);
      return { choices: [...hosts, ...attached], min: 1, max: 2, prompt: "选择 1 张己方场上角色作为宿主；若该角色已有结附卡，再选择其中 1 张撤退" };
    },
    validateTargets: (state, actor, source, selected) => {
      const hosts = faceUpRoles(state, actor).filter((id) => id !== source);
      const host = selected.find((id) => hosts.includes(id));
      if (!host || selected.filter((id) => hosts.includes(id)).length !== 1) return "必须且只能选择 1 张合法宿主";
      const existing = state.attachments[host] ?? [];
      if (existing.length === 0) return selected.length === 1 ? null : "该宿主没有可撤退的原结附卡";
      return selected.length === 2 && selected.some((id) => existing.includes(id)) ? null : "该宿主已有结附卡，必须选择其中 1 张撤退";
    },
    buildOperations: (state, actor, source, selected) => {
      const host = selected.find((id) => faceUpRoles(state, actor).includes(id))!;
      const oldAttachment = selected.find((id) => (state.attachments[host] ?? []).includes(id));
      return [
        { kind: "ATTACH", cardId: source, hostCardId: host },
        ...(oldAttachment ? [{ kind: "RETREAT" as const, cardIds: [oldAttachment], requiresPreviousSuccess: true }] : []),
        markUsed(source, "remote-specialization-attach"),
      ];
    },
  },
  {
    cardNo: "SD01-003",
    effectId: "coordinated-fire",
    label: "协同作战",
    trigger: "CARD_VALUE_CHANGED",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.40", "304.1"],
    eventFilter: (state, actor, _source, context) => {
      const event = triggerEvent(context, "CARD_VALUE_CHANGED");
      return Boolean(event && event.delta > 0 && (event.valueType === "power" || event.valueType === "range") && state.cards[event.targetCardId]?.owner === actor);
    },
    condition: (state, _actor, source) => unusedThisTurn(state, source, "coordinated-fire"),
    targeting: (state, actor) => {
      const choices = battleRoles(state, opponentOf(actor));
      return { choices, min: choices.length > 0 ? 1 : 0, max: choices.length > 0 ? 1 : 0, prompt: choices.length > 0 ? "选择敌方战区 1 张角色，本回合战力 -1000" : "当前没有合法敌方目标；效果仍完成本次触发" };
    },
    buildOperations: (_state, _actor, source, targets) => [...(targets[0] ? [modifier(source, targets[0], "power", -1000, "coordinated-fire")] : []), markUsed(source, "coordinated-fire", false)],
  },
  {
    cardNo: "SD01-005",
    effectId: "full-call",
    label: "充盈呼唤",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field", "base"],
    optional: true,
    ruleRefs: ["301.18", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => selfSummoned(context, source),
    condition: (state, actor) => baseCards(state, actor).length >= 2,
    targeting: (state, actor) => ({ choices: baseCards(state, actor), min: 2, max: 2, prompt: "选择己方基地 2 张卡撤退" }),
    buildOperations: (state, actor, _source, targets) => [
      { kind: "RETREAT", cardIds: [...targets] },
      ...(targets.every((id) => state.cards[id]?.attribute === 1) ? [{ kind: "DRAW" as const, actor, count: 2, requiresPreviousSuccess: true }] : []),
    ],
  },
  {
    cardNo: "SD01-006",
    effectId: "widows-bite",
    label: "寡妇蜇",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.18", "301.32", "304.2"],
    canActivate: (state, actor) => battleRoles(state, actor).length > 0 && baseCards(state, actor).length > 0 && battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") <= 5),
    targeting: (state, actor) => ({ choices: [...battleRoles(state, actor), ...baseCards(state, actor), ...battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 5)], min: 3, max: 3, prompt: "依次选择己方战区角色、己方基地卡、敌方战区 Lv5 或以下角色各 1 张" }),
    validateTargets: (state, actor, _source, selected) => {
      const ownBattle = battleRoles(state, actor);
      const ownBase = baseCards(state, actor);
      const enemy = battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 5);
      return exactlyOneFrom(selected, ownBattle) && exactlyOneFrom(selected, ownBase) && exactlyOneFrom(selected, enemy) ? null : "必须从三个指定区域各选择 1 张合法卡牌";
    },
    buildOperations: (_state, _actor, source, targets) => [
      { kind: "DISCARD", cardIds: [source] },
      { kind: "RETREAT", cardIds: [...targets], requiresPreviousSuccess: true },
    ],
  },
  {
    cardNo: "SD01-007",
    effectId: "fire-support",
    label: "火力投放",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field", "base"],
    optional: true,
    ruleRefs: ["301.18", "301.32", "301.40", "304.1"],
    eventFilter: (_state, _actor, source, context) => selfSummoned(context, source),
    condition: (state, actor, source) => state.players[actor].hand.some((id) => id !== source),
    targeting: (state, actor, source) => {
      const hand = state.players[actor].hand.filter((id) => id !== source);
      const enemies = battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 5);
      return { choices: [...hand, ...enemies], min: 1, max: enemies.length > 0 ? 2 : 1, prompt: "选择 1 张其他手牌舍弃；若存在合法敌方角色，再选择其一战力 -2000" };
    },
    validateTargets: (state, actor, source, selected) => {
      const hand = state.players[actor].hand.filter((id) => id !== source);
      const enemies = battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 5);
      const valid = exactlyOneFrom(selected, hand) && (enemies.length === 0 ? selected.length === 1 : exactlyOneFrom(selected, enemies) && selected.length === 2);
      return valid ? null : "必须选择 1 张其他手牌；有合法敌方目标时还必须选择 1 张敌方角色";
    },
    buildOperations: (state, actor, source, selected) => {
      const hand = state.players[actor].hand.filter((id) => id !== source);
      const discarded = selected.find((id) => hand.includes(id))!;
      const target = selected.find((id) => state.cards[id]?.owner === opponentOf(actor));
      return [
        { kind: "DISCARD", cardIds: [discarded] },
        ...(target ? [{ ...modifier(source, target, "power", -2000, "fire-support"), requiresPreviousSuccess: true }] : []),
      ];
    },
  },
  {
    cardNo: "SD01-009",
    effectId: "pulse-specialization-attach",
    label: "脉冲特化结附",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.18", "301.25", "301.32", "304.2"],
    canActivate: (state, actor, source) => state.players[actor].hand.some((id) => id !== source) && faceUpRoles(state, actor).length > 0,
    targeting: (state, actor, source) => ({ choices: [...state.players[actor].hand.filter((id) => id !== source), ...faceUpRoles(state, actor)], min: 2, max: 2, prompt: "选择 1 张其他手牌舍弃，并选择 1 张己方场上角色结附" }),
    validateTargets: (state, actor, source, selected) => exactlyOneFrom(selected, state.players[actor].hand.filter((id) => id !== source)) && exactlyOneFrom(selected, faceUpRoles(state, actor)) ? null : "必须选择 1 张其他手牌和 1 张己方场上角色",
    buildOperations: (state, actor, source, selected) => {
      const discarded = selected.find((id) => state.players[actor].hand.includes(id) && id !== source)!;
      const host = selected.find((id) => faceUpRoles(state, actor).includes(id))!;
      return [{ kind: "DISCARD", cardIds: [discarded] }, { kind: "ATTACH", cardId: source, hostCardId: host, requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SD01-009",
    effectId: "pulse-specialization-recovery",
    label: "脉冲特化·展示",
    trigger: "CARDS_RETREATED",
    sourceZones: ["retreat"],
    ruleRefs: ["301.13", "301.18", "301.20", "301.27", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => triggerEvent(context, "CARDS_RETREATED")?.cardIds.includes(source) ?? false,
    condition: (state, actor) => {
      if (baseCards(state, actor).length > 4) return false;
      return state.players[actor].baseCovered.some((covered) => state.players[actor].retreat.filter((id) => state.cards[id]?.deckKind === "main" && effectiveValueV2(state, id, "level") === effectiveValueV2(state, covered, "level")).length >= 2);
    },
    targeting: (state, actor) => ({ choices: state.players[actor].baseCovered.filter((covered) => state.players[actor].retreat.filter((id) => state.cards[id]?.deckKind === "main" && effectiveValueV2(state, id, "level") === effectiveValueV2(state, covered, "level")).length >= 2), min: 1, max: 1, prompt: "选择己方基地 1 张盖卡展示" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "REVEAL", cardIds: [selected[0]], sourceCardId: source }],
  },
  {
    cardNo: "SD01-009",
    effectId: "pulse-specialization-recover-pair",
    label: "脉冲特化·盖放",
    trigger: "CARDS_REVEALED",
    sourceZones: ["retreat"],
    ruleRefs: ["301.20", "301.27", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => triggerEvent(context, "CARDS_REVEALED")?.sourceCardId === source,
    condition: (state, actor, _source, context) => {
      const covered = triggerEvent(context, "CARDS_REVEALED")?.cards[0]?.instanceId;
      return Boolean(covered && state.players[actor].retreat.filter((id) => state.cards[id]?.deckKind === "main" && effectiveValueV2(state, id, "level") === effectiveValueV2(state, covered, "level")).length >= 2 && baseCards(state, actor).length <= 4);
    },
    targeting: (state, actor, _source, context) => {
      const covered = triggerEvent(context, "CARDS_REVEALED")!.cards[0].instanceId;
      return { choices: state.players[actor].retreat.filter((id) => state.cards[id]?.deckKind === "main" && effectiveValueV2(state, id, "level") === effectiveValueV2(state, covered, "level")), min: 2, max: 2, prompt: "打开撤退区，选择 2 张与展示盖卡 Lv 相同的角色盖放进基地" };
    },
    buildOperations: (_state, _actor, _source, selected) => selected.map((cardId) => ({ kind: "MOVE_TO_BASE" as const, cardId, face: "down" as const })),
  },
  {
    cardNo: "SD01-010",
    effectId: "red-room-attach",
    label: "红房魅影结附",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.25", "304.2"],
    canActivate: (state, actor) => faceUpRoles(state, actor).some((id) => hasFeature(state, id, "人类")),
    targeting: (state, actor) => ({ choices: faceUpRoles(state, actor).filter((id) => hasFeature(state, id, "人类")), min: 1, max: 1, prompt: "选择己方场上 1 张特征含有【人类】的角色" }),
    buildOperations: (_state, _actor, source, targets) => [{ kind: "ATTACH", cardId: source, hostCardId: targets[0] }],
  },
  {
    cardNo: "SD01-014",
    effectId: "equal-strike",
    label: "对等打击",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field", "base"],
    ruleRefs: ["301.40", "304.1"],
    eventFilter: (_state, _actor, source, context) => selfSummoned(context, source),
    condition: (state, actor) => battleRoles(state, actor).length < battleRoles(state, opponentOf(actor)).length,
    targeting: (state, actor) => {
      const choices = battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 3);
      return { choices, min: choices.length > 0 ? 1 : 0, max: choices.length > 0 ? 1 : 0, prompt: choices.length > 0 ? "选择敌方战区 1 张 Lv3 或以下角色，本回合战力 -2000" : "当前没有 Lv3 或以下的合法目标" };
    },
    buildOperations: (_state, _actor, source, targets) => targets[0] ? [modifier(source, targets[0], "power", -2000, "equal-strike")] : [],
  },
  {
    cardNo: "SD01-015",
    effectId: "tear-everything",
    label: "撕裂一切",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field", "base"],
    ruleRefs: ["301.14", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => selfSummoned(context, source),
    condition: (state, actor) => state.players[actor].retreat.some((id) => state.cards[id]?.attribute === 1 && state.cards[id]?.deckKind === "main"),
    targeting: (state, actor) => ({ choices: state.players[actor].retreat.filter((id) => state.cards[id]?.attribute === 1 && state.cards[id]?.deckKind === "main"), min: 1, max: 1, prompt: "选择己方撤退区 1 张红色角色裁剪" }),
    buildOperations: (_state, actor, _source, targets) => [{ kind: "BANISH", cardIds: [targets[0]] }, { kind: "DRAW", actor, count: 1, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SD01-016",
    effectId: "melee-specialization-attach",
    label: "肉搏特化结附",
    activation: "response",
    usage: "turn_once",
    sourceZones: ["field", "base"],
    ruleRefs: ["301.25", "301.32", "304.2"],
    canActivate: (state, actor, source) => unusedThisTurn(state, source, "melee-specialization-attach") && faceUpRoles(state, actor).some((id) => id !== source),
    targeting: (state, actor, source) => ({ choices: faceUpRoles(state, actor).filter((id) => id !== source), min: 1, max: 1, prompt: "选择 1 张己方场上角色作为宿主" }),
    buildOperations: (state, _actor, source, targets) => {
      const old = [...(state.attachments[targets[0]] ?? [])];
      return [{ kind: "ATTACH", cardId: source, hostCardId: targets[0] }, ...(old.length ? [{ kind: "RETREAT" as const, cardIds: old, requiresPreviousSuccess: true }] : []), markUsed(source, "melee-specialization-attach")];
    },
  },
  {
    cardNo: "SD01-018",
    effectId: "farewell-gift",
    label: "临别赠礼",
    trigger: "CARDS_RETREATED",
    sourceZones: ["retreat"],
    optional: true,
    ruleRefs: ["301.13", "301.20", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => {
      const event = triggerEvent(context, "CARDS_RETREATED");
      return Boolean(event?.reason === "summon_payment" && event.cardIds.includes(source));
    },
    condition: (state, actor) => state.players[actor].deck.length > 0 && baseCards(state, actor).length < 6,
    buildOperations: (state, actor, source) => [{ kind: "MOVE_TO_BASE", cardId: state.players[actor].deck[0], face: "down" }, { kind: "MOVE_TO_DECK_BOTTOM", cardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SD02-002",
    effectId: "computing-recycle",
    label: "战败机械盖放",
    trigger: "CHARACTER_BATTLE_RESOLVED",
    sourceZones: ["field"],
    ruleRefs: ["301.20", "303.2.a.4", "304.1"],
    eventFilter: (state, actor, _source, context) => {
      const event = triggerEvent(context, "CHARACTER_BATTLE_RESOLVED");
      return Boolean(event && event.defeatedCardIds.some((id) => state.cards[id]?.owner === actor && hasFeature(state, id, "机械")));
    },
    condition: (state, actor) => baseCards(state, actor).length < 6,
    buildOperations: (state, actor, _source, _targets, context) => {
      const event = triggerEvent(context, "CHARACTER_BATTLE_RESOLVED");
      const defeated = event?.defeatedCardIds.find((id) => state.cards[id]?.owner === actor && hasFeature(state, id, "机械"));
      return defeated ? [{ kind: "MOVE_TO_BASE", cardId: defeated, face: "down" }] : [];
    },
  },
  {
    cardNo: "SD02-005",
    effectId: "machine-tide",
    label: "机骸潮汐",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["base"],
    ruleRefs: ["301.18", "301.20", "301.32", "304.2"],
    canActivate: (state, actor, source) => unusedThisTurn(state, source, "machine-tide") && state.players[actor].deck.length >= 3,
    buildOperations: (_state, actor, source) => [
      { kind: "DISCARD_DECK_TOP", actor, count: 3 },
      { kind: "DRAW", actor, count: 1, requiresPreviousSuccess: true },
      { kind: "COVER", cardId: source, requiresPreviousSuccess: true },
      markUsed(source, "machine-tide"),
    ],
  },
  {
    cardNo: "SD02-006",
    effectId: "equivalent-exchange-attach",
    label: "等价交换结附",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field"],
    optional: true,
    ruleRefs: ["301.25", "304.1"],
    eventFilter: (_state, _actor, source, context) => selfSummoned(context, source) && triggerEvent(context, "CHARACTER_SUMMONED")?.destination !== "base",
    condition: (state, actor) => state.players[actor].retreat.filter((id) => effectiveValueV2(state, id, "level") === 1 && hasFeature(state, id, "机械")).length >= 2,
    targeting: (state, actor) => ({ choices: state.players[actor].retreat.filter((id) => effectiveValueV2(state, id, "level") === 1 && hasFeature(state, id, "机械")), min: 2, max: 2, prompt: "选择己方撤退区 2 张 Lv1【机械】角色结附" }),
    buildOperations: (_state, _actor, source, targets) => targets.map((cardId) => ({ kind: "ATTACH" as const, cardId, hostCardId: source })),
  },
  {
    cardNo: "SD02-006",
    effectId: "equivalent-exchange-detach",
    label: "等价交换解除",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.26", "304.2"],
    canActivate: (state, actor, source) => unusedThisTurn(state, source, "equivalent-exchange-detach") && baseCards(state, actor).length < 6 && (state.attachments[source] ?? []).some((id) => effectiveValueV2(state, id, "level") === 1),
    targeting: (state, _actor, source) => ({ choices: (state.attachments[source] ?? []).filter((id) => effectiveValueV2(state, id, "level") === 1), min: 1, max: 1, prompt: "选择此卡 1 张 Lv1 结附卡解除至己方基地" }),
    buildOperations: (_state, _actor, source, targets) => [{ kind: "DETACH", cardId: targets[0], destination: "base" }, markUsed(source, "equivalent-exchange-detach")],
  },
  {
    cardNo: "SD02-007",
    effectId: "rage-out-of-control",
    label: "暴怒失控",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.12", "304.2"],
    canActivate: (state, actor) => {
      const roles = state.players[actor].retreat.filter((id) => state.cards[id]?.deckKind === "main");
      return roles.length >= 9 && roles.every((id) => state.cards[id]?.attribute === 2) && (fieldZones.some((zone) => state.players[actor].field[zone].length === 0) || baseCards(state, actor).length < 6);
    },
    targeting: (state, actor) => ({
      choices: [...fieldZones.filter((zone) => state.players[actor].field[zone].length === 0).map((zone) => `zone:${zone}`), ...(baseCards(state, actor).length < 6 ? ["zone:base"] : [])],
      min: 1,
      max: 1,
      prompt: "选择此卡放置进己方场上的位置",
      choiceKind: "field_location",
    }),
    validateTargets: (_state, _actor, _source, selected) => selected.length === 1 && /^zone:(vanguard|flankLeft|flankRight|rear|base)$/.test(selected[0]) ? null : "必须选择 1 个合法场上位置",
    buildOperations: (_state, _actor, source, targets) => {
      const destination = targets[0].replace(/^zone:/, "") as FieldZoneV2 | "base";
      return destination === "base" ? [{ kind: "MOVE_TO_BASE", cardId: source, face: "up" }] : [{ kind: "PLACE_FIELD", cardId: source, destination }];
    },
  },
  {
    cardNo: "SD02-008",
    effectId: "machine-load",
    label: "机骸加载",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["base"],
    ruleRefs: ["301.20", "301.32", "301.40", "304.2"],
    canActivate: (state, actor, source) => unusedThisTurn(state, source, "machine-load") && battleRoles(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: battleRoles(state, actor), min: 1, max: 1, prompt: "选择己方战区 1 张角色，本回合 R+1" }),
    buildOperations: (_state, _actor, source, targets) => [{ ...modifier(source, targets[0], "range", 1, "machine-load") }, { kind: "COVER", cardId: source, requiresPreviousSuccess: true }, markUsed(source, "machine-load")],
  },
  {
    cardNo: "SD02-009",
    effectId: "machine-detonation",
    label: "机骸引爆",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["base"],
    ruleRefs: ["301.20", "301.32", "301.40", "304.2"],
    canActivate: (state, actor, source) => unusedThisTurn(state, source, "machine-detonation") && battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "选择敌方战区 1 张角色，本回合战力 -1000" }),
    buildOperations: (_state, _actor, source, targets) => [{ ...modifier(source, targets[0], "power", -1000, "machine-detonation") }, { kind: "COVER", cardId: source, requiresPreviousSuccess: true }, markUsed(source, "machine-detonation")],
  },
  {
    cardNo: "SD02-010",
    effectId: "machine-recycle",
    label: "机骸回收",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field", "base"],
    ruleRefs: ["301.12", "304.1"],
    eventFilter: (_state, _actor, source, context) => selfSummoned(context, source),
    condition: (state, actor) => baseCards(state, actor).length < 6 && state.players[actor].retreat.some((id) => effectiveValueV2(state, id, "level") === 1 && hasFeature(state, id, "机械")),
    targeting: (state, actor) => ({ choices: state.players[actor].retreat.filter((id) => effectiveValueV2(state, id, "level") === 1 && hasFeature(state, id, "机械")), min: 1, max: 1, prompt: "选择己方撤退区 1 张 Lv1【机械】角色放置进基地" }),
    buildOperations: (_state, _actor, _source, targets) => [{ kind: "MOVE_TO_BASE", cardId: targets[0], face: "up" }],
  },
  {
    cardNo: "SD02-011",
    effectId: "thunder-resonance",
    label: "雷霆共鸣",
    trigger: "CHARACTER_BATTLE_RESOLVED",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.20", "301.23", "301.27", "301.32", "303.2.a.4", "304.1"],
    eventFilter: (state, actor, _source, context) => {
      const event = triggerEvent(context, "CHARACTER_BATTLE_RESOLVED");
      return Boolean(event && event.defeatedCardIds.some((id) => state.cards[id]?.owner === actor && state.cards[id]?.level <= 3));
    },
    condition: (state, actor, source) => unusedThisTurn(state, source, "thunder-resonance") && state.players[actor].field.rear.includes(source) && state.players[actor].baseCovered.length > 0,
    targeting: (state, actor) => ({ choices: state.players[actor].baseCovered, min: 1, max: 1, prompt: "选择己方基地 1 张盖卡展示；Lv 相同时翻开" }),
    buildOperations: (state, actor, source, targets, context) => {
      const event = triggerEvent(context, "CHARACTER_BATTLE_RESOLVED");
      const defeated = event?.defeatedCardIds.find((id) => state.cards[id]?.owner === actor && state.cards[id]?.level <= 3);
      const sameLevel = Boolean(defeated && effectiveValueV2(state, targets[0], "level") === state.cards[defeated].level);
      return [{ kind: "REVEAL", cardIds: [targets[0]] }, ...(sameLevel ? [{ kind: "FLIP_BASE_FACE_UP" as const, cardId: targets[0], requiresPreviousSuccess: true }] : []), markUsed(source, "thunder-resonance")];
    },
  },
  {
    cardNo: "SD02-014",
    effectId: "underdog",
    label: "下克上",
    trigger: "ATTACK_DECLARED",
    sourceZones: ["field"],
    ruleRefs: ["301.40", "303.2.a.4", "304.1"],
    eventFilter: (state, _actor, source, context) => {
      const event = triggerEvent(context, "ATTACK_DECLARED");
      return Boolean(event?.attackerId === source && event.target.kind === "character" && effectiveValueV2(state, event.target.cardId, "level") >= 4);
    },
    buildOperations: (_state, _actor, source) => [modifier(source, source, "power", 1500, "underdog")],
  },
  {
    cardNo: "SD02-015",
    effectId: "machine-remains-assembly",
    label: "残械组装",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field", "base"],
    ruleRefs: ["301.12", "304.1"],
    eventFilter: (_state, _actor, source, context) => selfSummoned(context, source),
    condition: (state, actor) => baseCards(state, actor).length < 6 && state.players[actor].retreat.some((id) => effectiveValueV2(state, id, "level") === 1 && hasFeature(state, id, "机械")),
    targeting: (state, actor) => ({ choices: state.players[actor].retreat.filter((id) => effectiveValueV2(state, id, "level") === 1 && hasFeature(state, id, "机械")), min: 1, max: 1, prompt: "选择己方撤退区 1 张 Lv1【机械】角色放置进基地" }),
    buildOperations: (_state, _actor, _source, targets) => [{ kind: "MOVE_TO_BASE", cardId: targets[0], face: "up" }],
  },
  {
    cardNo: "SD02-016",
    effectId: "hunting-instinct",
    label: "狩猎本能",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field", "base"],
    ruleRefs: ["301.37", "304.1", "305.4"],
    eventFilter: (_state, _actor, source, context) => selfSummoned(context, source),
    buildOperations: (_state, _actor, source) => [{ kind: "GRANT_KEYWORD", grant: { id: `starter:${source}:hunting-instinct`, sourceCardId: source, targetCardId: source, keyword: "assault", duration: "turn" } }],
  },
  {
    cardNo: "SD02-017",
    effectId: "anti-tank",
    label: "反坦克",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field", "base"],
    ruleRefs: ["301.40", "304.1"],
    eventFilter: (_state, _actor, source, context) => selfSummoned(context, source),
    condition: (state, actor) => state.players[opponentOf(actor)].field.vanguard.length > 0,
    buildOperations: (state, actor, source) => [modifier(source, state.players[opponentOf(actor)].field.vanguard[0], "power", -1000, "anti-tank")],
  },
];

/** Idempotent registration: production calls this once; isolated tests can clear and re-register. */
export function registerStarterEffectsV2(): void {
  for (const definition of definitions) registerEffectV2(definition);
}

export const STARTER_EFFECT_DEFINITIONS_V2: readonly EffectDefinitionV2[] = definitions;
