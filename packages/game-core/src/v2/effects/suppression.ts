import type { CardInstanceIdV2, GameStateV2 } from "../model";

/** Shared rule predicate for effects such as SP01-067 Anti-Venom. */
export function isCardEffectSuppressedV2(state: GameStateV2, cardId: CardInstanceIdV2): boolean {
  return (state.attachments[cardId] ?? []).some((attachedId) => state.cards[attachedId]?.cardNo === "SP01-067");
}

/** Shared immunity predicate. Character-effect immunity never blocks a card's own effect. */
export function isCardProtectedFromCharacterEffectV2(
  state: GameStateV2,
  targetCardId: CardInstanceIdV2,
  sourceCardId: CardInstanceIdV2,
  sourceLevel: number = state.cards[sourceCardId]?.level ?? 0,
): boolean {
  const source = state.cards[sourceCardId];
  if (!source || source.deckKind !== "main" || sourceCardId === targetCardId) return false;
  const levelOneAttachmentGuard = sourceLevel === 1 && Object.entries(state.attachments).some(([hostCardId, attachedIds]) => (
    (hostCardId === targetCardId || attachedIds.includes(targetCardId))
    && attachedIds.some((id) => state.cards[id]?.cardNo === "SP01-050" && !isCardEffectSuppressedV2(state, id))
  ));
  if (levelOneAttachmentGuard) return true;
  const target = state.cards[targetCardId];
  return Boolean(target && sourceLevel <= 4 && state.players[target.owner].baseCards.includes(targetCardId) && target.cardNo === "BP01-062" && !isCardEffectSuppressedV2(state, targetCardId));
}

/** Backward-compatible name retained for existing continuous-effect call sites. */
export function isCardProtectedFromLevelOneEffectV2(
  state: GameStateV2,
  targetCardId: CardInstanceIdV2,
  sourceCardId: CardInstanceIdV2,
  sourceLevel: number = state.cards[sourceCardId]?.level ?? 0,
): boolean {
  return isCardProtectedFromCharacterEffectV2(state, targetCardId, sourceCardId, sourceLevel);
}
