import type { DeterministicRandomState } from "./random";

export type PlayerIndex = 0 | 1;
export type CardInstanceIdV2 = string;
export type DeckKindV2 = "main" | "rush";
export type FieldZoneV2 = "vanguard" | "flankLeft" | "flankRight" | "rear";
export type BattleBaseLocationV2 = FieldZoneV2 | "base";
export type OfficialKeywordV2 = "counter" | "intercept" | "combo" | "assault" | "airRaid" | "unique";

export interface CardInstanceV2 {
  instanceId: CardInstanceIdV2;
  definitionId: string;
  cardNo: string;
  name: string;
  owner: PlayerIndex;
  deckKind: DeckKindV2;
  level: number;
  range: number;
  power: number;
  attribute: number;
  features: string[];
  hasEffectText: boolean;
  effectText: string;
  printedKeywords: OfficialKeywordV2[];
}

export type AttackTargetV2 =
  | { kind: "character"; cardId: CardInstanceIdV2 }
  | { kind: "breach"; zone: FieldZoneV2 };

export interface BattleContextV2 {
  order: FieldZoneV2[];
  cursor: number;
  flankOrderChosen?: boolean;
  attackerId: CardInstanceIdV2 | null;
  target: AttackTargetV2 | null;
  attackedCardIds: CardInstanceIdV2[];
  priorityPlayer: PlayerIndex | null;
  consecutivePasses: number;
  responseSummoned: [boolean, boolean];
}

export interface TurnResponseContextV2 {
  priorityPlayer: PlayerIndex;
  consecutivePasses: number;
  responseSummoned: [boolean, boolean];
}

export interface ModifierStateV2 {
  id: string;
  sourceCardId: CardInstanceIdV2;
  targetCardId: CardInstanceIdV2;
  type: "power" | "range" | "level";
  value: number;
  mode?: "delta" | "replace";
  duration: "turn" | "permanent" | "while_source_present";
}

export interface KeywordGrantStateV2 {
  id: string;
  sourceCardId: CardInstanceIdV2;
  targetCardId: CardInstanceIdV2;
  keyword: OfficialKeywordV2;
  duration: "turn" | "permanent" | "while_source_present";
}

export interface EffectCopyGrantStateV2 {
  id: string;
  sourceCardId: CardInstanceIdV2;
  targetCardId: CardInstanceIdV2;
  copiedFromCardId: CardInstanceIdV2;
  copiedCardNo: string;
  duration: "turn" | "permanent";
}

