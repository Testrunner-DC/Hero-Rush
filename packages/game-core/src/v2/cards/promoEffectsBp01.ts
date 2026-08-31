import type { AtomicOperationV2, AttackTargetV2, FieldZoneV2, GameEventV2, GameStateV2, PlayerIndex } from "../model";
import { cardControllerV2 } from "../control";
import { effectiveValueV2 } from "../effects/atomicOps";
import { effectiveKeywordsV2 } from "../effects/keywords";
import { legalAttackTargetsV2 } from "../battleTargetRules";
import { promoAttackTargetRestrictionV2 } from "./promoContinuous";
import { registerEffectV2, type EffectContextV2, type EffectDefinitionV2 } from "../effects/registry";

const fieldZones: readonly FieldZoneV2[] = ["vanguard", "flankLeft", "flankRight", "rear"];
const opponentOf = (actor: PlayerIndex): PlayerIndex => actor === 0 ? 1 : 0;
const battleRoles = (state: GameStateV2, actor: PlayerIndex): string[] => fieldZones.flatMap((zone) => state.players[actor].field[zone]);
const faceUpRoles = (state: GameStateV2, actor: PlayerIndex): string[] => [...battleRoles(state, actor), ...state.players[actor].baseCards];
const faceUpCards = (state: GameStateV2, actor: PlayerIndex): string[] => [...faceUpRoles(state, actor), ...Object.values(state.attachments).flat().filter((id) => cardControllerV2(state, id) === actor)];
const openFieldZones = (state: GameStateV2, actor: PlayerIndex): FieldZoneV2[] => fieldZones.filter((zone) => state.players[actor].field[zone].length === 0);
const eventOf = <T extends GameEventV2["type"]>(context: EffectContextV2 | undefined, type: T): Extract<GameEventV2, { type: T }> | null => context?.triggerEvent?.type === type ? context.triggerEvent as Extract<GameEventV2, { type: T }> : null;
const useKey = (source: string, effectId: string): string => `${source}:${effectId}`;
const zoneChoice = (zone: FieldZoneV2): string => `zone:${zone}`;
const parseZone = (choice: string): FieldZoneV2 => choice.replace(/^zone:/, "") as FieldZoneV2;
const boardPlacementChoices = (state: GameStateV2, actor: PlayerIndex): string[] => [
  ...openFieldZones(state, actor).map(zoneChoice),
  ...(state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6 ? ["zone:base"] : []),
];
const boardPlacementOperation = (cardId: string, sourceCardId: string, choice: string): AtomicOperationV2 => choice === "zone:base"
  ? { kind: "MOVE_TO_BASE", cardId, face: "up", sourceCardId }
  : { kind: "PLACE_FIELD", cardId, destination: parseZone(choice), sourceCardId };
const battleBaseMoveChoices = (state: GameStateV2, actor: PlayerIndex, cardId: string): string[] => {
  if (state.usage.enteredThisTurn.includes(cardId) || state.usage.movedCardIds.includes(cardId) || state.usage.movementBlockedCardIds.includes(cardId)) return [];
  if (state.players[actor].baseCards.includes(cardId)) return openFieldZones(state, actor).map(zoneChoice);
  if (battleRoles(state, actor).includes(cardId) && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6) return ["zone:base"];
  return [];
};
const attackTargetChoice = (target: AttackTargetV2): string => target.kind === "character" ? target.cardId : `breach:${target.zone}`;
const parseAttackTargetChoice = (choice: string): AttackTargetV2 => choice.startsWith("breach:")
  ? { kind: "breach", zone: choice.slice(7) as FieldZoneV2 }
  : { kind: "character", cardId: choice };
const alternateAttackTargets = (state: GameStateV2): AttackTargetV2[] => {
  const attackerId = state.battle?.attackerId;
  const current = state.battle?.target;
  if (!attackerId || !current) return [];
  return legalAttackTargetsV2(state, state.activePlayer, attackerId, (id) => effectiveValueV2(state, id, "range"), (id, keyword) => effectiveKeywordsV2(state, id).includes(keyword), (id, candidate) => promoAttackTargetRestrictionV2(state, id, candidate, (cardId) => effectiveValueV2(state, cardId, "level")))
    .filter((target) => JSON.stringify(target) !== JSON.stringify(current));
};
const modifier = (source: string, target: string, type: "power" | "range" | "level", value: number, suffix: string): AtomicOperationV2 => ({ kind: "ADD_MODIFIER", modifier: { id: `bp01:${source}:${suffix}:${target}`, sourceCardId: source, targetCardId: target, type, value, mode: "delta", duration: "turn" } });

