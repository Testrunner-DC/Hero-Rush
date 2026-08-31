import type { Card } from "../types/card";

export interface CardVariantGroup {
  cardNo: string;
  variants: Card[];
  lowest: Card;
}

/** Canonical display/deck order: lowest rarity first, then stable definition id. */
export function sortCardVariantsLowestFirst(cards: readonly Card[]): Card[] {
  return [...cards].sort((left, right) => left.rarity - right.rarity || left.id.localeCompare(right.id));
}

export function groupCardVariants(cards: readonly Card[]): CardVariantGroup[] {
  const grouped = new Map<string, Card[]>();
  for (const card of cards) grouped.set(card.card_no, [...(grouped.get(card.card_no) ?? []), card]);
  return [...grouped.entries()].map(([cardNo, values]) => {
    const variants = sortCardVariantsLowestFirst(values);
    return { cardNo, variants, lowest: variants[0] };
  });
}

export interface CardVariantAccess {
  /** Reserved for future account entitlements; ordinary players remain false. */
  canUsePremiumVariants: boolean;
}

export const ORDINARY_CARD_VARIANT_ACCESS: CardVariantAccess = { canUsePremiumVariants: false };

export function deckEligibleVariant(group: CardVariantGroup, access: CardVariantAccess, requested?: Card): Card {
  if (access.canUsePremiumVariants && requested && group.variants.some((card) => card.id === requested.id)) return requested;
  return group.lowest;
}
