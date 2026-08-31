import type { FieldZoneV2, GameEventV2, GameStateV2, PlayerIndex } from "../model";
import { effectiveValueV2 } from "../effects/atomicOps";
import { registerEffectV2, type EffectContextV2, type EffectDefinitionV2 } from "../effects/registry";

const cardNos = ["TB01-001", "TB01-001（金）", "TB01-001（银）"] as const;
const fieldZones: readonly FieldZoneV2[] = ["vanguard", "flankLeft", "flankRight", "rear"];
const opponentOf = (actor: PlayerIndex): PlayerIndex => actor === 0 ? 1 : 0;
const eventOf = <T extends GameEventV2["type"]>(context: EffectContextV2 | undefined, type: T): Extract<GameEventV2, { type: T }> | null => context?.triggerEvent?.type === type ? context.triggerEvent as Extract<GameEventV2, { type: T }> : null;

function faceUpFieldCards(state: GameStateV2, actor: PlayerIndex): string[] {
  const direct = [...state.players[actor].baseCards, ...fieldZones.flatMap((zone) => state.players[actor].field[zone])];
  const attached = direct.flatMap((host) => state.attachments[host] ?? []);
  return [...direct, ...attached];
}

function definition(cardNo: string): EffectDefinitionV2 {
  return {
    cardNo,
    effectId: "battleworld-lord-banish",
    label: "斗界之主",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["field", "base"],
    optional: true,
    ruleRefs: ["301.15", "301.20", "301.32", "304.1", "305.1", "305.6"],
    eventFilter: (_state, _actor, source, context) => {
      const event = eventOf(context, "CHARACTER_PLACED");
      return Boolean(event && event.cardId === source && event.placementKind === "summon");
    },
    condition: (state, actor) => faceUpFieldCards(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") <= 2),
    targeting: (state, actor) => ({ choices: faceUpFieldCards(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 2), min: 1, max: 1, prompt: "选择敌方场上 1 张 Lv2 或以下卡牌裁剪" }),
    buildOperations: (_state, _actor, source, targets) => [{ kind: "BANISH", cardIds: [targets[0]], sourceCardId: source }],
  };
}

const definitions: EffectDefinitionV2[] = cardNos.map(definition);

export function registerPromoEffectsTb01V2(): void {
  for (const item of definitions) registerEffectV2(item);
}

export const PROMO_EFFECT_DEFINITIONS_TB01_V2: readonly EffectDefinitionV2[] = definitions;
