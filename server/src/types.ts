import type { WebSocket } from "ws";

export interface ClientSession {
  connectionId: string;
  ws: WebSocket;
  userId: string | null;
  authenticated: boolean;
  helloComplete: boolean;
  matchId?: string;
  seat?: 0 | 1;
}

export interface MatchParticipant {
  userId: string;
  name: string;
  deck: string[];
  rushDeck: string[];
  ws: WebSocket | null;
}