export type AtomicOperationV2 = (
  | { kind: "DRAW"; actor: PlayerIndex; count: number; sourceCardId?: CardInstanceIdV2; contextValue?: number }
  | { kind: "DISCARD"; cardIds: CardInstanceIdV2[] }
  | { kind: "DISCARD_DECK_TOP"; actor: PlayerIndex; count: number }
  | { kind: "BANISH_DECK_TOP"; actor: PlayerIndex; count: number; sourceCardId?: CardInstanceIdV2 }
  | { kind: "REVEAL_RANDOM_HAND"; actor: PlayerIndex; count: number; sourceCardId?: CardInstanceIdV2 }
  | { kind: "RETREAT_RANDOM_BASE_COVERED"; actor: PlayerIndex; sourceCardId?: CardInstanceIdV2 }
  | { kind: "COVER_RANDOM_HAND"; actor: PlayerIndex; sourceCardId?: CardInstanceIdV2 }
  | { kind: "RETREAT"; cardIds: CardInstanceIdV2[]; sourceCardId?: CardInstanceIdV2 }
  | { kind: "BANISH"; cardIds: CardInstanceIdV2[]; sourceCardId?: CardInstanceIdV2 }
  | { kind: "MOVE_TO_BASE"; cardId: CardInstanceIdV2; face: "up" | "down"; controller?: PlayerIndex; sourceCardId?: CardInstanceIdV2 }
  | { kind: "PLACE_FIELD"; cardId: CardInstanceIdV2; destination: FieldZoneV2; controller?: PlayerIndex; sourceCardId?: CardInstanceIdV2 }
  | { kind: "COVER"; cardId: CardInstanceIdV2 }
  | { kind: "REVEAL"; cardIds: CardInstanceIdV2[]; sourceCardId?: CardInstanceIdV2 }
  | { kind: "FLIP_BASE_FACE_UP"; cardId: CardInstanceIdV2 }
  | { kind: "MOVE_TO_DECK_BOTTOM"; cardId: CardInstanceIdV2 }
  | { kind: "MOVE_TO_DECK_TOP"; cardId: CardInstanceIdV2; sourceCardId?: CardInstanceIdV2 }
  | { kind: "MOVE_FIELD"; cardId: CardInstanceIdV2; destination: FieldZoneV2; sourceCardId?: CardInstanceIdV2 }
  | { kind: "MOVE_BATTLE_BASE"; cardId: CardInstanceIdV2; destination: BattleBaseLocationV2 }
  | { kind: "RETURN_TO_HAND"; cardIds: CardInstanceIdV2[] }
  | { kind: "MOVE_TO_HAND"; cardIds: CardInstanceIdV2[]; sourceCardId?: CardInstanceIdV2 }
  | { kind: "SWAP_POSITIONS"; cardIds: [CardInstanceIdV2, CardInstanceIdV2]; sourceCardId?: CardInstanceIdV2 }
  | { kind: "ADD_MODIFIER"; modifier: ModifierStateV2 }
  | { kind: "REMOVE_MODIFIER"; modifierId: string }
  | { kind: "GRANT_KEYWORD"; grant: KeywordGrantStateV2 }
  | { kind: "REMOVE_KEYWORD"; grantId: string }
  | { kind: "ATTACH"; cardId: CardInstanceIdV2; hostCardId: CardInstanceIdV2; sourceCardId?: CardInstanceIdV2 }
  | { kind: "DETACH"; cardId: CardInstanceIdV2; destination: "hand" | "retreat" | "base" | FieldZoneV2 }
  | { kind: "MARK_EFFECT_USED"; key: string }
  | { kind: "FORBID_SUMMON_PAYMENT"; cardId: CardInstanceIdV2 }
  | { kind: "FORBID_HIGH_LEVEL_SUMMON_PAYMENT"; actor: PlayerIndex; minimumLevel: number }
  | { kind: "FORBID_MOVE"; cardId: CardInstanceIdV2; sourceCardId?: CardInstanceIdV2 }
  | { kind: "REORDER_DECK_CARDS"; actor: PlayerIndex; inspectedCardIds: CardInstanceIdV2[]; topCardIds: CardInstanceIdV2[]; bottomCardIds: CardInstanceIdV2[]; sourceCardId?: CardInstanceIdV2 }
  | { kind: "GRANT_COPIED_EFFECTS"; grant: EffectCopyGrantStateV2 }
  | { kind: "GRANT_ADDITIONAL_CHARACTER_ATTACK"; cardId: CardInstanceIdV2 }
  | { kind: "REDIRECT_ATTACK_TARGET"; target: AttackTargetV2; sourceCardId: CardInstanceIdV2 }
  | { kind: "SKIP_BATTLE_PHASE"; actor: PlayerIndex; sourceCardId: CardInstanceIdV2 }
  | { kind: "FORBID_ATTACK"; cardId: CardInstanceIdV2; sourceCardId?: CardInstanceIdV2 }
) & {
  /** “如此做后”：只有前一个原子完整成功时才继续处理本原子。 */
  requiresPreviousSuccess?: boolean;
};

export type AtomicOperationKindV2 = AtomicOperationV2["kind"];

export interface QueuedEffectV2 {
  id: string;
  sourceCardId: CardInstanceIdV2;
  controller: PlayerIndex;
  effectId: string;
  trigger: string;
  optional: boolean;
  targetingActor?: PlayerIndex;
  operations: AtomicOperationV2[];
  triggerEvent?: GameEventV2;
  targeting?: {
    choices: CardInstanceIdV2[];
    min: number;
    max: number;
    prompt: string;
    choiceKind?: "card" | "field_location" | "mixed" | "deck_reorder";
  };
}

export interface EffectRuntimeStateV2 {
  queue: QueuedEffectV2[];
  resolving: boolean;
  resolvedEffectIds: string[];
}

export interface PlayerStateV2 {
  name: string;
  deck: CardInstanceIdV2[];
  rushDeck: CardInstanceIdV2[];
  hand: CardInstanceIdV2[];
  baseCards: CardInstanceIdV2[];
  baseCovered: CardInstanceIdV2[];
  field: Record<FieldZoneV2, CardInstanceIdV2[]>;
  timeline: CardInstanceIdV2[];
  retreat: CardInstanceIdV2[];
  void: CardInstanceIdV2[];
}

