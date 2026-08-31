import { shuffleDeterministic } from "./random";
import { assertStateInvariantsV2, otherPlayerV2 } from "./invariants";
import type {
  AttackTargetV2,
  BattleBaseLocationV2,
  BattleContextV2,
  CommandEnvelopeV2,
  CommandErrorCodeV2,
  CommandResultV2,
  FieldZoneV2,
  GameEventV2,
  GameStateV2,
  PlayerIndex,
  PlayerStateV2,
} from "./model";
import { createMulliganDecisionV2 } from "./setup";
import { preventsTieRetreatV2 } from "./cards/starterContinuous";
import { allowedCommandTypesV2 } from "./commandPolicy";
import { hashStateV2 } from "./stateHash";
import {
  collectTriggeredEffectsV2,
  attackOpportunityLimitV2,
  applyStateBasedActionsV2,
  consumedAttackOpportunitiesV2,
  detectValueChangeEventsV2,
  effectiveValueV2,
  getEffectV2,
  hasKeywordV2,
  prepareEffectResolutionV2,
  prepareTriggerResolutionV2,
  queueActivatedEffectV2,
  retreatCardsV2,
  retreatClosureCardIdsV2,
  resolveEffectQueueV2,
} from "./effects/index";

function rejectV2(
  state: GameStateV2,
  code: CommandErrorCodeV2,
  message: string,
): CommandResultV2 {
  return {
    ok: false,
    code,
    message,
    currentRevision: state.revision,
    stateHash: hashStateV2(state),
  };
}

function replacePlayerV2(
  players: GameStateV2["players"],
  actor: PlayerIndex,
  player: PlayerStateV2,
): GameStateV2["players"] {
  return actor === 0 ? [player, players[1]] : [players[0], player];
}

function executeMulliganCommandV2(
  state: GameStateV2,
  envelope: CommandEnvelopeV2,
): CommandResultV2 {
  if (state.status === "finished") {
    return rejectV2(state, "GAME_FINISHED", "对局已经结束");
  }
  if (envelope.expectedRevision !== state.revision) {
    return rejectV2(state, "STALE_REVISION", "命令基于过期状态");
  }
  if (
    state.status !== "setup"
    || state.flow.kind !== "SETUP_MULLIGAN"
    || state.decision?.kind !== "MULLIGAN"
    || envelope.command.type !== "SUBMIT_MULLIGAN"
  ) {
    return rejectV2(state, "INVALID_FLOW", "当前流程不接受调度命令");
  }
  if (state.decision.actor !== envelope.actor || state.flow.actor !== envelope.actor) {
    return rejectV2(state, "NOT_DECISION_ACTOR", "当前不是该玩家的调度决策");
  }

  const selected = envelope.command.cardIds;
  if (selected.length < state.decision.min || selected.length > state.decision.max) {
    return rejectV2(state, "INVALID_CHOICE_COUNT", "调度数量必须在 0 到 6 张之间");
  }
  if (new Set(selected).size !== selected.length) {
    return rejectV2(state, "DUPLICATE_CHOICE", "调度选择不能包含重复卡牌");
  }
  const available = new Set(state.decision.choices);
  if (selected.some((id) => !available.has(id))) {
    return rejectV2(state, "CHOICE_NOT_AVAILABLE", "调度选择包含当前手牌之外的卡牌");
  }

  const player = state.players[envelope.actor];
  const selectedSet = new Set(selected);
  const retainedHand = player.hand.filter((id) => !selectedSet.has(id));
  let nextDeck = player.deck;
  let nextRandomState = state.randomState;
  let drawn: string[] = [];

  if (selected.length > 0) {
    const withReturnedAtBottom = [...player.deck, ...selected];
    drawn = withReturnedAtBottom.slice(0, selected.length);
    const shuffled = shuffleDeterministic(
      withReturnedAtBottom.slice(selected.length),
      state.randomState,
    );
    nextDeck = shuffled.items;
    nextRandomState = shuffled.state;
  }

  const nextPlayer: PlayerStateV2 = {
    ...player,
    hand: [...retainedHand, ...drawn],
    deck: [...nextDeck],
  };
  const nextRevision = state.revision + 1;
  const completed: [boolean, boolean] = [...state.flow.completed];
  completed[envelope.actor] = true;
  const nextActor = otherPlayerV2(envelope.actor);
  const allCompleted = completed[0] && completed[1];
  const players = replacePlayerV2(state.players, envelope.actor, nextPlayer);

  const nextState: GameStateV2 = allCompleted
    ? {
        ...state,
        revision: nextRevision,
        status: "playing",
        activePlayer: state.firstPlayer,
        turnNumber: 1,
        flow: { kind: "TURN_START", actor: state.firstPlayer },
        decision: null,
        players,
        randomState: nextRandomState,
      }
    : {
        ...state,
        revision: nextRevision,
        flow: { kind: "SETUP_MULLIGAN", actor: nextActor, completed },
        decision: createMulliganDecisionV2(nextActor, nextRevision, players[nextActor].hand, null),
        players,
        randomState: nextRandomState,
      };

  assertStateInvariantsV2(nextState);
  return {
    ok: true,
    state: nextState,
    stateHash: hashStateV2(nextState),
    events: [{ type: "MULLIGAN_SUBMITTED", actor: envelope.actor, replacedCount: selected.length }],
  };
}

function actionReadyV2(state: GameStateV2, actor: PlayerIndex): CommandResultV2 | null {
  if (state.status !== "playing" || state.flow.kind !== "ACTION" || state.decision) {
    return rejectV2(state, "INVALID_FLOW", "当前不处于行动阶段");
  }
  if (state.activePlayer !== actor || state.flow.actor !== actor) {
    return rejectV2(state, "WRONG_ACTOR", "只有当前回合玩家可以执行行动");
  }
  return null;
}

function successV2(state: GameStateV2, events: GameEventV2[]): CommandResultV2 {
  assertStateInvariantsV2(state);
  return { ok: true, state, stateHash: hashStateV2(state), events };
}

