import type { AttackTargetV2, FieldZoneV2, GameStateV2, PlayerIndex, PlayerStateV2 } from "./model";

export const battleFieldZonesV2: readonly FieldZoneV2[] = ["vanguard", "flankLeft", "flankRight", "rear"];

export function locateBattleFieldCardV2(player: PlayerStateV2, cardId: string): FieldZoneV2 | null {
  return battleFieldZonesV2.find((zone) => player.field[zone].includes(cardId)) ?? null;
}

function battleRankV2(owner: PlayerIndex, zone: FieldZoneV2, activePlayer: PlayerIndex): number {
  const own = owner === activePlayer;
  if (own && zone === "rear") return 0;
  if (own && zone === "vanguard") return 2;
  if (zone === "flankLeft" || zone === "flankRight") return own ? 1 : 4;
  if (zone === "vanguard") return 3;
  return 5;
}

export function battleDistanceV2(
  activePlayer: PlayerIndex,
  attackerZone: FieldZoneV2,
  targetOwner: PlayerIndex,
  targetZone: FieldZoneV2,
): number {
  return Math.abs(
    battleRankV2(activePlayer, attackerZone, activePlayer)
      - battleRankV2(targetOwner, targetZone, activePlayer),
  );
}

export type AttackTargetRuleIssueV2 =
  | { code: "CARD_CANNOT_ATTACK"; message: string }
  | { code: "INVALID_TARGET"; message: string }
  | { code: "ATTACK_OUT_OF_RANGE"; message: string };

/** Pure attack-target rule shared by commands, effects and atomic target redirection. */
export function attackTargetRuleIssueV2(
  state: GameStateV2,
  actor: PlayerIndex,
  attackerId: string,
  target: AttackTargetV2,
  effectiveRange: (cardId: string) => number,
  hasKeyword: (cardId: string, keyword: "airRaid") => boolean,
  additionalRestriction: (attackerId: string, target: AttackTargetV2) => string | null = () => null,
): AttackTargetRuleIssueV2 | null {
  const attackerZone = locateBattleFieldCardV2(state.players[actor], attackerId);
  const attacker = state.cards[attackerId];
  const range = effectiveRange(attackerId);
  if (!attackerZone || !attacker || range <= 0) return { code: "CARD_CANNOT_ATTACK", message: "攻击角色不在战区或 R 为 0" };
  if (target.kind === "breach" && (state.usage.characterOnlyAdditionalAttackCardIds ?? []).includes(attackerId) && (state.battle?.attackedCardIds ?? []).filter((id) => id === attackerId).length >= 1) {
    return { code: "INVALID_TARGET", message: "该角色获得的第 2 次攻击机会只能攻击敌方角色" };
  }
  const defender: PlayerIndex = actor === 0 ? 1 : 0;
  let targetZone: FieldZoneV2;
  if (target.kind === "character") {
    const located = locateBattleFieldCardV2(state.players[defender], target.cardId);
    if (!located) return { code: "INVALID_TARGET", message: "目标角色不在敌方战区" };
    targetZone = located;
  } else {
    targetZone = target.zone;
    if (state.players[defender].field[targetZone].length > 0 && !hasKeyword(attackerId, "airRaid")) {
      return { code: "INVALID_TARGET", message: "该战区不是破绽；只有【空袭】可以攻击有角色的战区破绽" };
    }
  }
  const additionalIssue = additionalRestriction(attackerId, target);
  if (additionalIssue) return { code: "INVALID_TARGET", message: additionalIssue };
  return battleDistanceV2(actor, attackerZone, defender, targetZone) > range
    ? { code: "ATTACK_OUT_OF_RANGE", message: "目标超出攻击者 R 范围" }
    : null;
}

export function legalAttackTargetsV2(
  state: GameStateV2,
  actor: PlayerIndex,
  attackerId: string,
  effectiveRange: (cardId: string) => number,
  hasKeyword: (cardId: string, keyword: "airRaid") => boolean,
  additionalRestriction: (attackerId: string, target: AttackTargetV2) => string | null = () => null,
): AttackTargetV2[] {
  const defender: PlayerIndex = actor === 0 ? 1 : 0;
  return battleFieldZonesV2.flatMap((zone): AttackTargetV2[] => {
    const targetId = state.players[defender].field[zone][0];
    return [...(targetId ? [{ kind: "character" as const, cardId: targetId }] : []), { kind: "breach" as const, zone }];
  }).filter((target) => attackTargetRuleIssueV2(state, actor, attackerId, target, effectiveRange, hasKeyword, additionalRestriction) === null);
}
