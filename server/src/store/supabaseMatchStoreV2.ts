import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GameStateV2 } from "@hero-rush/game-core";
import type {
  MatchCreationRecordV2,
  MatchEventRecordV2,
  MatchStoreV2,
} from "./matchStoreV2.js";

export class SupabaseMatchStoreV2 implements MatchStoreV2 {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async createMatch(record: MatchCreationRecordV2): Promise<void> {
    const { error: matchError } = await this.client.from("matches").insert({
      id: record.matchId,
      mode: record.mode,
      status: "setup",
      current_seq: 0,
      seed: record.seed,
      ruleset_version: record.initialState.match.rulesetVersion,
      card_data_version: record.initialState.match.cardDataVersion,
      engine_version: record.initialState.match.engineVersion,
    });
    if (matchError) throw matchError;

    const { error: playersError } = await this.client.from("match_players").insert(
      record.players.map((player, seat) => ({
        match_id: record.matchId,
        user_id: player.userId.startsWith("guest:") ? null : player.userId,
        guest_id: player.userId.startsWith("guest:") ? player.userId : null,
        seat,
        display_name: player.name,
        deck_snapshot: { deck: player.mainDeck, rushDeck: player.rushDeck },
      })),
    );
    if (playersError) throw playersError;

    const { error: snapshotError } = await this.client.from("match_snapshots").insert({
      match_id: record.matchId,
      seq: 0,
      state: record.initialState,
    });
    if (snapshotError) throw snapshotError;
  }

  async appendEvent(record: MatchEventRecordV2): Promise<void> {
    const { error: eventError } = await this.client.from("match_events").upsert(
      {
        match_id: record.matchId,
        seq: record.revision,
        command_id: record.commandId,
        actor_user_id: record.actorUserId.startsWith("guest:") ? null : record.actorUserId,
        actor_guest_id: record.actorUserId.startsWith("guest:") ? record.actorUserId : null,
        command: record.command,
        public_events: record.events,
      },
      { onConflict: "match_id,command_id" },
    );
    if (eventError) throw eventError;

    const { error: snapshotError } = await this.client.from("match_snapshots").upsert({
      match_id: record.matchId,
      seq: record.revision,
      state: record.state,
    });
    if (snapshotError) throw snapshotError;

    const { error: matchError } = await this.client
      .from("matches")
      .update({
        current_seq: record.revision,
        status: record.state.status,
      })
      .eq("id", record.matchId);
    if (matchError) throw matchError;
  }

  async finishMatch(
    matchId: string,
    winnerSeat: 0 | 1 | null,
    reason: "surrender" | "disconnect_timeout",
    finalState: GameStateV2,
  ): Promise<void> {
    const { error } = await this.client
      .from("matches")
      .update({
        status: "finished",
        winner_seat: winnerSeat,
        finish_reason: reason,
        finished_at: new Date().toISOString(),
        final_state: finalState,
      })
      .eq("id", matchId);
    if (error) throw error;
  }
}