function removeFromAllFieldV2(player: PlayerStateV2, cardIds: Set<string>): PlayerStateV2 {
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

function paymentCandidatesV2(player: PlayerStateV2): string[] {
  return [
    ...player.baseCards,
    ...player.baseCovered,
    ...player.field.vanguard,
    ...player.field.flankLeft,
    ...player.field.flankRight,
    ...player.field.rear,
  ];
}

function paymentLevelV2(state: GameStateV2, actor: PlayerIndex, cardIds: readonly string[]): number {
  const covered = new Set(state.players[actor].baseCovered);
  return cardIds.reduce(
    (sum, id) => sum + (covered.has(id) ? 1 : effectiveValueV2(state, id, "level")),
    0,
  );
}

function hasExactPaymentV2(
  state: GameStateV2,
  actor: PlayerIndex,
  candidates: readonly string[],
  requiredLevel: number,
): boolean {
  let reachable = new Set([0]);
  for (const id of candidates) {
    const level = paymentLevelV2(state, actor, [id]);
    reachable = new Set([
      ...reachable,
      ...[...reachable].map((sum) => sum + level).filter((sum) => sum <= requiredLevel),
    ]);
  }
  return reachable.has(requiredLevel);
}

function completeSummonV2(
  state: GameStateV2,
  actor: PlayerIndex,
  cardId: string,
  destination: "base" | FieldZoneV2,
  paymentCardIds: readonly string[],
  summonKind: "action" | "battle_response" | "turn_response",
  paymentAlreadyRetreated = false,
  previouslyRetreatedCardIds: readonly string[] = paymentCardIds,
): CommandResultV2 {
  const retreatedCardIds = paymentAlreadyRetreated ? [...previouslyRetreatedCardIds] : retreatClosureCardIdsV2(state, paymentCardIds);
  const paidState = paymentAlreadyRetreated || paymentCardIds.length === 0 ? state : retreatCardsV2(state, paymentCardIds);
  const player = paidState.players[actor];
  let nextPlayer = player;
  nextPlayer = {
    ...nextPlayer,
    hand: nextPlayer.hand.filter((id) => id !== cardId),
    retreat: nextPlayer.retreat,
    baseCards: destination === "base" ? [...nextPlayer.baseCards, cardId] : nextPlayer.baseCards,
    field: destination === "base"
      ? nextPlayer.field
      : { ...nextPlayer.field, [destination]: [cardId] },
  };
  const summons: [number, number] = [...state.usage.summonsThisTurn];
  if (summonKind === "action") summons[actor] += 1;
  let nextState: GameStateV2 = {
    ...state,
    revision: state.revision + 1,
    decision: null,
    players: replacePlayerV2(paidState.players, actor, nextPlayer),
    attachments: paidState.attachments,
    usage: {
      ...state.usage,
      summonsThisTurn: summons,
      enteredThisTurn: [...state.usage.enteredThisTurn, cardId],
    },
  };
  if (summonKind === "battle_response" && nextState.battle) {
    const priority = otherPlayerV2(actor);
    const responseSummoned: [boolean, boolean] = [...nextState.battle.responseSummoned];
    responseSummoned[actor] = true;
    nextState = {
      ...nextState,
      flow: { kind: "BATTLE_RESPONSE", actor: nextState.activePlayer, priority },
      battle: {
        ...nextState.battle,
        priorityPlayer: priority,
        consecutivePasses: 0,
        responseSummoned,
      },
    };
  }
  if (summonKind === "turn_response" && nextState.turnResponse) {
    const priority = otherPlayerV2(actor);
    const responseSummoned: [boolean, boolean] = [...nextState.turnResponse.responseSummoned];
    responseSummoned[actor] = true;
    nextState = {
      ...nextState,
      flow: { kind: "TURN_RESPONSE", actor: nextState.activePlayer, priority },
      turnResponse: {
        ...nextState.turnResponse,
        priorityPlayer: priority,
        consecutivePasses: 0,
        responseSummoned,
      },
    };
  }
  const checked = applyStateBasedActionsV2(nextState);
  nextState = checked.state;
  return successV2(nextState, [
    ...(retreatedCardIds.length > 0 ? [{ type: "CARDS_RETREATED" as const, cardIds: retreatedCardIds, reason: "summon_payment" as const }] : []),
    {
      type: "CHARACTER_SUMMONED",
      actor,
      cardId,
      destination,
      paymentCardIds: [...paymentCardIds],
      summonKind,
    },
    { type: "CHARACTER_PLACED", actor, cardId, destination, placementKind: "summon" },
    ...checked.events,
  ]);
}

function availableSummonDestinationsV2(state: GameStateV2, actor: PlayerIndex): BattleBaseLocationV2[] {
  const player = state.players[actor];
  return [
    ...(player.baseCards.length + player.baseCovered.length < 6 ? ["base" as const] : []),
    ...fieldZonesV2.filter((zone) => player.field[zone].length === 0),
  ];
}

function beginSummonV2(
  state: GameStateV2,
  actor: PlayerIndex,
  command: Extract<CommandEnvelopeV2["command"], { type: "SUMMON_CHARACTER" }>,
  summonKind: "action" | "battle_response" | "turn_response",
): CommandResultV2 {
  const player = state.players[actor];
  if (!player.hand.includes(command.cardId)) return rejectV2(state, "INVALID_SOURCE", "号召卡牌不在手牌中");
  const card = state.cards[command.cardId];
  if (!card || card.deckKind !== "main") return rejectV2(state, "INVALID_SOURCE", "只能号召角色卡");
  if (summonKind !== "action" && !hasKeywordV2(state, command.cardId, "counter")) {
    return rejectV2(state, "EFFECT_NOT_AVAILABLE", "该手牌角色不具备【应对】，不能进行应对号召");
  }
  if (hasKeywordV2(state, command.cardId, "unique")) {
    const controlledField = [
      ...player.baseCards,
      ...Object.values(player.field).flat(),
      ...Object.values(state.attachments).flat().filter((id) => state.cards[id]?.owner === actor),
    ];
    if (controlledField.some((id) => id !== command.cardId && state.cards[id]?.cardNo === card.cardNo)) {
      return rejectV2(state, "LIMIT_REACHED", "己方场上已经存在同名【唯一】卡牌");
    }
  }
  if (summonKind === "action") {
    const summonLimit = actor === state.firstPlayer && state.turnNumber === 1 ? 1 : 3;
    if (state.usage.summonsThisTurn[actor] >= summonLimit) {
      return rejectV2(state, "LIMIT_REACHED", "本回合行动号召次数已用完");
    }
  }
  const summonLevel = effectiveValueV2(state, command.cardId, "level");
  if (summonLevel >= 4) {
    const candidates = paymentCandidatesV2(player);
    if (!hasExactPaymentV2(state, actor, candidates, summonLevel)) {
      return rejectV2(state, "COST_MISMATCH", "己方场上没有可精确支付该 Lv 的撤退组合");
    }
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      decision: {
        id: `summon-payment:${actor}:${state.revision + 1}`,
        kind: "SUMMON_PAYMENT",
        actor,
        choices: candidates,
        min: 1,
        max: candidates.length,
        prompt: `选择 Lv 合计恰好为 ${summonLevel} 的己方场上卡牌并撤退`,
        requiredLevel: summonLevel,
        continuation: {
          kind: "RESUME_SUMMON_PAYMENT",
          cardId: command.cardId,
          summonKind,
        },
      },
    };
    return successV2(nextState, [{
      type: "SUMMON_PAYMENT_REQUESTED",
      actor,
      cardId: command.cardId,
      requiredLevel: summonLevel,
      summonKind,
    }]);
  }
  if (!command.destination) return rejectV2(state, "INVALID_TARGET", "Lv3 或以下号召必须选择放置位置");
  if (command.destination === "base") {
    if (player.baseCards.length + player.baseCovered.length >= 6) return rejectV2(state, "INVALID_TARGET", "基地区已满");
  } else if (player.field[command.destination].length > 0) {
    return rejectV2(state, "INVALID_TARGET", "目标战区已有角色");
  }
  return completeSummonV2(state, actor, command.cardId, command.destination, [], summonKind);
}

