import type { GameCommandV2, GameStateV2, PlayerIndex } from "./model";

export type GameCommandTypeV2 = GameCommandV2["type"];

/**
 * The single authoritative command whitelist for every externally stable V2
 * state. UI projection and kernel admission both consume this function.
 */
export function allowedCommandTypesV2(state: GameStateV2, actor: PlayerIndex): GameCommandTypeV2[] {
  if (state.status === "finished") return [];
  if (state.status === "setup") {
    return state.flow.kind === "SETUP_MULLIGAN"
      && state.decision?.kind === "MULLIGAN"
      && state.decision.actor === actor
      ? ["SUBMIT_MULLIGAN"]
      : [];
  }
  if (state.decision) {
    if (state.decision.actor !== actor) return [];
    return state.decision.kind === "SUMMON_PAYMENT"
      ? ["ANSWER_DECISION", "CANCEL_SUMMON_PAYMENT"]
      : state.decision.kind === "EFFECT_TARGETS"
        ? ["ANSWER_DECISION", "CANCEL_EFFECT_TARGETS"]
      : ["ANSWER_DECISION"];
  }

  switch (state.flow.kind) {
    case "ACTION":
      return state.activePlayer === actor
        ? ["DEPLOY_BASE", "SUMMON_CHARACTER", "MOVE_BATTLE_BASE", "ACTIVATE_EFFECT", "END_ACTION_PHASE"]
        : [];
    case "BATTLE_ADJUST":
      return state.activePlayer === actor ? ["SUBMIT_BATTLE_LAYOUT"] : [];
    case "BATTLE_FLANK_CHOICE":
      return state.activePlayer === actor ? ["CHOOSE_FLANK_ATTACKER"] : [];
    case "BATTLE_ATTACK":
      return state.activePlayer === actor ? ["DECLARE_ATTACK", "PASS_ATTACK_OPPORTUNITY"] : [];
    case "BATTLE_TARGET":
      return state.activePlayer === actor ? ["DECLARE_ATTACK"] : [];
    case "BATTLE_RESPONSE":
      return state.flow.priority === actor ? ["SUMMON_CHARACTER", "ACTIVATE_KEYWORD", "ACTIVATE_EFFECT", "PASS_PRIORITY"] : [];
    case "TURN_RESPONSE":
      return state.flow.priority === actor ? ["SUMMON_CHARACTER", "ACTIVATE_EFFECT", "PASS_PRIORITY"] : [];
    default:
      return [];
  }
}