export interface MulliganContinuationV2 {
  kind: "AFTER_MULLIGAN";
  nextActor: PlayerIndex | null;
}

export interface MulliganDecisionV2 {
  id: string;
  kind: "MULLIGAN";
  actor: PlayerIndex;
  choices: CardInstanceIdV2[];
  min: 0;
  max: 6;
  continuation: MulliganContinuationV2;
}

export interface SummonPaymentDecisionV2 {
  id: string;
  kind: "SUMMON_PAYMENT";
  actor: PlayerIndex;
  choices: CardInstanceIdV2[];
  min: 1;
  max: number;
  prompt: string;
  requiredLevel: number;
  continuation: {
    kind: "RESUME_SUMMON_PAYMENT";
    cardId: CardInstanceIdV2;
    summonKind: "action" | "battle_response" | "turn_response";
  };
}

export interface SummonDestinationDecisionV2 {
  id: string;
  kind: "SUMMON_DESTINATION";
  actor: PlayerIndex;
  choices: string[];
  min: 1;
  max: 1;
  prompt: string;
  continuation: {
    kind: "RESUME_SUMMON_DESTINATION";
    cardId: CardInstanceIdV2;
    paymentCardIds: CardInstanceIdV2[];
    retreatedCardIds: CardInstanceIdV2[];
    summonKind: "action" | "battle_response" | "turn_response";
  };
}

export interface DiscardToLimitDecisionV2 {
  id: string;
  kind: "DISCARD_TO_LIMIT";
  actor: PlayerIndex;
  choices: CardInstanceIdV2[];
  min: number;
  max: number;
  prompt: string;
  continuation: { kind: "RESUME_TURN_SWITCH" };
}

export interface TriggerOrderDecisionV2 {
  id: string;
  kind: "ORDER_TRIGGERS";
  actor: PlayerIndex;
  choices: string[];
  min: number;
  max: number;
  prompt: string;
  continuation: {
    kind: "RESUME_TRIGGER_ORDER";
    orderedBefore: QueuedEffectV2[];
    currentEffects: QueuedEffectV2[];
    remainingEffects: QueuedEffectV2[];
  };
}

export interface EffectTargetsDecisionV2 {
  id: string;
  kind: "EFFECT_TARGETS";
  actor: PlayerIndex;
  choices: CardInstanceIdV2[];
  min: number;
  max: number;
  prompt: string;
  choiceKind?: "card" | "field_location" | "mixed" | "deck_reorder";
  continuation: {
    kind: "RESUME_EFFECT_TARGETS";
    sourceCardId: CardInstanceIdV2;
    effectId: string;
    activationFlow: "action" | "battle_response" | "turn_response";
  } | {
    kind: "RESUME_TRIGGER_EFFECT_TARGETS";
    effect: QueuedEffectV2;
    remainingEffects: QueuedEffectV2[];
  };
}

export interface OptionalEffectDecisionV2 {
  id: string;
  kind: "OPTIONAL_EFFECT";
  actor: PlayerIndex;
  choices: ["resolve", "skip"];
  min: 1;
  max: 1;
  prompt: string;
  continuation: {
    kind: "RESUME_OPTIONAL_EFFECT";
    effect: QueuedEffectV2;
    remainingEffects: QueuedEffectV2[];
  };
}

export type PendingDecisionV2 =
  | MulliganDecisionV2
  | SummonPaymentDecisionV2
  | SummonDestinationDecisionV2
  | DiscardToLimitDecisionV2
  | TriggerOrderDecisionV2
  | EffectTargetsDecisionV2
  | OptionalEffectDecisionV2;