function executeDecisionCommandV2(
  state: GameStateV2,
  envelope: CommandEnvelopeV2,
): CommandResultV2 {
  if (
    state.status !== "playing"
    || !state.decision
    || envelope.command.type !== "ANSWER_DECISION"
  ) {
    return rejectV2(state, "INVALID_FLOW", "当前没有可回答的行动阶段选择");
  }
  const decision = state.decision;
  if (decision.actor !== envelope.actor) {
    return rejectV2(state, "NOT_DECISION_ACTOR", "当前不是该选择的回答玩家");
  }
  if (envelope.command.decisionId !== decision.id) {
    return rejectV2(state, "STALE_DECISION", "选择已过期，请按最新状态重新选择");
  }
  const selected = envelope.command.cardIds;
  if (selected.length < decision.min || selected.length > decision.max) {
    return rejectV2(state, "INVALID_CHOICE_COUNT", "选择数量不符合当前决策要求");
  }
  if (new Set(selected).size !== selected.length) {
    return rejectV2(state, "DUPLICATE_CHOICE", "选择不能包含重复卡牌");
  }
  const available = new Set(decision.choices);
  if (selected.some((id) => !available.has(id))) {
    return rejectV2(state, "CHOICE_NOT_AVAILABLE", "选择包含当前候选之外的卡牌");
  }
  if (decision.kind === "SUMMON_PAYMENT") {
    const expectedFlow = decision.continuation.summonKind === "action"
      ? "ACTION"
      : decision.continuation.summonKind === "battle_response"
        ? "BATTLE_RESPONSE"
        : "TURN_RESPONSE";
    if (state.flow.kind !== expectedFlow) return rejectV2(state, "INVALID_FLOW", "当前不处于号召支付流程");
    if (paymentLevelV2(state, envelope.actor, selected) !== decision.requiredLevel) {
      return rejectV2(state, "COST_MISMATCH", `撤退卡 Lv 合计必须恰好为 ${decision.requiredLevel}`);
    }
    const retreatedCardIds = retreatClosureCardIdsV2(state, selected);
    const paidState = retreatCardsV2(state, selected);
    const destinations = availableSummonDestinationsV2(paidState, envelope.actor);
    if (destinations.length === 0) return rejectV2(state, "INVALID_TARGET", "支付后没有可用的号召位置");
    const nextState: GameStateV2 = {
      ...paidState,
      revision: state.revision + 1,
      decision: {
        id: `summon-destination:${envelope.actor}:${state.revision + 1}`,
        kind: "SUMMON_DESTINATION",
        actor: envelope.actor,
        choices: destinations.map((destination) => `zone:${destination}`),
        min: 1,
        max: 1,
        prompt: "支付已完成，选择角色号召到的基地或战区位置",
        continuation: {
          kind: "RESUME_SUMMON_DESTINATION",
          cardId: decision.continuation.cardId,
          paymentCardIds: [...selected],
          retreatedCardIds,
          summonKind: decision.continuation.summonKind,
        },
      },
    };
    return successV2(nextState, [{
      type: "SUMMON_DESTINATION_REQUESTED",
      actor: envelope.actor,
      cardId: decision.continuation.cardId,
      choices: destinations,
      summonKind: decision.continuation.summonKind,
    }]);
  }
  if (decision.kind === "SUMMON_DESTINATION") {
    const destination = selected[0].replace(/^zone:/, "") as BattleBaseLocationV2;
    if (!availableSummonDestinationsV2(state, envelope.actor).includes(destination)) {
      return rejectV2(state, "INVALID_TARGET", "所选号召位置不再可用");
    }
    return completeSummonV2(
      state,
      envelope.actor,
      decision.continuation.cardId,
      destination,
      decision.continuation.paymentCardIds,
      decision.continuation.summonKind,
      true,
      decision.continuation.retreatedCardIds,
    );
  }
  if (decision.kind === "DISCARD_TO_LIMIT") {
    if (state.flow.kind !== "END_DISCARD") return rejectV2(state, "INVALID_FLOW", "当前不处于弃至手牌上限流程");
    const player = state.players[envelope.actor];
    const selectedSet = new Set(selected);
    const nextPlayer: PlayerStateV2 = {
      ...player,
      hand: player.hand.filter((id) => !selectedSet.has(id)),
      retreat: [...player.retreat, ...selected],
    };
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      decision: null,
      flow: { kind: "TURN_SWITCH", actor: state.activePlayer },
      players: replacePlayerV2(state.players, envelope.actor, nextPlayer),
    };
    return successV2(nextState, [{ type: "CARDS_DISCARDED_TO_LIMIT", actor: envelope.actor, cardIds: [...selected] }]);
  }
  if (decision.kind === "EFFECT_TARGETS") {
    if (decision.continuation.kind === "RESUME_TRIGGER_EFFECT_TARGETS") {
      const { effect, remainingEffects } = decision.continuation;
      const definition = getEffectV2(state.cards[effect.sourceCardId]?.cardNo ?? "", effect.effectId);
      if (!definition) return rejectV2(state, "EFFECT_NOT_IMPLEMENTED", "触发效果定义不存在");
      const targetIssue = definition.validateTargets?.(state, envelope.actor, effect.sourceCardId, selected, { triggerEvent: effect.triggerEvent });
      if (targetIssue) return rejectV2(state, "INVALID_TARGET", targetIssue);
      const { targeting: _resolvedTargeting, ...effectWithoutTargeting } = effect;
      const targetedEffect = {
        ...effectWithoutTargeting,
        operations: definition.buildOperations(state, envelope.actor, effect.sourceCardId, selected, { triggerEvent: effect.triggerEvent }),
      };
      const prepared = prepareEffectResolutionV2(
        { ...state, revision: state.revision + 1, decision: null },
        [targetedEffect, ...remainingEffects],
      );
      return successV2(prepared.state, [{
        type: "EFFECT_TARGETS_SELECTED",
        actor: envelope.actor,
        sourceCardId: effect.sourceCardId,
        effectId: effect.effectId,
        targetCardIds: [...selected],
      }, ...prepared.events]);
    }
    const { sourceCardId, effectId, activationFlow } = decision.continuation;
    const definition = getEffectV2(state.cards[sourceCardId]?.cardNo ?? "", effectId);
    if (!definition) return rejectV2(state, "EFFECT_NOT_IMPLEMENTED", "效果定义不存在");
    const targetIssue = definition.validateTargets?.(state, envelope.actor, sourceCardId, selected);
    if (targetIssue) return rejectV2(state, "INVALID_TARGET", targetIssue);
    const queued = queueActivatedEffectV2(state, envelope.actor, sourceCardId, effectId, selected);
    if (!queued) return rejectV2(state, "EFFECT_NOT_IMPLEMENTED", "效果定义不存在");
    const resolved = resolveEffectQueueV2({ ...queued.state, decision: null });
    let nextState: GameStateV2 = { ...resolved.state, revision: state.revision + 1 };
    if (activationFlow === "battle_response" && nextState.battle) {
      const priority = otherPlayerV2(envelope.actor);
      nextState = {
        ...nextState,
        flow: { kind: "BATTLE_RESPONSE", actor: nextState.activePlayer, priority },
        battle: { ...nextState.battle, priorityPlayer: priority, consecutivePasses: 0 },
      };
    }
    if (activationFlow === "turn_response" && nextState.turnResponse) {
      const priority = otherPlayerV2(envelope.actor);
      nextState = {
        ...nextState,
        flow: { kind: "TURN_RESPONSE", actor: nextState.activePlayer, priority },
        turnResponse: { ...nextState.turnResponse, priorityPlayer: priority, consecutivePasses: 0 },
      };
    }
    return successV2(nextState, [{
      type: "EFFECT_TARGETS_SELECTED",
      actor: envelope.actor,
      sourceCardId,
      effectId,
      targetCardIds: [...selected],
    }, queued.event, ...resolved.events]);
  }
  if (decision.kind === "ORDER_TRIGGERS") {
    const byId = new Map(decision.continuation.currentEffects.map((effect) => [effect.id, effect]));
    const ordered = selected.map((id) => byId.get(id)!);
    const orderedBefore = [...decision.continuation.orderedBefore, ...ordered];
    const remaining = decision.continuation.remainingEffects;
    const nextRevision = state.revision + 1;
    const orderEvent: GameEventV2 = { type: "TRIGGERS_ORDERED", actor: envelope.actor, effectInstanceIds: [...selected] };
    if (remaining.length > 1 && remaining.every((effect) => effect.controller === remaining[0].controller)) {
      const actor = remaining[0].controller;
      const effectInstanceIds = remaining.map((effect) => effect.id);
      const nextState: GameStateV2 = {
        ...state,
        revision: nextRevision,
        decision: {
          id: `trigger-order:${actor}:${nextRevision}`,
          kind: "ORDER_TRIGGERS",
          actor,
          choices: effectInstanceIds,
          min: effectInstanceIds.length,
          max: effectInstanceIds.length,
          prompt: "决定同时触发效果的处理顺序",
          continuation: {
            kind: "RESUME_TRIGGER_ORDER",
            orderedBefore,
            currentEffects: remaining,
            remainingEffects: [],
          },
        },
      };
      return successV2(nextState, [orderEvent, { type: "TRIGGER_ORDER_REQUESTED", actor, effectInstanceIds }]);
    }
    const prepared = prepareEffectResolutionV2(
      { ...state, revision: nextRevision, decision: null },
      [...orderedBefore, ...remaining],
    );
    return successV2(prepared.state, [orderEvent, ...prepared.events]);
  }
  if (decision.kind === "OPTIONAL_EFFECT") {
    const resolve = selected[0] === "resolve";
    const effect = decision.continuation.effect;
    const effects = resolve
      ? [{ ...effect, optional: false }, ...decision.continuation.remainingEffects]
      : decision.continuation.remainingEffects;
    const prepared = prepareEffectResolutionV2(
      { ...state, revision: state.revision + 1, decision: null },
      effects,
    );
    return successV2(prepared.state, [{
      type: "OPTIONAL_EFFECT_CHOSEN",
      actor: envelope.actor,
      effectInstanceId: effect.id,
      resolved: resolve,
    }, ...prepared.events]);
  }
  return rejectV2(state, "INVALID_FLOW", "当前决策不能由通用回答命令处理");
}

