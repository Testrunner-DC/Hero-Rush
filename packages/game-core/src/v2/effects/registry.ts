import type { AtomicOperationV2, GameEventV2, GameStateV2, PlayerIndex } from "../model";

export interface EffectContextV2 {
  triggerEvent?: GameEventV2;
}

export interface EffectDefinitionV2 {
  cardNo: string;
  effectId: string;
  label?: string;
  ruleRefs?: string[];
  activation?: "action" | "response";
  trigger?: GameEventV2["type"];
  sourceZones?: Array<"hand" | "field" | "base" | "retreat" | "void" | "timeline" | "attachment">;
  optional?: boolean;
  /** Who answers this effect's targeting prompt; effect operations still resolve for the source controller. */
  targetingActor?: "controller" | "opponent";
  usage?: "turn_once";
  eventFilter?: (state: GameStateV2, actor: PlayerIndex, sourceCardId: string, context: EffectContextV2) => boolean;
  condition?: (state: GameStateV2, actor: PlayerIndex, sourceCardId: string, context?: EffectContextV2) => boolean;
  targeting?: (state: GameStateV2, actor: PlayerIndex, sourceCardId: string, context?: EffectContextV2) => {
    choices: string[];
    min: number;
    max: number;
    prompt: string;
    choiceKind?: "card" | "field_location" | "mixed" | "deck_reorder";
  };
  canActivate?: (state: GameStateV2, actor: PlayerIndex, sourceCardId: string) => boolean;
  validateTargets?: (state: GameStateV2, actor: PlayerIndex, sourceCardId: string, targetCardIds: readonly string[], context?: EffectContextV2) => string | null;
  buildOperations: (state: GameStateV2, actor: PlayerIndex, sourceCardId: string, targetCardIds: readonly string[], context?: EffectContextV2) => AtomicOperationV2[];
}

export interface EffectRegistryRecordV2 {
  cardNo: string;
  effectId: string;
  label: string;
  activation: EffectDefinitionV2["activation"] | null;
  trigger: GameEventV2["type"] | null;
  sourceZones: string[];
  optional: boolean;
  usage: "turn_once" | null;
  ruleRefs: string[];
  requiresTargeting: boolean;
}

const definitions = new Map<string, EffectDefinitionV2>();

function key(cardNo: string, effectId: string): string {
  return `${cardNo}:${effectId}`;
}

export function registerEffectV2(definition: EffectDefinitionV2): void {
  definitions.set(key(definition.cardNo, definition.effectId), definition);
}

export function getEffectV2(cardNo: string, effectId: string): EffectDefinitionV2 | null {
  return definitions.get(key(cardNo, effectId)) ?? null;
}

export function getEffectForCardInstanceV2(state: GameStateV2, cardId: string, effectId: string): EffectDefinitionV2 | null {
  const cardNos = [state.cards[cardId]?.cardNo, ...(state.effectCopies ?? []).filter((copy) => copy.targetCardId === cardId).map((copy) => copy.copiedCardNo)].filter(Boolean) as string[];
  for (const cardNo of cardNos) {
    const definition = getEffectV2(cardNo, effectId);
    if (definition) return definition;
  }
  return null;
}

export function implementedEffectIdsForCardInstanceV2(state: GameStateV2, cardId: string): string[] {
  const cardNos = [state.cards[cardId]?.cardNo, ...(state.effectCopies ?? []).filter((copy) => copy.targetCardId === cardId).map((copy) => copy.copiedCardNo)].filter(Boolean) as string[];
  return [...new Set([...definitions.values()].filter((definition) => cardNos.includes(definition.cardNo) && definition.activation).map((definition) => definition.effectId))].sort();
}

export function implementedCardNosV2(): string[] {
  return [...new Set([...definitions.values()].map((definition) => definition.cardNo))].sort();
}

export function implementedEffectDefinitionsV2(): EffectDefinitionV2[] {
  return [...definitions.values()];
}

/** Serializable administration/sandbox view; executable callbacks never leave the server. */
export function effectRegistrySnapshotV2(): EffectRegistryRecordV2[] {
  return [...definitions.values()].map((definition) => ({
    cardNo: definition.cardNo,
    effectId: definition.effectId,
    label: definition.label ?? definition.effectId,
    activation: definition.activation ?? null,
    trigger: definition.trigger ?? null,
    sourceZones: [...(definition.sourceZones ?? [])],
    optional: definition.optional ?? false,
    usage: definition.usage ?? null,
    ruleRefs: [...(definition.ruleRefs ?? [])],
    requiresTargeting: Boolean(definition.targeting),
  })).sort((left, right) => left.cardNo.localeCompare(right.cardNo) || left.effectId.localeCompare(right.effectId));
}

export function implementedEffectIdsForCardV2(cardNo: string): string[] {
  return [...definitions.values()]
    .filter((definition) => definition.cardNo === cardNo && definition.activation)
    .map((definition) => definition.effectId)
    .sort();
}

export function clearEffectRegistryForTestsV2(): void {
  definitions.clear();
}