export type FlowStateV2 =
  | {
      kind: "FINISHED";
      actor: PlayerIndex;
    }
  | {
      kind: "SETUP_MULLIGAN";
      actor: PlayerIndex;
      completed: [boolean, boolean];
    }
  | {
      kind: "TURN_START";
      actor: PlayerIndex;
    }
  | {
      kind: "ACTION";
      actor: PlayerIndex;
    }
  | {
      kind: "BATTLE_START";
      actor: PlayerIndex;
    }
  | {
      kind: "BATTLE_ADJUST";
      actor: PlayerIndex;
    }
  | {
      kind: "BATTLE_NEXT";
      actor: PlayerIndex;
    }
  | {
      kind: "BATTLE_FLANK_CHOICE";
      actor: PlayerIndex;
      choices: ["flankLeft", "flankRight"];
    }
  | {
      kind: "BATTLE_ATTACK";
      actor: PlayerIndex;
      zone: FieldZoneV2;
      attackerId: CardInstanceIdV2;
    }
  | {
      kind: "BATTLE_TARGET";
      actor: PlayerIndex;
      attackerId: CardInstanceIdV2;
    }
  | {
      kind: "BATTLE_RESPONSE";
      actor: PlayerIndex;
      priority: PlayerIndex;
    }
  | {
      kind: "TURN_RESPONSE_START";
      actor: PlayerIndex;
    }
  | {
      kind: "TURN_RESPONSE";
      actor: PlayerIndex;
      priority: PlayerIndex;
    }
  | {
      kind: "END_TRIGGER";
      actor: PlayerIndex;
    }
  | {
      kind: "END_EXPIRE";
      actor: PlayerIndex;
    }
  | {
      kind: "END_DISCARD";
      actor: PlayerIndex;
    }
  | {
      kind: "TURN_SWITCH";
      actor: PlayerIndex;
    };

export interface GameStateV2 {
  match: {
    matchId: string;
    rulesetVersion: "1.02";
    cardDataVersion: string;
    engineVersion: string;
  };
  revision: number;
  status: "setup" | "playing" | "finished";
  firstPlayer: PlayerIndex;
  activePlayer: PlayerIndex;
  turnNumber: number;
  flow: FlowStateV2;
  decision: PendingDecisionV2 | null;
  battle: BattleContextV2 | null;
  turnResponse: TurnResponseContextV2 | null;
  effects: EffectRuntimeStateV2;
  modifiers: ModifierStateV2[];
  keywordGrants: KeywordGrantStateV2[];
  effectCopies: EffectCopyGrantStateV2[];
  attachments: Record<CardInstanceIdV2, CardInstanceIdV2[]>;
  players: [PlayerStateV2, PlayerStateV2];
  cards: Record<CardInstanceIdV2, CardInstanceV2>;
  randomState: DeterministicRandomState;
  usage: {
    summonsThisTurn: [number, number];
    baseDeployedThisTurn: boolean;
    movedCardIds: CardInstanceIdV2[];
    movementBlockedCardIds: CardInstanceIdV2[];
    /**
     * 本回合作为正面角色放置进场、仍保有该角色身份的卡牌。
     * 结附不会清除此状态；盖放会清除；翻开盖卡和解除结附不会新建此状态。
     */
    enteredThisTurn: CardInstanceIdV2[];
    interceptUsedCardIds: CardInstanceIdV2[];
    attackedCardIdsByPlayer: [CardInstanceIdV2[], CardInstanceIdV2[]];
    /** 本回合已被声明为角色攻击目标的实例；重复项表示被攻击多次。 */
    attackedTargetCardIdsThisTurn: CardInstanceIdV2[];
    characterOnlyAdditionalAttackCardIds: CardInstanceIdV2[];
    summonPaymentBlockedCardIds: CardInstanceIdV2[];
    minimumSummonPaymentLevelBlockedThisTurn: [number | null, number | null];
    effectUseKeysThisTurn: string[];
    battlePhaseSkippedThisTurn: boolean;
    attackBlockedCardIds: CardInstanceIdV2[];
  };
  winner: PlayerIndex | null;
}

