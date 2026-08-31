import type {
  AttackTargetV2,
  BattleBaseLocationV2,
  CardInstanceIdV2,
  FlowStateV2,
  GameStateV2,
  PendingDecisionV2,
  PlayerIndex,
  BattleContextV2,
  TurnResponseContextV2,
  GameCommandV2,
  FieldZoneV2,
  OfficialKeywordV2,
} from "./model";
import { implementedEffectIdsForCardInstanceV2 } from "./effects/registry";
import { effectiveValueV2 } from "./effects/atomicOps";
import { attackOpportunityLimitV2, effectiveKeywordsV2, hasKeywordV2 } from "./effects/keywords";
import { isCardEffectSuppressedV2 } from "./effects/suppression";
import { allowedCommandTypesV2 } from "./commandPolicy";
import { battleDistanceV2, executeCommandV2 } from "./kernel";
import { cardControllerV2 } from "./control";

export type LegalActionV2 =
  | { type: "DEPLOY_BASE"; cardId: CardInstanceIdV2 }
  | { type: "SUMMON_CHARACTER"; cardId: CardInstanceIdV2; destinations: BattleBaseLocationV2[] }
  | { type: "MOVE_BATTLE_BASE"; cardId: CardInstanceIdV2; from: BattleBaseLocationV2; destinations: BattleBaseLocationV2[] }
  | { type: "ACTIVATE_EFFECT"; sourceCardId: CardInstanceIdV2; effectIds: string[] }
  | { type: "ACTIVATE_KEYWORD"; sourceCardId: CardInstanceIdV2; keyword: "intercept" }
  | { type: "DECLARE_ATTACK"; attackerId: CardInstanceIdV2; targets: AttackTargetV2[] };

export interface VisibleCardV2 {
  instanceId: CardInstanceIdV2;
  definitionId: string;
  level: number;
  range: number;
  power: number;
  effectiveLevel: number;
  effectiveRange: number;
  effectivePower: number;
  keywords: OfficialKeywordV2[];
  /** 当前通过持续条件或效果额外获得、并非卡面直接印刷的能力。 */
  gainedKeywords: OfficialKeywordV2[];
  effectIds: string[];
}

export interface CombatPresentationV2 {
  attacker: {
    cardId: CardInstanceIdV2;
    seat: PlayerIndex;
    zone: FieldZoneV2;
    power: number;
    range: number;
  };
  target: {
    kind: "character";
    cardId: CardInstanceIdV2;
    seat: PlayerIndex;
    zone: FieldZoneV2;
    power: number;
  } | {
    kind: "breach";
    seat: PlayerIndex;
    zone: FieldZoneV2;
  } | null;
  distance: number | null;
  priorityPlayer: PlayerIndex | null;
  consecutivePasses: number;
}

export interface PlayerViewV2 {
  name: string;
  deckCount: number;
  rushDeckCount: number;
  handCount: number;
  hand: VisibleCardV2[];
  baseCards: VisibleCardV2[];
  baseCoveredCount: number;
  baseCovered: VisibleCardV2[];
  field: Record<"vanguard" | "flankLeft" | "flankRight" | "rear", VisibleCardV2[]>;
  timeline: VisibleCardV2[];
  retreat: VisibleCardV2[];
  void: VisibleCardV2[];
  attached: VisibleCardV2[];
  attackedCardIds: CardInstanceIdV2[];
  exhaustedCardIds: CardInstanceIdV2[];
}

export interface BattleViewV2 {
  matchId: string;
  rulesetVersion: "1.02";
  engineVersion: string;
  revision: number;
  stateHash: string;
  status: GameStateV2["status"];
  viewer: PlayerIndex;
  firstPlayer: PlayerIndex;
  activePlayer: PlayerIndex;
  turnNumber: number;
  actionUsage: {
    summonsUsed: number;
    summonLimit: number;
    baseDeploymentsUsed: number;
    baseDeploymentLimit: 1;
  };
  flow: FlowStateV2;
  players: [PlayerViewV2, PlayerViewV2];
  pendingDecision: PendingDecisionV2 | null;
  /** Full card snapshots for hidden-zone choices, exposed only to the decision actor. */
  decisionCards: VisibleCardV2[];
  battle: BattleContextV2 | null;
  turnResponse: TurnResponseContextV2 | null;
  attachments: Record<CardInstanceIdV2, CardInstanceIdV2[]>;
  availableActions: string[];
  /** Exact server-authoritative sources and targets for direct board interaction. */
  legalActions: LegalActionV2[];
  combat: CombatPresentationV2 | null;
}

const fieldZones: Array<keyof PlayerViewV2["field"]> = ["vanguard", "flankLeft", "flankRight", "rear"];
const summonDestinations: BattleBaseLocationV2[] = ["base", ...fieldZones];

function isLegalCommand(state: GameStateV2, actor: PlayerIndex, command: GameCommandV2): boolean {
  return executeCommandV2(state, {
    actor,
    commandId: `projection:${state.revision}:${command.type}`,
    expectedRevision: state.revision,
    command,
  }).ok;
}

