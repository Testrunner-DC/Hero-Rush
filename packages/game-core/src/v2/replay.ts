import type { CreateGameInputV2 } from "./setup";
import { createGameV2 } from "./setup";
import { executeAuthoritativeCommandV2 } from "./kernel";
import type { GameCommandV2, GameStateV2, PlayerIndex } from "./model";
import { hashStateV2 } from "./stateHash";

export interface AcceptedJournalEntryV2 {
  actor: PlayerIndex;
  commandId: string;
  expectedRevision: number;
  command: GameCommandV2;
  stateHash?: string;
}

export function rebuildGameV2(
  input: CreateGameInputV2,
  journal: readonly AcceptedJournalEntryV2[],
): GameStateV2 {
  let state = createGameV2(input);
  for (const entry of journal) {
    const result = executeAuthoritativeCommandV2(state, entry);
    if (!result.ok) {
      throw new Error(
        `V2 重放在 revision ${entry.expectedRevision} 失败：${result.code} ${result.message}`,
      );
    }
    if (entry.stateHash && entry.stateHash !== result.stateHash) {
      throw new Error(
        `V2 重放状态摘要不一致：期望 ${entry.stateHash}，实际 ${result.stateHash}`,
      );
    }
    state = result.state;
  }
  return state;
}

export function assertReplayEquivalentV2(
  expected: GameStateV2,
  rebuilt: GameStateV2,
): void {
  const expectedHash = hashStateV2(expected);
  const rebuiltHash = hashStateV2(rebuilt);
  if (expectedHash !== rebuiltHash) {
    throw new Error(`V2 回放不等价：${expectedHash} != ${rebuiltHash}`);
  }
}
