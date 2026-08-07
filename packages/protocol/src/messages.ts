import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

const RequestIdSchema = z.string().min(1).max(100);
const MatchIdSchema = z.string().min(1).max(100);
const CardIdSchema = z.string().min(1).max(160);
const ZoneSchema = z.enum(["vanguard", "flankLeft", "flankRight", "rear"]);
const LocationSchema = z.union([ZoneSchema, z.literal("base")]);
const PhaseSchema = z.enum(["TURN_START", "DRAW", "ACTION", "CONFLICT", "END_PHASE"]);

export const DeckSelectionSchema = z
  .object({
    deckId: z.string().uuid().optional(),
    deck: z.array(CardIdSchema).length(50).optional(),
    rushDeck: z.array(CardIdSchema).length(9).optional(),
  })
  .refine(
    (value) => Boolean(value.deckId || (value.deck && value.rushDeck)),
    "必须提供 deckId，或提交完整的 50+9 卡组快照",
  );

/** 客户端只能提交意图，玩家身份由服务端连接会话补充。 */
export const GameCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("DRAW_CARDS") }),
  z.object({ type: z.literal("ADVANCE_PHASE"), next: PhaseSchema }),
  z.object({ type: z.literal("END_TURN") }),
  z.object({ type: z.literal("DEPLOY_TO_BASE"), cardId: CardIdSchema }),
  z.object({ type: z.literal("SUMMON_TO_FIELD"), cardId: CardIdSchema, zone: LocationSchema }),
  z.object({ type: z.literal("MOVE_CHARACTER"), fromZone: ZoneSchema, cardId: CardIdSchema, toZone: ZoneSchema }),
  z.object({ type: z.literal("MOVE_CARD"), fromLoc: LocationSchema, cardId: CardIdSchema, toLoc: LocationSchema }),
  z.object({ type: z.literal("SET_ATTACK_ZONE"), zone: ZoneSchema }),
  z.object({ type: z.literal("START_ATTACK"), zone: ZoneSchema, cardId: CardIdSchema }),
  z.object({ type: z.literal("CONFIRM_ATTACK"), targetZone: ZoneSchema, targetCardId: CardIdSchema.optional() }),
  z.object({ type: z.literal("SKIP_ZONE"), zone: ZoneSchema }),
  z.object({ type: z.literal("START_ATTACK_SUBPHASE") }),
  z.object({ type: z.literal("CLEAR_ATTACK_TARGET") }),
  z.object({ type: z.literal("SELECT_RETREAT"), cardId: CardIdSchema, loc: LocationSchema }),
  z.object({ type: z.literal("CANCEL_SUMMON") }),
  z.object({ type: z.literal("MULLIGAN_SELECT"), cardIds: z.array(CardIdSchema).max(6) }),
  z.object({ type: z.literal("MULLIGAN_CONFIRM") }),
  z.object({ type: z.literal("TRIGGER_COUNTER"), cardId: CardIdSchema, handIndex: z.number().int().nonnegative() }),
  z.object({ type: z.literal("RESOLVE_COUNTER"), effectCardId: CardIdSchema, effectId: z.string().max(160).optional() }),
  z.object({ type: z.literal("PASS_COUNTER") }),
  z.object({ type: z.literal("ACTIVATE_EFFECT"), cardId: CardIdSchema, effectId: z.string().max(160).optional() }),
  z.object({ type: z.literal("SELECT_TARGETS"), targetCardIds: z.array(CardIdSchema).max(20) }),
  z.object({ type: z.literal("CANCEL_TARGET_SELECTION") }),
  z.object({ type: z.literal("CONFIRM_EFFECT") }),
  z.object({ type: z.literal("DECLINE_EFFECT") }),
]);

const QueuePayloadSchema = z.object({
  requestId: RequestIdSchema,
  playerName: z.string().trim().min(1).max(24),
  deckSelection: DeckSelectionSchema,
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("HELLO"),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    accessToken: z.string().min(1).max(8192).optional(),
    resumeToken: z.string().min(16).max(256).optional(),
  }),
  QueuePayloadSchema.extend({ type: z.literal("QUEUE_JOIN"), mode: z.enum(["casual", "ranked"]).default("casual") }),
  z.object({ type: z.literal("QUEUE_LEAVE"), requestId: RequestIdSchema }),
  QueuePayloadSchema.extend({ type: z.literal("PRIVATE_ROOM_CREATE") }),
  QueuePayloadSchema.extend({ type: z.literal("PRIVATE_ROOM_JOIN"), roomCode: z.string().trim().min(4).max(12) }),
  z.object({
    type: z.literal("GAME_COMMAND"),
    requestId: RequestIdSchema,
    matchId: MatchIdSchema,
    commandId: RequestIdSchema,
    expectedSeq: z.number().int().nonnegative(),
    command: GameCommandSchema,
  }),
  z.object({ type: z.literal("RESUME_MATCH"), requestId: RequestIdSchema, matchId: MatchIdSchema, lastSeq: z.number().int().nonnegative() }),
  z.object({ type: z.literal("SURRENDER"), requestId: RequestIdSchema, matchId: MatchIdSchema }),
  z.object({ type: z.literal("PING"), timestamp: z.number().optional() }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type GameCommand = z.infer<typeof GameCommandSchema>;
export type DeckSelection = z.infer<typeof DeckSelectionSchema>;

export type PublicPlayer = {
  name: string;
  deck: string[];
  rushDeck: string[];
  hand: string[];
  baseCards: string[];
  baseCovered: string[];
  field: Record<"vanguard" | "flankLeft" | "flankRight" | "rear", string[]>;
  timeline: string[];
  retreat: string[];
  void: string[];
  isFirstPlayer: boolean;
};

export type BattleView = Record<string, unknown> & {
  players: [PublicPlayer, PublicPlayer];
  cardInstances?: Record<string, string>;
};

export type ServerMessage =
  | { type: "READY"; protocolVersion: typeof PROTOCOL_VERSION; connectionId: string; userId: string; authenticated: boolean; resumeToken: string }
  | { type: "QUEUE_STATUS"; requestId?: string; position: number; mode: "casual" | "ranked" }
  | { type: "PRIVATE_ROOM_CREATED"; requestId: string; roomCode: string }
  | { type: "MATCH_FOUND"; matchId: string; seat: 0 | 1; opponentName: string; seq: number; state: BattleView }
  | { type: "STATE_UPDATED"; matchId: string; seq: number; state: BattleView; events: string[]; acceptedCommandId?: string }
  | { type: "COMMAND_REJECTED"; requestId: string; commandId: string; code: string; message: string; currentSeq: number }
  | { type: "RESUME_OK"; requestId: string; matchId: string; seat: 0 | 1; opponentName: string; seq: number; state: BattleView }
  | { type: "OPPONENT_CONNECTION"; matchId: string; connected: boolean; graceDeadline?: number }
  | { type: "MATCH_ENDED"; matchId: string; winner: 0 | 1 | null; reason: "game_over" | "surrender" | "disconnect_timeout" }
  | { type: "ERROR"; code: string; message: string; requestId?: string }
  | { type: "PONG"; timestamp?: number };
