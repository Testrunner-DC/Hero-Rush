import type { AtomicOperationV2, FieldZoneV2, GameEventV2, GameStateV2, PlayerIndex } from "../model";
import { effectiveValueV2 } from "../effects/atomicOps";
import { registerEffectV2, type EffectContextV2, type EffectDefinitionV2 } from "../effects/registry";

const fieldZones: readonly FieldZoneV2[] = ["vanguard", "flankLeft", "flankRight", "rear"];
const opponentOf = (actor: PlayerIndex): PlayerIndex => actor === 0 ? 1 : 0;
const battleRoles = (state: GameStateV2, actor: PlayerIndex): string[] => fieldZones.flatMap((zone) => state.players[actor].field[zone]);
const hasFeature = (state: GameStateV2, cardId: string, feature: string): boolean => state.cards[cardId]?.features.some((value) => value.includes(feature)) ?? false;
const eventOf = <T extends GameEventV2["type"]>(context: EffectContextV2 | undefined, type: T): Extract<GameEventV2, { type: T }> | null => context?.triggerEvent?.type === type ? context.triggerEvent as Extract<GameEventV2, { type: T }> : null;
const useKey = (source: string, effectId: string): string => `${source}:${effectId}`;
const unused = (state: GameStateV2, source: string, effectId: string): boolean => !state.usage.effectUseKeysThisTurn.includes(useKey(source, effectId));
const markUse = (source: string, effectId: string, requiresPreviousSuccess = false): AtomicOperationV2 => ({ kind: "MARK_EFFECT_USED", key: useKey(source, effectId), ...(requiresPreviousSuccess ? { requiresPreviousSuccess: true } : {}) });
const zoneChoice = (zone: FieldZoneV2): string => `zone:${zone}`;
const parseZone = (choice: string): FieldZoneV2 => choice.replace(/^zone:/, "") as FieldZoneV2;

function fieldZoneOf(state: GameStateV2, actor: PlayerIndex, cardId: string): FieldZoneV2 | null {
  return fieldZones.find((zone) => state.players[actor].field[zone].includes(cardId)) ?? null;
}

function levelThreeAvengers(state: GameStateV2, cardIds: readonly string[]): string[] {
  return cardIds.filter((id) => effectiveValueV2(state, id, "level") === 3 && hasFeature(state, id, "复仇者联盟"));
}

function mindResonanceTargeting(state: GameStateV2, actor: PlayerIndex) {
  const costs = levelThreeAvengers(state, battleRoles(state, actor));
  const hand = levelThreeAvengers(state, state.players[actor].hand);
  const openZones = fieldZones.filter((zone) => state.players[actor].field[zone].length === 0);
  const vacatableZones = costs.map((id) => fieldZoneOf(state, actor, id)).filter((zone): zone is FieldZoneV2 => zone !== null);
  return {
    choices: [...costs, ...hand, ...[...new Set([...openZones, ...vacatableZones])].map(zoneChoice)],
    min: 1,
    max: hand.length > 0 ? 3 : 1,
    prompt: "选择 1 张己方场上 Lv3【复仇者联盟】角色撤退；也可同时选择 1 张合法手牌及放置战区",
    choiceKind: "mixed" as const,
  };
}

function validateMindResonance(state: GameStateV2, actor: PlayerIndex, selected: readonly string[]): string | null {
  const costs = levelThreeAvengers(state, battleRoles(state, actor));
  const hand = levelThreeAvengers(state, state.players[actor].hand);
  const selectedCosts = selected.filter((id) => costs.includes(id));
  const selectedHand = selected.filter((id) => hand.includes(id));
  const selectedZones = selected.filter((id) => id.startsWith("zone:"));
  if (selectedCosts.length !== 1) return "必须选择 1 张己方场上 Lv3【复仇者联盟】角色撤退";
  if (selected.length === 1) return null;
  if (selected.length !== 3 || selectedHand.length !== 1 || selectedZones.length !== 1) return "可选放置必须同时选择 1 张合法手牌和 1 个战区";
  const destination = parseZone(selectedZones[0]);
  const occupant = state.players[actor].field[destination][0];
  return !occupant || occupant === selectedCosts[0] ? null : "所选战区不会因本次费用撤退而腾空";
}

