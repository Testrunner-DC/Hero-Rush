import type {
  AcceptedJournalEntryV2,
  CreateGameInputV2,
  GameEventV2,
  GameStateV2,
} from "@hero-rush/game-core";

export interface MatchCreationRecordV2 {
  matchId: string;
  mode: "casual" | "ranked" | "private";
  seed: string;
  players: [
    { userId: string; name: string; mainDeck: string[]; rushDeck: string[] },
    { userId: string; name: string; mainDeck: string[]; rushDeck: string[] },
  ];
  setup: Omit<CreateGameInputV2, "cardDefinitions">;
  initialState: GameStateV2;
}

export interface MatchEventRecordV2 extends AcceptedJournalEntryV2 {
  matchId: string;
  actorUserId: string;
  revision: number;
  events: GameEventV2[];
  state: GameStateV2;
}

export interface MatchStoreV2 {
  createMatch(record: MatchCreationRecordV2): Promise<void>;
  appendEvent(record: MatchEventRecordV2): Promise<void>;
  finishMatch(
    matchId: string,
    winnerSeat: 0 | 1 | null,
    reason: "surrender" | "disconnect_timeout",
    finalState: GameStateV2,
  ): Promise<void>;
}

export class InMemoryMatchStoreV2 implements MatchStoreV2 {
  readonly matches = new Map<string, MatchCreationRecordV2>();
  readonly events = new Map<string, MatchEventRecordV2[]>();
  readonly finished = new Map<string, { winnerSeat: 0 | 1 | null; reason: string; finalState: GameStateV2 }>();

  async createMatch(record: MatchCreationRecordV2): Promise<void> {
    this.matches.set(record.matchId, structuredClone(record));
    this.events.set(record.matchId, []);
  }

  async appendEvent(record: MatchEventRecordV2): Promise<void> {
    const journal = this.events.get(record.matchId) ?? [];
    journal.push(structuredClone(record));
    this.events.set(record.matchId, journal);
  }

  async finishMatch(
    matchId: string,
    winnerSeat: 0 | 1 | null,
    reason: "surrender" | "disconnect_timeout",
    finalState: GameStateV2,
  ): Promise<void> {
    this.finished.set(matchId, { winnerSeat, reason, finalState: structuredClone(finalState) });
  }
}