function executeActionCommandV2(state: GameStateV2, envelope: CommandEnvelopeV2): CommandResultV2 {
  const readiness = actionReadyV2(state, envelope.actor);
  if (readiness) return readiness;
  const actor = envelope.actor;
  const player = state.players[actor];
  const command = envelope.command;

  if (command.type === "DEPLOY_BASE") {
    if (state.usage.baseDeployedThisTurn) return rejectV2(state, "LIMIT_REACHED", "本回合已经进行过基地部署");
    if (!player.hand.includes(command.cardId)) return rejectV2(state, "INVALID_SOURCE", "基地部署卡牌不在手牌中");
    if (player.baseCards.length + player.baseCovered.length >= 6) return rejectV2(state, "INVALID_TARGET", "基地区已满");
    if (player.deck.length === 0) return rejectV2(state, "DECK_EMPTY", "主卡组为空，无法完成基地部署抽卡");
    const drawn = player.deck[0];
    const nextPlayer: PlayerStateV2 = {
      ...player,
      hand: [...player.hand.filter((id) => id !== command.cardId), drawn],
      deck: player.deck.slice(1),
      baseCovered: [...player.baseCovered, command.cardId],
    };
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      players: replacePlayerV2(state.players, actor, nextPlayer),
      usage: {
        ...state.usage,
        baseDeployedThisTurn: true,
      },
    };
    return successV2(nextState, [{ type: "BASE_DEPLOYED", actor, cardId: command.cardId, drawnCount: 1 }]);
  }

  if (command.type === "SUMMON_CHARACTER") {
    return beginSummonV2(state, actor, command, "action");
  }

  if (command.type === "MOVE_BATTLE_BASE") {
    const fromBase = command.from === "base";
    const toBase = command.destination === "base";
    if (fromBase === toBase) return rejectV2(state, "INVALID_TARGET", "战基移动必须发生在战区与基地之间");
    if (state.usage.movedCardIds.includes(command.cardId)) return rejectV2(state, "CARD_ALREADY_MOVED", "该角色本回合已经战基移动");
    const fromCovered = fromBase && player.baseCovered.includes(command.cardId);
    const sourceContains = fromBase
      ? player.baseCards.includes(command.cardId) || fromCovered
      : player.field[command.from as FieldZoneV2].includes(command.cardId);
    if (!sourceContains) return rejectV2(state, "INVALID_SOURCE", "角色不在声明的来源区域");
    if (state.usage.enteredThisTurn.includes(command.cardId) && !fromCovered) {
      return rejectV2(state, "CARD_ENTERED_THIS_TURN", "本回合放置进场的角色不能战基移动");
    }
    if (toBase) {
      if (player.baseCards.length + player.baseCovered.length >= 6) return rejectV2(state, "INVALID_TARGET", "基地区已满");
    } else if (player.field[command.destination as FieldZoneV2].length > 0) {
      return rejectV2(state, "INVALID_TARGET", "目标战区已有角色");
    }
    let nextPlayer = removeFromAllFieldV2(player, new Set([command.cardId]));
    nextPlayer = toBase
      ? { ...nextPlayer, baseCards: [...nextPlayer.baseCards, command.cardId] }
      : {
          ...nextPlayer,
          field: { ...nextPlayer.field, [command.destination]: [command.cardId] },
        };
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      players: replacePlayerV2(state.players, actor, nextPlayer),
      usage: { ...state.usage, movedCardIds: [...state.usage.movedCardIds, command.cardId] },
    };
    return successV2(nextState, [{ type: "BATTLE_BASE_MOVED", actor, cardId: command.cardId, from: command.from, destination: command.destination }]);
  }

  if (command.type === "END_ACTION_PHASE") {
    const skipBattle = actor === state.firstPlayer && state.turnNumber === 1;
    const next = skipBattle ? "TURN_RESPONSE_START" : "BATTLE_START";
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      flow: { kind: next, actor },
    };
    return successV2(nextState, [{ type: "ACTION_PHASE_ENDED", actor, next }]);
  }

  return rejectV2(state, "INVALID_FLOW", "当前行动阶段不接受该命令");
}

const fieldZonesV2: FieldZoneV2[] = ["vanguard", "flankLeft", "flankRight", "rear"];

function locateFieldCardV2(player: PlayerStateV2, cardId: string): FieldZoneV2 | null {
  return fieldZonesV2.find((zone) => player.field[zone].includes(cardId)) ?? null;
}

function battleRankV2(owner: PlayerIndex, zone: FieldZoneV2, activePlayer: PlayerIndex): number {
  const own = owner === activePlayer;
  if (own) {
    if (zone === "rear") return 0;
    if (zone === "vanguard") return 2;
    return 1;
  }
  if (zone === "vanguard") return 3;
  if (zone === "rear") return 5;
  return 4;
}

export function battleDistanceV2(
  activePlayer: PlayerIndex,
  attackerZone: FieldZoneV2,
  targetOwner: PlayerIndex,
  targetZone: FieldZoneV2,
): number {
  return Math.abs(
    battleRankV2(activePlayer, attackerZone, activePlayer)
      - battleRankV2(targetOwner, targetZone, activePlayer),
  );
}

function validateAttackTargetV2(
  state: GameStateV2,
  actor: PlayerIndex,
  attackerId: string,
  target: AttackTargetV2,
): CommandResultV2 | null {
  const attackerZone = locateFieldCardV2(state.players[actor], attackerId);
  const attacker = state.cards[attackerId];
  const attackerRange = effectiveValueV2(state, attackerId, "range");
  if (!attackerZone || !attacker || attackerRange <= 0) {
    return rejectV2(state, "CARD_CANNOT_ATTACK", "攻击角色不在战区或 R 为 0");
  }
  const defender = otherPlayerV2(actor);
  let targetZone: FieldZoneV2;
  if (target.kind === "character") {
    targetZone = locateFieldCardV2(state.players[defender], target.cardId) as FieldZoneV2;
    if (!targetZone) return rejectV2(state, "INVALID_TARGET", "目标角色不在敌方战区");
  } else {
    targetZone = target.zone;
    if (state.players[defender].field[targetZone].length > 0 && !hasKeywordV2(state, attackerId, "airRaid")) {
      return rejectV2(state, "INVALID_TARGET", "该战区不是破绽；只有【空袭】可以攻击有角色的战区破绽");
    }
  }
  if (battleDistanceV2(actor, attackerZone, defender, targetZone) > attackerRange) {
    return rejectV2(state, "ATTACK_OUT_OF_RANGE", "目标超出攻击者 R 范围");
  }
  return null;
}

function hasLegalAttackTargetV2(state: GameStateV2, actor: PlayerIndex, attackerId: string): boolean {
  const defender = otherPlayerV2(actor);
  return fieldZonesV2.some((zone) => {
    const targetId = state.players[defender].field[zone][0];
    const targets: AttackTargetV2[] = [
      ...(targetId ? [{ kind: "character" as const, cardId: targetId }] : []),
      { kind: "breach", zone },
    ];
    return targets.some((target) => validateAttackTargetV2(state, actor, attackerId, target) === null);
  });
}

function cancelSummonPaymentV2(
  state: GameStateV2,
  envelope: CommandEnvelopeV2,
): CommandResultV2 {
  if (state.status !== "playing" || state.decision?.kind !== "SUMMON_PAYMENT" || envelope.command.type !== "CANCEL_SUMMON_PAYMENT") {
    return rejectV2(state, "INVALID_FLOW", "当前没有可取消的号召支付");
  }
  const decision = state.decision;
  if (decision.actor !== envelope.actor) return rejectV2(state, "NOT_DECISION_ACTOR", "当前不是该选择的回答玩家");
  if (envelope.command.decisionId !== decision.id) return rejectV2(state, "STALE_DECISION", "选择已过期，请按最新状态重新选择");
  return successV2(
    { ...state, revision: state.revision + 1, decision: null },
    [{ type: "SUMMON_PAYMENT_CANCELLED", actor: envelope.actor, cardId: decision.continuation.cardId }],
  );
}

function cancelEffectTargetsV2(
  state: GameStateV2,
  envelope: CommandEnvelopeV2,
): CommandResultV2 {
  if (state.status !== "playing" || state.decision?.kind !== "EFFECT_TARGETS" || envelope.command.type !== "CANCEL_EFFECT_TARGETS") {
    return rejectV2(state, "INVALID_FLOW", "当前没有可取消的效果目标选择");
  }
  const decision = state.decision;
  if (decision.actor !== envelope.actor) return rejectV2(state, "NOT_DECISION_ACTOR", "当前不是该选择的回答玩家");
  if (envelope.command.decisionId !== decision.id) return rejectV2(state, "STALE_DECISION", "选择已过期，请按最新状态重新选择");
  const sourceCardId = decision.continuation.kind === "RESUME_TRIGGER_EFFECT_TARGETS"
    ? decision.continuation.effect.sourceCardId
    : decision.continuation.sourceCardId;
  const effectId = decision.continuation.kind === "RESUME_TRIGGER_EFFECT_TARGETS"
    ? decision.continuation.effect.effectId
    : decision.continuation.effectId;
  const cancelledEvent: GameEventV2 = { type: "EFFECT_TARGETS_CANCELLED", actor: envelope.actor, sourceCardId, effectId };
  if (decision.continuation.kind === "RESUME_TRIGGER_EFFECT_TARGETS") {
    const prepared = prepareEffectResolutionV2(
      { ...state, revision: state.revision + 1, decision: null },
      decision.continuation.remainingEffects,
    );
    return successV2(prepared.state, [cancelledEvent, ...prepared.events]);
  }
  return successV2({ ...state, revision: state.revision + 1, decision: null }, [cancelledEvent]);
}

