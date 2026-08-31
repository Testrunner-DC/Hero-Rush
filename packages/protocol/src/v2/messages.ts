import { z } from "zod";

export const PROTOCOL_VERSION_V2 = 2 as const;

const IdSchemaV2 = z.string().min(1).max(160);
export const DeckSelectionSchema = z.object({
  deckId: z.string().uuid().optional(),
  deck: z.array(IdSchemaV2).length(50).optional(),
  rushDeck: z.array(IdSchemaV2).length(9).optional(),
}).refine(
  (value) => Boolean(value.deckId || (value.deck && value.rushDeck)),
  "必须提供 deckId，或提交完整的 50+9 卡组快照",
);
export type DeckSelection = z.infer<typeof DeckSelectionSchema>;
const PlayerIndexSchemaV2 = z.union([z.literal(0), z.literal(1)]);
const FieldZoneSchemaV2 = z.enum(["vanguard", "flankLeft", "flankRight", "rear"]);
const OfficialKeywordSchemaV2 = z.enum(["counter", "intercept", "combo", "assault", "airRaid", "unique"]);
const AttackTargetSchemaV2 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("character"), cardId: IdSchemaV2 }),
  z.object({ kind: z.literal("breach"), zone: FieldZoneSchemaV2 }),
]);

const ModifierSchemaV2 = z.object({
  id: IdSchemaV2,
  sourceCardId: IdSchemaV2,
  targetCardId: IdSchemaV2,
  type: z.enum(["power", "range", "level"]),
  value: z.number().finite(),
  mode: z.enum(["delta", "replace"]).optional(),
  duration: z.enum(["turn", "permanent", "while_source_present"]),
});

const KeywordGrantSchemaV2 = z.object({
  id: IdSchemaV2,
  sourceCardId: IdSchemaV2,
  targetCardId: IdSchemaV2,
  keyword: OfficialKeywordSchemaV2,
  duration: z.enum(["turn", "permanent", "while_source_present"]),
});

const EffectCopyGrantSchemaV2 = z.object({
  id: IdSchemaV2,
  sourceCardId: IdSchemaV2,
  targetCardId: IdSchemaV2,
  copiedFromCardId: IdSchemaV2,
  copiedCardNo: IdSchemaV2,
  duration: z.enum(["turn", "permanent"]),
});

