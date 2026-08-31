import type { AtomicOperationV2, FieldZoneV2, GameEventV2, GameStateV2, PlayerIndex } from "../model";
import { effectiveValueV2 } from "../effects/atomicOps";
import { registerEffectV2, type EffectContextV2, type EffectDefinitionV2 } from "../effects/registry";

const fieldZones: readonly FieldZoneV2[] = ["vanguard", "flankLeft", "flankRight", "rear"];
const battleRoles = (state: GameStateV2, actor: PlayerIndex): string[] => fieldZones.flatMap((zone) => state.players[actor].field[zone]);
const opponentOf = (actor: PlayerIndex): PlayerIndex => actor === 0 ? 1 : 0;
const hasFeature = (state: GameStateV2, cardId: string, feature: string): boolean => state.cards[cardId]?.features.some((value) => value.includes(feature)) ?? false;
const eventOf = <T extends GameEventV2["type"]>(context: EffectContextV2 | undefined, type: T): Extract<GameEventV2, { type: T }> | null => context?.triggerEvent?.type === type ? context.triggerEvent as Extract<GameEventV2, { type: T }> : null;
const zoneChoice = (zone: FieldZoneV2): string => `zone:${zone}`;
const parseZone = (choice: string): FieldZoneV2 => choice.replace(/^zone:/, "") as FieldZoneV2;
const openFieldZones = (state: GameStateV2, actor: PlayerIndex): FieldZoneV2[] => fieldZones.filter((zone) => state.players[actor].field[zone].length === 0);
const useKey = (source: string, effectId: string): string => `${source}:${effectId}`;

function locationTargeting(state: GameStateV2, actor: PlayerIndex, prompt: string) {
  return { choices: openFieldZones(state, actor).map(zoneChoice), min: 1, max: 1, prompt, choiceKind: "field_location" as const };
}

function validateLocation(state: GameStateV2, actor: PlayerIndex, selected: readonly string[]): string | null {
  if (selected.length !== 1 || !selected[0].startsWith("zone:")) return "必须选择 1 个战区";
  return openFieldZones(state, actor).includes(parseZone(selected[0])) ? null : "所选战区当前不能放置角色";
}

function powerModifier(source: string, target: string, value: number, suffix: string): AtomicOperationV2 {
  return { kind: "ADD_MODIFIER", modifier: { id: `promo:${source}:${suffix}:${target}`, sourceCardId: source, targetCardId: target, type: "power", value, mode: "delta", duration: "turn" } };
}

function rangeModifier(source: string, target: string, value: number, suffix: string): AtomicOperationV2 {
  return { kind: "ADD_MODIFIER", modifier: { id: `promo:${source}:${suffix}:${target}`, sourceCardId: source, targetCardId: target, type: "range", value, mode: "delta", duration: "turn" } };
}