function modifier(source: string, target: string, value: number, suffix: string): AtomicOperationV2 {
  return {
    kind: "ADD_MODIFIER",
    modifier: {
      id: `promo:${source}:${suffix}:${target}`,
      sourceCardId: source,
      targetCardId: target,
      type: "power",
      value,
      mode: "delta",
      duration: "turn",
    },
  };
}

const definitions: EffectDefinitionV2[] = [
  {
    cardNo: "EB01-006",
    effectId: "suppressive-strike",
    label: "压制打击",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["field"],
    ruleRefs: ["301.12", "301.32", "301.41", "304.1"],
    eventFilter: (state, actor, _source, context) => {
      const event = eventOf(context, "CHARACTER_PLACED");
      return Boolean(event && event.actor === opponentOf(actor) && effectiveValueV2(state, event.cardId, "level") === 6);
    },
    buildOperations: (_state, _actor, source, _targets, context) => {
      const placed = eventOf(context, "CHARACTER_PLACED")!.cardId;
      return [
        modifier(source, source, -1000, "suppressive-strike-self"),
        modifier(source, placed, -1000, "suppressive-strike-enemy"),
      ];
    },
  },
  {
    cardNo: "EB01-007",
    effectId: "mind-resonance",
    label: "心灵共鸣",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.12", "301.14", "301.32", "304.2"],
    canActivate: (state, actor, source) => unused(state, source, "mind-resonance") && levelThreeAvengers(state, battleRoles(state, actor)).length > 0,
    targeting: (state, actor) => mindResonanceTargeting(state, actor),
    validateTargets: (state, actor, _source, selected) => validateMindResonance(state, actor, selected),
    buildOperations: (state, actor, source, selected) => {
      const cost = selected.find((id) => battleRoles(state, actor).includes(id))!;
      const hand = selected.find((id) => state.players[actor].hand.includes(id));
      const zone = selected.find((id) => id.startsWith("zone:"));
      return [
        { kind: "RETREAT", cardIds: [cost] },
        ...(hand && zone ? [{ kind: "PLACE_FIELD" as const, cardId: hand, destination: parseZone(zone), requiresPreviousSuccess: true }] : []),
        markUse(source, "mind-resonance", true),
      ];
    },
  },
  {
    cardNo: "EB01-008",
    effectId: "chaos-origin",
    label: "混沌本源",
    trigger: "BATTLE_BASE_MOVED",
    sourceZones: ["field", "base"],
    usage: "turn_once",
    ruleRefs: ["301.23", "301.32", "301.41", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "BATTLE_BASE_MOVED")?.cardId === source,
    condition: (state, _actor, source) => unused(state, source, "chaos-origin"),
    buildOperations: (state, actor, source) => {
      const roleCount = state.players[actor].void.filter((id) => state.cards[id]?.deckKind === "main").length;
      return [modifier(source, source, roleCount * 1000, "chaos-origin"), markUse(source, "chaos-origin")];
    },
  },
  {
    cardNo: "EB01-009",
    effectId: "one-against-two",
    label: "以一敌二",
    trigger: "CHARACTER_BATTLE_RESOLVED",
    sourceZones: ["field"],
    optional: true,
    ruleRefs: ["301.14", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_BATTLE_RESOLVED")?.winnerCardId === source,
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") <= 3),
    targeting: (state, actor) => ({
      choices: battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 3),
      min: 1,
      max: 1,
      prompt: "选择敌方战区 1 张 Lv3 或以下角色，与此卡一同撤退",
    }),
    buildOperations: (_state, _actor, source, targets) => [{ kind: "RETREAT", cardIds: [source, targets[0]] }],
  },
];

export function registerPromoEffectsEb01V2(): void {
  for (const definition of definitions) registerEffectV2(definition);
}

export const PROMO_EFFECT_DEFINITIONS_EB01_V2: readonly EffectDefinitionV2[] = definitions;