export const AtomicOperationV2Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("DRAW"), actor: PlayerIndexSchemaV2, count: z.number().int().min(1).max(20), sourceCardId: IdSchemaV2.optional(), contextValue: z.number().finite().optional() }),
  z.object({ kind: z.literal("DISCARD"), cardIds: z.array(IdSchemaV2).min(1).max(40) }),
  z.object({ kind: z.literal("DISCARD_DECK_TOP"), actor: PlayerIndexSchemaV2, count: z.number().int().min(1).max(40) }),
  z.object({ kind: z.literal("BANISH_DECK_TOP"), actor: PlayerIndexSchemaV2, count: z.number().int().min(1).max(40), sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("REVEAL_RANDOM_HAND"), actor: PlayerIndexSchemaV2, count: z.number().int().min(1).max(40), sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("RETREAT_RANDOM_BASE_COVERED"), actor: PlayerIndexSchemaV2, sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("COVER_RANDOM_HAND"), actor: PlayerIndexSchemaV2, sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("RETREAT"), cardIds: z.array(IdSchemaV2).min(1).max(40), sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("BANISH"), cardIds: z.array(IdSchemaV2).min(1).max(40), sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("MOVE_TO_BASE"), cardId: IdSchemaV2, face: z.enum(["up", "down"]), controller: PlayerIndexSchemaV2.optional(), sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("PLACE_FIELD"), cardId: IdSchemaV2, destination: FieldZoneSchemaV2, controller: PlayerIndexSchemaV2.optional(), sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("COVER"), cardId: IdSchemaV2 }),
  z.object({ kind: z.literal("REVEAL"), cardIds: z.array(IdSchemaV2).min(1).max(40), sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("FLIP_BASE_FACE_UP"), cardId: IdSchemaV2 }),
  z.object({ kind: z.literal("MOVE_TO_DECK_BOTTOM"), cardId: IdSchemaV2 }),
  z.object({ kind: z.literal("MOVE_TO_DECK_TOP"), cardId: IdSchemaV2, sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("MOVE_FIELD"), cardId: IdSchemaV2, destination: FieldZoneSchemaV2, sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("MOVE_BATTLE_BASE"), cardId: IdSchemaV2, destination: z.union([FieldZoneSchemaV2, z.literal("base")]) }),
  z.object({ kind: z.literal("RETURN_TO_HAND"), cardIds: z.array(IdSchemaV2).min(1).max(40) }),
  z.object({ kind: z.literal("MOVE_TO_HAND"), cardIds: z.array(IdSchemaV2).min(1).max(40), sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("SWAP_POSITIONS"), cardIds: z.tuple([IdSchemaV2, IdSchemaV2]), sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("ADD_MODIFIER"), modifier: ModifierSchemaV2 }),
  z.object({ kind: z.literal("REMOVE_MODIFIER"), modifierId: IdSchemaV2 }),
  z.object({ kind: z.literal("GRANT_KEYWORD"), grant: KeywordGrantSchemaV2 }),
  z.object({ kind: z.literal("REMOVE_KEYWORD"), grantId: IdSchemaV2 }),
  z.object({ kind: z.literal("ATTACH"), cardId: IdSchemaV2, hostCardId: IdSchemaV2, sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("DETACH"), cardId: IdSchemaV2, destination: z.union([z.enum(["hand", "retreat", "base"]), FieldZoneSchemaV2]) }),
  z.object({ kind: z.literal("MARK_EFFECT_USED"), key: IdSchemaV2 }),
  z.object({ kind: z.literal("FORBID_SUMMON_PAYMENT"), cardId: IdSchemaV2 }),
  z.object({ kind: z.literal("FORBID_HIGH_LEVEL_SUMMON_PAYMENT"), actor: PlayerIndexSchemaV2, minimumLevel: z.number().int().min(1).max(99) }),
  z.object({ kind: z.literal("FORBID_MOVE"), cardId: IdSchemaV2, sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("REORDER_DECK_CARDS"), actor: PlayerIndexSchemaV2, inspectedCardIds: z.array(IdSchemaV2).max(50), topCardIds: z.array(IdSchemaV2).max(50), bottomCardIds: z.array(IdSchemaV2).max(50), sourceCardId: IdSchemaV2.optional() }),
  z.object({ kind: z.literal("GRANT_COPIED_EFFECTS"), grant: EffectCopyGrantSchemaV2 }),
  z.object({ kind: z.literal("GRANT_ADDITIONAL_CHARACTER_ATTACK"), cardId: IdSchemaV2 }),
  z.object({ kind: z.literal("REDIRECT_ATTACK_TARGET"), target: AttackTargetSchemaV2, sourceCardId: IdSchemaV2 }),
  z.object({ kind: z.literal("SKIP_BATTLE_PHASE"), actor: PlayerIndexSchemaV2, sourceCardId: IdSchemaV2 }),
  z.object({ kind: z.literal("FORBID_ATTACK"), cardId: IdSchemaV2, sourceCardId: IdSchemaV2.optional() }),
]).and(z.object({ requiresPreviousSuccess: z.boolean().optional() }));