function projectLegalActions(state: GameStateV2, actor: PlayerIndex): LegalActionV2[] {
  const available = new Set(allowedCommandTypesV2(state, actor));
  const player = state.players[actor];
  const actions: LegalActionV2[] = [];

  if (available.has("DEPLOY_BASE")) {
    for (const cardId of player.hand) {
      if (isLegalCommand(state, actor, { type: "DEPLOY_BASE", cardId })) actions.push({ type: "DEPLOY_BASE", cardId });
    }
  }

  if (available.has("SUMMON_CHARACTER")) {
    for (const cardId of player.hand) {
      const destinations = summonDestinations.filter((destination) => (
        isLegalCommand(state, actor, { type: "SUMMON_CHARACTER", cardId, destination })
      ));
      if (destinations.length) actions.push({ type: "SUMMON_CHARACTER", cardId, destinations });
    }
  }

  if (available.has("MOVE_BATTLE_BASE")) {
    const sources: Array<{ cardId: string; from: BattleBaseLocationV2 }> = [
      ...player.baseCards.map((cardId) => ({ cardId, from: "base" as const })),
      ...player.baseCovered.map((cardId) => ({ cardId, from: "base" as const })),
      ...fieldZones.flatMap((from) => player.field[from].map((cardId) => ({ cardId, from }))),
    ];
    for (const source of sources) {
      const destinations = summonDestinations.filter((destination) => destination !== source.from && (
        isLegalCommand(state, actor, { type: "MOVE_BATTLE_BASE", ...source, destination })
      ));
      if (destinations.length) actions.push({ type: "MOVE_BATTLE_BASE", ...source, destinations });
    }
  }

  if (available.has("ACTIVATE_EFFECT")) {
    const sources = [
      ...player.hand,
      ...player.baseCards,
      ...fieldZones.flatMap((zone) => player.field[zone]),
      ...player.void,
      ...Object.values(state.attachments).flat().filter((cardId) => cardControllerV2(state, cardId) === actor),
    ];
    for (const sourceCardId of sources) {
      const card = state.cards[sourceCardId];
      const effectIds = card && !isCardEffectSuppressedV2(state, sourceCardId) ? implementedEffectIdsForCardInstanceV2(state, sourceCardId).filter((effectId) => (
        isLegalCommand(state, actor, { type: "ACTIVATE_EFFECT", sourceCardId, effectId })
      )) : [];
      if (effectIds.length) actions.push({ type: "ACTIVATE_EFFECT", sourceCardId, effectIds });
    }
  }

  if (available.has("ACTIVATE_KEYWORD")) {
    for (const sourceCardId of fieldZones.flatMap((zone) => player.field[zone])) {
      if (hasKeywordV2(state, sourceCardId, "intercept") && isLegalCommand(state, actor, { type: "ACTIVATE_KEYWORD", sourceCardId, keyword: "intercept" })) {
        actions.push({ type: "ACTIVATE_KEYWORD", sourceCardId, keyword: "intercept" });
      }
    }
  }

  if (available.has("DECLARE_ATTACK") && (state.flow.kind === "BATTLE_ATTACK" || state.flow.kind === "BATTLE_TARGET")) {
    const attackerId = state.flow.attackerId;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const targets = fieldZones.flatMap((zone): AttackTargetV2[] => {
      const cardId = state.players[defender].field[zone][0];
      return [...(cardId ? [{ kind: "character" as const, cardId }] : []), { kind: "breach" as const, zone }];
    }).filter((target) => isLegalCommand(state, actor, { type: "DECLARE_ATTACK", attackerId, target }));
    if (targets.length) actions.push({ type: "DECLARE_ATTACK", attackerId, targets });
  }

  return actions;
}

function visibleCard(state: GameStateV2, id: CardInstanceIdV2): VisibleCardV2 {
  const card = state.cards[id];
  if (!card) throw new Error(`无法投影未知卡牌实体：${id}`);
  const keywords = effectiveKeywordsV2(state, id);
  const printedKeywords = new Set(card.printedKeywords ?? []);
  return {
    instanceId: id,
    definitionId: card.definitionId,
    level: card.level,
    range: card.range,
    power: card.power,
    effectiveLevel: effectiveValueV2(state, id, "level"),
    effectiveRange: effectiveValueV2(state, id, "range"),
    effectivePower: effectiveValueV2(state, id, "power"),
    keywords,
    gainedKeywords: keywords.filter((keyword) => !printedKeywords.has(keyword)),
    effectIds: isCardEffectSuppressedV2(state, id) ? [] : implementedEffectIdsForCardInstanceV2(state, id),
  };
}

function locateFieldCard(state: GameStateV2, seat: PlayerIndex, cardId: CardInstanceIdV2): FieldZoneV2 | null {
  return fieldZones.find((zone) => state.players[seat].field[zone].includes(cardId)) ?? null;
}

