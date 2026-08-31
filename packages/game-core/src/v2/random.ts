/** 可被快照保存和重放的确定性随机数状态。 */
export interface DeterministicRandomState {
  seed: string;
  value: number;
  cursor: number;
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || 0x6d2b79f5;
}

export function createRandomState(seed: string): DeterministicRandomState {
  return { seed, value: hashSeed(seed), cursor: 0 };
}

/** xorshift32：同一状态始终产生同一结果与下一状态。 */
export function nextRandom(state: DeterministicRandomState): { value: number; state: DeterministicRandomState } {
  let next = state.value >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return {
    value: next / 0x1_0000_0000,
    state: { ...state, value: next, cursor: state.cursor + 1 },
  };
}

export function shuffleDeterministic<T>(source: readonly T[], initialState: DeterministicRandomState): { items: T[]; state: DeterministicRandomState } {
  const items = [...source];
  let state = initialState;
  for (let i = items.length - 1; i > 0; i -= 1) {
    const next = nextRandom(state);
    state = next.state;
    const j = Math.floor(next.value * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return { items, state };
}