export const GameCommandV2Schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("SUBMIT_MULLIGAN"),
    cardIds: z.array(IdSchemaV2).max(6),
  }),
  z.object({ type: z.literal("DEPLOY_BASE"), cardId: IdSchemaV2 }),
  z.object({
    type: z.literal("SUMMON_CHARACTER"),
    cardId: IdSchemaV2,
    destination: z.enum(["vanguard", "flankLeft", "flankRight", "rear", "base"]).optional(),
  }),
  z.object({
    type: z.literal("MOVE_BATTLE_BASE"),
    cardId: IdSchemaV2,
    from: z.enum(["vanguard", "flankLeft", "flankRight", "rear", "base"]),
    destination: z.enum(["vanguard", "flankLeft", "flankRight", "rear", "base"]),
  }),
  z.object({
    type: z.literal("ANSWER_DECISION"),
    decisionId: IdSchemaV2,
    cardIds: z.array(IdSchemaV2).max(100),
  }),
  z.object({ type: z.literal("CANCEL_SUMMON_PAYMENT"), decisionId: IdSchemaV2 }),
  z.object({ type: z.literal("CANCEL_EFFECT_TARGETS"), decisionId: IdSchemaV2 }),
  z.object({ type: z.literal("END_ACTION_PHASE") }),
  z.object({
    type: z.literal("SUBMIT_BATTLE_LAYOUT"),
    layout: z.object({
      vanguard: IdSchemaV2.nullable(),
      flankLeft: IdSchemaV2.nullable(),
      flankRight: IdSchemaV2.nullable(),
      rear: IdSchemaV2.nullable(),
    }),
    flankOrder: z.union([
      z.tuple([z.literal("flankLeft"), z.literal("flankRight")]),
      z.tuple([z.literal("flankRight"), z.literal("flankLeft")]),
    ]).optional(),
  }),
  z.object({ type: z.literal("CHOOSE_FLANK_ATTACKER"), zone: z.enum(["flankLeft", "flankRight"]) }),
  z.object({ type: z.literal("DECLARE_ATTACK"), attackerId: IdSchemaV2, target: AttackTargetSchemaV2 }),
  z.object({ type: z.literal("PASS_ATTACK_OPPORTUNITY"), attackerId: IdSchemaV2 }),
  z.object({ type: z.literal("PASS_PRIORITY") }),
  z.object({ type: z.literal("ACTIVATE_KEYWORD"), sourceCardId: IdSchemaV2, keyword: z.literal("intercept") }),
  z.object({ type: z.literal("ACTIVATE_EFFECT"), sourceCardId: IdSchemaV2, effectId: IdSchemaV2 }),
]);

export const GameCommandEnvelopeV2Schema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  requestId: IdSchemaV2,
  matchId: IdSchemaV2,
  commandId: IdSchemaV2,
  expectedRevision: z.number().int().nonnegative(),
  command: GameCommandV2Schema,
});