const definitions: EffectDefinitionV2[] = [
  {
    cardNo: "PB01-001",
    effectId: "destroyer-victory-range",
    label: "毁灭者",
    trigger: "CHARACTER_BATTLE_RESOLVED",
    sourceZones: ["field"],
    ruleRefs: ["301.32", "301.41", "303.2.a.4", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_BATTLE_RESOLVED")?.winnerCardId === source,
    buildOperations: (state, actor, source) => battleRoles(state, actor)
      .filter((id) => id !== source && hasFeature(state, id, "银河护卫队"))
      .map((id) => rangeModifier(source, id, 1, "destroyer-victory-range")),
  },
  {
    cardNo: "PB01-002",
    effectId: "warm-bunny-finish",
    label: "暖心小兔子",
    trigger: "ATTACK_DECLARED",
    sourceZones: ["field"],
    ruleRefs: ["301.14", "303.2.a.4", "304.1"],
    eventFilter: (state, actor, source, context) => {
      const event = eventOf(context, "ATTACK_DECLARED");
      if (!event || event.actor !== actor || event.attackerId !== source || event.target.kind !== "character") return false;
      const targetCardId = event.target.cardId;
      return (state.usage.attackedTargetCardIdsThisTurn ?? []).filter((id) => id === targetCardId).length >= 2;
    },
    buildOperations: (_state, _actor, _source, _targets, context) => [{ kind: "RETREAT", cardIds: [(eventOf(context, "ATTACK_DECLARED")!.target as { kind: "character"; cardId: string }).cardId] }],
  },
  {
    cardNo: "PB01-003",
    effectId: "galactic-dancer-bottom-deck",
    label: "银河舞者",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["base"],
    optional: true,
    ruleRefs: ["301.15", "301.32", "304.1", "305.6"],
    eventFilter: (_state, actor, _source, context) => {
      const event = eventOf(context, "CHARACTER_PLACED");
      return Boolean(event && event.actor === opponentOf(actor) && event.placementKind === "effect");
    },
    buildOperations: (_state, _actor, source, _targets, context) => [
      { kind: "BANISH", cardIds: [source] },
      { kind: "MOVE_TO_DECK_BOTTOM", cardId: eventOf(context, "CHARACTER_PLACED")!.cardId, requiresPreviousSuccess: true },
    ],
  },
  {
    cardNo: "PB01-005",
    effectId: "dangerous-sisters-gamora-deploy",
    label: "危险姐妹·卡魔拉",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.12", "301.32", "304.2"],
    canActivate: (state, actor) => battleRoles(state, actor).filter((id) => hasFeature(state, id, "银河护卫队")).length >= 2 && openFieldZones(state, actor).length > 0,
    targeting: (state, actor) => locationTargeting(state, actor, "选择我方 1 个空战区放置此卡"),
    validateTargets: (state, actor, _source, selected) => validateLocation(state, actor, selected),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "PLACE_FIELD", cardId: source, destination: parseZone(selected[0]) }],
  },
  {
    cardNo: "PB01-007",
    effectId: "preemptive-strike",
    label: "先决打击",
    trigger: "ATTACK_DECLARED",
    sourceZones: ["field"],
    ruleRefs: ["301.32", "301.41", "303.2.a.4", "304.1"],
    eventFilter: (state, actor, source, context) => {
      const event = eventOf(context, "ATTACK_DECLARED");
      return Boolean(event && event.actor === actor && event.attackerId === source && event.target.kind === "character" && effectiveValueV2(state, event.target.cardId, "power") > effectiveValueV2(state, source, "power"));
    },
    buildOperations: (_state, _actor, source, _targets, context) => {
      const target = (eventOf(context, "ATTACK_DECLARED")!.target as { kind: "character"; cardId: string }).cardId;
      return [powerModifier(source, target, -2000, "preemptive-strike")];
    },
  },
  {
    cardNo: "PB01-009",
    effectId: "divine-descent-hulk",
    label: "神兵天降",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.12", "301.14", "301.20", "301.32", "304.2"],
    canActivate: (state, actor) => state.players[actor].baseCards.length + state.players[actor].baseCovered.length === 6 && openFieldZones(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].baseCards, ...state.players[actor].baseCovered, ...openFieldZones(state, actor).map(zoneChoice)], min: 7, max: 7, prompt: "选择基地全部 6 张卡撤退，并选择此卡的放置战区", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => {
      const base = [...state.players[actor].baseCards, ...state.players[actor].baseCovered];
      const selectedBase = selected.filter((id) => base.includes(id));
      const zones = selected.filter((id) => id.startsWith("zone:"));
      if (selectedBase.length !== 6 || !base.every((id) => selectedBase.includes(id))) return "必须撤退基地全部 6 张卡";
      return zones.length === 1 ? validateLocation(state, actor, zones) : "必须选择 1 个放置战区";
    },
    buildOperations: (state, actor, source, selected) => {
      const base = selected.filter((id) => state.players[actor].baseCards.includes(id) || state.players[actor].baseCovered.includes(id));
      const destination = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      return [{ kind: "RETREAT", cardIds: base }, { kind: "PLACE_FIELD", cardId: source, destination, requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "PB01-010",
    effectId: "behind-enemy-lines-deploy",
    label: "深入敌后·潜入",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.3", "301.12", "301.32", "304.2"],
    canActivate: (state, actor) => state.players[actor].baseCovered.length > state.players[opponentOf(actor)].baseCovered.length && openFieldZones(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => locationTargeting(state, opponentOf(actor), "选择敌方 1 个空战区放置此卡"),
    validateTargets: (state, actor, _source, selected) => validateLocation(state, opponentOf(actor), selected),
    buildOperations: (_state, actor, source, selected) => [{ kind: "PLACE_FIELD", cardId: source, destination: parseZone(selected[0]), controller: opponentOf(actor) }],
  },
  {
    cardNo: "PB01-010",
    effectId: "behind-enemy-lines-retreat",
    label: "深入敌后·撤退",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["field"],
    ruleRefs: ["301.3", "301.14", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_PLACED")?.cardId === source,
    condition: (state, actor) => battleRoles(state, actor).some((id) => effectiveValueV2(state, id, "power") <= 4500),
    targeting: (state, actor) => ({ choices: battleRoles(state, actor).filter((id) => effectiveValueV2(state, id, "power") <= 4500), min: 1, max: 1, prompt: "选择控制方战区 1 张战力 4500 或以下角色撤退" }),
    buildOperations: (_state, _actor, _source, targets) => [{ kind: "RETREAT", cardIds: [targets[0]] }],
  },
  {
    cardNo: "PB01-011",
    effectId: "astral-visitor",
    label: "星体访客",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["void"],
    ruleRefs: ["301.12", "301.15", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "astral-visitor")) && state.players[actor].retreat.some((id) => effectiveValueV2(state, id, "level") >= 4) && openFieldZones(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].retreat.filter((id) => effectiveValueV2(state, id, "level") >= 4), ...openFieldZones(state, actor).map(zoneChoice)], min: 2, max: 2, prompt: "选择撤退区 1 张 Lv4 或以上角色裁剪，并选择此卡的放置战区", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => {
      const costs = selected.filter((id) => state.players[actor].retreat.includes(id) && effectiveValueV2(state, id, "level") >= 4);
      const zones = selected.filter((id) => id.startsWith("zone:"));
      if (costs.length !== 1 || zones.length !== 1) return "必须选择 1 张合法撤退区角色和 1 个战区";
      return validateLocation(state, actor, zones);
    },
    buildOperations: (state, actor, source, selected) => {
      const cost = selected.find((id) => state.players[actor].retreat.includes(id))!;
      const destination = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      return [
        { kind: "BANISH", cardIds: [cost], sourceCardId: source },
        { kind: "PLACE_FIELD", cardId: source, destination, requiresPreviousSuccess: true },
        { kind: "MARK_EFFECT_USED", key: useKey(source, "astral-visitor"), requiresPreviousSuccess: true },
      ];
    },
  },
];

export function registerPromoEffectsPb01V2(): void {
  for (const definition of definitions) registerEffectV2(definition);
}

export const PROMO_EFFECT_DEFINITIONS_PB01_V2: readonly EffectDefinitionV2[] = definitions;