export type GameCommandV2 =
  | { type: "SUBMIT_MULLIGAN"; cardIds: CardInstanceIdV2[] }
  | { type: "DEPLOY_BASE"; cardId: CardInstanceIdV2 }
  | {
      type: "SUMMON_CHARACTER";
      cardId: CardInstanceIdV2;
      destination?: BattleBaseLocationV2;
    }
  | {
      type: "MOVE_BATTLE_BASE";
      cardId: CardInstanceIdV2;
      from: BattleBaseLocationV2;
      destination: BattleBaseLocationV2;
    }
  | { type: "ANSWER_DECISION"; decisionId: string; cardIds: CardInstanceIdV2[] }
  | { type: "CANCEL_SUMMON_PAYMENT"; decisionId: string }
  | { type: "CANCEL_EFFECT_TARGETS"; decisionId: string }
  | { type: "END_ACTION_PHASE" }
  | {
      type: "SUBMIT_BATTLE_LAYOUT";
      layout: Record<FieldZoneV2, CardInstanceIdV2 | null>;
      flankOrder?: ["flankLeft", "flankRight"] | ["flankRight", "flankLeft"];
    }
  | { type: "CHOOSE_FLANK_ATTACKER"; zone: "flankLeft" | "flankRight" }
  | { type: "DECLARE_ATTACK"; attackerId: CardInstanceIdV2; target: AttackTargetV2 }
  | { type: "PASS_ATTACK_OPPORTUNITY"; attackerId: CardInstanceIdV2 }
  | { type: "PASS_PRIORITY" }
  | { type: "ACTIVATE_KEYWORD"; sourceCardId: CardInstanceIdV2; keyword: "intercept" }
  | { type: "ACTIVATE_EFFECT"; sourceCardId: CardInstanceIdV2; effectId: string };

export interface CommandEnvelopeV2 {
  actor: PlayerIndex;
  commandId: string;
  expectedRevision: number;
  command: GameCommandV2;
}