function resolveBattleJudgmentV2(state: GameStateV2, actor: PlayerIndex): CommandResultV2 {
  const battle = state.battle;
  if (!battle?.attackerId || !battle.target) return rejectV2(state, "INVALID_FLOW", "缺少待判定战斗");
  const events: GameEventV2[] = [];
  let players = state.players;
  let attachments = state.attachments;
  let winner: PlayerIndex | null = null;

  if (battle.target.kind === "character") {
    const attackerPower = effectiveValueV2(state, battle.attackerId, "power");
    const targetPower = effectiveValueV2(state, battle.target.cardId, "power");
    const attackerWon = attackerPower > targetPower;
    const retreated = attackerPower === targetPower
      ? [battle.attackerId, battle.target.cardId].filter((id) => !preventsTieRetreatV2(state, id))
      : attackerPower < targetPower
        ? [battle.attackerId]
        : [battle.target.cardId];
    const allRetreated = retreatClosureCardIdsV2(state, retreated);
    const retreatedState = retreatCardsV2(state, retreated);
    players = retreatedState.players;
    attachments = retreatedState.attachments;
    const tied = attackerPower === targetPower;
    const winnerCardId = tied ? null : attackerPower > targetPower ? battle.attackerId : battle.target.cardId;
    const defeatedCardIds = tied ? [] : retreated;
    if (allRetreated.length > 0) events.push({ type: "CARDS_RETREATED", cardIds: allRetreated, reason: "battle" });
    events.push({ type: "CHARACTERS_RETREATED_BY_BATTLE", cardIds: allRetreated });
    events.push({ type: "CHARACTER_BATTLE_RESOLVED", attackerId: battle.attackerId, targetId: battle.target.cardId, winnerCardId, defeatedCardIds, tied });
    if (attackerWon && hasKeywordV2(state, battle.attackerId, "assault")) {
      const defender = otherPlayerV2(actor);
      const attackerState = players[actor];
      const rushCardId = attackerState.rushDeck[0];
      if (!rushCardId) return rejectV2(state, "INVALID_FLOW", "进攻方冲击卡组为空");
      const nextAttacker: PlayerStateV2 = {
        ...attackerState,
        rushDeck: attackerState.rushDeck.slice(1),
        timeline: [...attackerState.timeline, rushCardId],
      };
      players = replacePlayerV2(players, actor, nextAttacker);
      events.push({ type: "BREACH_HIT", attacker: actor, defender, rushCardId });
      if (nextAttacker.timeline.length >= 9) winner = actor;
    }
  } else {
    const defender = otherPlayerV2(actor);
    const attackerState = state.players[actor];
    const rushCardId = attackerState.rushDeck[0];
    if (!rushCardId) return rejectV2(state, "INVALID_FLOW", "进攻方冲击卡组为空");
    const nextAttacker: PlayerStateV2 = {
      ...attackerState,
      rushDeck: attackerState.rushDeck.slice(1),
      timeline: [...attackerState.timeline, rushCardId],
    };
    players = replacePlayerV2(state.players, actor, nextAttacker);
    events.push({ type: "BREACH_HIT", attacker: actor, defender, rushCardId });
    if (nextAttacker.timeline.length >= 9) winner = actor;
  }

  if (winner !== null) {
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      status: "finished",
      flow: { kind: "FINISHED", actor: winner },
      players,
      attachments,
      battle: null,
      turnResponse: null,
      winner,
    };
    events.push({ type: "GAME_WON", winner, reason: "timeline" });
    return successV2(nextState, events);
  }

  const checked = applyStateBasedActionsV2({ ...state, players, attachments });
  players = checked.state.players;
  attachments = checked.state.attachments;
  events.push(...checked.events);

  const attackerStillPresent = locateFieldCardV2(players[actor], battle.attackerId) !== null;
  const hasNextOpportunity = attackerStillPresent
    && consumedAttackOpportunitiesV2(state, battle.attackerId) < attackOpportunityLimitV2(state, battle.attackerId);
  const nextBattle: BattleContextV2 = {
    ...battle,
    cursor: battle.cursor + (hasNextOpportunity ? 0 : 1),
    attackerId: null,
    target: null,
    priorityPlayer: null,
    consecutivePasses: 0,
    responseSummoned: [false, false],
  };
  const nextState: GameStateV2 = {
    ...checked.state,
    revision: state.revision + 1,
    players,
    attachments,
    flow: { kind: "BATTLE_NEXT", actor },
    battle: nextBattle,
  };
  return successV2(nextState, events);
}

