import type { CardInstanceIdV2, GameStateV2, PlayerIndex } from "./model";

export type EffectSourceZoneV2 = "hand" | "field" | "base" | "retreat" | "void" | "timeline" | "attachment";

/**
 * 场上卡牌由其所在场地的玩家控制；场外卡牌由拥有者控制。
 * 结附卡跟随宿主的控制者。拥有者始终保存在卡牌实例上，离场移动仍回拥有者区域。
 */
export function cardControllerV2(state: GameStateV2, cardId: CardInstanceIdV2): PlayerIndex | null {
  for (const seat of [0, 1] as const) {
    const player = state.players[seat];
    if (player.baseCards.includes(cardId) || player.baseCovered.includes(cardId) || Object.values(player.field).some((cards) => cards.includes(cardId))) return seat;
  }
  const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(cardId))?.[0];
  if (host) return cardControllerV2(state, host);
  return state.cards[cardId]?.owner ?? null;
}

/** 盖卡不具有可起动/触发的效果，因此不会返回 source zone。 */
export function effectSourceZoneV2(state: GameStateV2, controller: PlayerIndex, cardId: CardInstanceIdV2): EffectSourceZoneV2 | null {
  const player = state.players[controller];
  if (player.hand.includes(cardId)) return "hand";
  if (Object.values(player.field).some((cards) => cards.includes(cardId))) return "field";
  if (player.baseCards.includes(cardId)) return "base";
  if (player.retreat.includes(cardId)) return "retreat";
  if (player.void.includes(cardId)) return "void";
  if (player.timeline.includes(cardId)) return "timeline";
  const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(cardId))?.[0];
  return host && cardControllerV2(state, host) === controller ? "attachment" : null;
}
