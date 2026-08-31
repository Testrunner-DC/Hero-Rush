export interface SandboxLaunchPlayerV2 {
  name: string;
  deckName: string;
  deck: string[];
  rushDeck: string[];
}

export interface SandboxLaunchStateV2 {
  source: "battle-lobby";
  seed: string;
  players: [SandboxLaunchPlayerV2, SandboxLaunchPlayerV2];
}

function isLaunchPlayer(value: unknown): value is SandboxLaunchPlayerV2 {
  if (!value || typeof value !== "object") return false;
  const player = value as Partial<SandboxLaunchPlayerV2>;
  return typeof player.name === "string"
    && typeof player.deckName === "string"
    && Array.isArray(player.deck)
    && player.deck.length === 50
    && player.deck.every((id) => typeof id === "string")
    && Array.isArray(player.rushDeck)
    && player.rushDeck.length === 9
    && player.rushDeck.every((id) => typeof id === "string");
}

export function isSandboxLaunchStateV2(value: unknown): value is SandboxLaunchStateV2 {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<SandboxLaunchStateV2>;
  return state.source === "battle-lobby"
    && typeof state.seed === "string"
    && Array.isArray(state.players)
    && state.players.length === 2
    && isLaunchPlayer(state.players[0])
    && isLaunchPlayer(state.players[1]);
}
