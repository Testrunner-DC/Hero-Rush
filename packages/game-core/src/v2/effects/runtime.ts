import { applyAtomicOperationsV2 } from "./atomicOps";
import { getEffectForCardInstanceV2, implementedEffectDefinitionsV2 } from "./registry";
import { effectCardNosForInstanceV2 } from "./copying";
import { otherPlayerV2 } from "../invariants";
import { cardControllerV2, effectSourceZoneV2 } from "../control";
import { isCardEffectSuppressedV2 } from "./suppression";
import type { GameEventV2, GameStateV2, PlayerIndex, QueuedEffectV2 } from "../model";

export function queueActivatedEffectV2(
  state: GameStateV2,
  actor: PlayerIndex,
  sourceCardId: string,
  effectId: string,
  targetCardIds: readonly string[] = [],
): { state: GameStateV2; event: GameEventV2 } | null {
  const card = state.cards[sourceCardId];
  if (!card) return null;
  if (isCardEffectSuppressedV2(state, sourceCardId)) return null;
  const definition = getEffectForCardInstanceV2(state, sourceCardId, effectId);
  if (!definition) return null;
  const queued: QueuedEffectV2 = {
    id: `effect:${state.revision + 1}:${state.effects.queue.length}`,
    sourceCardId,
    controller: actor,
    effectId,
    trigger: "manual",
    optional: false,
    operations: definition.buildOperations(state, actor, sourceCardId, targetCardIds),
  };
  return {
    state: { ...state, effects: { ...state.effects, queue: [...state.effects.queue, queued] } },
    event: { type: "EFFECT_QUEUED", actor, sourceCardId, effectId },
  };
}

export function resolveEffectQueueV2(
  input: GameStateV2,
): { state: GameStateV2; events: GameEventV2[] } {
  let state: GameStateV2 = { ...input, effects: { ...input.effects, resolving: true } };
  const events: GameEventV2[] = [];
  while (state.effects.queue.length > 0 && state.status === "playing") {
    const [effect, ...remaining] = state.effects.queue;
    state = { ...state, effects: { ...state.effects, queue: remaining } };
    const sourceCard = state.cards[effect.sourceCardId];
    const definition = getEffectForCardInstanceV2(state, effect.sourceCardId, effect.effectId);
    if (sourceCard) {
      events.push({
        type: "EFFECT_PRESENTED",
        actor: effect.controller,
        sourceCardId: effect.sourceCardId,
        definitionId: sourceCard.definitionId,
        effectId: effect.effectId,
        effectLabel: definition?.label ?? effect.effectId,
        activation: effect.trigger === "manual"
          ? definition?.activation === "response" ? "response" : "action"
          : "trigger",
      });
    }
    const applied = applyAtomicOperationsV2(state, effect.operations, effect.sourceCardId);
    state = applied.state;
    events.push(...applied.events, { type: "EFFECT_RESOLVED", effectInstanceId: effect.id });
    state = {
      ...state,
      effects: {
        ...state.effects,
        resolvedEffectIds: [...state.effects.resolvedEffectIds, effect.id],
      },
    };
  }
  state = { ...state, effects: { ...state.effects, resolving: false } };
  return { state, events };
}

export function collectTriggeredEffectsV2(
  state: GameStateV2,
  events: readonly GameEventV2[],
): QueuedEffectV2[] {
  const candidates: QueuedEffectV2[] = [];
  for (const [eventIndex, triggerEvent] of events.entries()) {
    const definitions = implementedEffectDefinitionsV2().filter((definition) => definition.trigger === triggerEvent.type);
    for (const controller of [state.activePlayer, otherPlayerV2(state.activePlayer)] as const) {
      for (const card of Object.values(state.cards).filter((item) => cardControllerV2(state, item.instanceId) === controller)) {
        if (isCardEffectSuppressedV2(state, card.instanceId)) continue;
        const zone = effectSourceZoneV2(state, controller, card.instanceId);
        if (!zone) continue;
        for (const definition of definitions) {
          const context = { triggerEvent };
          if (!effectCardNosForInstanceV2(state, card.instanceId).includes(definition.cardNo)) continue;
          if (definition.sourceZones && !definition.sourceZones.includes(zone)) continue;
          if (definition.eventFilter && !definition.eventFilter(state, controller, card.instanceId, context)) continue;
          if (definition.condition && !definition.condition(state, controller, card.instanceId, context)) continue;
          if (definition.usage === "turn_once" && candidates.some((item) => item.sourceCardId === card.instanceId && item.effectId === definition.effectId)) continue;
          const requestedTargeting = definition.targeting?.(state, controller, card.instanceId, context);
          const normalizedChoices = requestedTargeting
            ? [...new Set(requestedTargeting.choices)].filter((id) => requestedTargeting.choiceKind && requestedTargeting.choiceKind !== "card" ? true : Boolean(state.cards[id]))
            : [];
          if (requestedTargeting && (requestedTargeting.min < 0 || requestedTargeting.max < requestedTargeting.min || requestedTargeting.max > normalizedChoices.length)) continue;
          const targeting = requestedTargeting && requestedTargeting.max > 0
            ? { ...requestedTargeting, choices: normalizedChoices }
            : undefined;
          candidates.push({
            id: `trigger:${state.revision}:${eventIndex}:${state.effects.resolvedEffectIds.length + candidates.length}`,
            sourceCardId: card.instanceId,
            controller,
            effectId: definition.effectId,
            trigger: definition.trigger as QueuedEffectV2["trigger"],
            optional: definition.optional ?? false,
            targetingActor: definition.targetingActor === "opponent" ? otherPlayerV2(controller) : controller,
            triggerEvent,
            operations: targeting ? [] : definition.buildOperations(state, controller, card.instanceId, [], context),
            ...(targeting ? { targeting: {
              choices: targeting.choices,
              min: targeting.min,
              max: targeting.max,
              prompt: targeting.prompt,
              choiceKind: targeting.choiceKind ?? "card",
            } } : {}),
          });
        }
      }
    }
  }
  return candidates;
}

