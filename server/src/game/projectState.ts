import type { BattleState } from "@hero-rush/game-core";
import type { BattleView } from "@hero-rush/protocol";

const hidden = (scope: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `hidden:${scope}:${index}`);

function collectPublicInstances(state: BattleState, viewer: 0 | 1): Set<string> {
  const visible = new Set<string>();
  state.players.forEach((player, seat) => {
    for (const cards of Object.values(player.field)) cards.forEach((id) => visible.add(id));
    player.baseCards.forEach((id) => visible.add(id));
    player.timeline.forEach((id) => visible.add(id));
    player.retreat.forEach((id) => visible.add(id));
    player.void.forEach((id) => visible.add(id));
    if (seat === viewer) {
      player.hand.forEach((id) => visible.add(id));
      player.baseCovered.forEach((id) => visible.add(id));
    }
  });
  for (const [hostId, attachmentIds] of Object.entries(state.attachments)) {
    visible.add(hostId);
    attachmentIds.forEach((id) => visible.add(id));
  }
  if (state.pendingSummon) visible.add(state.pendingSummon.cardId);
  if (state.pendingCounter) visible.add(state.pendingCounter.summoningCardId);
  if (state.pendingEffectConfirmation) visible.add(state.pendingEffectConfirmation.effectCardId);
  if (state.pendingTargetSelection) visible.add(state.pendingTargetSelection.effectCardId);
  return visible;
}

/** 为每个席位生成独立视图，绝不下发牌库顺序、对手手牌和对手盖牌。 */
export function projectState(
  state: BattleState,
  viewer: 0 | 1,
  publicEvents: string[] = [],
): BattleView {
  const view = structuredClone(state);

  view.players.forEach((player, seat) => {
    player.deck = hidden(`p${seat}:deck`, player.deck.length);
    player.rushDeck = hidden(`p${seat}:rush`, player.rushDeck.length);
    if (seat !== viewer) {
      player.hand = hidden(`p${seat}:hand`, player.hand.length);
      player.baseCovered = hidden(`p${seat}:base`, player.baseCovered.length);
    }
  });

  const visible = collectPublicInstances(state, viewer);
  view.cardInstances = Object.fromEntries(
    Object.entries(state.cardInstances ?? {}).filter(([instanceId]) => visible.has(instanceId)),
  );
  view.randomState = undefined;
  view.log = publicEvents;

  const pendingEffectOwner = view.pendingTargetSelection
    ? state.players.findIndex((player) => [
        player.deck,
        player.rushDeck,
        player.hand,
        player.baseCards,
        player.baseCovered,
        player.timeline,
        player.retreat,
        player.void,
        ...Object.values(player.field),
      ].some((cards) => cards.includes(view.pendingTargetSelection!.effectCardId)))
    : -1;
  if (pendingEffectOwner !== viewer) {
    view.pendingTargetSelection = null;
  }
  if (view.pendingEffectConfirmation?.playerIdx !== viewer) {
    view.pendingEffectConfirmation = null;
  }

  return view as unknown as BattleView;
}
