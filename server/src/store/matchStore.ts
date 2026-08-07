import type { BattleState } from "@hero-rush/game-core";
import type { GameCommand } from "@hero-rush/protocol";

export interface MatchCreationRecord {
  matchId: string;
  mode: "casual" | "ranked" | "private";
  seed: string;
  players: [
    { userId: string; name: string; deck: string[]; rushDeck: string[] },
    { userId: string; name: string; deck: string[]; rushDeck: string[] },
  ];
  initialState: BattleState;
}

export interface MatchEventRecord {
  matchId: string;
  seq: number;
  commandId: string;
  actorUserId: string;
  command: GameCommand;
  publicEvents: string[];
  state: BattleState;
}

export interface MatchStore {
  createMatch(record: MatchCreationRecord): Promise<void>;
  appendEvent(record: MatchEventRecord): Promise<void>;
  finishMatch(matchId: string, winnerSeat: 0 | 1 | null, reason: string, finalState: BattleState): Promise<void>;
}

export class InMemoryMatchStore implements MatchStore {
  readonly matches = new Map<string, MatchCreationRecord>();
  readonly events = new Map<string, MatchEventRecord[]>();

  async createMatch(record: MatchCreationRecord): Promise<void> {
    this.matches.set(record.matchId, structuredClone(record));
    this.events.set(record.matchId, []);
  }

  async appendEvent(record: MatchEventRecord): Promise<void> {
    const events = this.events.get(record.matchId) ?? [];
    events.push(structuredClone(record));
    this.events.set(record.matchId, events);
  }

  async finishMatch(): Promise<void> {
    // 内存存储仅供开发与测试；最终状态已包含在最后一个事件中。
  }
}
