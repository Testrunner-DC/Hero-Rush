export interface BattleV2Location {
  protocol: string;
  hostname: string;
  host: string;
}

export function battleV2WebSocketUrl(
  location: BattleV2Location = window.location,
  configuredUrl: string | undefined = import.meta.env.VITE_BATTLE_V2_WS_URL,
): string {
  const configured = configuredUrl?.trim();
  if (configured) return configured;

  if (location.protocol === "https:") return `wss://${location.host}/ws/`;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return `ws://${location.hostname}:8081`;
  }
  return `ws://${location.host}/ws/`;
}