export const CommandAcceptedV2Schema = z.object({
  type: z.literal("COMMAND_ACCEPTED_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  requestId: IdSchemaV2,
  matchId: IdSchemaV2,
  commandId: IdSchemaV2,
  revision: z.number().int().nonnegative(),
  stateHash: z.string().length(16),
  events: z.array(z.unknown()),
  state: z.unknown(),
  trace: z.array(z.unknown()).optional(),
  invariantIssues: z.array(z.string()).optional(),
});

export const CommandRejectedV2Schema = z.object({
  type: z.literal("COMMAND_REJECTED_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  requestId: IdSchemaV2,
  matchId: IdSchemaV2,
  commandId: IdSchemaV2,
  currentRevision: z.number().int().nonnegative(),
  stateHash: z.string().length(16),
  code: z.string().min(1).max(80),
  message: z.string().max(500),
});

export const MatchFoundV2Schema = z.object({
  type: z.literal("MATCH_FOUND_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  matchId: IdSchemaV2,
  seat: PlayerIndexSchemaV2,
  opponentName: z.string().max(80),
  revision: z.number().int().nonnegative(),
  stateHash: z.string().length(16),
  state: z.unknown(),
});

export const StateUpdatedV2Schema = z.object({
  type: z.literal("STATE_UPDATED_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  matchId: IdSchemaV2,
  revision: z.number().int().nonnegative(),
  stateHash: z.string().length(16),
  events: z.array(z.unknown()),
  state: z.unknown(),
  acceptedCommandId: IdSchemaV2.optional(),
});

export const ResumeOkV2Schema = z.object({
  type: z.literal("RESUME_OK_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  requestId: IdSchemaV2,
  matchId: IdSchemaV2,
  seat: PlayerIndexSchemaV2,
  opponentName: z.string().max(80),
  revision: z.number().int().nonnegative(),
  stateHash: z.string().length(16),
  state: z.unknown(),
});

export const ReadyV2Schema = z.object({
  type: z.literal("READY_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  connectionId: IdSchemaV2,
  userId: IdSchemaV2,
  authenticated: z.boolean(),
  resumeToken: z.string().min(16).max(256),
});

export const QueueStatusV2Schema = z.object({
  type: z.literal("QUEUE_STATUS_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  requestId: IdSchemaV2.optional(),
  position: z.number().int().positive(),
  mode: z.enum(["casual", "ranked"]),
});

export const PrivateRoomCreatedV2Schema = z.object({
  type: z.literal("PRIVATE_ROOM_CREATED_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  requestId: IdSchemaV2,
  roomCode: z.string().min(4).max(12),
});

export const OpponentConnectionV2Schema = z.object({
  type: z.literal("OPPONENT_CONNECTION_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  matchId: IdSchemaV2,
  connected: z.boolean(),
  graceDeadline: z.number().int().positive().optional(),
});

export const MatchEndedV2Schema = z.object({
  type: z.literal("MATCH_ENDED_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  matchId: IdSchemaV2,
  winner: PlayerIndexSchemaV2.nullable(),
  reason: z.enum(["surrender", "disconnect_timeout"]),
});

export const ErrorV2Schema = z.object({
  type: z.literal("ERROR_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  code: z.string().min(1).max(80),
  message: z.string().max(500),
  requestId: IdSchemaV2.optional(),
});

export const PongV2Schema = z.object({
  type: z.literal("PONG_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  timestamp: z.number().optional(),
});

const QueuePayloadV2Schema = z.object({
  requestId: IdSchemaV2,
  playerName: z.string().trim().min(1).max(24),
  deckSelection: DeckSelectionSchema,
});

const SandboxPlayerV2Schema = z.object({
  name: z.string().trim().min(1).max(24),
  deckSelection: DeckSelectionSchema,
});

export const SandboxCommandPayloadV2Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("GAME"), actor: PlayerIndexSchemaV2, command: GameCommandV2Schema }),
  z.object({ kind: z.literal("ATOMIC"), operations: z.array(AtomicOperationV2Schema).min(1).max(20) }),
  z.object({ kind: z.literal("FINISH_MULLIGAN") }),
]);

export const SandboxCreatedV2Schema = z.object({
  type: z.literal("SANDBOX_CREATED_V2"),
  protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  requestId: IdSchemaV2,
  matchId: IdSchemaV2,
  revision: z.number().int().nonnegative(),
  stateHash: z.string().length(16),
  state: z.unknown(),
  invariantIssues: z.array(z.string()),
  recovered: z.boolean().optional(),
  journal: z.array(z.object({
    revision: z.number().int().nonnegative(),
    commandId: IdSchemaV2,
    kind: z.enum(["GAME", "ATOMIC", "FINISH_MULLIGAN"]),
    label: z.string().max(160),
    accepted: z.boolean(),
    code: z.string().max(80).optional(),
    events: z.array(z.unknown()),
    trace: z.array(z.unknown()).optional(),
    timestamp: z.number().int().nonnegative(),
  })).optional(),
});

export const ClientMessageV2Schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("HELLO_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
    accessToken: z.string().min(1).max(8192).optional(),
    resumeToken: z.string().min(16).max(256).optional(),
  }),
  QueuePayloadV2Schema.extend({
    type: z.literal("QUEUE_JOIN_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
    mode: z.enum(["casual", "ranked"]).default("casual"),
  }),
  z.object({
    type: z.literal("QUEUE_LEAVE_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
    requestId: IdSchemaV2,
  }),
  QueuePayloadV2Schema.extend({
    type: z.literal("PRIVATE_ROOM_CREATE_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
  }),
  QueuePayloadV2Schema.extend({
    type: z.literal("PRIVATE_ROOM_JOIN_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
    roomCode: z.string().trim().min(4).max(12),
  }),
  GameCommandEnvelopeV2Schema.extend({ type: z.literal("GAME_COMMAND_V2") }),
  z.object({
    type: z.literal("SANDBOX_CREATE_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
    requestId: IdSchemaV2,
    seed: z.string().min(1).max(160),
    players: z.tuple([SandboxPlayerV2Schema, SandboxPlayerV2Schema]),
  }),
  z.object({
    type: z.literal("SANDBOX_COMMAND_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
    requestId: IdSchemaV2,
    matchId: IdSchemaV2,
    commandId: IdSchemaV2,
    expectedRevision: z.number().int().nonnegative(),
    payload: SandboxCommandPayloadV2Schema,
  }),
  z.object({
    type: z.literal("SANDBOX_RESUME_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
    requestId: IdSchemaV2,
    matchId: IdSchemaV2,
    lastRevision: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("SANDBOX_CLOSE_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
    requestId: IdSchemaV2,
    matchId: IdSchemaV2,
  }),
  z.object({
    type: z.literal("RESUME_MATCH_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
    requestId: IdSchemaV2,
    matchId: IdSchemaV2,
    lastRevision: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("SURRENDER_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
    requestId: IdSchemaV2,
    matchId: IdSchemaV2,
  }),
  z.object({
    type: z.literal("PING_V2"),
    protocolVersion: z.literal(PROTOCOL_VERSION_V2),
    timestamp: z.number().optional(),
  }),
]);

export const ServerMessageV2Schema = z.discriminatedUnion("type", [
  MatchFoundV2Schema,
  StateUpdatedV2Schema,
  CommandAcceptedV2Schema,
  CommandRejectedV2Schema,
  ResumeOkV2Schema,
  ReadyV2Schema,
  QueueStatusV2Schema,
  PrivateRoomCreatedV2Schema,
  SandboxCreatedV2Schema,
  OpponentConnectionV2Schema,
  MatchEndedV2Schema,
  ErrorV2Schema,
  PongV2Schema,
]);

export const PlayerScopedCommandV2Schema = GameCommandEnvelopeV2Schema.extend({
  actor: PlayerIndexSchemaV2.optional(),
});

export type GameCommandV2Message = z.infer<typeof GameCommandV2Schema>;
export type AtomicOperationV2Message = z.infer<typeof AtomicOperationV2Schema>;
export type SandboxCommandPayloadV2Message = z.infer<typeof SandboxCommandPayloadV2Schema>;
export type SandboxCreatedV2Message = z.infer<typeof SandboxCreatedV2Schema>;
export type GameCommandEnvelopeV2Message = z.infer<typeof GameCommandEnvelopeV2Schema>;
export type CommandAcceptedV2Message = z.infer<typeof CommandAcceptedV2Schema>;
export type CommandRejectedV2Message = z.infer<typeof CommandRejectedV2Schema>;
export type MatchFoundV2Message = z.infer<typeof MatchFoundV2Schema>;
export type StateUpdatedV2Message = z.infer<typeof StateUpdatedV2Schema>;
export type ResumeOkV2Message = z.infer<typeof ResumeOkV2Schema>;
export type ServerMessageV2 = z.infer<typeof ServerMessageV2Schema>;
export type ClientMessageV2 = z.infer<typeof ClientMessageV2Schema>;
