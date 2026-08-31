import type { GameStateV2, ModifierStateV2, OfficialKeywordV2, PlayerIndex } from "../model";
import { isCardEffectSuppressedV2, isCardProtectedFromLevelOneEffectV2 } from "../effects/suppression";
import { cardHasEffectIdentityV2 } from "../effects/copying";

type ValueResolverV2 = (cardId: string, type: ModifierStateV2["type"]) => number;
const fieldZones = ["vanguard", "flankLeft", "flankRight", "rear"] as const;

function fieldZoneOf(state: GameStateV2, owner: PlayerIndex, cardId: string): typeof fieldZones[number] | null {
  return fieldZones.find((zone) => state.players[owner].field[zone].includes(cardId)) ?? null;
}

function attachmentHost(state: GameStateV2, cardId: string): string | null {
  return Object.entries(state.attachments).find(([, cards]) => cards.includes(cardId))?.[0] ?? null;
}

function battleZoneCard(state: GameStateV2, owner: PlayerIndex, cardId: string): boolean {
  return fieldZoneOf(state, owner, attachmentHost(state, cardId) ?? cardId) !== null;
}

function faceUpOnField(state: GameStateV2, owner: PlayerIndex, cardId: string): boolean {
  return state.players[owner].baseCards.includes(cardId) || battleZoneCard(state, owner, cardId);
}

function isBattlePhase(state: GameStateV2): boolean {
  return state.flow.kind.startsWith("BATTLE_");
}

/** Canonical continuous-value layer for SD01-SD04; returns deltas only. */
export function starterContinuousDeltaV2(
  state: GameStateV2,
  targetCardId: string,
  type: ModifierStateV2["type"],
  resolve: ValueResolverV2,
): number {
  const target = state.cards[targetCardId];
  if (!target) return 0;
  const owner = target.owner;
  const opponent: PlayerIndex = owner === 0 ? 1 : 0;
  const targetEffectsActive = !isCardEffectSuppressedV2(state, targetCardId) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, targetCardId);
  let delta = 0;

  for (const [hostCardId, attachedIds] of Object.entries(state.attachments)) {
    if (hostCardId !== targetCardId) continue;
    for (const attachedId of attachedIds) {
      if (isCardEffectSuppressedV2(state, attachedId) || isCardProtectedFromLevelOneEffectV2(state, targetCardId, attachedId)) continue;
      if (cardHasEffectIdentityV2(state, attachedId, "SD01-002")) delta += type === "range" ? 2 : type === "power" ? 2500 : 0;
      if (cardHasEffectIdentityV2(state, attachedId, "SD01-010") && type === "range") delta += 1;
      if (cardHasEffectIdentityV2(state, attachedId, "SD01-016") && type === "power") delta += 1000;
      if (cardHasEffectIdentityV2(state, attachedId, "SD04-001") && type === "power") delta += 1000;
    }
  }

  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "SD01-004") && type === "power" && battleZoneCard(state, owner, targetCardId) && state.activePlayer === opponent && isBattlePhase(state)) {
    delta += fieldZones.reduce((count, zone) => count + state.players[opponent].field[zone].length, 0) * 1000;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "SD01-008") && type === "level" && state.players[owner].hand.includes(targetCardId)) {
    const allFaceUp = ([0, 1] as const).flatMap((seat) => [
      ...state.players[seat].baseCards,
      ...fieldZones.flatMap((zone) => state.players[seat].field[zone]),
      ...Object.values(state.attachments).flat().filter((id) => state.cards[id]?.owner === seat),
    ]);
    if (!allFaceUp.some((id) => resolve(id, "level") >= 4)) delta -= 2;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "SD02-001") && type === "power" && battleZoneCard(state, owner, targetCardId)) delta += state.players[owner].baseCovered.length * 1000;
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "SD02-002") && type === "range" && battleZoneCard(state, owner, targetCardId)) delta += state.players[owner].baseCovered.length;

  for (const source of Object.values(state.cards).filter((card) => card.owner === owner && faceUpOnField(state, owner, card.instanceId))) {
    if (isCardEffectSuppressedV2(state, source.instanceId) || isCardProtectedFromLevelOneEffectV2(state, targetCardId, source.instanceId)) continue;
    if (!cardHasEffectIdentityV2(state, source.instanceId, "SD02-001") || type !== "power" || !battleZoneCard(state, owner, source.instanceId)) continue;
    const yellowRetreatCount = state.players[owner].retreat.filter((id) => state.cards[id]?.attribute === 2).length;
    if (yellowRetreatCount >= 9 && battleZoneCard(state, owner, targetCardId) && target.features.includes("机械") && resolve(targetCardId, "level") === 1) delta += state.players[owner].baseCovered.length * 1000;
  }
  for (const source of Object.values(state.cards).filter((card) => card.owner === opponent && faceUpOnField(state, opponent, card.instanceId))) {
    if (isCardEffectSuppressedV2(state, source.instanceId) || isCardProtectedFromLevelOneEffectV2(state, targetCardId, source.instanceId)) continue;
    if (cardHasEffectIdentityV2(state, source.instanceId, "SD02-003") && type === "power" && fieldZoneOf(state, opponent, source.instanceId) === "rear" && fieldZoneOf(state, owner, targetCardId) === "vanguard") delta -= 500;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "SD02-018") && type === "power" && battleZoneCard(state, owner, targetCardId)) {
    const enemyVanguard = state.players[opponent].field.vanguard[0];
    if (enemyVanguard && resolve(enemyVanguard, "range") === 1) delta += 1500;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "SD03-004")) {
    if (type === "range" && fieldZoneOf(state, owner, targetCardId) === "rear") delta += 2;
    if (type === "level" && state.players[owner].baseCards.includes(targetCardId)) delta += 1;
  }
  for (const source of Object.values(state.cards).filter((card) => card.owner === opponent && faceUpOnField(state, opponent, card.instanceId))) {
    if (isCardEffectSuppressedV2(state, source.instanceId) || isCardProtectedFromLevelOneEffectV2(state, targetCardId, source.instanceId)) continue;
    const sourceZone = fieldZoneOf(state, opponent, source.instanceId);
    const targetZone = fieldZoneOf(state, owner, targetCardId);
    if (cardHasEffectIdentityV2(state, source.instanceId, "SD03-011") && type === "power") {
      if (sourceZone === "vanguard" && (targetZone === "flankLeft" || targetZone === "flankRight")) delta -= 1000;
      if ((sourceZone === "flankLeft" || sourceZone === "flankRight") && targetZone === "vanguard") delta -= 500;
    }
    if (cardHasEffectIdentityV2(state, source.instanceId, "SD04-016") && type === "level" && targetZone === "rear") delta -= 2;
  }
  return delta;
}