export function prepareTriggerResolutionV2(
  state: GameStateV2,
  candidates: readonly QueuedEffectV2[],
): { state: GameStateV2; events: GameEventV2[] } {
  if (candidates.length === 0) return { state, events: [] };
  const controllers = [state.activePlayer, otherPlayerV2(state.activePlayer)] as const;
  const groups = controllers
    .map((actor) => ({ actor, effects: candidates.filter((effect) => effect.controller === actor) }))
    .filter((group) => group.effects.length > 0);
  const orderedBefore: QueuedEffectV2[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (group.effects.length > 1) {
      const remainingEffects = groups.slice(index + 1).flatMap((item) => item.effects);
      const effectInstanceIds = group.effects.map((effect) => effect.id);
      return {
        state: {
          ...state,
          decision: {
            id: `trigger-order:${group.actor}:${state.revision}`,
            kind: "ORDER_TRIGGERS",
            actor: group.actor,
            choices: effectInstanceIds,
            min: effectInstanceIds.length,
            max: effectInstanceIds.length,
            prompt: "决定同时触发效果的处理顺序",
            continuation: {
              kind: "RESUME_TRIGGER_ORDER",
              orderedBefore,
              currentEffects: group.effects,
              remainingEffects,
            },
          },
        },
        events: [{ type: "TRIGGER_ORDER_REQUESTED", actor: group.actor, effectInstanceIds }],
      };
    }
    orderedBefore.push(...group.effects);
  }
  return prepareEffectResolutionV2(state, orderedBefore);
}

/**
 * Resolves mandatory effects until the next optional effect. Optional effects
 * always become an explicit serializable player decision, so journal replay can
 * never depend on an implicit UI choice.
 */
export function prepareEffectResolutionV2(
  state: GameStateV2,
  effects: readonly QueuedEffectV2[],
): { state: GameStateV2; events: GameEventV2[] } {
  if (effects.length === 0 || state.status === "finished") return { state, events: [] };
  const [queuedEffect, ...remainingEffects] = effects;
  let effect = queuedEffect;
  if (queuedEffect.targeting) {
    const definition = getEffectForCardInstanceV2(state, queuedEffect.sourceCardId, queuedEffect.effectId);
    const refreshed = definition?.targeting?.(state, queuedEffect.controller, queuedEffect.sourceCardId, { triggerEvent: queuedEffect.triggerEvent });
    if (!definition || !refreshed) return prepareEffectResolutionV2(state, remainingEffects);
    const choices = [...new Set(refreshed.choices)].filter((id) => refreshed.choiceKind && refreshed.choiceKind !== "card" ? true : Boolean(state.cards[id]));
    if (refreshed.min < 0 || refreshed.max < refreshed.min || refreshed.max > choices.length) {
      return prepareEffectResolutionV2(state, remainingEffects);
    }
    if (refreshed.max === 0) {
      const { targeting: _staleTargeting, ...withoutTargeting } = queuedEffect;
      effect = {
        ...withoutTargeting,
        operations: definition.buildOperations(state, queuedEffect.controller, queuedEffect.sourceCardId, [], { triggerEvent: queuedEffect.triggerEvent }),
      };
    } else {
      effect = { ...queuedEffect, targeting: { ...refreshed, choices } };
    }
  }
  if (effect.optional) {
    return {
      state: {
        ...state,
        decision: {
          id: `optional-effect:${effect.controller}:${state.revision}:${effect.id}`,
          kind: "OPTIONAL_EFFECT",
          actor: effect.controller,
          choices: ["resolve", "skip"],
          min: 1,
          max: 1,
          prompt: "是否处理该可选触发效果？",
          continuation: { kind: "RESUME_OPTIONAL_EFFECT", effect, remainingEffects },
        },
      },
      events: [{ type: "OPTIONAL_EFFECT_REQUESTED", actor: effect.controller, effectInstanceId: effect.id }],
    };
  }
  if (effect.targeting) {
    return {
      state: {
        ...state,
        decision: {
          id: `trigger-targets:${effect.controller}:${state.revision}:${effect.id}`,
          kind: "EFFECT_TARGETS",
          actor: effect.targetingActor ?? effect.controller,
          choices: effect.targeting.choices,
          min: effect.targeting.min,
          max: effect.targeting.max,
            prompt: effect.targeting.prompt,
            choiceKind: effect.targeting.choiceKind ?? "card",
          continuation: { kind: "RESUME_TRIGGER_EFFECT_TARGETS", effect, remainingEffects },
        },
      },
      events: [{
        type: "EFFECT_TARGETS_REQUESTED",
        actor: effect.targetingActor ?? effect.controller,
        sourceCardId: effect.sourceCardId,
        effectId: effect.effectId,
        min: effect.targeting.min,
        max: effect.targeting.max,
      }],
    };
  }
  const resolved = resolveEffectQueueV2({
    ...state,
    effects: { ...state.effects, queue: [...state.effects.queue, effect] },
  });
  const continued = prepareEffectResolutionV2(resolved.state, remainingEffects);
  return { state: continued.state, events: [...resolved.events, ...continued.events] };
}