function executeBattleCommandV2(state: GameStateV2, envelope: CommandEnvelopeV2): CommandResultV2 {
  if (state.status !== "playing") return rejectV2(state, "INVALID_FLOW", "当前不处于游戏中");
  const actor = envelope.actor;
  const command = envelope.command;

  if (state.flow.kind === "BATTLE_ADJUST" && command.type === "SUBMIT_BATTLE_LAYOUT") {
    if (actor !== state.activePlayer) return rejectV2(state, "WRONG_ACTOR", "只有回合玩家可以调整战区");
    const current = Object.values(state.players[actor].field).flat();
    const submitted = Object.values(command.layout).filter((id): id is string => id !== null);
    if (
      new Set(submitted).size !== submitted.length
      || submitted.length !== current.length
      || submitted.some((id) => !current.includes(id))
    ) {
      return rejectV2(state, "INVALID_LAYOUT", "战区调整必须是己方现有战区角色的完整原子排列");
    }
    const nextPlayer: PlayerStateV2 = {
      ...state.players[actor],
      field: Object.fromEntries(
        fieldZonesV2.map((zone) => [zone, command.layout[zone] ? [command.layout[zone] as string] : []]),
      ) as PlayerStateV2["field"],
    };
    const order: FieldZoneV2[] = ["vanguard", "flankLeft", "flankRight", "rear"];
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      players: replacePlayerV2(state.players, actor, nextPlayer),
      flow: { kind: "BATTLE_NEXT", actor },
      battle: {
        order,
        cursor: 0,
        flankOrderChosen: false,
        attackerId: null,
        target: null,
        attackedCardIds: [],
        priorityPlayer: null,
        consecutivePasses: 0,
        responseSummoned: [false, false],
      },
    };
    return successV2(nextState, [{ type: "BATTLE_LAYOUT_SUBMITTED", actor, order }]);
  }

  if (state.flow.kind === "BATTLE_FLANK_CHOICE" && command.type === "CHOOSE_FLANK_ATTACKER") {
    if (actor !== state.activePlayer) return rejectV2(state, "WRONG_ACTOR", "只有回合玩家可以选择先攻击的侧翼");
    if (!state.battle || !state.flow.choices.includes(command.zone)) {
      return rejectV2(state, "INVALID_TARGET", "所选侧翼当前没有攻击机会");
    }
    const other = command.zone === "flankLeft" ? "flankRight" : "flankLeft";
    const order: FieldZoneV2[] = ["vanguard", command.zone, other, "rear"];
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      flow: { kind: "BATTLE_NEXT", actor },
      battle: { ...state.battle, order, cursor: 1, flankOrderChosen: true },
    };
    return successV2(nextState, [{ type: "FLANK_ATTACKER_CHOSEN", actor, zone: command.zone }]);
  }

  if (state.flow.kind === "BATTLE_ATTACK") {
    if (actor !== state.activePlayer) return rejectV2(state, "WRONG_ACTOR", "只有回合玩家处理攻击机会");
    if (!state.battle || state.flow.attackerId !== state.battle.attackerId) {
      return rejectV2(state, "INVALID_FLOW", "攻击机会状态不完整");
    }
    const attackerId = state.flow.attackerId;
    if (command.type === "PASS_ATTACK_OPPORTUNITY") {
      if (command.attackerId !== attackerId) return rejectV2(state, "INVALID_SOURCE", "放弃的不是当前攻击角色");
      const attackedCardIds = [...state.battle.attackedCardIds, attackerId];
      const consumed = attackedCardIds.filter((id) => id === attackerId).length;
      const nextBattle: BattleContextV2 = {
        ...state.battle,
        cursor: state.battle.cursor + (consumed < attackOpportunityLimitV2(state, attackerId) ? 0 : 1),
        attackerId: null,
        attackedCardIds,
      };
      const nextState: GameStateV2 = {
        ...state,
        revision: state.revision + 1,
        flow: { kind: "BATTLE_NEXT", actor },
        battle: nextBattle,
        usage: {
          ...state.usage,
          attackedCardIdsByPlayer: state.usage.attackedCardIdsByPlayer.map((ids, seat) => seat === actor && !ids.includes(attackerId) ? [...ids, attackerId] : [...ids]) as [string[], string[]],
        },
      };
      return successV2(nextState, [{ type: "ATTACK_OPPORTUNITY_PASSED", actor, attackerId }]);
    }
    if (command.type === "DECLARE_ATTACK") {
      if (command.attackerId !== attackerId) return rejectV2(state, "INVALID_SOURCE", "声明的不是当前攻击角色");
      const invalidTarget = validateAttackTargetV2(state, actor, attackerId, command.target);
      if (invalidTarget) return invalidTarget;
      const priority = otherPlayerV2(actor);
      const nextBattle: BattleContextV2 = {
        ...state.battle,
        attackerId,
        target: command.target,
        attackedCardIds: [...state.battle.attackedCardIds, attackerId],
        priorityPlayer: priority,
        consecutivePasses: 0,
        responseSummoned: [false, false],
      };
      const nextState: GameStateV2 = {
        ...state,
        revision: state.revision + 1,
        flow: { kind: "BATTLE_RESPONSE", actor, priority },
        battle: nextBattle,
        usage: {
          ...state.usage,
          attackedCardIdsByPlayer: state.usage.attackedCardIdsByPlayer.map((ids, seat) => seat === actor && !ids.includes(attackerId) ? [...ids, attackerId] : [...ids]) as [string[], string[]],
        },
      };
      return successV2(nextState, [{ type: "ATTACK_DECLARED", actor, attackerId, target: command.target }]);
    }
  }

  if (state.flow.kind === "BATTLE_TARGET" && command.type === "DECLARE_ATTACK") {
    if (actor !== state.activePlayer) return rejectV2(state, "WRONG_ACTOR", "只有回合玩家可以重选攻击目标");
    if (!state.battle || command.attackerId !== state.flow.attackerId || state.battle.attackerId !== command.attackerId) {
      return rejectV2(state, "INVALID_SOURCE", "重选目标的攻击者不一致");
    }
    const invalidTarget = validateAttackTargetV2(state, actor, command.attackerId, command.target);
    if (invalidTarget) return invalidTarget;
    const priority = otherPlayerV2(actor);
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      flow: { kind: "BATTLE_RESPONSE", actor, priority },
      battle: {
        ...state.battle,
        target: command.target,
        priorityPlayer: priority,
        consecutivePasses: 0,
        responseSummoned: [false, false],
      },
    };
    return successV2(nextState, [{ type: "ATTACK_DECLARED", actor, attackerId: command.attackerId, target: command.target }]);
  }

  if (state.flow.kind === "BATTLE_RESPONSE" && command.type === "ACTIVATE_KEYWORD") {
    if (!state.battle || state.battle.priorityPlayer !== actor || state.flow.priority !== actor) {
      return rejectV2(state, "WRONG_ACTOR", "当前不由该玩家持有战斗应对优先权");
    }
    if (command.keyword !== "intercept" || !hasKeywordV2(state, command.sourceCardId, "intercept")) {
      return rejectV2(state, "EFFECT_NOT_AVAILABLE", "该角色不具备【拦截】");
    }
    if (state.cards[command.sourceCardId]?.owner !== actor || !locateFieldCardV2(state.players[actor], command.sourceCardId)) {
      return rejectV2(state, "INVALID_SOURCE", "【拦截】来源必须是己方战区角色");
    }
    if ((state.usage.interceptUsedCardIds ?? []).includes(command.sourceCardId)) {
      return rejectV2(state, "LIMIT_REACHED", "该角色本回合已经使用过【拦截】");
    }
    if (state.battle.target?.kind === "character" && state.battle.target.cardId === command.sourceCardId) {
      return rejectV2(state, "INVALID_TARGET", "当前攻击目标已经是该【拦截】角色");
    }
    const attackerId = state.battle.attackerId;
    if (!attackerId) return rejectV2(state, "INVALID_FLOW", "【拦截】缺少当前攻击者");
    const target: AttackTargetV2 = { kind: "character", cardId: command.sourceCardId };
    const invalidTarget = validateAttackTargetV2(state, state.activePlayer, attackerId, target);
    if (invalidTarget) return invalidTarget;
    const priority = otherPlayerV2(actor);
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      flow: { kind: "BATTLE_RESPONSE", actor: state.activePlayer, priority },
      battle: { ...state.battle, target, priorityPlayer: priority, consecutivePasses: 0 },
      usage: { ...state.usage, interceptUsedCardIds: [...(state.usage.interceptUsedCardIds ?? []), command.sourceCardId] },
    };
    return successV2(nextState, [{ type: "KEYWORD_ACTIVATED", actor, sourceCardId: command.sourceCardId, keyword: "intercept" }]);
  }

  if (state.flow.kind === "BATTLE_RESPONSE" && command.type === "PASS_PRIORITY") {
    if (!state.battle || state.battle.priorityPlayer !== actor || state.flow.priority !== actor) {
      return rejectV2(state, "WRONG_ACTOR", "当前不由该玩家持有战斗应对优先权");
    }
    const passEvent: GameEventV2 = { type: "PRIORITY_PASSED", actor, scope: "battle" };
    if (state.battle.consecutivePasses + 1 >= 2) {
      const attackerId = state.battle.attackerId;
      const target = state.battle.target;
      if (!attackerId || !target) return rejectV2(state, "INVALID_FLOW", "应对步骤缺少攻击者或目标");
      const targetInvalid = validateAttackTargetV2(state, state.activePlayer, attackerId, target);
      if (targetInvalid) {
        const canReselect = hasLegalAttackTargetV2(state, state.activePlayer, attackerId);
        const nextBattle: BattleContextV2 = {
          ...state.battle,
          cursor: canReselect ? state.battle.cursor : state.battle.cursor + 1,
          target: null,
          priorityPlayer: null,
          consecutivePasses: 0,
          responseSummoned: [false, false],
        };
        const nextState: GameStateV2 = {
          ...state,
          revision: state.revision + 1,
          flow: canReselect
            ? { kind: "BATTLE_TARGET", actor: state.activePlayer, attackerId }
            : { kind: "BATTLE_NEXT", actor: state.activePlayer },
          battle: nextBattle,
        };
        return successV2(nextState, [
          passEvent,
          { type: "ATTACK_TARGET_INVALIDATED", actor: state.activePlayer, attackerId, canReselect },
        ]);
      }
      const result = resolveBattleJudgmentV2(state, state.activePlayer);
      if (!result.ok) return result;
      return successV2(result.state, [passEvent, ...result.events]);
    }
    const priority = otherPlayerV2(actor);
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      flow: { kind: "BATTLE_RESPONSE", actor: state.activePlayer, priority },
      battle: { ...state.battle, priorityPlayer: priority, consecutivePasses: 1 },
    };
    return successV2(nextState, [passEvent]);
  }

  if (state.flow.kind === "BATTLE_RESPONSE" && command.type === "SUMMON_CHARACTER") {
    if (!state.battle || state.battle.priorityPlayer !== actor || state.flow.priority !== actor) {
      return rejectV2(state, "WRONG_ACTOR", "当前不由该玩家持有战斗应对优先权");
    }
    if (state.battle.responseSummoned[actor]) {
      return rejectV2(state, "LIMIT_REACHED", "该玩家本次战斗应对已进行过应对号召");
    }
    return beginSummonV2(state, actor, command, "battle_response");
  }

  if (state.flow.kind === "TURN_RESPONSE" && command.type === "PASS_PRIORITY") {
    const response = state.turnResponse;
    if (!response || response.priorityPlayer !== actor || state.flow.priority !== actor) {
      return rejectV2(state, "WRONG_ACTOR", "当前不由该玩家持有回合应对优先权");
    }
    const passEvent: GameEventV2 = { type: "PRIORITY_PASSED", actor, scope: "turn" };
    if (response.consecutivePasses + 1 >= 2) {
      const nextState: GameStateV2 = {
        ...state,
        revision: state.revision + 1,
        flow: { kind: "END_TRIGGER", actor: state.activePlayer },
        turnResponse: null,
      };
      return successV2(nextState, [passEvent]);
    }
    const priority = otherPlayerV2(actor);
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      flow: { kind: "TURN_RESPONSE", actor: state.activePlayer, priority },
      turnResponse: { ...response, priorityPlayer: priority, consecutivePasses: 1 },
    };
    return successV2(nextState, [passEvent]);
  }

  if (state.flow.kind === "TURN_RESPONSE" && command.type === "SUMMON_CHARACTER") {
    if (!state.turnResponse || state.turnResponse.priorityPlayer !== actor || state.flow.priority !== actor) {
      return rejectV2(state, "WRONG_ACTOR", "当前不由该玩家持有回合应对优先权");
    }
    if (state.turnResponse.responseSummoned[actor]) {
      return rejectV2(state, "LIMIT_REACHED", "该玩家本回合应对已进行过应对号召");
    }
    return beginSummonV2(state, actor, command, "turn_response");
  }

  return rejectV2(state, "INVALID_FLOW", "当前战斗或应对流程不接受该命令");
}