const definitions: EffectDefinitionV2[] = [
  {
    cardNo: "BP01-001", effectId: "antimatter-iron-man-banish", label: "反物质·号召裁剪", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.15", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor, _source, context) => { const x = eventOf(context, "CHARACTER_SUMMONED")?.paymentCardIds.length ?? 0; return faceUpRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") <= x); },
    targeting: (state, actor, _source, context) => { const x = eventOf(context, "CHARACTER_SUMMONED")!.paymentCardIds.length; return { choices: faceUpRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= x), min: 1, max: 1, prompt: `选择敌方场上 1 张 Lv${x} 或以下角色裁剪` }; },
    buildOperations: (_state, _actor, source, selected) => [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }],
  },
  {
    cardNo: "BP01-002", effectId: "shadow-agent-widow-response", label: "潜龙谍影·战力压制", activation: "response", sourceZones: ["hand"], ruleRefs: ["301.13", "301.32", "301.41", "304.2"],
    canActivate: (state, actor) => battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "舍弃此卡，并选择敌方战区 1 张角色本回合战力 -2000" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "DISCARD", cardIds: [source] }, { ...modifier(source, selected[0], "power", -2000, "shadow-agent"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-003", effectId: "thunder-confidant-end", label: "雷霆知音·未攻击惩戒", trigger: "END_TRIGGERS_PROCESSED", sourceZones: ["field"], ruleRefs: ["301.32", "301.41", "304.1"],
    eventFilter: (state, actor, source, context) => eventOf(context, "END_TRIGGERS_PROCESSED")?.actor === actor && (state.players[actor].field.flankLeft.includes(source) || state.players[actor].field.flankRight.includes(source)) && !(state.usage.attackedCardIdsByPlayer[actor] ?? []).includes(source),
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "选择敌方战区 1 张角色，使其本回合失去等同雷神当前战力的战力" }),
    buildOperations: (state, _actor, source, selected) => [modifier(source, selected[0], "power", -effectiveValueV2(state, source, "power"), "thunder-confidant")],
  },
  {
    cardNo: "BP01-005", effectId: "red-room-specimen-boost", label: "红房实验品·攻击支援", trigger: "ATTACK_DECLARED", sourceZones: ["hand"], optional: true, ruleRefs: ["301.13", "301.32", "301.41", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return Boolean(event && event.actor === actor && state.cards[event.attackerId]?.attribute === 1); },
    condition: (state, actor) => battleRoles(state, actor).some((id) => state.cards[id]?.attribute === 1),
    targeting: (state, actor) => ({ choices: battleRoles(state, actor).filter((id) => state.cards[id]?.attribute === 1), min: 1, max: 1, prompt: "舍弃此卡，并选择我方战区 1 张红色角色本回合战力 +3000" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "DISCARD", cardIds: [source] }, { ...modifier(source, selected[0], "power", 3000, "red-room"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-007", effectId: "void-reconstruction-vision", label: "虚空重构·幻视归来", trigger: "CARDS_BANISHED", sourceZones: ["void"], optional: true, ruleRefs: ["301.12", "301.13", "301.15", "301.32", "301.41", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_BANISHED")?.fromRetreatCardIds?.includes(source) ?? false,
    condition: (state, actor) => state.players[actor].hand.length >= 2 && openFieldZones(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand, ...openFieldZones(state, actor).map(zoneChoice)], min: 3, max: 3, prompt: "选择 2 张手牌舍弃，并选择幻视放置的空战区", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].hand.includes(id)).length === 2 && selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id))).length === 1 ? null : "必须选择 2 张手牌和 1 个空战区",
    buildOperations: (state, actor, source, selected) => {
      const hand = selected.filter((id) => state.players[actor].hand.includes(id));
      const zone = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      const enemyVanguard = state.players[opponentOf(actor)].field.vanguard[0];
      return [{ kind: "DISCARD", cardIds: hand }, { kind: "PLACE_FIELD", cardId: source, destination: zone, sourceCardId: source, requiresPreviousSuccess: true }, ...(enemyVanguard ? [{ ...modifier(source, enemyVanguard, "power", -1000, "void-reconstruction"), requiresPreviousSuccess: true }] : [])];
    },
  },
  {
    cardNo: "BP01-008", effectId: "unload-pulse-banish-attachments", label: "卸载脉冲·清除结附", trigger: "CHARACTER_PLACED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.15", "301.25", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_PLACED")?.cardId === source,
    condition: (state) => ([0, 1] as const).flatMap((seat) => faceUpRoles(state, seat)).some((host) => (state.attachments[host] ?? []).length > 0),
    buildOperations: (state, _actor, source) => [{ kind: "BANISH", cardIds: ([0, 1] as const).flatMap((seat) => faceUpRoles(state, seat)).flatMap((host) => state.attachments[host] ?? []), sourceCardId: source }],
  },
  {
    cardNo: "BP01-009", effectId: "assemble-pulse-iron-man", label: "组装脉冲·裁剪压制", activation: "action", usage: "turn_once", sourceZones: ["field"], ruleRefs: ["301.13", "301.15", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => state.players[actor].baseCards.length + state.players[actor].baseCovered.length === 0 && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "assemble-pulse-iron-man")) && state.players[actor].retreat.some((id) => effectiveValueV2(state, id, "level") >= 5 && state.cards[id]?.attribute === 1) && battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].retreat.filter((id) => effectiveValueV2(state, id, "level") >= 5 && state.cards[id]?.attribute === 1), ...battleRoles(state, opponentOf(actor))], min: 2, max: 2, prompt: "选择我方撤退区 1 张 Lv5+ 红色角色裁剪，并选择敌方战区 1 张角色战力 -1000", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].retreat.includes(id) && effectiveValueV2(state, id, "level") >= 5 && state.cards[id]?.attribute === 1).length === 1 && selected.filter((id) => battleRoles(state, opponentOf(actor)).includes(id)).length === 1 ? null : "必须选择 1 张合法裁剪费用和 1 张敌方战区角色",
    buildOperations: (state, actor, source, selected) => {
      const cost = selected.find((id) => state.players[actor].retreat.includes(id))!;
      const target = selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id))!;
      return [{ kind: "BANISH", cardIds: [cost], sourceCardId: source }, { ...modifier(source, target, "power", -1000, "assemble-pulse"), requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "assemble-pulse-iron-man"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "BP01-010", effectId: "evolution-load-attach", label: "进化加载·机械结附", activation: "action", sourceZones: ["hand"], ruleRefs: ["301.25", "301.32", "304.2"],
    canActivate: (state, actor) => faceUpRoles(state, actor).some((id) => effectiveValueV2(state, id, "level") >= 4 && state.cards[id]?.features.some((feature) => feature.includes("机械"))),
    targeting: (state, actor) => ({ choices: faceUpRoles(state, actor).filter((id) => effectiveValueV2(state, id, "level") >= 4 && state.cards[id]?.features.some((feature) => feature.includes("机械"))), min: 1, max: 1, prompt: "选择我方场上 1 张 Lv4+【机械】角色作为结附宿主" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "ATTACH", cardId: source, hostCardId: selected[0], sourceCardId: source }],
  },
  {
    cardNo: "BP01-010", effectId: "evolution-load-rear-recover", label: "进化加载·后卫回收", activation: "action", usage: "turn_once", sourceZones: ["field"], ruleRefs: ["301.12", "301.28", "301.32", "304.2"],
    canActivate: (state, actor, source) => state.players[actor].field.rear.includes(source) && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "evolution-load-rear-recover")) && state.players[actor].baseCovered.length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].baseCovered], min: 1, max: 1, prompt: "选择我方基地 1 张盖卡展示；若为 Lv1【机械】角色则移回手牌" }),
    buildOperations: (state, _actor, source, selected) => [{ kind: "REVEAL", cardIds: [selected[0]], sourceCardId: source }, ...(effectiveValueV2(state, selected[0], "level") === 1 && state.cards[selected[0]]?.features.some((feature) => feature.includes("机械")) ? [{ kind: "MOVE_TO_HAND" as const, cardIds: [selected[0]], sourceCardId: source, requiresPreviousSuccess: true }] : []), { kind: "MARK_EFFECT_USED", key: useKey(source, "evolution-load-rear-recover"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-011", effectId: "gale-thunder-thor", label: "疾风迅雷·额外攻击", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[actor].deck.length > 0,
    buildOperations: (_state, actor, source) => [{ kind: "DRAW", actor, count: 1, sourceCardId: source }, { kind: "GRANT_ADDITIONAL_CHARACTER_ATTACK", cardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-012", effectId: "thunder-flash-charge", label: "雷霆闪充·卡组顶盖放", trigger: "CHARACTER_SUMMONED", sourceZones: ["field"], optional: true, ruleRefs: ["301.12", "301.28", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source && event.destination !== "base"; },
    condition: (state, actor) => state.players[actor].baseCards.some((id) => state.cards[id]?.attribute === 1) && state.players[actor].baseCards.length + state.players[actor].baseCovered.length <= 4 && state.players[actor].deck.length >= 2,
    buildOperations: (state, actor, source) => state.players[actor].deck.slice(0, 2).map((cardId) => ({ kind: "MOVE_TO_BASE" as const, cardId, face: "down" as const, sourceCardId: source })),
  },
  {
    cardNo: "BP01-013", effectId: "wakanda-forever-cover", label: "瓦坎达万岁·移动盖伏", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.23", "301.28", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[opponentOf(actor)].baseCards.length + state.players[opponentOf(actor)].baseCovered.length < 6 && battleRoles(state, opponentOf(actor)).some((id) => state.cards[id]?.features.some((feature) => feature.includes("人类")) && effectiveValueV2(state, id, "power") >= 5000 && !state.usage.enteredThisTurn.includes(id) && !state.usage.movedCardIds.includes(id)),
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)).filter((id) => state.cards[id]?.features.some((feature) => feature.includes("人类")) && effectiveValueV2(state, id, "power") >= 5000 && !state.usage.enteredThisTurn.includes(id) && !state.usage.movedCardIds.includes(id)), min: 1, max: 1, prompt: "选择敌方战区 1 张战力 5000+【人类】角色移动至其基地并盖伏" }),
    buildOperations: (_state, _actor, _source, selected) => [{ kind: "MOVE_BATTLE_BASE", cardId: selected[0], destination: "base" }, { kind: "COVER", cardId: selected[0], requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-014", effectId: "defense-program-ultron", label: "防御程序·奥创撤退", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.14", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor, source) => faceUpRoles(state, actor).some((id) => id !== source && state.cards[id]?.name.includes("奥创")) && battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") <= 3),
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 3), min: 1, max: 1, prompt: "选择敌方战区 1 张 Lv3 或以下角色撤退" }),
    buildOperations: (_state, _actor, _source, selected) => [{ kind: "RETREAT", cardIds: [selected[0]] }],
  },
  {
    cardNo: "BP01-015", effectId: "disintegration-ray-vision", label: "瓦解射线·低战力裁剪", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.15", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "power") <= 4000),
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "power") <= 4000), min: 1, max: 1, prompt: "选择敌方战区 1 张战力 4000 或以下角色裁剪" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }],
  },
  {
    cardNo: "BP01-016", effectId: "higher-dimensional-shock", label: "高维震荡·高阶号召驱逐", trigger: "CHARACTER_SUMMONED", sourceZones: ["field"], optional: true, usage: "turn_once", ruleRefs: ["301.12", "301.23", "301.32", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return Boolean(event?.actor === actor && effectiveValueV2(state, event.cardId, "level") >= 4); },
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "higher-dimensional-shock")) && state.players[opponentOf(actor)].baseCards.length + state.players[opponentOf(actor)].baseCovered.length < 6 && battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") <= 3 && !state.usage.enteredThisTurn.includes(id) && !state.usage.movedCardIds.includes(id)),
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 3 && !state.usage.enteredThisTurn.includes(id) && !state.usage.movedCardIds.includes(id)), min: 1, max: 1, prompt: "选择敌方战区 1 张 Lv3 或以下角色移动至其基地" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "MOVE_BATTLE_BASE", cardId: selected[0], destination: "base" }, { kind: "MARK_EFFECT_USED", key: useKey(source, "higher-dimensional-shock"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-017", effectId: "vengeful-rage-hulk", label: "复仇暴怒·撤退区裁剪", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.15", "301.32", "301.41", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[opponentOf(actor)].retreat.length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[opponentOf(actor)].retreat], min: 1, max: 1, prompt: "选择敌方撤退区 1 张角色裁剪；如此做后浩克本回合战力 +1000" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }, { ...modifier(source, source, "power", 1000, "vengeful-rage"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-018", effectId: "equal-strike-iron-man", label: "对等打击·人数劣势压制", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.32", "301.41", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => battleRoles(state, actor).length < battleRoles(state, opponentOf(actor)).length && battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") <= 3),
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 3), min: 1, max: 1, prompt: "选择敌方战区 1 张 Lv3 或以下角色本回合战力 -2000" }),
    buildOperations: (_state, _actor, source, selected) => [modifier(source, selected[0], "power", -2000, "equal-strike")],
  },
  {
    cardNo: "BP01-019", effectId: "vibranium-excavation", label: "振金挖掘·攻击增幅", trigger: "ATTACK_DECLARED", sourceZones: ["field"], optional: true, usage: "turn_once", ruleRefs: ["301.13", "301.32", "301.41", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return event?.actor === actor && event.attackerId === source; },
    condition: (state, actor, source) => state.players[actor].deck.length > 0 && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "vibranium-excavation")),
    buildOperations: (_state, actor, source) => [{ kind: "DISCARD_DECK_TOP", actor, count: 1 }, { ...modifier(source, source, "power", 2000, "vibranium-excavation"), requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "vibranium-excavation"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-020", effectId: "tear-everything-hulk", label: "撕裂一切·裁剪抽牌", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.15", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[actor].deck.length > 0 && state.players[actor].retreat.some((id) => state.cards[id]?.attribute === 1),
    targeting: (state, actor) => ({ choices: state.players[actor].retreat.filter((id) => state.cards[id]?.attribute === 1), min: 1, max: 1, prompt: "选择我方撤退区 1 张红色角色裁剪；如此做后抽 1 张" }),
    buildOperations: (_state, actor, source, selected) => [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }, { kind: "DRAW", actor, count: 1, sourceCardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-021", effectId: "thunder-call-reveal", label: "雷霆呼唤·展示卡组顶", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.13", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[actor].deck.length > 0,
    buildOperations: (state, actor, source) => [{ kind: "REVEAL", cardIds: state.players[actor].deck.slice(0, 3), sourceCardId: source }],
  },
  {
    cardNo: "BP01-021", effectId: "thunder-call-select", label: "雷霆呼唤·人类入手", trigger: "CARDS_REVEALED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.13", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_REVEALED")?.sourceCardId === source,
    targeting: (state, _actor, _source, context) => { const shown = eventOf(context, "CARDS_REVEALED")!.cards.map((item) => item.instanceId); const humans = shown.filter((id) => state.cards[id]?.features.some((feature) => feature.includes("人类"))); return { choices: humans, min: humans.length ? 1 : 0, max: humans.length ? 1 : 0, prompt: humans.length ? "选择展示卡中 1 张【人类】角色加入手牌" : "展示卡中没有【人类】角色，全部舍弃" }; },
    buildOperations: (_state, _actor, _source, selected, context) => { const shown = eventOf(context, "CARDS_REVEALED")!.cards.map((item) => item.instanceId); return [...(selected[0] ? [{ kind: "MOVE_TO_HAND" as const, cardIds: [selected[0]] }] : []), ...(shown.filter((id) => id !== selected[0]).length ? [{ kind: "DISCARD" as const, cardIds: shown.filter((id) => id !== selected[0]) }] : [])]; },
  },
  {
    cardNo: "BP01-022", effectId: "top-agent-widow", label: "顶级特工·常驻角色撤退", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.14", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor, source) => faceUpRoles(state, actor).some((id) => id !== source && state.cards[id]?.features.some((feature) => feature.includes("复仇者联盟"))) && faceUpRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") <= 3 && /常驻/.test(state.cards[id]?.effectText ?? "")),
    targeting: (state, actor) => ({ choices: faceUpRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 3 && /常驻/.test(state.cards[id]?.effectText ?? "")), min: 1, max: 1, prompt: "选择敌方场上 1 张 Lv3 或以下、具有【常驻】效果的角色撤退" }),
    buildOperations: (_state, _actor, _source, selected) => [{ kind: "RETREAT", cardIds: [selected[0]] }],
  },
  {
    cardNo: "BP01-023", effectId: "mk44-melee-attach", label: "MK44·肉搏特化结附", activation: "response", usage: "turn_once", sourceZones: ["field", "base"], ruleRefs: ["301.14", "301.25", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "mk44-melee-attach")) && faceUpRoles(state, actor).some((id) => id !== source),
    targeting: (state, actor, source) => ({ choices: faceUpRoles(state, actor).filter((id) => id !== source), min: 1, max: 1, prompt: "选择我方场上 1 张角色作为宿主；撤退该角色其他所有结附卡" }),
    buildOperations: (state, _actor, source, selected) => [{ kind: "ATTACH", cardId: source, hostCardId: selected[0], sourceCardId: source }, ...((state.attachments[selected[0]] ?? []).filter((id) => id !== source).length ? [{ kind: "RETREAT" as const, cardIds: (state.attachments[selected[0]] ?? []).filter((id) => id !== source), requiresPreviousSuccess: true }] : []), { kind: "MARK_EFFECT_USED", key: useKey(source, "mk44-melee-attach"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-026", effectId: "farewell-gift-surfer", label: "临别赠礼·盖放回底", trigger: "CARDS_RETREATED", sourceZones: ["retreat"], optional: true, ruleRefs: ["301.12", "301.23", "301.28", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => { const event = eventOf(context, "CARDS_RETREATED"); return event?.reason === "summon_payment" && event.cardIds.includes(source); },
    condition: (state, actor) => state.players[actor].deck.length > 0 && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6,
    buildOperations: (state, actor, source) => [{ kind: "MOVE_TO_BASE", cardId: state.players[actor].deck[0], face: "down", sourceCardId: source }, { kind: "MOVE_TO_DECK_BOTTOM", cardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-028", effectId: "behind-enemy-lines-infiltrate", label: "深入敌后·潜入基地", activation: "action", sourceZones: ["hand"], ruleRefs: ["301.12", "301.32", "304.2"],
    canActivate: (state, actor) => state.players[opponentOf(actor)].baseCards.length > 0 && state.players[opponentOf(actor)].baseCards.length + state.players[opponentOf(actor)].baseCovered.length < 6,
    buildOperations: (_state, actor, source) => [{ kind: "MOVE_TO_BASE", cardId: source, face: "up", controller: opponentOf(actor), sourceCardId: source }],
  },
  {
    cardNo: "BP01-028", effectId: "behind-enemy-lines-retreat", label: "深入敌后·敌方指定撤退", trigger: "CHARACTER_PLACED", sourceZones: ["base"], ruleRefs: ["301.14", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_PLACED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[opponentOf(actor)].baseCards.some((id) => effectiveValueV2(state, id, "level") <= 3),
    targeting: (state, actor) => ({ choices: state.players[opponentOf(actor)].baseCards.filter((id) => effectiveValueV2(state, id, "level") <= 3), min: 1, max: 1, prompt: "选择原控制者基地 1 张 Lv3 或以下角色撤退" }),
    buildOperations: (_state, _actor, _source, selected) => [{ kind: "RETREAT", cardIds: [selected[0]] }],
  },
  {
    cardNo: "BP01-030", effectId: "add-leverage-attach", label: "加杠杆·Lv1 红色结附", activation: "action", sourceZones: ["hand"], ruleRefs: ["301.25", "301.32", "304.2"],
    canActivate: (state, actor) => faceUpRoles(state, actor).some((id) => effectiveValueV2(state, id, "level") === 1 && state.cards[id]?.attribute === 1),
    targeting: (state, actor) => ({ choices: faceUpRoles(state, actor).filter((id) => effectiveValueV2(state, id, "level") === 1 && state.cards[id]?.attribute === 1), min: 1, max: 1, prompt: "选择我方场上 1 张 Lv1 红色角色作为宿主" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "ATTACH", cardId: source, hostCardId: selected[0], sourceCardId: source }],
  },
  {
    cardNo: "BP01-032", effectId: "multiple-strikes-panther", label: "多重打击·相杀降临", trigger: "CHARACTER_BATTLE_RESOLVED", sourceZones: ["hand"], optional: true, ruleRefs: ["301.12", "301.20", "301.32", "301.41", "304.1", "305.6"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "CHARACTER_BATTLE_RESOLVED"); return Boolean(event?.tied && [event.attackerId, event.targetId].some((id) => cardControllerV2(state, id) === actor && state.cards[id]?.attribute === 2)); },
    condition: (state, actor) => openFieldZones(state, actor).length > 0 && battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: [...openFieldZones(state, actor).map(zoneChoice), ...battleRoles(state, opponentOf(actor))], min: 2, max: 2, prompt: "选择黑豹放置战区，并选择敌方战区 1 张角色本回合战力 -1000", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id))).length === 1 && selected.filter((id) => battleRoles(state, opponentOf(actor)).includes(id)).length === 1 ? null : "必须选择 1 个空战区和 1 张敌方战区角色",
    buildOperations: (state, actor, source, selected) => { const zone = parseZone(selected.find((id) => id.startsWith("zone:"))!); const target = selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id))!; return [{ kind: "PLACE_FIELD", cardId: source, destination: zone, sourceCardId: source }, { ...modifier(source, target, "power", -1000, "multiple-strikes"), requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-033", effectId: "covering-fire-war-machine", label: "援护射击·后卫支援", trigger: "ATTACK_DECLARED", sourceZones: ["field"], ruleRefs: ["301.32", "301.41", "304.1"],
    eventFilter: (state, actor, source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return Boolean(state.players[actor].field.rear.includes(source) && event?.actor === actor && state.cards[event.attackerId]?.features.some((feature) => feature.includes("复仇者联盟"))); },
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "选择敌方战区 1 张角色本回合战力 -500" }),
    buildOperations: (_state, _actor, source, selected) => [modifier(source, selected[0], "power", -500, "covering-fire")],
  },
  {
    cardNo: "BP01-034", effectId: "wisdom-curse-reveal", label: "智慧诅咒·展示卡组顶", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.13", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; }, condition: (state, actor) => state.players[actor].deck.length > 0,
    buildOperations: (state, actor, source) => [{ kind: "REVEAL", cardIds: state.players[actor].deck.slice(0, 3), sourceCardId: source }],
  },
  {
    cardNo: "BP01-034", effectId: "wisdom-curse-select", label: "智慧诅咒·机械入手", trigger: "CARDS_REVEALED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.13", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_REVEALED")?.sourceCardId === source,
    targeting: (state, _actor, _source, context) => { const shown = eventOf(context, "CARDS_REVEALED")!.cards.map((item) => item.instanceId); const machines = shown.filter((id) => state.cards[id]?.features.some((feature) => feature.includes("机械"))); return { choices: machines, min: machines.length ? 1 : 0, max: machines.length ? 1 : 0, prompt: machines.length ? "选择展示卡中 1 张【机械】角色加入手牌" : "展示卡中没有【机械】角色，全部舍弃" }; },
    buildOperations: (_state, _actor, _source, selected, context) => { const shown = eventOf(context, "CARDS_REVEALED")!.cards.map((item) => item.instanceId); return [...(selected[0] ? [{ kind: "MOVE_TO_HAND" as const, cardIds: [selected[0]] }] : []), ...(shown.filter((id) => id !== selected[0]).length ? [{ kind: "DISCARD" as const, cardIds: shown.filter((id) => id !== selected[0]) }] : [])]; },
  },
  {
    cardNo: "BP01-035", effectId: "mk44-tactical-attach", label: "MK44·战术特化结附", activation: "response", usage: "turn_once", sourceZones: ["field", "base"], ruleRefs: ["301.14", "301.25", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "mk44-tactical-attach")) && faceUpRoles(state, actor).some((id) => id !== source),
    targeting: (state, actor, source) => ({ choices: faceUpRoles(state, actor).filter((id) => id !== source), min: 1, max: 1, prompt: "选择我方场上 1 张角色作为宿主；撤退该角色其他所有结附卡" }),
    buildOperations: (state, _actor, source, selected) => [{ kind: "ATTACH", cardId: source, hostCardId: selected[0], sourceCardId: source }, ...((state.attachments[selected[0]] ?? []).filter((id) => id !== source).length ? [{ kind: "RETREAT" as const, cardIds: (state.attachments[selected[0]] ?? []).filter((id) => id !== source), requiresPreviousSuccess: true }] : []), { kind: "MARK_EFFECT_USED", key: useKey(source, "mk44-tactical-attach"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-035", effectId: "mk44-tactical-move", label: "MK44·宿主战区移动", trigger: "CARD_ATTACHED", sourceZones: ["attachment"], optional: true, ruleRefs: ["301.23", "301.25", "301.32", "304.1"],
    eventFilter: (state, _actor, source, context) => { const event = eventOf(context, "CARD_ATTACHED"); return Boolean(event?.cardId === source && battleRoles(state, cardControllerV2(state, event.hostCardId) ?? 0).includes(event.hostCardId)); },
    condition: (state, _actor, source) => { const host = Object.entries(state.attachments).find(([, ids]) => ids.includes(source))?.[0]; const controller = host ? cardControllerV2(state, host) : null; return controller !== null && openFieldZones(state, controller).length > 0; },
    targeting: (state, _actor, source) => { const host = Object.entries(state.attachments).find(([, ids]) => ids.includes(source))![0]; const controller = cardControllerV2(state, host)!; return { choices: openFieldZones(state, controller).map(zoneChoice), min: 1, max: 1, prompt: "选择宿主移动到的空战区", choiceKind: "field_location" as const }; },
    buildOperations: (state, _actor, source, selected) => [{ kind: "MOVE_FIELD", cardId: Object.entries(state.attachments).find(([, ids]) => ids.includes(source))![0], destination: parseZone(selected[0]) }],
  },
  {
    cardNo: "BP01-037", effectId: "kin-summon-ultron", label: "眷族号召·奥创回场", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => boardPlacementChoices(state, actor).length > 0 && state.players[actor].retreat.some((id) => effectiveValueV2(state, id, "level") <= 2 && state.cards[id]?.name.includes("奥创")),
    targeting: (state, actor) => ({ choices: [...state.players[actor].retreat.filter((id) => effectiveValueV2(state, id, "level") <= 2 && state.cards[id]?.name.includes("奥创")), ...boardPlacementChoices(state, actor)], min: 2, max: 2, prompt: "选择撤退区 1 张 Lv2 或以下【奥创】，再选择放置进战区或基地", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].retreat.includes(id) && effectiveValueV2(state, id, "level") <= 2 && state.cards[id]?.name.includes("奥创")).length === 1 && selected.filter((id) => boardPlacementChoices(state, actor).includes(id)).length === 1 ? null : "必须选择合法奥创和可用场上位置各 1",
    buildOperations: (state, actor, source, selected) => [boardPlacementOperation(selected.find((id) => state.players[actor].retreat.includes(id))!, source, selected.find((id) => id.startsWith("zone:"))!)],
  },
  {
    cardNo: "BP01-038", effectId: "wasp-circuit-swap", label: "蜂回路转·先锋替换", trigger: "TURN_CARDS_DRAWN", sourceZones: ["field"], optional: true, ruleRefs: ["301.23", "301.32", "301.41", "304.1"],
    eventFilter: (_state, actor, _source, context) => eventOf(context, "TURN_CARDS_DRAWN")?.actor === opponentOf(actor),
    condition: (state, actor) => { const vanguard = state.players[actor].field.vanguard[0]; return Boolean(vanguard && state.cards[vanguard]?.attribute === 2 && !state.cards[vanguard]?.name.includes("黄蜂女")); },
    targeting: (state, actor) => ({ choices: [state.players[actor].field.vanguard[0]], min: 1, max: 1, prompt: "选择先锋区黄色非黄蜂女角色，与此卡互相替换" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "SWAP_POSITIONS", cardIds: [source, selected[0]], sourceCardId: source }, { ...modifier(source, source, "power", 2500, "wasp-circuit"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-039", effectId: "conductive-surge-thor", label: "导电窜流·三黄降临", activation: "action", sourceZones: ["hand"], ruleRefs: ["301.12", "301.32", "304.2"],
    canActivate: (state, actor) => battleRoles(state, actor).filter((id) => state.cards[id]?.attribute === 2).length === 3 && openFieldZones(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: openFieldZones(state, actor).map(zoneChoice), min: 1, max: 1, prompt: "选择雷神放置的空战区", choiceKind: "field_location" as const }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "PLACE_FIELD", cardId: source, destination: parseZone(selected[0]), sourceCardId: source }],
  },
  {
    cardNo: "BP01-040", effectId: "death-rebirth-ultron", label: "死与新生·机械献祭", activation: "action", sourceZones: ["hand"], ruleRefs: ["301.12", "301.15", "301.32", "304.2"],
    canActivate: (state, actor) => new Set(state.players[actor].retreat.filter((id) => state.cards[id]?.features.some((feature) => feature.includes("机械"))).map((id) => state.cards[id]?.name)).size >= 3 && boardPlacementChoices(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].retreat.filter((id) => state.cards[id]?.features.some((feature) => feature.includes("机械"))), ...boardPlacementChoices(state, actor)], min: 4, max: 4, prompt: "选择 3 张不同名【机械】角色裁剪，再选择此卡放置进战区或基地", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => { const costs = selected.filter((id) => state.players[actor].retreat.includes(id) && state.cards[id]?.features.some((feature) => feature.includes("机械"))); const zones = selected.filter((id) => boardPlacementChoices(state, actor).includes(id)); return costs.length === 3 && new Set(costs.map((id) => state.cards[id]?.name)).size === 3 && zones.length === 1 ? null : "必须选择 3 张不同名机械和 1 个可用场上位置"; },
    buildOperations: (state, actor, source, selected) => [{ kind: "BANISH", cardIds: selected.filter((id) => state.players[actor].retreat.includes(id)), sourceCardId: source }, { ...boardPlacementOperation(source, source, selected.find((id) => id.startsWith("zone:"))!), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-041", effectId: "shadow-dance-draw", label: "影舞·破绽抽牌", trigger: "BREACH_HIT", sourceZones: ["field"], ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "BREACH_HIT"); return event?.attacker === actor && event.attackerCardId === source; }, condition: (state, actor) => state.players[actor].deck.length > 0,
    buildOperations: (_state, actor, source) => [{ kind: "DRAW", actor, count: 1, sourceCardId: source }],
  },
  {
    cardNo: "BP01-041", effectId: "shadow-dance-discard", label: "影舞·抽后舍弃", trigger: "TURN_CARDS_DRAWN", sourceZones: ["field"], ruleRefs: ["301.13", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "TURN_CARDS_DRAWN"); return event?.actor === actor && event.sourceCardId === source; }, condition: (state, actor) => state.players[actor].hand.length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand], min: 1, max: 1, prompt: "选择抽牌后的 1 张手牌舍弃" }), buildOperations: (_state, _actor, _source, selected) => [{ kind: "DISCARD", cardIds: [selected[0]] }],
  },
  {
    cardNo: "BP01-042", effectId: "family-oath-widow", label: "家族誓盟·黄色回场", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; }, condition: (state, actor) => openFieldZones(state, actor).length > 0 && state.players[actor].retreat.some((id) => effectiveValueV2(state, id, "level") <= 2 && state.cards[id]?.attribute === 2),
    targeting: (state, actor) => ({ choices: [...state.players[actor].retreat.filter((id) => effectiveValueV2(state, id, "level") <= 2 && state.cards[id]?.attribute === 2), ...openFieldZones(state, actor).map(zoneChoice)], min: 2, max: 2, prompt: "选择撤退区 1 张 Lv2 或以下黄色角色及其放置战区", choiceKind: "mixed" as const }),
    buildOperations: (state, actor, source, selected) => [{ kind: "PLACE_FIELD", cardId: selected.find((id) => state.players[actor].retreat.includes(id))!, destination: parseZone(selected.find((id) => id.startsWith("zone:"))!), sourceCardId: source }],
  },
  {
    cardNo: "BP01-043", effectId: "unload-rearm-vision", label: "卸载重装·撤退抽牌", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.14", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; }, condition: (state, actor) => faceUpRoles(state, actor).some((id) => state.cards[id]?.name.includes("奥创")) && state.players[actor].deck.length > 0,
    targeting: (state, actor) => ({ choices: faceUpRoles(state, actor).filter((id) => state.cards[id]?.name.includes("奥创")), min: 1, max: 1, prompt: "选择我方场上 1 张【奥创】角色撤退；如此做后抽 1 张" }),
    buildOperations: (_state, actor, source, selected) => [{ kind: "RETREAT", cardIds: [selected[0]], sourceCardId: source }, { kind: "DRAW", actor, count: 1, sourceCardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-043", effectId: "unload-rearm-place", label: "卸载重装·机械入场", trigger: "TURN_CARDS_DRAWN", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "TURN_CARDS_DRAWN"); return event?.actor === actor && event.sourceCardId === source; }, condition: (state, actor) => boardPlacementChoices(state, actor).length > 0 && state.players[actor].hand.some((id) => effectiveValueV2(state, id, "level") <= 3 && state.cards[id]?.features.some((feature) => feature.includes("机械"))),
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand.filter((id) => effectiveValueV2(state, id, "level") <= 3 && state.cards[id]?.features.some((feature) => feature.includes("机械"))), ...boardPlacementChoices(state, actor)], min: 2, max: 2, prompt: "选择手牌 1 张 Lv3 或以下机械，再选择放置进战区或基地", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].hand.includes(id) && effectiveValueV2(state, id, "level") <= 3 && state.cards[id]?.features.some((feature) => feature.includes("机械"))).length === 1 && selected.filter((id) => boardPlacementChoices(state, actor).includes(id)).length === 1 ? null : "必须选择合法机械和可用场上位置各 1",
    buildOperations: (state, actor, source, selected) => [boardPlacementOperation(selected.find((id) => state.players[actor].hand.includes(id))!, source, selected.find((id) => id.startsWith("zone:"))!)],
  },
  {
    cardNo: "BP01-044", effectId: "leave-cover-retreat", label: "脱离掩护·自撤退", trigger: "CHARACTER_PLACED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.14", "301.32", "304.1"],
    eventFilter: (state, actor, source, context) => { const event = eventOf(context, "CHARACTER_PLACED"); return Boolean(state.activePlayer === actor && event?.actor === opponentOf(actor) && event.cardId !== source); }, buildOperations: (_state, _actor, source) => [{ kind: "RETREAT", cardIds: [source], sourceCardId: source }],
  },
  {
    cardNo: "BP01-044", effectId: "leave-cover-swap", label: "脱离掩护·钢铁侠替换", trigger: "CARDS_RETREATED", sourceZones: ["retreat"], optional: true, ruleRefs: ["301.23", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => { const event = eventOf(context, "CARDS_RETREATED"); return event?.reason === "effect" && event.sourceCardId === source && event.cardIds.includes(source); }, condition: (state, actor) => Boolean(state.players[actor].field.vanguard[0] && state.players[actor].hand.some((id) => effectiveValueV2(state, id, "level") <= 4 && state.cards[id]?.name.includes("钢铁侠"))),
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand.filter((id) => effectiveValueV2(state, id, "level") <= 4 && state.cards[id]?.name.includes("钢铁侠")), state.players[actor].field.vanguard[0]], min: 2, max: 2, prompt: "选择手牌 Lv4 或以下【钢铁侠】和我方先锋角色互相替换", choiceKind: "mixed" as const }),
    buildOperations: (state, actor, source, selected) => [{ kind: "SWAP_POSITIONS", cardIds: [selected.find((id) => state.players[actor].hand.includes(id))!, state.players[actor].field.vanguard[0]], sourceCardId: source }],
  },
  {
    cardNo: "BP01-045", effectId: "mind-projection-vision", label: "心灵投影·增幅传导", trigger: "CARD_VALUE_CHANGED", sourceZones: ["field"], usage: "turn_once", ruleRefs: ["301.32", "301.41", "304.1"],
    eventFilter: (_state, _actor, source, context) => { const event = eventOf(context, "CARD_VALUE_CHANGED"); return event?.targetCardId === source && event.valueType === "power" && event.delta > 0; }, condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "mind-projection-vision")) && battleRoles(state, actor).some((id) => id !== source && state.cards[id]?.features.some((feature) => feature.includes("机械"))),
    targeting: (state, actor, source) => ({ choices: battleRoles(state, actor).filter((id) => id !== source && state.cards[id]?.features.some((feature) => feature.includes("机械"))), min: 1, max: 1, prompt: "选择我方战区另一张机械角色，获得与本次增加相同的战力" }),
    buildOperations: (_state, _actor, source, selected, context) => [modifier(source, selected[0], "power", eventOf(context, "CARD_VALUE_CHANGED")!.delta, "mind-projection"), { kind: "MARK_EFFECT_USED", key: useKey(source, "mind-projection-vision"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-047", effectId: "central-control-hulkbuster", label: "中控系统·装甲解除", activation: "response", usage: "turn_once", sourceZones: ["field", "base"], ruleRefs: ["301.23", "301.25", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "central-control-hulkbuster")) && openFieldZones(state, actor).length > 0 && Object.values(state.attachments).flat().some((id) => cardControllerV2(state, id) === actor && state.cards[id]?.name.includes("反浩克装甲")),
    targeting: (state, actor) => ({ choices: [...Object.values(state.attachments).flat().filter((id) => cardControllerV2(state, id) === actor && state.cards[id]?.name.includes("反浩克装甲")), ...openFieldZones(state, actor).map(zoneChoice)], min: 2, max: 2, prompt: "选择我方 1 张【反浩克装甲】结附卡及其解除到的空战区", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => Object.values(state.attachments).flat().includes(id) && cardControllerV2(state, id) === actor && state.cards[id]?.name.includes("反浩克装甲")).length === 1 && selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id))).length === 1 ? null : "必须选择合法反浩克装甲和空战区各 1",
    buildOperations: (state, actor, source, selected) => { const armor = selected.find((id) => Object.values(state.attachments).flat().includes(id) && cardControllerV2(state, id) === actor)!; return [{ kind: "DETACH", cardId: armor, destination: parseZone(selected.find((id) => id.startsWith("zone:"))!) }, { ...modifier(source, armor, "power", 1000, "central-control"), requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "central-control-hulkbuster"), requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-048", effectId: "agent-foresight-reveal", label: "特工预感·查看卡组顶", activation: "action", usage: "turn_once", sourceZones: ["field"], ruleRefs: ["301.13", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "agent-foresight-reveal")) && state.players[actor].deck.length > 0,
    buildOperations: (state, actor, source) => [{ kind: "REVEAL", cardIds: state.players[actor].deck.slice(0, 3), sourceCardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "agent-foresight-reveal"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-048", effectId: "agent-foresight-reorder", label: "特工预感·顶底排序", trigger: "CARDS_REVEALED", sourceZones: ["field"], ruleRefs: ["301.13", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_REVEALED")?.sourceCardId === source,
    targeting: (_state, _actor, _source, context) => { const shown = eventOf(context, "CARDS_REVEALED")!.cards.map((item) => item.instanceId); return { choices: [...shown, ...Array.from({ length: shown.length + 1 }, (_, count) => `split:${count}`)], min: shown.length + 1, max: shown.length + 1, prompt: "调整展示卡顺序，并选择其中多少张放回卡组顶；其余按所定顺序放回卡组底", choiceKind: "deck_reorder" as const }; },
    validateTargets: (_state, _actor, _source, selected, context) => { const shown = eventOf(context, "CARDS_REVEALED")!.cards.map((item) => item.instanceId); const ordered = selected.filter((id) => shown.includes(id)); const split = selected.filter((id) => /^split:\d+$/.test(id)); return ordered.length === shown.length && shown.every((id) => ordered.includes(id)) && split.length === 1 && Number(split[0].slice(6)) <= shown.length ? null : "必须完整排列展示卡并选择合法顶底分界"; },
    buildOperations: (_state, actor, source, selected, context) => { const shown = eventOf(context, "CARDS_REVEALED")!.cards.map((item) => item.instanceId); const ordered = selected.filter((id) => shown.includes(id)); const split = Number(selected.find((id) => /^split:\d+$/.test(id))!.slice(6)); return [{ kind: "REORDER_DECK_CARDS", actor, inspectedCardIds: shown, topCardIds: ordered.slice(0, split), bottomCardIds: ordered.slice(split), sourceCardId: source }]; },
  },
  {
    cardNo: "BP01-050", effectId: "superconductive-shock", label: "超导感电·禁止移动", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.23", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => faceUpRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: faceUpRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "选择敌方场上 1 张角色，本回合不能战基移动" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "FORBID_MOVE", cardId: selected[0], sourceCardId: source }],
  },
  {
    cardNo: "BP01-051", effectId: "support-strike-widow", label: "援助打击·黄色增幅", trigger: "CARDS_RETREATED", sourceZones: ["retreat"], ruleRefs: ["301.14", "301.32", "301.41", "304.1"],
    eventFilter: (_state, _actor, source, context) => { const event = eventOf(context, "CARDS_RETREATED"); return event?.reason === "summon_payment" && event.cardIds.includes(source); },
    condition: (state, actor) => faceUpRoles(state, actor).some((id) => state.cards[id]?.attribute === 2),
    targeting: (state, actor) => ({ choices: faceUpRoles(state, actor).filter((id) => state.cards[id]?.attribute === 2), min: 1, max: 1, prompt: "选择我方场上 1 张黄色角色，本回合战力 +2000" }),
    buildOperations: (_state, _actor, source, selected) => [modifier(source, selected[0], "power", 2000, "support-strike")],
  },
  {
    cardNo: "BP01-052", effectId: "tracker-hulkbuster", label: "追迹者·装甲追加入场", trigger: "CHARACTER_PLACED", sourceZones: ["hand"], optional: true, ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "CHARACTER_PLACED"); return Boolean(event?.actor === actor && effectiveValueV2(state, event.cardId, "level") >= 4 && state.cards[event.cardId]?.features.some((feature) => feature.includes("机械"))); },
    condition: (state, actor) => !faceUpRoles(state, actor).some((id) => state.cards[id]?.name.includes("反浩克装甲")) && boardPlacementChoices(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: boardPlacementChoices(state, actor), min: 1, max: 1, prompt: "选择反浩克装甲放置进战区或基地", choiceKind: "field_location" as const }),
    buildOperations: (_state, _actor, source, selected) => [boardPlacementOperation(source, source, selected[0])],
  },
  {
    cardNo: "BP01-053", effectId: "underdog-hulkbuster", label: "下克上·高阶目标增幅", trigger: "ATTACK_DECLARED", sourceZones: ["field"], ruleRefs: ["301.32", "301.41", "304.1"],
    eventFilter: (state, actor, source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return Boolean(event?.actor === actor && event.attackerId === source && event.target.kind === "character" && effectiveValueV2(state, event.target.cardId, "level") >= 4); },
    buildOperations: (_state, _actor, source) => [modifier(source, source, "power", 1500, "underdog-hulkbuster")],
  },
  {
    cardNo: "BP01-054", effectId: "kin-remodel-ultron", label: "眷族重塑·机械换奥创", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.12", "301.13", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[actor].hand.some((id) => state.cards[id]?.features.some((feature) => feature.includes("机械"))) && state.players[actor].retreat.some((id) => effectiveValueV2(state, id, "level") >= 4 && state.cards[id]?.name.includes("奥创")),
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand.filter((id) => state.cards[id]?.features.some((feature) => feature.includes("机械"))), ...state.players[actor].retreat.filter((id) => effectiveValueV2(state, id, "level") >= 4 && state.cards[id]?.name.includes("奥创"))], min: 2, max: 2, prompt: "选择 1 张机械手牌舍弃，并选择撤退区 1 张 Lv4 或以上奥创移回手牌", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].hand.includes(id) && state.cards[id]?.features.some((feature) => feature.includes("机械"))).length === 1 && selected.filter((id) => state.players[actor].retreat.includes(id) && effectiveValueV2(state, id, "level") >= 4 && state.cards[id]?.name.includes("奥创")).length === 1 ? null : "必须选择合法机械手牌与高阶奥创各 1",
    buildOperations: (state, actor, _source, selected) => [{ kind: "DISCARD", cardIds: [selected.find((id) => state.players[actor].hand.includes(id))!] }, { kind: "MOVE_TO_HAND", cardIds: [selected.find((id) => state.players[actor].retreat.includes(id))!], requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-057", effectId: "remnant-assembly-vision", label: "残械组装·机械入基地", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6 && state.players[actor].retreat.some((id) => effectiveValueV2(state, id, "level") === 1 && state.cards[id]?.features.some((feature) => feature.includes("机械"))),
    targeting: (state, actor) => ({ choices: state.players[actor].retreat.filter((id) => effectiveValueV2(state, id, "level") === 1 && state.cards[id]?.features.some((feature) => feature.includes("机械"))), min: 1, max: 1, prompt: "选择撤退区 1 张 Lv1 机械角色放置进我方基地" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "MOVE_TO_BASE", cardId: selected[0], face: "up", sourceCardId: source }],
  },
  {
    cardNo: "BP01-059", effectId: "hunting-instinct-panther", label: "狩猎本能·获得强袭", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.32", "304.1", "305.4"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    buildOperations: (_state, _actor, source) => [{ kind: "GRANT_KEYWORD", grant: { id: `bp01:${source}:hunting-instinct`, sourceCardId: source, targetCardId: source, keyword: "assault", duration: "turn" } }],
  },
  {
    cardNo: "BP01-060", effectId: "anti-tank-war-machine", label: "反坦克·先锋压制", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.32", "301.41", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => Boolean(state.players[opponentOf(actor)].field.vanguard[0]),
    buildOperations: (state, actor, source) => [modifier(source, state.players[opponentOf(actor)].field.vanguard[0], "power", -1000, "anti-tank")],
  },
  {
    cardNo: "BP01-061", effectId: "shadowing-panther", label: "如影随形·基地支付替换", activation: "response", sourceZones: ["hand"], ruleRefs: ["301.14", "301.23", "301.32", "304.2"],
    canActivate: (state, actor, source) => state.players[actor].baseCards.length + state.players[actor].baseCovered.length >= 2 && battleRoles(state, actor).some((id) => effectiveValueV2(state, id, "level") >= 4 && state.cards[id]?.attribute === 3 && state.cards[id]?.name !== state.cards[source]?.name),
    targeting: (state, actor, source) => ({ choices: [...state.players[actor].baseCards, ...state.players[actor].baseCovered, ...battleRoles(state, actor).filter((id) => effectiveValueV2(state, id, "level") >= 4 && state.cards[id]?.attribute === 3 && state.cards[id]?.name !== state.cards[source]?.name)], min: 3, max: 3, prompt: "选择基地 2 张卡撤退，并选择战区 1 张 Lv4 或以上不同名蓝色角色与此卡互换", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, source, selected) => selected.filter((id) => state.players[actor].baseCards.includes(id) || state.players[actor].baseCovered.includes(id)).length === 2 && selected.filter((id) => battleRoles(state, actor).includes(id) && effectiveValueV2(state, id, "level") >= 4 && state.cards[id]?.attribute === 3 && state.cards[id]?.name !== state.cards[source]?.name).length === 1 ? null : "必须选择 2 张基地卡和 1 张合法蓝色角色",
    buildOperations: (state, actor, source, selected) => { const costs = selected.filter((id) => state.players[actor].baseCards.includes(id) || state.players[actor].baseCovered.includes(id)); const target = selected.find((id) => battleRoles(state, actor).includes(id))!; return [{ kind: "RETREAT", cardIds: costs, sourceCardId: source }, { kind: "SWAP_POSITIONS", cardIds: [source, target], sourceCardId: source, requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-062", effectId: "free-will-captain", label: "自由意志·战基移动增幅", activation: "response", usage: "turn_once", sourceZones: ["field", "base"], ruleRefs: ["301.23", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "free-will-captain")) && battleBaseMoveChoices(state, actor, source).length > 0,
    targeting: (state, actor, source) => { const fromBase = state.players[actor].baseCards.includes(source); const rolesAfter = fromBase ? [...battleRoles(state, actor), source] : battleRoles(state, actor).filter((id) => id !== source); return { choices: [...battleBaseMoveChoices(state, actor, source), ...rolesAfter], min: 2, max: 2, prompt: "选择此卡战基移动的目的地，并选择移动后战区 1 张角色本回合战力 +1000", choiceKind: "mixed" as const }; },
    validateTargets: (state, actor, source, selected) => { const destinations = selected.filter((id) => battleBaseMoveChoices(state, actor, source).includes(id)); const fromBase = state.players[actor].baseCards.includes(source); const rolesAfter = fromBase ? [...battleRoles(state, actor), source] : battleRoles(state, actor).filter((id) => id !== source); return destinations.length === 1 && selected.filter((id) => rolesAfter.includes(id)).length === 1 ? null : "必须选择合法移动目的地和移动后战区角色各 1"; },
    buildOperations: (state, actor, source, selected) => { const destination = selected.find((id) => id.startsWith("zone:"))!.slice(5) as FieldZoneV2 | "base"; const target = selected.find((id) => !id.startsWith("zone:"))!; return [{ kind: "MOVE_BATTLE_BASE", cardId: source, destination }, { kind: "MARK_EFFECT_USED", key: useKey(source, "free-will-captain"), requiresPreviousSuccess: true }, { ...modifier(source, target, "power", 1000, "free-will"), requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-063", effectId: "time-abduction-loki", label: "时间诱拐·减力裁剪", trigger: "CARD_VALUE_CHANGED", sourceZones: ["hand"], optional: true, ruleRefs: ["301.15", "301.32", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "CARD_VALUE_CHANGED"); return Boolean(event?.valueType === "power" && event.delta < 0 && cardControllerV2(state, event.targetCardId) === actor && battleRoles(state, actor).includes(event.targetCardId)); },
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "power") <= 3500),
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "power") <= 3500), min: 1, max: 1, prompt: "裁剪手牌的洛基，并选择敌方战区 1 张战力 3500 或以下角色裁剪" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "BANISH", cardIds: [source], sourceCardId: source }, { kind: "BANISH", cardIds: [selected[0]], sourceCardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-065", effectId: "supply-loading-falcon", label: "物资装填·战败补给", trigger: "CHARACTER_BATTLE_RESOLVED", sourceZones: ["retreat"], ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_BATTLE_RESOLVED")?.defeatedCardIds.includes(source) ?? false,
    condition: (state, actor) => state.players[actor].deck.length > 0 && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6,
    buildOperations: (state, actor, source) => state.players[actor].deck.slice(0, 2).map((cardId, index) => ({ kind: "MOVE_TO_BASE" as const, cardId, face: "down" as const, sourceCardId: source, ...(index > 0 ? { requiresPreviousSuccess: true } : {}) })),
  },
  {
    cardNo: "BP01-066", effectId: "turn-the-tide-captain", label: "力挽狂澜·败退返场", trigger: "CARDS_RETREATED", sourceZones: ["hand"], optional: true, ruleRefs: ["301.12", "301.15", "301.32", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "CARDS_RETREATED"); if (!event || !["battle", "effect"].includes(event.reason)) return false; if (event.reason === "effect" && (!event.sourceCardId || state.cards[event.sourceCardId]?.owner === actor)) return false; return (event.fromFieldCardIds ?? event.cardIds).some((id) => event.cardIds.includes(id) && state.cards[id]?.owner === actor && effectiveValueV2(state, id, "level") <= 4 && state.cards[id]?.features.some((feature) => feature.includes("人类"))); },
    condition: (state, actor, _source, context) => { const event = eventOf(context, "CARDS_RETREATED")!; return event.cardIds.some((id) => state.players[actor].retreat.includes(id) && state.cards[id]?.owner === actor && effectiveValueV2(state, id, "level") <= 4 && state.cards[id]?.features.some((feature) => feature.includes("人类"))) && boardPlacementChoices(state, actor).length > 0; },
    targeting: (state, actor, _source, context) => { const event = eventOf(context, "CARDS_RETREATED")!; return { choices: [...event.cardIds.filter((id) => state.players[actor].retreat.includes(id) && effectiveValueV2(state, id, "level") <= 4 && state.cards[id]?.features.some((feature) => feature.includes("人类"))), ...boardPlacementChoices(state, actor)], min: 2, max: 2, prompt: "裁剪手牌的美国队长，选择本次败退的人类角色及其返场位置", choiceKind: "mixed" as const }; },
    validateTargets: (state, actor, _source, selected, context) => { const event = eventOf(context, "CARDS_RETREATED")!; return selected.filter((id) => event.cardIds.includes(id) && state.players[actor].retreat.includes(id) && effectiveValueV2(state, id, "level") <= 4 && state.cards[id]?.features.some((feature) => feature.includes("人类"))).length === 1 && selected.filter((id) => boardPlacementChoices(state, actor).includes(id)).length === 1 ? null : "必须选择本次合法败退角色和一个可放置位置"; },
    buildOperations: (state, actor, source, selected) => { const target = selected.find((id) => state.players[actor].retreat.includes(id))!; const location = selected.find((id) => id.startsWith("zone:"))!; return [{ kind: "BANISH", cardIds: [source], sourceCardId: source }, { ...boardPlacementOperation(target, source, location), requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-067", effectId: "hostility-focus-winter-soldier", label: "敌意焦点·变更攻击目标", trigger: "ATTACK_DECLARED", sourceZones: ["field", "base"], optional: true, usage: "turn_once", ruleRefs: ["301.32", "304.1"],
    eventFilter: (_state, actor, _source, context) => eventOf(context, "ATTACK_DECLARED")?.actor === opponentOf(actor),
    condition: (state, _actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "hostility-focus-winter-soldier")) && alternateAttackTargets(state).length > 0,
    targeting: (state) => ({ choices: alternateAttackTargets(state).map(attackTargetChoice), min: 1, max: 1, prompt: "选择另一个符合当前攻击规则的角色或破绽作为攻击目标", choiceKind: "mixed" as const }),
    validateTargets: (state, _actor, _source, selected) => selected.length === 1 && alternateAttackTargets(state).map(attackTargetChoice).includes(selected[0]) ? null : "必须选择另一个合法攻击目标",
    buildOperations: (_state, _actor, source, selected) => [{ kind: "REDIRECT_ATTACK_TARGET", target: parseAttackTargetChoice(selected[0]), sourceCardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "hostility-focus-winter-soldier"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-068", effectId: "wakanda-forever-panther", label: "瓦坎达万岁·人类同退", trigger: "CHARACTER_BATTLE_RESOLVED", sourceZones: ["retreat"], ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (state, _actor, source, context) => { const event = eventOf(context, "CHARACTER_BATTLE_RESOLVED"); return Boolean(event?.defeatedCardIds.includes(source) && event.winnerCardId && state.cards[event.winnerCardId]?.features.some((feature) => feature.includes("人类"))); },
    buildOperations: (_state, _actor, source, _selected, context) => [{ kind: "RETREAT", cardIds: [eventOf(context, "CHARACTER_BATTLE_RESOLVED")!.winnerCardId!], sourceCardId: source }],
  },
  {
    cardNo: "BP01-069", effectId: "fantastic-call-torch", label: "神奇呼唤·升阶替换", activation: "action", usage: "turn_once", sourceZones: ["field", "base"], ruleRefs: ["301.13", "301.23", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "fantastic-call-torch")) && battleRoles(state, actor).some((target) => target !== source && state.players[actor].hand.some((hand) => effectiveValueV2(state, hand, "level") === effectiveValueV2(state, target, "level") + 1)),
    targeting: (state, actor, source) => ({ choices: [...state.players[actor].hand.filter((hand) => battleRoles(state, actor).some((target) => target !== source && effectiveValueV2(state, hand, "level") === effectiveValueV2(state, target, "level") + 1)), ...battleRoles(state, actor).filter((id) => id !== source)], min: 2, max: 2, prompt: "选择手牌 1 张恰好高 1 Lv 的角色与我方战区另一张角色互相替换", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, source, selected) => { const hand = selected.find((id) => state.players[actor].hand.includes(id)); const target = selected.find((id) => battleRoles(state, actor).includes(id) && id !== source); return hand && target && effectiveValueV2(state, hand, "level") === effectiveValueV2(state, target, "level") + 1 ? null : "手牌角色必须恰好比所选战区角色高 1 Lv"; },
    buildOperations: (state, actor, source, selected) => { const hand = selected.find((id) => state.players[actor].hand.includes(id))!; const target = selected.find((id) => battleRoles(state, actor).includes(id) && id !== source)!; return [{ kind: "SWAP_POSITIONS", cardIds: [hand, target], sourceCardId: source }, { kind: "DRAW", actor, count: 1, sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MOVE_TO_DECK_BOTTOM", cardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "fantastic-call-torch"), requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-070", effectId: "time-guidance-loki", label: "时间引导·蓝色入场盖放", trigger: "CHARACTER_PLACED", sourceZones: ["field", "base"], optional: true, usage: "turn_once", ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "CHARACTER_PLACED"); return Boolean(event?.actor === actor && state.cards[event.cardId]?.attribute === 3); },
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "time-guidance-loki")) && state.players[actor].deck.length > 0 && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6,
    buildOperations: (state, actor, source) => [{ kind: "MOVE_TO_BASE", cardId: state.players[actor].deck[0], face: "down", sourceCardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "time-guidance-loki"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-072", effectId: "protective-field-invisible-woman", label: "防护力场·破绽防御", trigger: "ATTACK_DECLARED", sourceZones: ["hand"], optional: true, ruleRefs: ["301.13", "301.15", "301.32", "301.41", "304.1"],
    eventFilter: (_state, actor, _source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return Boolean(event && event.actor === opponentOf(actor) && event.target.kind === "breach"); },
    condition: (state, actor) => state.players[actor].retreat.some((id) => !state.cards[id]?.name.includes("隐形女")) && battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].retreat.filter((id) => !state.cards[id]?.name.includes("隐形女")), ...battleRoles(state, opponentOf(actor))], min: 2, max: 2, prompt: "裁剪手牌的隐形女，选择撤退区非隐形女角色移回卡组底，并选择敌方战区角色本回合 R-2", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].retreat.includes(id) && !state.cards[id]?.name.includes("隐形女")).length === 1 && selected.filter((id) => battleRoles(state, opponentOf(actor)).includes(id)).length === 1 ? null : "必须选择合法撤退区角色和敌方战区角色各 1",
    buildOperations: (state, actor, source, selected) => { const retreat = selected.find((id) => state.players[actor].retreat.includes(id))!; const target = selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id))!; return [{ kind: "BANISH", cardIds: [source], sourceCardId: source }, { kind: "MOVE_TO_DECK_BOTTOM", cardId: retreat, requiresPreviousSuccess: true }, { ...modifier(source, target, "range", -2, "protective-field"), requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-073", effectId: "fantastic-infusion-torch", label: "神奇灌注·回底增幅", trigger: "CARD_MOVED_TO_DECK_BOTTOM", sourceZones: ["field", "base"], usage: "turn_once", ruleRefs: ["301.32", "301.41", "304.1"],
    eventFilter: (_state, actor, _source, context) => eventOf(context, "CARD_MOVED_TO_DECK_BOTTOM")?.actor === actor,
    condition: (state, _actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "fantastic-infusion-torch")),
    buildOperations: (state, actor, source) => [{ ...modifier(source, source, "range", 1, "fantastic-infusion-range") }, { ...modifier(source, source, "power", faceUpCards(state, actor).filter((id) => state.cards[id]?.features.some((feature) => feature.includes("神奇四侠"))).length * 1000, "fantastic-infusion-power"), requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "fantastic-infusion-torch"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-074", effectId: "wisdom-curse-mister-fantastic", label: "智慧诅咒·四手分歧", activation: "response", usage: "turn_once", sourceZones: ["field"], ruleRefs: ["301.12", "301.13", "301.32", "304.2"],
    canActivate: (state, actor, source) => state.players[actor].field.rear.includes(source) && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "wisdom-curse-mister-fantastic")) && (state.players[actor].hand.length === 4 ? state.players[actor].hand.some((id) => effectiveValueV2(state, id, "level") === 4) && boardPlacementChoices(state, actor).length > 0 : state.players[actor].retreat.length > 0),
    targeting: (state, actor) => state.players[actor].hand.length === 4
      ? { choices: [...state.players[actor].hand.filter((id) => effectiveValueV2(state, id, "level") === 4), ...boardPlacementChoices(state, actor)], min: 2, max: 2, prompt: "选择手牌 1 张 Lv4 角色及其放置位置", choiceKind: "mixed" as const }
      : { choices: [...state.players[actor].retreat], min: 1, max: 1, prompt: "选择撤退区 1 张角色移回卡组底" },
    validateTargets: (state, actor, _source, selected) => state.players[actor].hand.length === 4
      ? selected.filter((id) => state.players[actor].hand.includes(id) && effectiveValueV2(state, id, "level") === 4).length === 1 && selected.filter((id) => boardPlacementChoices(state, actor).includes(id)).length === 1 ? null : "必须选择 Lv4 手牌角色和合法位置各 1"
      : selected.length === 1 && state.players[actor].retreat.includes(selected[0]) ? null : "必须选择撤退区 1 张角色",
    buildOperations: (state, actor, source, selected) => { const branch = state.players[actor].hand.length === 4; const operations: AtomicOperationV2[] = branch ? [boardPlacementOperation(selected.find((id) => state.players[actor].hand.includes(id))!, source, selected.find((id) => id.startsWith("zone:"))!)] : [{ kind: "MOVE_TO_DECK_BOTTOM", cardId: selected[0] }]; return [...operations, { kind: "MARK_EFFECT_USED", key: useKey(source, "wisdom-curse-mister-fantastic"), requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-077", effectId: "i-need-you-captain", label: "我需要你·抽牌盖放", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[actor].deck.length > 0,
    buildOperations: (state, actor, source) => [{ kind: "DRAW", actor, count: 1, sourceCardId: source }, ...(state.players[actor].deck.length >= 2 && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6 ? [{ kind: "MOVE_TO_BASE" as const, cardId: state.players[actor].deck[1], face: "down" as const, sourceCardId: source, requiresPreviousSuccess: true }] : [])],
  },
  {
    cardNo: "BP01-078", effectId: "desperate-airdrop-falcon", label: "殊死空投·卡组顶判定", trigger: "CHARACTER_BATTLE_RESOLVED", sourceZones: ["retreat"], optional: true, ruleRefs: ["301.12", "301.13", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_BATTLE_RESOLVED")?.defeatedCardIds.includes(source) ?? false,
    condition: (state, actor) => state.players[actor].deck.length > 0,
    buildOperations: (state, actor, source) => { const top = state.players[actor].deck[0]; const success = effectiveValueV2(state, top, "level") === 4 && state.cards[top]?.attribute === 3 && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6; return [{ kind: "REVEAL", cardIds: [top], sourceCardId: source }, success ? { kind: "MOVE_TO_BASE", cardId: top, face: "up", sourceCardId: source, requiresPreviousSuccess: true } : { kind: "DISCARD", cardIds: [top], requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-080", effectId: "self-sacrifice-captain", label: "杀身成仁·低阶反击", trigger: "ATTACK_DECLARED", sourceZones: ["hand"], optional: true, ruleRefs: ["301.15", "301.32", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); if (!event || event.actor !== opponentOf(actor) || effectiveValueV2(state, event.attackerId, "level") !== 3) return false; const own = battleRoles(state, actor).reduce((sum, id) => sum + effectiveValueV2(state, id, "level"), 0); const enemy = battleRoles(state, opponentOf(actor)).reduce((sum, id) => sum + effectiveValueV2(state, id, "level"), 0); return own < enemy; },
    buildOperations: (_state, _actor, source, _selected, context) => [{ kind: "BANISH", cardIds: [source], sourceCardId: source }, { kind: "RETREAT", cardIds: [eventOf(context, "ATTACK_DECLARED")!.attackerId], sourceCardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-081", effectId: "quantum-entanglement-ant-man", label: "量子纠缠·攻击者结附", trigger: "ATTACK_DECLARED", sourceZones: ["hand"], optional: true, ruleRefs: ["301.25", "301.32", "301.41", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return Boolean(event && event.actor === opponentOf(actor) && event.target.kind === "character" && state.cards[event.target.cardId]?.owner === actor && state.cards[event.target.cardId]?.attribute === 3); },
    buildOperations: (_state, _actor, source, _selected, context) => [{ kind: "ATTACH", cardId: source, hostCardId: eventOf(context, "ATTACK_DECLARED")!.attackerId, sourceCardId: source }],
  },
  {
    cardNo: "BP01-085", effectId: "void-exile-witch-banish", label: "虚空放逐·裁剪撤退角色", trigger: "END_TRIGGERS_PROCESSED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.15", "301.23", "301.32", "304.1"],
    eventFilter: (_state, actor, _source, context) => eventOf(context, "END_TRIGGERS_PROCESSED")?.actor === actor,
    condition: (state, actor) => state.players[actor].retreat.some((id) => state.cards[id]?.deckKind === "main") && faceUpRoles(state, actor).some((id) => battleBaseMoveChoices(state, actor, id).length > 0),
    targeting: (state, actor) => ({ choices: state.players[actor].retreat.filter((id) => state.cards[id]?.deckKind === "main"), min: 1, max: 1, prompt: "打开撤退区，选择我方 1 张角色裁剪" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }],
  },
  {
    cardNo: "BP01-085", effectId: "void-exile-witch-move", label: "虚空放逐·战基移动", trigger: "CARDS_BANISHED", sourceZones: ["field", "base"], ruleRefs: ["301.23", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_BANISHED")?.sourceCardId === source,
    condition: (state, actor) => faceUpRoles(state, actor).some((id) => battleBaseMoveChoices(state, actor, id).length > 0),
    targeting: (state, actor) => { const movable = faceUpRoles(state, actor).filter((id) => battleBaseMoveChoices(state, actor, id).length > 0); return { choices: [...movable, ...movable.flatMap((id) => battleBaseMoveChoices(state, actor, id))], min: 2, max: 2, prompt: "选择我方 1 张可移动角色及其合法战基移动目的地", choiceKind: "mixed" as const }; },
    validateTargets: (state, actor, _source, selected) => { const card = selected.find((id) => faceUpRoles(state, actor).includes(id)); const destination = selected.find((id) => id.startsWith("zone:")); return card && destination && battleBaseMoveChoices(state, actor, card).includes(destination) ? null : "必须选择可移动角色及其对应合法目的地"; },
    buildOperations: (_state, _actor, _source, selected) => [{ kind: "MOVE_BATTLE_BASE", cardId: selected.find((id) => !id.startsWith("zone:"))!, destination: selected.find((id) => id.startsWith("zone:"))!.slice(5) as FieldZoneV2 | "base" }],
  },
  {
    cardNo: "BP01-087", effectId: "flash-arrow-hawkeye", label: "闪光箭·复仇者支付压制", activation: "response", usage: "turn_once", sourceZones: ["field"], ruleRefs: ["301.13", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "flash-arrow-hawkeye")) && state.players[actor].hand.some((id) => state.cards[id]?.features.some((feature) => feature.includes("复仇者联盟"))) && battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand.filter((id) => state.cards[id]?.features.some((feature) => feature.includes("复仇者联盟"))), ...battleRoles(state, opponentOf(actor))], min: 2, max: 2, prompt: "选择 1 张复仇者联盟手牌舍弃，并选择敌方战区 1 张角色本回合战力 -1000", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].hand.includes(id) && state.cards[id]?.features.some((feature) => feature.includes("复仇者联盟"))).length === 1 && selected.filter((id) => battleRoles(state, opponentOf(actor)).includes(id)).length === 1 ? null : "必须选择合法复仇者联盟手牌与敌方角色各 1",
    buildOperations: (state, actor, source, selected) => { const cost = selected.find((id) => state.players[actor].hand.includes(id))!; const target = selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id))!; return [{ kind: "DISCARD", cardIds: [cost] }, { ...modifier(source, target, "power", -1000, "flash-arrow"), requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "flash-arrow-hawkeye"), requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-090", effectId: "freedom-judgment-captain", label: "自由裁决·跳过战斗压制", activation: "action", sourceZones: ["hand"], ruleRefs: ["301.15", "301.32", "301.41", "304.2"],
    canActivate: (state, actor) => battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "裁剪手牌的美国队长，选择敌方战区 1 张角色失去我方战区角色战力合计数" }),
    buildOperations: (state, actor, source, selected) => { const total = battleRoles(state, actor).reduce((sum, id) => sum + effectiveValueV2(state, id, "power"), 0); return [{ kind: "BANISH", cardIds: [source], sourceCardId: source }, { kind: "SKIP_BATTLE_PHASE", actor, sourceCardId: source, requiresPreviousSuccess: true }, { ...modifier(source, selected[0], "power", -total, "freedom-judgment"), requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-091", effectId: "hacker-arrow-hawkeye", label: "黑客箭·基地盖卡撤退", trigger: "CARDS_PLACED_IN_BASE", sourceZones: ["field", "base"], optional: true, usage: "turn_once", ruleRefs: ["301.13", "301.32", "304.1"],
    eventFilter: (_state, actor, _source, context) => eventOf(context, "CARDS_PLACED_IN_BASE")?.actor === opponentOf(actor),
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "hacker-arrow-hawkeye")) && faceUpRoles(state, actor).every((id) => state.cards[id]?.attribute === 4) && state.players[actor].hand.length > 0 && state.players[opponentOf(actor)].baseCovered.length >= 2,
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand, ...state.players[opponentOf(actor)].baseCovered], min: 3, max: 3, prompt: "选择我方 1 张手牌舍弃，并选择敌方基地 2 张盖卡撤退", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].hand.includes(id)).length === 1 && selected.filter((id) => state.players[opponentOf(actor)].baseCovered.includes(id)).length === 2 ? null : "必须选择 1 张手牌和敌方 2 张基地盖卡",
    buildOperations: (state, actor, source, selected) => [{ kind: "DISCARD", cardIds: [selected.find((id) => state.players[actor].hand.includes(id))!] }, { kind: "RETREAT", cardIds: selected.filter((id) => state.players[opponentOf(actor)].baseCovered.includes(id)), sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "hacker-arrow-hawkeye"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-092", effectId: "quantum-superposition-banish", label: "量子叠加·自身裁剪", trigger: "CARDS_RETREATED", sourceZones: ["retreat"], ruleRefs: ["301.15", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => { const event = eventOf(context, "CARDS_RETREATED"); return Boolean(event?.cardIds.includes(source) && event.fromFieldCardIds?.includes(source)); },
    buildOperations: (_state, _actor, source) => [{ kind: "BANISH", cardIds: [source], sourceCardId: source }],
  },
  {
    cardNo: "BP01-092", effectId: "quantum-superposition-place", label: "量子叠加·复仇者入基地", trigger: "CARDS_BANISHED", sourceZones: ["void"], optional: true, ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_BANISHED")?.sourceCardId === source,
    condition: (state, actor) => state.players[actor].baseCards.length + state.players[actor].baseCovered.length >= 4 && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6 && state.players[actor].hand.some((id) => state.cards[id]?.features.some((feature) => feature.includes("复仇者联盟"))),
    targeting: (state, actor) => ({ choices: state.players[actor].hand.filter((id) => state.cards[id]?.features.some((feature) => feature.includes("复仇者联盟"))), min: 1, max: 1, prompt: "选择手牌 1 张复仇者联盟角色放置进我方基地" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "MOVE_TO_BASE", cardId: selected[0], face: "up", sourceCardId: source }],
  },
  {
    cardNo: "BP01-093", effectId: "thunder-confidant-mighty-thor", label: "雷霆知音·侧翼战力承接", trigger: "ATTACK_DECLARED", sourceZones: ["field"], ruleRefs: ["301.32", "301.41", "304.1"],
    eventFilter: (state, actor, source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return Boolean(event?.actor === actor && event.attackerId === source && (state.players[actor].field.flankLeft.includes(source) || state.players[actor].field.flankRight.includes(source))); },
    condition: (state, actor, source) => battleRoles(state, actor).some((id) => id !== source && (state.players[actor].field.flankLeft.includes(id) || state.players[actor].field.flankRight.includes(id)) && effectiveValueV2(state, id, "power") <= 4000 && !(state.usage.attackedCardIdsByPlayer[actor] ?? []).includes(id)),
    targeting: (state, actor, source) => ({ choices: battleRoles(state, actor).filter((id) => id !== source && (state.players[actor].field.flankLeft.includes(id) || state.players[actor].field.flankRight.includes(id)) && effectiveValueV2(state, id, "power") <= 4000 && !(state.usage.attackedCardIdsByPlayer[actor] ?? []).includes(id)), min: 1, max: 1, prompt: "选择另一侧翼未攻击且战力 4000 或以下角色，获得其战力并令其本回合不能攻击" }),
    buildOperations: (state, _actor, source, selected) => [modifier(source, source, "power", effectiveValueV2(state, selected[0], "power"), "thunder-confidant-mighty"), { kind: "FORBID_ATTACK", cardId: selected[0], sourceCardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-094", effectId: "god-of-stories-loki", label: "故事之神·未攻击清场", trigger: "END_TRIGGERS_PROCESSED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, _source, context) => eventOf(context, "END_TRIGGERS_PROCESSED")?.actor === actor,
    condition: (state, actor) => { const x = battleRoles(state, actor).filter((id) => !(state.usage.attackedCardIdsByPlayer[actor] ?? []).includes(id)).length; const enemy = opponentOf(actor); return x > 0 && (faceUpRoles(state, enemy).some((id) => effectiveValueV2(state, id, "level") === x) || state.players[enemy].baseCovered.length >= x); },
    targeting: (state, actor) => { const x = battleRoles(state, actor).filter((id) => !(state.usage.attackedCardIdsByPlayer[actor] ?? []).includes(id)).length; const enemy = opponentOf(actor); return { choices: [...faceUpRoles(state, enemy).filter((id) => effectiveValueV2(state, id, "level") === x), ...state.players[enemy].baseCovered], min: 1, max: x, prompt: `选择敌方场上 1 张 Lv${x} 角色，或敌方基地 ${x} 张盖卡撤退`, choiceKind: "mixed" as const }; },
    validateTargets: (state, actor, _source, selected) => { const x = battleRoles(state, actor).filter((id) => !(state.usage.attackedCardIdsByPlayer[actor] ?? []).includes(id)).length; const enemy = opponentOf(actor); const role = selected.length === 1 && faceUpRoles(state, enemy).includes(selected[0]) && effectiveValueV2(state, selected[0], "level") === x; const covers = selected.length === x && selected.every((id) => state.players[enemy].baseCovered.includes(id)); return role || covers ? null : `必须选择 1 张 Lv${x} 角色或 ${x} 张基地盖卡`; },
    buildOperations: (_state, _actor, source, selected) => [{ kind: "RETREAT", cardIds: [...selected], sourceCardId: source }],
  },
  {
    cardNo: "BP01-095", effectId: "sacrifice-for-justice-captain", label: "舍身取义·低阶移入基地", trigger: "CARDS_DISCARDED", sourceZones: ["retreat"], optional: true, ruleRefs: ["301.12", "301.15", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_DISCARDED")?.cardIds.includes(source) ?? false,
    condition: (state, actor) => state.players[opponentOf(actor)].baseCards.length + state.players[opponentOf(actor)].baseCovered.length < 6 && battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") <= 3),
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 3), min: 1, max: 1, prompt: "裁剪撤退区的美国队长，并选择敌方战区 1 张 Lv3 或以下角色移至其基地" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "BANISH", cardIds: [source], sourceCardId: source }, { kind: "MOVE_TO_BASE", cardId: selected[0], face: "up", sourceCardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-096", effectId: "body-as-shield-captain", label: "我身作盾·美国队长替换", activation: "response", usage: "turn_once", sourceZones: ["field", "base"], ruleRefs: ["301.13", "301.23", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "body-as-shield-captain")) && state.players[actor].hand.length > 0 && battleRoles(state, actor).some((id) => id !== source && state.cards[id]?.name.includes("美国队长")),
    targeting: (state, actor, source) => ({ choices: [...state.players[actor].hand, ...battleRoles(state, actor).filter((id) => id !== source && state.cards[id]?.name.includes("美国队长"))], min: 2, max: 2, prompt: "选择 1 张手牌舍弃，并选择战区另一张美国队长与此卡互相替换", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, source, selected) => selected.filter((id) => state.players[actor].hand.includes(id)).length === 1 && selected.filter((id) => battleRoles(state, actor).includes(id) && id !== source && state.cards[id]?.name.includes("美国队长")).length === 1 ? null : "必须选择 1 张手牌和另一张美国队长",
    buildOperations: (state, actor, source, selected) => { const cost = selected.find((id) => state.players[actor].hand.includes(id))!; const captain = selected.find((id) => battleRoles(state, actor).includes(id))!; const zone = fieldZones.find((candidate) => state.players[actor].field[candidate].includes(captain))!; return [{ kind: "DISCARD", cardIds: [cost] }, { kind: "MOVE_TO_BASE", cardId: captain, face: "up", sourceCardId: source, requiresPreviousSuccess: true }, { kind: "PLACE_FIELD", cardId: source, destination: zone, sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "body-as-shield-captain"), requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-098", effectId: "chaos-vision-witch", label: "混沌灵视·攻击限制结附", trigger: "CARDS_DISCARDED", sourceZones: ["retreat"], optional: true, ruleRefs: ["301.12", "301.25", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_DISCARDED")?.cardIds.includes(source) ?? false,
    condition: (state, actor) => faceUpRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: faceUpRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "选择敌方场上 1 张角色，把此卡结附并撤退该角色其他所有结附卡" }),
    buildOperations: (state, _actor, source, selected) => [{ kind: "ATTACH", cardId: source, hostCardId: selected[0], sourceCardId: source }, ...((state.attachments[selected[0]] ?? []).length > 0 ? [{ kind: "RETREAT" as const, cardIds: [...state.attachments[selected[0]]], sourceCardId: source, requiresPreviousSuccess: true }] : [])],
  },
  {
    cardNo: "BP01-099", effectId: "pym-arrow-hawkeye", label: "皮姆箭·高阶入场裁剪", trigger: "CHARACTER_PLACED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.13", "301.15", "301.32", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "CHARACTER_PLACED"); return Boolean(event?.actor === opponentOf(actor) && effectiveValueV2(state, event.cardId, "level") >= 4); },
    condition: (state, actor) => state.players[actor].hand.length >= 2 && faceUpRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand, ...faceUpRoles(state, opponentOf(actor))], min: 3, max: 3, prompt: "选择我方 2 张手牌舍弃，并选择敌方场上 1 张角色与皮姆箭一同裁剪", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].hand.includes(id)).length === 2 && selected.filter((id) => faceUpRoles(state, opponentOf(actor)).includes(id)).length === 1 ? null : "必须选择 2 张手牌和敌方场上 1 张角色",
    buildOperations: (state, actor, source, selected) => [{ kind: "DISCARD", cardIds: selected.filter((id) => state.players[actor].hand.includes(id)) }, { kind: "BANISH", cardIds: [source, selected.find((id) => faceUpRoles(state, opponentOf(actor)).includes(id))!], sourceCardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-100", effectId: "sound-disarm-daredevil", label: "听声缴械·入场减 R", trigger: "CHARACTER_PLACED", sourceZones: ["field", "base"], ruleRefs: ["301.32", "301.41", "304.1", "305.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_PLACED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => faceUpRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: faceUpRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "选择敌方场上 1 张角色，本回合 R-1" }),
    buildOperations: (_state, _actor, source, selected) => [modifier(source, selected[0], "range", -1, "sound-disarm")],
  },
  {
    cardNo: "BP01-101", effectId: "split-arrow-retreat-base", label: "分导箭·撤退基地费用", trigger: "ATTACK_DECLARED", sourceZones: ["field", "base"], optional: true, usage: "turn_once", ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, _source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return Boolean(event && event.actor === opponentOf(actor) && event.target.kind === "breach"); },
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "split-arrow-retreat-base")) && state.players[actor].baseCards.length + state.players[actor].baseCovered.length > 0,
    targeting: (state, actor) => { const choices = [...state.players[actor].baseCards, ...state.players[actor].baseCovered]; return { choices, min: 1, max: Math.min(3, choices.length), prompt: "选择我方基地最多 3 张卡撤退，以撤退数量作为 X" }; },
    buildOperations: (_state, _actor, source, selected) => [{ kind: "RETREAT", cardIds: [...selected], sourceCardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "split-arrow-retreat-base"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-101", effectId: "split-arrow-place", label: "分导箭·原本等级入场", trigger: "CARDS_RETREATED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => { const event = eventOf(context, "CARDS_RETREATED"); return event?.reason === "effect" && event.sourceCardId === source && event.cardIds.length >= 1 && event.cardIds.length <= 3; },
    condition: (state, actor, _source, context) => { const x = eventOf(context, "CARDS_RETREATED")!.cardIds.length; return state.players[actor].hand.some((id) => state.cards[id]?.level === x) && openFieldZones(state, actor).length > 0; },
    targeting: (state, actor, _source, context) => { const x = eventOf(context, "CARDS_RETREATED")!.cardIds.length; return { choices: [...state.players[actor].hand.filter((id) => state.cards[id]?.level === x), ...openFieldZones(state, actor).map(zoneChoice)], min: 2, max: 2, prompt: `选择手牌 1 张原本 Lv${x} 角色及其战区放置位置`, choiceKind: "mixed" as const }; },
    validateTargets: (state, actor, _source, selected, context) => { const x = eventOf(context, "CARDS_RETREATED")!.cardIds.length; return selected.filter((id) => state.players[actor].hand.includes(id) && state.cards[id]?.level === x).length === 1 && selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id))).length === 1 ? null : "必须选择原本等级等于 X 的手牌角色和空战区"; },
    buildOperations: (state, actor, source, selected) => [{ kind: "PLACE_FIELD", cardId: selected.find((id) => state.players[actor].hand.includes(id))!, destination: parseZone(selected.find((id) => id.startsWith("zone:"))!), sourceCardId: source }],
  },
  {
    cardNo: "BP01-102", effectId: "quantum-collapse-self", label: "量子坍塌·自身裁剪", trigger: "CARDS_RETREATED", sourceZones: ["retreat"], ruleRefs: ["301.15", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => { const event = eventOf(context, "CARDS_RETREATED"); return Boolean(event?.cardIds.includes(source) && event.fromFieldCardIds?.includes(source)); },
    buildOperations: (_state, _actor, source) => [{ kind: "BANISH", cardIds: [source], sourceCardId: source }],
  },
  {
    cardNo: "BP01-102", effectId: "quantum-collapse-enemy-base", label: "量子坍塌·低阶基地裁剪", trigger: "CARDS_BANISHED", sourceZones: ["void"], ruleRefs: ["301.15", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_BANISHED")?.sourceCardId === source,
    condition: (state, actor) => state.players[opponentOf(actor)].baseCards.some((id) => effectiveValueV2(state, id, "level") <= 3),
    targeting: (state, actor) => ({ choices: state.players[opponentOf(actor)].baseCards.filter((id) => effectiveValueV2(state, id, "level") <= 3), min: 1, max: 1, prompt: "选择敌方基地 1 张 Lv3 或以下角色裁剪" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }],
  },
  {
    cardNo: "BP01-103", effectId: "tactical-intimidation-winter-soldier", label: "战术恐吓·先锋后移", trigger: "BATTLE_BASE_MOVED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.23", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "BATTLE_BASE_MOVED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => Boolean(state.players[opponentOf(actor)].field.vanguard[0] && !state.players[opponentOf(actor)].field.rear[0]),
    buildOperations: (state, actor, source) => [{ kind: "MOVE_FIELD", cardId: state.players[opponentOf(actor)].field.vanguard[0], destination: "rear", sourceCardId: source }],
  },
  {
    cardNo: "BP01-104", effectId: "rewind-witch-pair", label: "时光倒流·同等级回顶", trigger: "CARDS_DISCARDED", sourceZones: ["retreat"], optional: true, ruleRefs: ["301.13", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_DISCARDED")?.cardIds.includes(source) ?? false,
    condition: (state, actor) => battleRoles(state, actor).some((own) => battleRoles(state, opponentOf(actor)).some((enemy) => effectiveValueV2(state, own, "level") === effectiveValueV2(state, enemy, "level"))),
    targeting: (state, actor) => ({ choices: [...battleRoles(state, actor), ...battleRoles(state, opponentOf(actor))], min: 2, max: 2, prompt: "选择双方战区各 1 张 Lv 相同的角色移回各自卡组顶", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => { const own = selected.find((id) => battleRoles(state, actor).includes(id)); const enemy = selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id)); return own && enemy && effectiveValueV2(state, own, "level") === effectiveValueV2(state, enemy, "level") ? null : "必须选择双方各 1 张等级相同的战区角色"; },
    buildOperations: (state, actor, source, selected) => [{ kind: "MOVE_TO_DECK_TOP", cardId: selected.find((id) => battleRoles(state, actor).includes(id))!, sourceCardId: source }, { kind: "MOVE_TO_DECK_TOP", cardId: selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id))!, sourceCardId: source }],
  },
  {
    cardNo: "BP01-104", effectId: "rewind-witch-bottom", label: "时光倒流·撤退区回底", activation: "action", usage: "turn_once", sourceZones: ["field"], ruleRefs: ["301.13", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "rewind-witch-bottom")) && state.players[actor].retreat.length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].retreat], min: 1, max: 1, prompt: "选择我方撤退区 1 张角色移回卡组底" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "MOVE_TO_DECK_BOTTOM", cardId: selected[0] }, { kind: "MARK_EFFECT_USED", key: useKey(source, "rewind-witch-bottom"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-105", effectId: "mind-sync-panther", label: "精神同步·强敌增幅", trigger: "ATTACK_DECLARED", sourceZones: ["field", "base"], usage: "turn_once", ruleRefs: ["301.32", "301.41", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return Boolean(event?.actor === actor && event.target.kind === "character" && effectiveValueV2(state, event.target.cardId, "power") >= 5000); },
    condition: (state, _actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "mind-sync-panther")),
    buildOperations: (_state, _actor, source, _selected, context) => [{ ...modifier(source, eventOf(context, "ATTACK_DECLARED")!.attackerId, "power", 1000, "mind-sync") }, { kind: "MARK_EFFECT_USED", key: useKey(source, "mind-sync-panther"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-106", effectId: "search-comrade-falcon", label: "搜寻战友·绿色换二抽", trigger: "CHARACTER_SUMMONED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.13", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[actor].hand.some((id) => state.cards[id]?.attribute === 4) && state.players[actor].deck.length > 0,
    targeting: (state, actor) => ({ choices: state.players[actor].hand.filter((id) => state.cards[id]?.attribute === 4), min: 1, max: 1, prompt: "选择我方手牌 1 张绿色角色舍弃，然后抽 2 张卡" }),
    buildOperations: (_state, actor, source, selected) => [{ kind: "DISCARD", cardIds: [selected[0]] }, { kind: "DRAW", actor, count: 2, sourceCardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-107", effectId: "freedom-glory-cover", label: "自由威光·撤退后盖放", trigger: "CARDS_DISCARDED", sourceZones: ["retreat"], optional: true, ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_DISCARDED")?.cardIds.includes(source) ?? false,
    condition: (state, actor) => state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6,
    buildOperations: (_state, _actor, source) => [{ kind: "MOVE_TO_BASE", cardId: source, face: "down", sourceCardId: source }],
  },
  {
    cardNo: "BP01-108", effectId: "airbag-arrow-hawkeye", label: "安全气囊箭·复仇者换盖卡", activation: "action", usage: "turn_once", sourceZones: ["field", "base"], ruleRefs: ["301.13", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "airbag-arrow-hawkeye")) && state.players[actor].hand.some((id) => state.cards[id]?.features.some((feature) => feature.includes("复仇者联盟"))) && state.players[actor].deck.length > 0 && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6,
    targeting: (state, actor) => ({ choices: state.players[actor].hand.filter((id) => state.cards[id]?.features.some((feature) => feature.includes("复仇者联盟"))), min: 1, max: 1, prompt: "选择我方手牌 1 张复仇者联盟角色舍弃，把卡组顶最多 2 张卡盖放基地" }),
    buildOperations: (state, actor, source, selected) => { const count = Math.min(2, state.players[actor].deck.length, 6 - state.players[actor].baseCards.length - state.players[actor].baseCovered.length); return [{ kind: "DISCARD", cardIds: [selected[0]] }, ...state.players[actor].deck.slice(0, count).map((cardId) => ({ kind: "MOVE_TO_BASE" as const, cardId, face: "down" as const, sourceCardId: source, requiresPreviousSuccess: true })), { kind: "MARK_EFFECT_USED", key: useKey(source, "airbag-arrow-hawkeye"), requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-109", effectId: "sound-location-daredevil", label: "听声辨位·敌方盖放手牌", trigger: "CHARACTER_PLACED", sourceZones: ["field", "base"], targetingActor: "opponent", ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_PLACED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[opponentOf(actor)].hand.length > 0 && state.players[opponentOf(actor)].baseCards.length + state.players[opponentOf(actor)].baseCovered.length < 6,
    targeting: (state, actor) => ({ choices: [...state.players[opponentOf(actor)].hand], min: 1, max: 1, prompt: "选择你自己的 1 张手牌盖放进基地" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "MOVE_TO_BASE", cardId: selected[0], face: "down", sourceCardId: source }],
  },
  {
    cardNo: "BP01-111", effectId: "quantum-gate-banish", label: "量子门·自身裁剪", trigger: "CARDS_RETREATED", sourceZones: ["retreat"], ruleRefs: ["301.15", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => { const event = eventOf(context, "CARDS_RETREATED"); return Boolean(event?.cardIds.includes(source) && event.fromFieldCardIds?.includes(source)); },
    buildOperations: (_state, _actor, source) => [{ kind: "BANISH", cardIds: [source], sourceCardId: source }],
  },
  {
    cardNo: "BP01-111", effectId: "quantum-gate-move", label: "量子门·战基移动", trigger: "CARDS_BANISHED", sourceZones: ["void"], ruleRefs: ["301.23", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_BANISHED")?.sourceCardId === source,
    condition: (state, actor) => faceUpRoles(state, actor).some((id) => battleBaseMoveChoices(state, actor, id).length > 0),
    targeting: (state, actor) => { const movable = faceUpRoles(state, actor).filter((id) => battleBaseMoveChoices(state, actor, id).length > 0); return { choices: [...movable, ...movable.flatMap((id) => battleBaseMoveChoices(state, actor, id))], min: 2, max: 2, prompt: "选择我方场上 1 张角色及其合法战基移动目的地", choiceKind: "mixed" as const }; },
    validateTargets: (state, actor, _source, selected) => { const card = selected.find((id) => faceUpRoles(state, actor).includes(id)); const destination = selected.find((id) => id.startsWith("zone:")); return card && destination && battleBaseMoveChoices(state, actor, card).includes(destination) ? null : "必须选择可移动角色及其合法目的地"; },
    buildOperations: (_state, _actor, _source, selected) => [{ kind: "MOVE_BATTLE_BASE", cardId: selected.find((id) => !id.startsWith("zone:"))!, destination: selected.find((id) => id.startsWith("zone:"))!.slice(5) as FieldZoneV2 | "base" }],
  },
  {
    cardNo: "BP01-112", effectId: "black-shroud-daredevil", label: "漆黑笼罩·撤退敌方盖卡", trigger: "CHARACTER_PLACED", sourceZones: ["field", "base"], ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_PLACED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[opponentOf(actor)].baseCovered.length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[opponentOf(actor)].baseCovered], min: 1, max: 1, prompt: "选择敌方基地 1 张盖卡撤退" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "RETREAT", cardIds: [selected[0]], sourceCardId: source }],
  },
  {
    cardNo: "BP01-113", effectId: "sudden-falcon", label: "突如其来·后卫攻击移动", trigger: "ATTACK_DECLARED", sourceZones: ["field", "base"], optional: true, usage: "turn_once", ruleRefs: ["301.23", "301.32", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return Boolean(event?.actor === opponentOf(actor) && state.players[opponentOf(actor)].field.rear.includes(event.attackerId)); },
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "sudden-falcon")) && battleBaseMoveChoices(state, actor, source).length > 0,
    targeting: (state, actor, source) => ({ choices: battleBaseMoveChoices(state, actor, source), min: 1, max: 1, prompt: "选择猎鹰本次战基移动的合法目的地", choiceKind: "field_location" as const }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "MOVE_BATTLE_BASE", cardId: source, destination: selected[0].slice(5) as FieldZoneV2 | "base" }, { kind: "MARK_EFFECT_USED", key: useKey(source, "sudden-falcon"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "BP01-114", effectId: "hit-and-run-winter-soldier", label: "打带跑·移动压制", trigger: "BATTLE_BASE_MOVED", sourceZones: ["field", "base"], ruleRefs: ["301.23", "301.32", "301.41", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "BATTLE_BASE_MOVED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "选择敌方战区 1 张角色，本回合战力 -1000" }),
    buildOperations: (_state, _actor, source, selected) => [modifier(source, selected[0], "power", -1000, "hit-and-run")],
  },
  {
    cardNo: "BP01-116", effectId: "rear-guard-evacuation-base", label: "殿后撤离·角色移入基地", trigger: "ATTACK_DECLARED", sourceZones: ["field", "base"], optional: true, ruleRefs: ["301.12", "301.23", "301.32", "304.1"],
    eventFilter: (state, actor, _source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return Boolean(event?.actor === opponentOf(actor) && (state.players[opponentOf(actor)].field.flankLeft.includes(event.attackerId) || state.players[opponentOf(actor)].field.flankRight.includes(event.attackerId))); },
    condition: (state, actor) => battleRoles(state, actor).length > 0 && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6,
    targeting: (state, actor) => ({ choices: battleRoles(state, actor), min: 1, max: 1, prompt: "选择我方战区 1 张角色移动至基地" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "MOVE_TO_BASE", cardId: selected[0], face: "up", sourceCardId: source }],
  },
  {
    cardNo: "BP01-116", effectId: "rear-guard-evacuation-move", label: "殿后撤离·猎鹰战基移动", trigger: "CARDS_PLACED_IN_BASE", sourceZones: ["field", "base"], ruleRefs: ["301.23", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_PLACED_IN_BASE")?.sourceCardId === source,
    condition: (state, actor, source) => battleBaseMoveChoices(state, actor, source).length > 0,
    targeting: (state, actor, source) => ({ choices: battleBaseMoveChoices(state, actor, source), min: 1, max: 1, prompt: "选择猎鹰本次战基移动的合法目的地", choiceKind: "field_location" as const }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "MOVE_BATTLE_BASE", cardId: source, destination: selected[0].slice(5) as FieldZoneV2 | "base" }],
  },
  {
    cardNo: "BP01-118", effectId: "run-search-draw", label: "跑带搜·移动抽牌", trigger: "BATTLE_BASE_MOVED", sourceZones: ["field", "base"], ruleRefs: ["301.13", "301.23", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "BATTLE_BASE_MOVED"); return event?.actor === actor && event.cardId === source; },
    condition: (state, actor) => state.players[actor].deck.length > 0,
    buildOperations: (_state, actor, source) => [{ kind: "DRAW", actor, count: 1, sourceCardId: source }],
  },
  {
    cardNo: "BP01-118", effectId: "run-search-discard", label: "跑带搜·抽后舍弃", trigger: "TURN_CARDS_DRAWN", sourceZones: ["field", "base"], ruleRefs: ["301.13", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "TURN_CARDS_DRAWN"); return event?.actor === actor && event.sourceCardId === source; },
    condition: (state, actor) => state.players[actor].hand.length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand], min: 1, max: 1, prompt: "抽牌后选择我方 1 张手牌舍弃" }),
    buildOperations: (_state, _actor, _source, selected) => [{ kind: "DISCARD", cardIds: [selected[0]] }],
  },
  {
    cardNo: "BP01-119", effectId: "fair-justice-captain", label: "公平正义·Lv6 替换", trigger: "CARDS_DISCARDED", sourceZones: ["retreat"], optional: true, ruleRefs: ["301.12", "301.23", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_DISCARDED")?.cardIds.includes(source) ?? false,
    condition: (state, actor) => faceUpRoles(state, actor).some((id) => effectiveValueV2(state, id, "level") === 6),
    targeting: (state, actor) => ({ choices: faceUpRoles(state, actor).filter((id) => effectiveValueV2(state, id, "level") === 6), min: 1, max: 1, prompt: "选择我方场上 1 张 Lv6 角色与撤退区的美国队长互相替换" }),
    buildOperations: (state, actor, source, selected) => { const target = selected[0]; const zone = fieldZones.find((candidate) => state.players[actor].field[candidate].includes(target)); return zone ? [{ kind: "SWAP_POSITIONS", cardIds: [source, target], sourceCardId: source }] : [{ kind: "RETREAT", cardIds: [target], sourceCardId: source }, { kind: "MOVE_TO_BASE", cardId: source, face: "up", sourceCardId: source, requiresPreviousSuccess: true }]; },
  },
  {
    cardNo: "BP01-120", effectId: "quantum-tunneling-banish", label: "量子隧穿·自身裁剪", trigger: "CARDS_RETREATED", sourceZones: ["retreat"], ruleRefs: ["301.15", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => { const event = eventOf(context, "CARDS_RETREATED"); return Boolean(event?.cardIds.includes(source) && event.fromFieldCardIds?.includes(source)); },
    buildOperations: (_state, _actor, source) => [{ kind: "BANISH", cardIds: [source], sourceCardId: source }],
  },
  {
    cardNo: "BP01-120", effectId: "quantum-tunneling-return", label: "量子隧穿·虚空角色回顶", trigger: "CARDS_BANISHED", sourceZones: ["void"], ruleRefs: ["301.13", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_BANISHED")?.sourceCardId === source,
    condition: (state, actor, source) => state.players[actor].void.some((id) => id !== source && state.cards[id]?.level === 3 && !state.cards[id]?.name.includes("蚁人")),
    targeting: (state, actor, source) => ({ choices: state.players[actor].void.filter((id) => id !== source && state.cards[id]?.level === 3 && !state.cards[id]?.name.includes("蚁人")), min: 1, max: 1, prompt: "选择我方虚空区 1 张原本 Lv3 且非蚁人的角色移回卡组顶" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "MOVE_TO_DECK_TOP", cardId: selected[0], sourceCardId: source }],
  },
];

export function registerPromoEffectsBp01V2(): void { for (const definition of definitions) registerEffectV2(definition); }
export const PROMO_EFFECT_DEFINITIONS_BP01_V2: readonly EffectDefinitionV2[] = definitions;