function projectCombat(state: GameStateV2): CombatPresentationV2 | null {
  const attackerId = state.battle?.attackerId
    ?? ((state.flow.kind === "BATTLE_ATTACK" || state.flow.kind === "BATTLE_TARGET") ? state.flow.attackerId : null);
  if (!attackerId) return null;
  const attackerSeat = state.activePlayer;
  const attackerZone = locateFieldCard(state, attackerSeat, attackerId);
  if (!attackerZone) return null;
  const defender: PlayerIndex = attackerSeat === 0 ? 1 : 0;
  const battleTarget = state.battle?.target ?? null;
  const target = battleTarget?.kind === "character"
    ? (() => {
        const zone = locateFieldCard(state, defender, battleTarget.cardId);
        return zone ? {
          kind: "character" as const,
          cardId: battleTarget.cardId,
          seat: defender,
          zone,
          power: effectiveValueV2(state, battleTarget.cardId, "power"),
        } : null;
      })()
    : battleTarget?.kind === "breach"
      ? { kind: "breach" as const, seat: defender, zone: battleTarget.zone }
      : null;
  return {
    attacker: {
      cardId: attackerId,
      seat: attackerSeat,
      zone: attackerZone,
      power: effectiveValueV2(state, attackerId, "power"),
      range: effectiveValueV2(state, attackerId, "range"),
    },
    target,
    distance: target ? battleDistanceV2(attackerSeat, attackerZone, defender, target.zone) : null,
    priorityPlayer: state.battle?.priorityPlayer ?? null,
    consecutivePasses: state.battle?.consecutivePasses ?? 0,
  };
}

function projectPlayer(
  state: GameStateV2,
  seat: PlayerIndex,
  viewer: PlayerIndex,
): PlayerViewV2 {
  const player = state.players[seat];
  const ownView = seat === viewer;
  const map = (ids: CardInstanceIdV2[]) => ids.map((id) => visibleCard(state, id));
  const attackUses = state.usage.attackedCardIdsByPlayer?.[seat] ?? [];
  const battleUses = state.battle?.attackedCardIds ?? [];
  const exhaustedUses = seat === state.activePlayer && state.battle ? battleUses : attackUses;
  const exhaustedCardIds = fieldZones
    .flatMap((zone) => player.field[zone])
    .filter((id) => seat === state.activePlayer && state.battle
      ? exhaustedUses.filter((usedId) => usedId === id).length >= attackOpportunityLimitV2(state, id)
      : exhaustedUses.includes(id));
  return {
    name: player.name,
    deckCount: player.deck.length,
    rushDeckCount: player.rushDeck.length,
    handCount: player.hand.length,
    hand: ownView ? map(player.hand) : [],
    baseCards: map(player.baseCards),
    baseCoveredCount: player.baseCovered.length,
    baseCovered: ownView ? map(player.baseCovered) : [],
    field: {
      vanguard: map(player.field.vanguard),
      flankLeft: map(player.field.flankLeft),
      flankRight: map(player.field.flankRight),
      rear: map(player.field.rear),
    },
    timeline: map(player.timeline),
    retreat: map(player.retreat),
    void: map(player.void),
    attached: map(Object.values(state.attachments).flat().filter((id) => state.cards[id]?.owner === seat)),
    attackedCardIds: [...attackUses],
    exhaustedCardIds,
  };
}

export function projectBattleViewV2(
  state: GameStateV2,
  viewer: PlayerIndex,
  stateHash: string,
): BattleViewV2 {
  const ownsDecision = state.decision?.actor === viewer;
  return {
    matchId: state.match.matchId,
    rulesetVersion: state.match.rulesetVersion,
    engineVersion: state.match.engineVersion,
    revision: state.revision,
    stateHash,
    status: state.status,
    viewer,
    firstPlayer: state.firstPlayer,
    activePlayer: state.activePlayer,
    turnNumber: state.turnNumber,
    actionUsage: {
      summonsUsed: state.usage.summonsThisTurn[state.activePlayer],
      summonLimit: state.activePlayer === state.firstPlayer && state.turnNumber === 1 ? 1 : 3,
      baseDeploymentsUsed: state.usage.baseDeployedThisTurn ? 1 : 0,
      baseDeploymentLimit: 1,
    },
    flow: state.flow,
    players: [
      projectPlayer(state, 0, viewer),
      projectPlayer(state, 1, viewer),
    ],
    pendingDecision: ownsDecision ? structuredClone(state.decision) : null,
    decisionCards: ownsDecision && state.decision
      ? state.decision.choices.filter((id) => Boolean(state.cards[id])).map((id) => visibleCard(state, id))
      : [],
    battle: structuredClone(state.battle),
    turnResponse: structuredClone(state.turnResponse),
    attachments: structuredClone(state.attachments),
    availableActions: allowedCommandTypesV2(state, viewer),
    legalActions: projectLegalActions(state, viewer),
    combat: projectCombat(state),
  };
}