export type GameEventV2 =
  | { type: "MULLIGAN_SUBMITTED"; actor: PlayerIndex; replacedCount: number }
  | { type: "TURN_CARDS_DRAWN"; actor: PlayerIndex; count: number; sourceCardId?: CardInstanceIdV2; contextValue?: number }
  | { type: "CARDS_DISCARDED"; cardIds: CardInstanceIdV2[] }
  | { type: "CARDS_RETREATED"; cardIds: CardInstanceIdV2[]; reason: "effect" | "state" | "battle" | "summon_payment"; fromFieldCardIds?: CardInstanceIdV2[]; followedAttachmentCardIds?: CardInstanceIdV2[]; sourceCardId?: CardInstanceIdV2 }
  | { type: "CARDS_BANISHED"; cardIds: CardInstanceIdV2[]; sourceCardId?: CardInstanceIdV2; fromRetreatCardIds?: CardInstanceIdV2[] }
  | { type: "CARDS_REVEALED"; cards: Array<{ instanceId: CardInstanceIdV2; definitionId: string }>; sourceCardId?: CardInstanceIdV2 }
  | { type: "CARDS_COVERED"; cardIds: CardInstanceIdV2[] }
  | { type: "BASE_CARD_FLIPPED"; actor: PlayerIndex; cardId: CardInstanceIdV2 }
  | { type: "CARDS_PLACED_IN_BASE"; actor: PlayerIndex; cardIds: CardInstanceIdV2[]; face: "up" | "down"; sourceCardId?: CardInstanceIdV2 }
  | { type: "CARD_PLACED_FIELD_BY_EFFECT"; actor: PlayerIndex; cardId: CardInstanceIdV2; destination: FieldZoneV2; fromZone: "hand" | "field" | "base" | "retreat" | "void" | "deck" | "attachment" | "unknown"; sourceCardId?: CardInstanceIdV2 }
  | { type: "CARD_MOVED_TO_DECK_BOTTOM"; actor: PlayerIndex; cardId: CardInstanceIdV2 }
  | { type: "CARD_MOVED_TO_DECK_TOP"; actor: PlayerIndex; cardId: CardInstanceIdV2; sourceCardId?: CardInstanceIdV2 }
  | { type: "CARDS_RETURNED_TO_HAND"; cardIds: CardInstanceIdV2[] }
  | { type: "CARD_VALUE_CHANGED"; sourceCardId: CardInstanceIdV2; targetCardId: CardInstanceIdV2; valueType: "power" | "range" | "level"; delta: number }
  | { type: "EFFECT_USE_MARKED"; key: string }
  | { type: "SUMMON_PAYMENT_FORBIDDEN"; cardId: CardInstanceIdV2 }
  | { type: "HIGH_LEVEL_SUMMON_PAYMENT_FORBIDDEN"; actor: PlayerIndex; minimumLevel: number }
  | { type: "CARD_EFFECTS_COPIED"; sourceCardId: CardInstanceIdV2; targetCardId: CardInstanceIdV2; copiedFromCardId: CardInstanceIdV2; copiedCardNo: string; grantId: string }
  | { type: "ADDITIONAL_CHARACTER_ATTACK_GRANTED"; cardId: CardInstanceIdV2 }
  | { type: "ATTACK_TARGET_REDIRECTED"; sourceCardId: CardInstanceIdV2; attackerId: CardInstanceIdV2; previousTarget: AttackTargetV2; target: AttackTargetV2 }
  | { type: "BATTLE_PHASE_SKIP_MARKED"; actor: PlayerIndex; sourceCardId: CardInstanceIdV2 }
  | { type: "CARD_ATTACK_FORBIDDEN"; cardId: CardInstanceIdV2; sourceCardId?: CardInstanceIdV2 }
  | { type: "BASE_DEPLOYED"; actor: PlayerIndex; cardId: CardInstanceIdV2; drawnCount: number }
  | { type: "SUMMON_PAYMENT_REQUESTED"; actor: PlayerIndex; cardId: CardInstanceIdV2; requiredLevel: number; summonKind: "action" | "battle_response" | "turn_response" }
  | { type: "SUMMON_DESTINATION_REQUESTED"; actor: PlayerIndex; cardId: CardInstanceIdV2; choices: BattleBaseLocationV2[]; summonKind: "action" | "battle_response" | "turn_response" }
  | { type: "SUMMON_PAYMENT_CANCELLED"; actor: PlayerIndex; cardId: CardInstanceIdV2 }
  | { type: "CHARACTER_SUMMONED"; actor: PlayerIndex; cardId: CardInstanceIdV2; destination: BattleBaseLocationV2; paymentCardIds: CardInstanceIdV2[]; summonKind: "action" | "battle_response" | "turn_response" }
  | { type: "CHARACTER_PLACED"; actor: PlayerIndex; cardId: CardInstanceIdV2; destination: BattleBaseLocationV2; placementKind: "summon" | "effect" }
  | { type: "BATTLE_BASE_MOVED"; actor: PlayerIndex; cardId: CardInstanceIdV2; from: BattleBaseLocationV2; destination: BattleBaseLocationV2 }
  | { type: "ACTION_PHASE_ENDED"; actor: PlayerIndex; next: "BATTLE_START" | "TURN_RESPONSE_START" }
  | { type: "BATTLE_PHASE_STARTED"; actor: PlayerIndex }
  | { type: "BATTLE_LAYOUT_SUBMITTED"; actor: PlayerIndex; order: FieldZoneV2[] }
  | { type: "FLANK_ATTACKER_CHOSEN"; actor: PlayerIndex; zone: "flankLeft" | "flankRight" }
  | { type: "ATTACK_OPPORTUNITY_PASSED"; actor: PlayerIndex; attackerId: CardInstanceIdV2 }
  | { type: "ATTACK_DECLARED"; actor: PlayerIndex; attackerId: CardInstanceIdV2; target: AttackTargetV2 }
  | { type: "ATTACK_TARGET_INVALIDATED"; actor: PlayerIndex; attackerId: CardInstanceIdV2; canReselect: boolean }
  | { type: "PRIORITY_PASSED"; actor: PlayerIndex; scope: "battle" | "turn" }
  | { type: "CHARACTERS_RETREATED_BY_BATTLE"; cardIds: CardInstanceIdV2[] }
  | { type: "CHARACTER_BATTLE_RESOLVED"; attackerId: CardInstanceIdV2; targetId: CardInstanceIdV2; winnerCardId: CardInstanceIdV2 | null; defeatedCardIds: CardInstanceIdV2[]; tied: boolean }
  | { type: "BREACH_HIT"; attacker: PlayerIndex; attackerCardId: CardInstanceIdV2; defender: PlayerIndex; rushCardId: CardInstanceIdV2 }
  | { type: "BATTLE_PHASE_ENDED"; actor: PlayerIndex }
  | { type: "TURN_RESPONSE_STARTED"; actor: PlayerIndex; priority: PlayerIndex }
  | { type: "END_TRIGGERS_PROCESSED"; actor: PlayerIndex }
  | { type: "TURN_EFFECTS_EXPIRED"; actor: PlayerIndex }
  | { type: "DISCARD_TO_LIMIT_REQUESTED"; actor: PlayerIndex; count: number }
  | { type: "CARDS_DISCARDED_TO_LIMIT"; actor: PlayerIndex; cardIds: CardInstanceIdV2[] }
  | { type: "TURN_ENDED"; actor: PlayerIndex; nextActor: PlayerIndex; turnNumber: number }
  | { type: "EFFECT_QUEUED"; actor: PlayerIndex; sourceCardId: CardInstanceIdV2; effectId: string }
  | { type: "EFFECT_TARGETS_REQUESTED"; actor: PlayerIndex; sourceCardId: CardInstanceIdV2; effectId: string; min: number; max: number }
  | { type: "EFFECT_TARGETS_SELECTED"; actor: PlayerIndex; sourceCardId: CardInstanceIdV2; effectId: string; targetCardIds: CardInstanceIdV2[] }
  | { type: "EFFECT_TARGETS_CANCELLED"; actor: PlayerIndex; sourceCardId: CardInstanceIdV2; effectId: string }
  | { type: "EFFECT_RESOLVED"; effectInstanceId: string }
  | { type: "TRIGGER_ORDER_REQUESTED"; actor: PlayerIndex; effectInstanceIds: string[] }
  | { type: "TRIGGERS_ORDERED"; actor: PlayerIndex; effectInstanceIds: string[] }
  | { type: "OPTIONAL_EFFECT_REQUESTED"; actor: PlayerIndex; effectInstanceId: string }
  | { type: "OPTIONAL_EFFECT_CHOSEN"; actor: PlayerIndex; effectInstanceId: string; resolved: boolean }
  | { type: "STATE_BASED_RETREAT"; cardIds: CardInstanceIdV2[] }
  | { type: "CARD_ATTACHED"; cardId: CardInstanceIdV2; hostCardId: CardInstanceIdV2; sourceCardId?: CardInstanceIdV2 }
  | { type: "CARD_MOVED_BY_EFFECT"; actor: PlayerIndex; cardId: CardInstanceIdV2; from: FieldZoneV2; destination: FieldZoneV2 }
  | { type: "CARD_DETACHED"; cardId: CardInstanceIdV2; destination: "hand" | "retreat" | "base" | FieldZoneV2 }
  | { type: "CARD_MOVE_FORBIDDEN"; cardId: CardInstanceIdV2; sourceCardId?: CardInstanceIdV2 }
  | { type: "DECK_CARDS_REORDERED"; actor: PlayerIndex; topCardIds: CardInstanceIdV2[]; bottomCardIds: CardInstanceIdV2[]; sourceCardId?: CardInstanceIdV2 }
  | { type: "KEYWORD_GRANTED"; sourceCardId: CardInstanceIdV2; targetCardId: CardInstanceIdV2; keyword: OfficialKeywordV2; grantId: string }
  | { type: "KEYWORD_REMOVED"; grantId: string; keyword: OfficialKeywordV2 }
  | { type: "KEYWORD_ACTIVATED"; actor: PlayerIndex; sourceCardId: CardInstanceIdV2; keyword: OfficialKeywordV2 }
  | { type: "GAME_WON"; winner: PlayerIndex; reason: "timeline" | "deck_empty" };