function executeEffectCommandV2(state: GameStateV2, envelope: CommandEnvelopeV2): CommandResultV2 {
  if (envelope.command.type !== "ACTIVATE_EFFECT" || state.status !== "playing" || state.decision) {
    return rejectV2(state, "INVALID_FLOW", "当前不能起动效果");
  }
  const actor = envelope.actor;
  const { sourceCardId, effectId } = envelope.command;
  const card = state.cards[sourceCardId];
  if (!card || card.owner !== actor) return rejectV2(state, "INVALID_SOURCE", "效果来源不属于该玩家");
  const player = state.players[actor];
  const controlled = new Set([
    ...player.hand,
    ...player.baseCards,
    ...Object.values(player.field).flat(),
    ...player.retreat,
    ...player.timeline,
    ...Object.values(state.attachments).flat().filter((id) => state.cards[id]?.owner === actor),
  ]);
  if (!controlled.has(sourceCardId)) return rejectV2(state, "INVALID_SOURCE", "效果来源不在可起动区域");
  const definition = getEffectV2(card.cardNo, effectId);
  if (!definition) return rejectV2(state, "EFFECT_NOT_IMPLEMENTED", "该卡效果尚未进入 V2 可用卡池");
  const sourceZone = player.hand.includes(sourceCardId)
    ? "hand"
    : Object.values(player.field).flat().includes(sourceCardId)
      ? "field"
      : player.baseCards.includes(sourceCardId)
        ? "base"
        : player.retreat.includes(sourceCardId)
          ? "retreat"
          : player.timeline.includes(sourceCardId)
            ? "timeline"
            : "attachment";
  if (definition.sourceZones && !definition.sourceZones.includes(sourceZone)) {
    return rejectV2(state, "EFFECT_NOT_AVAILABLE", "效果来源不在允许的区域");
  }
  if (definition.canActivate && !definition.canActivate(state, actor, sourceCardId)) {
    return rejectV2(state, "EFFECT_NOT_AVAILABLE", "该效果的起动条件尚未满足");
  }
  if (definition.condition && !definition.condition(state, actor, sourceCardId)) {
    return rejectV2(state, "EFFECT_NOT_AVAILABLE", "该效果的规则条件尚未满足");
  }

  // 1.02：应对·起动除应对时机外，也能在控制者自己的行动阶段起动。
  const inAction = state.flow.kind === "ACTION"
    && actor === state.activePlayer
    && (definition.activation === "action" || definition.activation === "response");
  const inBattleResponse = state.flow.kind === "BATTLE_RESPONSE"
    && state.flow.priority === actor
    && state.battle?.priorityPlayer === actor
    && definition.activation === "response";
  const inTurnResponse = state.flow.kind === "TURN_RESPONSE"
    && state.flow.priority === actor
    && state.turnResponse?.priorityPlayer === actor
    && definition.activation === "response";
  if (!inAction && !inBattleResponse && !inTurnResponse) {
    return rejectV2(state, "EFFECT_NOT_AVAILABLE", "该效果不能在当前时点起动");
  }
  if (definition.targeting) {
    const targeting = definition.targeting(state, actor, sourceCardId);
    const choices = [...new Set(targeting.choices)].filter((id) => targeting.choiceKind && targeting.choiceKind !== "card" ? true : Boolean(state.cards[id]));
    if (targeting.min < 0 || targeting.max < targeting.min || targeting.max > choices.length) {
      return rejectV2(state, "EFFECT_NOT_AVAILABLE", "效果目标配置无效或没有足够的合法目标");
    }
    const activationFlow = inAction ? "action" : inBattleResponse ? "battle_response" : "turn_response";
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      decision: {
        id: `effect-targets:${actor}:${state.revision + 1}:${sourceCardId}:${effectId}`,
        kind: "EFFECT_TARGETS",
        actor,
        choices,
        min: targeting.min,
        max: targeting.max,
        prompt: targeting.prompt,
        choiceKind: targeting.choiceKind ?? "card",
        continuation: { kind: "RESUME_EFFECT_TARGETS", sourceCardId, effectId, activationFlow },
      },
    };
    return successV2(nextState, [{
      type: "EFFECT_TARGETS_REQUESTED",
      actor,
      sourceCardId,
      effectId,
      min: targeting.min,
      max: targeting.max,
    }]);
  }
  const queued = queueActivatedEffectV2(state, actor, sourceCardId, effectId);
  if (!queued) return rejectV2(state, "EFFECT_NOT_IMPLEMENTED", "效果定义不存在");
  const resolved = resolveEffectQueueV2(queued.state);
  let nextState: GameStateV2 = { ...resolved.state, revision: state.revision + 1 };
  if (inBattleResponse && nextState.battle) {
    const priority = otherPlayerV2(actor);
    nextState = {
      ...nextState,
      flow: { kind: "BATTLE_RESPONSE", actor: nextState.activePlayer, priority },
      battle: { ...nextState.battle, priorityPlayer: priority, consecutivePasses: 0 },
    };
  }
  if (inTurnResponse && nextState.turnResponse) {
    const priority = otherPlayerV2(actor);
    nextState = {
      ...nextState,
      flow: { kind: "TURN_RESPONSE", actor: nextState.activePlayer, priority },
      turnResponse: { ...nextState.turnResponse, priorityPlayer: priority, consecutivePasses: 0 },
    };
  }
  return successV2(nextState, [queued.event, ...resolved.events]);
}

