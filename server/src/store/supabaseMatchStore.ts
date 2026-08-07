import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MatchCreationRecord, MatchEventRecord, MatchStore } from "./matchStore.js";
import type { BattleState } from "@hero-rush/game-core";

export class SupabaseMatchStore implements MatchStore {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async createMatch(record: MatchCreationRecord): Promise<void> {
    const { error: matchError } = await this.client.from("matches").insert({
      id: record.matchId,
      mode: record.mode,
      status: "playing",
      current_seq: 0,
      seed: record.seed,
      ruleset_version: record.initialState.rulesetVersion,
      card_data_version: record.initialState.cardDataVersion,
      engine_version: record.initialState.engineVersion,
    });
    if (matchError) throw matchError;

    const { error: playersError } = await this.client.from("match_players").insert(
      record.players.map((player, seat) => ({
        match_id: record.matchId,
        user_id: player.userId.startsWith("guest:") ? null : player.userId,
        guest_id: player.userId.startsWith("guest:") ? player.userId : null,
        seat,
        display_name: player.name,
        deck_snapshot: { deck: player.deck, rushDeck: player.rushDeck },
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

  async appendEvent(record: MatchEventRecord): Promise<void> {
    const { error: eventError } = await this.client.from("match_events").insert({
      match_id: record.matchId,
      seq: record.seq,
      command_id: record.commandId,
      actor_user_id: record.actorUserId.startsWith("guest:") ? null : record.actorUserId,
      actor_guest_id: record.actorUserId.startsWith("guest:") ? record.actorUserId : null,
      command: record.command,
      public_events: record.publicEvents,
    });
    if (eventError) throw eventError;

    const { error: snapshotError } = await this.client.from("match_snapshots").upsert({
      match_id: record.matchId,
      seq: record.seq,
      state: record.state,
    });
    if (snapshotError) throw snapshotError;

    const { error: matchError } = await this.client
      .from("matches")
      .update({ current_seq: record.seq })
      .eq("id", record.matchId);
    if (matchError) throw matchError;
  }

  async finishMatch(
    matchId: string,
    winnerSeat: 0 | 1 | null,
    reason: string,
    finalState: BattleState,
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