export type CommandErrorCodeV2 =
  | "GAME_FINISHED"
  | "STALE_REVISION"
  | "INVALID_FLOW"
  | "NOT_DECISION_ACTOR"
  | "INVALID_CHOICE_COUNT"
  | "DUPLICATE_CHOICE"
  | "CHOICE_NOT_AVAILABLE"
  | "WRONG_ACTOR"
  | "INVALID_SOURCE"
  | "INVALID_TARGET"
  | "LIMIT_REACHED"
  | "COST_MISMATCH"
  | "CARD_ENTERED_THIS_TURN"
  | "CARD_ALREADY_MOVED"
  | "CARD_MOVE_FORBIDDEN"
  | "STALE_DECISION"
  | "INVALID_LAYOUT"
  | "ATTACK_OUT_OF_RANGE"
  | "CARD_CANNOT_ATTACK"
  | "EFFECT_NOT_IMPLEMENTED"
  | "EFFECT_NOT_AVAILABLE"
  | "EFFECT_LOOP_LIMIT"
  | "DECK_EMPTY";

export type CommandResultV2 =
  | {
      ok: true;
      state: GameStateV2;
      stateHash: string;
      events: GameEventV2[];
    }
  | {
      ok: false;
      code: CommandErrorCodeV2;
      message: string;
      currentRevision: number;
      stateHash: string;
    };
