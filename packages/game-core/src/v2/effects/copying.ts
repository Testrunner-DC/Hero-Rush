import type { CardInstanceIdV2, GameStateV2 } from "../model";

export function effectCardNosForInstanceV2(state: GameStateV2, cardId: CardInstanceIdV2): string[] {
  const printed = state.cards[cardId]?.cardNo;
  return [...new Set([...(printed ? [printed] : []), ...(state.effectCopies ?? []).filter((copy) => copy.targetCardId === cardId).map((copy) => copy.copiedCardNo)])];
}

export function cardHasEffectIdentityV2(state: GameStateV2, cardId: CardInstanceIdV2, cardNo: string): boolean {
  return effectCardNosForInstanceV2(state, cardId).includes(cardNo);
}