/** 服务端自动推进所有不需要外部选择的流程；客户端不能指定下一阶段。 */
export function advanceAutomaticFlowV2(state: GameStateV2): CommandResultV2 {
  if (state.status !== "playing") return rejectV2(state, "INVALID_FLOW", "当前对局不能自动推进");
  const actor = state.activePlayer;

  if (state.flow.kind === "TURN_START") {
    const player = state.players[actor];
    const drawn = player.deck.slice(0, 2);
    const nextPlayer = { ...player, hand: [...player.hand, ...drawn], deck: player.deck.slice(drawn.length) };
    const events: GameEventV2[] = [{ type: "TURN_CARDS_DRAWN", actor, count: drawn.length }];
    if (nextPlayer.deck.length === 0) {
      const winner = otherPlayerV2(actor);
      const finished: GameStateV2 = {
        ...state,
        revision: state.revision + 1,
        status: "finished",
        flow: { kind: "FINISHED", actor: winner },
        players: replacePlayerV2(state.players, actor, nextPlayer),
        winner,
      };
      events.push({ type: "GAME_WON", winner, reason: "deck_empty" });
      return successV2(finished, events);
    }
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      flow: { kind: "ACTION", actor },
      players: replacePlayerV2(state.players, actor, nextPlayer),
      usage: {
        summonsThisTurn: [0, 0],
        baseDeployedThisTurn: false,
        movedCardIds: [],
        enteredThisTurn: [],
        interceptUsedCardIds: [],
        attackedCardIdsByPlayer: (state.usage.attackedCardIdsByPlayer ?? [[], []]).map((ids, seat) => seat === actor ? [] : [...ids]) as [string[], string[]],
        effectUseKeysThisTurn: [],
      },
    };
    return successV2(nextState, events);
  }

  if (state.flow.kind === "BATTLE_START") {
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      flow: { kind: "BATTLE_ADJUST", actor },
      battle: {
        order: ["vanguard", "flankLeft", "flankRight", "rear"],
        cursor: 0,
        flankOrderChosen: false,
        attackerId: null,
        target: null,
        attackedCardIds: [],
        priorityPlayer: null,
        consecutivePasses: 0,
        responseSummoned: [false, false],
      },
    };
    return successV2(nextState, [{ type: "BATTLE_PHASE_STARTED", actor }]);
  }

  if (state.flow.kind === "BATTLE_NEXT") {
    if (!state.battle) return rejectV2(state, "INVALID_FLOW", "缺少战斗上下文");
    let cursor = state.battle.cursor;
    while (cursor < state.battle.order.length) {
      if (cursor === 1 && state.battle.flankOrderChosen !== true) {
        const choices = (["flankLeft", "flankRight"] as const).filter((zone) => {
          const candidateId = state.players[actor].field[zone][0];
          return Boolean(candidateId)
            && consumedAttackOpportunitiesV2(state, candidateId) < attackOpportunityLimitV2(state, candidateId)
            && effectiveValueV2(state, candidateId, "range") > 0;
        });
        if (choices.length === 2) {
          const nextState: GameStateV2 = {
            ...state,
            revision: state.revision + 1,
            flow: { kind: "BATTLE_FLANK_CHOICE", actor, choices: ["flankLeft", "flankRight"] },
            battle: { ...state.battle, cursor },
          };
          return successV2(nextState, []);
        }
      }
      const zone = state.battle.order[cursor];
      const attackerId = state.players[actor].field[zone][0];
      if (
        attackerId
        && consumedAttackOpportunitiesV2(state, attackerId) < attackOpportunityLimitV2(state, attackerId)
        && effectiveValueV2(state, attackerId, "range") > 0
      ) {
        const nextState: GameStateV2 = {
          ...state,
          revision: state.revision + 1,
          flow: { kind: "BATTLE_ATTACK", actor, zone, attackerId },
          battle: { ...state.battle, cursor, attackerId },
        };
        return successV2(nextState, []);
      }
      cursor += 1;
    }
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      flow: { kind: "TURN_RESPONSE_START", actor },
      battle: null,
    };
    return successV2(nextState, [{ type: "BATTLE_PHASE_ENDED", actor }]);
  }

  if (state.flow.kind === "TURN_RESPONSE_START") {
    const priority = otherPlayerV2(actor);
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      flow: { kind: "TURN_RESPONSE", actor, priority },
      turnResponse: { priorityPlayer: priority, consecutivePasses: 0, responseSummoned: [false, false] },
    };
    return successV2(nextState, [{ type: "TURN_RESPONSE_STARTED", actor, priority }]);
  }

  if (state.flow.kind === "END_TRIGGER") {
    const nextState: GameStateV2 = { ...state, revision: state.revision + 1, flow: { kind: "END_EXPIRE", actor } };
    return successV2(nextState, [{ type: "END_TRIGGERS_PROCESSED", actor }]);
  }

  if (state.flow.kind === "END_EXPIRE") {
    const excess = Math.max(0, state.players[actor].hand.length - 9);
    const events: GameEventV2[] = [{ type: "TURN_EFFECTS_EXPIRED", actor }];
    const modifiers = state.modifiers.filter((modifier) => modifier.duration !== "turn");
    const keywordGrants = (state.keywordGrants ?? []).filter((grant) => grant.duration !== "turn");
    if (excess > 0) {
      const nextState: GameStateV2 = {
        ...state,
        revision: state.revision + 1,
        modifiers,
        keywordGrants,
        flow: { kind: "END_DISCARD", actor },
        decision: {
          id: `discard-to-limit:${actor}:${state.revision + 1}`,
          kind: "DISCARD_TO_LIMIT",
          actor,
          choices: [...state.players[actor].hand],
          min: excess,
          max: excess,
          prompt: `选择 ${excess} 张手牌舍弃，使手牌回到 9 张`,
          continuation: { kind: "RESUME_TURN_SWITCH" },
        },
      };
      events.push({ type: "DISCARD_TO_LIMIT_REQUESTED", actor, count: excess });
      return successV2(nextState, events);
    }
    const nextState: GameStateV2 = { ...state, revision: state.revision + 1, modifiers, keywordGrants, flow: { kind: "TURN_SWITCH", actor } };
    return successV2(nextState, events);
  }

  if (state.flow.kind === "TURN_SWITCH") {
    const nextActor = otherPlayerV2(actor);
    const turnNumber = state.turnNumber + 1;
    const nextState: GameStateV2 = {
      ...state,
      revision: state.revision + 1,
      activePlayer: nextActor,
      turnNumber,
      flow: { kind: "TURN_START", actor: nextActor },
      decision: null,
      battle: null,
      turnResponse: null,
    };
    return successV2(nextState, [{ type: "TURN_ENDED", actor, nextActor, turnNumber }]);
  }

  return rejectV2(state, "INVALID_FLOW", "当前没有可自动推进的流程");
}

export function executeCommandV2(state: GameStateV2, envelope: CommandEnvelopeV2): CommandResultV2 {
  if (state.status === "finished") return rejectV2(state, "GAME_FINISHED", "对局已经结束");
  if (envelope.expectedRevision !== state.revision) return rejectV2(state, "STALE_REVISION", "命令基于过期状态");
  if (!allowedCommandTypesV2(state, envelope.actor).includes(envelope.command.type)) {
    if (state.decision && state.decision.actor !== envelope.actor) {
      return rejectV2(state, "NOT_DECISION_ACTOR", "当前不是该选择的回答玩家");
    }
    const priority = state.flow.kind === "BATTLE_RESPONSE" || state.flow.kind === "TURN_RESPONSE"
      ? state.flow.priority
      : state.activePlayer;
    if (state.status === "playing" && priority !== envelope.actor) {
      return rejectV2(state, "WRONG_ACTOR", "当前玩家没有该流程的操作权");
    }
    return rejectV2(state, "INVALID_FLOW", "当前流程不接受该命令");
  }
  if (envelope.command.type === "SUBMIT_MULLIGAN") return executeMulliganCommandV2(state, envelope);
  if (envelope.command.type === "CANCEL_SUMMON_PAYMENT") return cancelSummonPaymentV2(state, envelope);
  if (envelope.command.type === "CANCEL_EFFECT_TARGETS") return cancelEffectTargetsV2(state, envelope);
  if (envelope.command.type === "ANSWER_DECISION") return executeDecisionCommandV2(state, envelope);
  if (envelope.command.type === "ACTIVATE_EFFECT") return executeEffectCommandV2(state, envelope);
  if (state.flow.kind === "ACTION") return executeActionCommandV2(state, envelope);
  return executeBattleCommandV2(state, envelope);
}

/**
 * 权威入口：执行玩家命令，并在同一原子结果内完成无需玩家选择的流程。
 * 服务端持久化与 journal 重放必须共用此入口，避免停在仅供内核观察的 TURN_START。
 */
export function executeAuthoritativeCommandV2(
  state: GameStateV2,
  envelope: CommandEnvelopeV2,
): CommandResultV2 {
  const commandResult = executeCommandV2(state, envelope);
  if (!commandResult.ok) return commandResult;

  let nextState = commandResult.state;
  const initialValueEvents = commandResult.events.some((event) => event.type === "CARD_VALUE_CHANGED")
    ? []
    : detectValueChangeEventsV2(state, nextState);
  const events: GameEventV2[] = [...commandResult.events, ...initialValueEvents];
  let newEvents: GameEventV2[] = [...commandResult.events, ...initialValueEvents];
  const automaticFlows = new Set([
    "TURN_START",
    "BATTLE_START",
    "BATTLE_NEXT",
    "TURN_RESPONSE_START",
    "END_TRIGGER",
    "END_EXPIRE",
    "TURN_SWITCH",
  ]);
  for (let step = 0; step < 128; step += 1) {
    if (nextState.status !== "playing" || nextState.decision) return successV2(nextState, events);

    const candidates = collectTriggeredEffectsV2(nextState, newEvents);
    if (candidates.length > 0) {
      const prepared = prepareTriggerResolutionV2(nextState, candidates);
      nextState = prepared.state;
      newEvents = prepared.events;
      events.push(...newEvents);
      continue;
    }

    if (automaticFlows.has(nextState.flow.kind)) {
      const beforeAutomatic = nextState;
      const automaticResult = advanceAutomaticFlowV2(nextState);
      if (!automaticResult.ok) return automaticResult;
      nextState = automaticResult.state;
      const automaticValueEvents = automaticResult.events.some((event) => event.type === "CARD_VALUE_CHANGED")
        ? []
        : detectValueChangeEventsV2(beforeAutomatic, nextState);
      newEvents = [...automaticResult.events, ...automaticValueEvents];
      events.push(...newEvents);
      continue;
    }
    return successV2(nextState, events);
  }
  return rejectV2(state, "EFFECT_LOOP_LIMIT", "效果触发链超过安全上限，对局未接受该命令");
}