/** Printed continuous replacement effects are applied before all +/- deltas. */
export function starterContinuousReplacementV2(
  state: GameStateV2,
  targetCardId: string,
  type: ModifierStateV2["type"],
): number | null {
  if (type !== "range") return null;
  for (const [hostCardId, attachedIds] of Object.entries(state.attachments)) {
    if (hostCardId !== targetCardId) continue;
    if (attachedIds.some((id) => cardHasEffectIdentityV2(state, id, "SD04-001") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) return 0;
    if (attachedIds.some((id) => cardHasEffectIdentityV2(state, id, "SD03-016") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) return 1;
  }
  return null;
}

export function starterContinuousKeywordsV2(state: GameStateV2, cardId: string): OfficialKeywordV2[] {
  const card = state.cards[cardId];
  if (!card || isCardEffectSuppressedV2(state, cardId) || isCardProtectedFromLevelOneEffectV2(state, cardId, cardId) || !cardHasEffectIdentityV2(state, cardId, "SD01-017") || !battleZoneCard(state, card.owner, cardId)) return [];
  const fieldCount = fieldZones.reduce((count, zone) => count + state.players[card.owner].field[zone].length, 0);
  return fieldCount === 1 ? ["combo"] : [];
}

export function preventsTieRetreatV2(state: GameStateV2, cardId: string): boolean {
  const card = state.cards[cardId];
  return Boolean(card && !isCardEffectSuppressedV2(state, cardId) && !isCardProtectedFromLevelOneEffectV2(state, cardId, cardId) && cardHasEffectIdentityV2(state, cardId, "SD02-003") && fieldZoneOf(state, card.owner, cardId) === "vanguard");
}
