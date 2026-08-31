import type { AttackTargetV2, GameStateV2, ModifierStateV2, OfficialKeywordV2 } from "../model";
import { cardControllerV2 } from "../control";
import { isCardEffectSuppressedV2, isCardProtectedFromLevelOneEffectV2 } from "../effects/suppression";
import { cardHasEffectIdentityV2 } from "../effects/copying";

const fieldZones = ["vanguard", "flankLeft", "flankRight", "rear"] as const;

export function promoAttackTargetRestrictionV2(
  state: GameStateV2,
  attackerId: string,
  target: AttackTargetV2,
  effectiveLevel: (cardId: string) => number,
): string | null {
  const restricted = (state.attachments[attackerId] ?? []).some((id) => cardHasEffectIdentityV2(state, id, "BP01-098") && !isCardEffectSuppressedV2(state, id));
  if (restricted && !(target.kind === "character" && effectiveLevel(target.cardId) === 6)) return "受【混沌灵视】限制，该角色只能攻击敌方 Lv6 角色";
  const vanguardOnly = (state.attachments[attackerId] ?? []).some((id) => cardHasEffectIdentityV2(state, id, "SP01-077") && !isCardEffectSuppressedV2(state, id));
  if (vanguardOnly) {
    const controller = cardControllerV2(state, attackerId);
    if (controller === null) return "无法确认攻击角色的控制者";
    const defender = controller === 0 ? 1 : 0;
    const legal = target.kind === "breach" ? target.zone === "vanguard" : state.players[defender].field.vanguard.includes(target.cardId);
    if (!legal) return "受【多元逆转】限制，该角色只能攻击敌方先锋区或先锋区角色";
  }
  return null;
}

export function promoSummonPaymentForbiddenV2(state: GameStateV2, cardId: string, effectiveLevel: (cardId: string) => number): boolean {
  return effectiveLevel(cardId) <= 3 && (state.attachments[cardId] ?? []).some((id) => cardHasEffectIdentityV2(state, id, "SP01-079") && !isCardEffectSuppressedV2(state, id));
}

function inBattleZone(state: GameStateV2, cardId: string): boolean {
  const card = state.cards[cardId];
  return Boolean(card && fieldZones.some((zone) => state.players[card.owner].field[zone].includes(cardId)));
}

function isFaceUpRole(state: GameStateV2, cardId: string): boolean {
  const card = state.cards[cardId];
  return Boolean(card && (inBattleZone(state, cardId) || state.players[card.owner].baseCards.includes(cardId)));
}

function presentFaceUpIds(state: GameStateV2): string[] {
  return [...new Set(state.players.flatMap((player) => [...player.baseCards, ...fieldZones.flatMap((zone) => player.field[zone]), ...Object.values(state.attachments).flat()]))];
}

function guardianCountBesides(state: GameStateV2, cardId: string): number {
  const card = state.cards[cardId];
  if (!card) return 0;
  return fieldZones
    .flatMap((zone) => state.players[card.owner].field[zone])
    .filter((id) => id !== cardId && state.cards[id]?.features.some((feature) => feature.includes("银河护卫队")))
    .length;
}

/** SP01-013：仅削减已经存在的战力减少量，不能把减益反转成增益。 */
export function promoPowerReductionMitigationV2(state: GameStateV2, targetCardId: string): number {
  const target = state.cards[targetCardId];
  if (!target || !inBattleZone(state, targetCardId)) return 0;
  const rear = state.players[target.owner].field.rear[0];
  if (!rear || !cardHasEffectIdentityV2(state, rear, "SP01-013") || isCardEffectSuppressedV2(state, rear) || isCardProtectedFromLevelOneEffectV2(state, targetCardId, rear)) return 0;
  const lv6Count = [
    ...fieldZones.flatMap((zone) => state.players[target.owner].field[zone]),
    ...state.players[target.owner].baseCards,
  ].filter((id) => state.cards[id]?.level === 6).length;
  return lv6Count * 500;
}

export function promoPowerReductionMultiplierV2(state: GameStateV2, targetCardId: string): number {
  return cardHasEffectIdentityV2(state, targetCardId, "SP01-052") && !isCardEffectSuppressedV2(state, targetCardId) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, targetCardId) && inBattleZone(state, targetCardId) ? 2 : 1;
}

export function promoContinuousReplacementV2(
  state: GameStateV2,
  targetCardId: string,
  type: ModifierStateV2["type"],
  effectiveRange: (cardId: string) => number,
): number | null {
  const targetOwner = state.cards[targetCardId]?.owner;
  if (type === "level" && targetOwner !== undefined && cardHasEffectIdentityV2(state, targetCardId, "BP01-110") && !isCardEffectSuppressedV2(state, targetCardId) && state.players[targetOwner].baseCards.includes(targetCardId) && fieldZones.flatMap((zone) => state.players[targetOwner].field[zone]).length === 0) return 5;
  if (type === "level" && cardHasEffectIdentityV2(state, targetCardId, "SP01-040") && !isCardEffectSuppressedV2(state, targetCardId) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, targetCardId) && presentFaceUpIds(state).includes(targetCardId)) {
    return effectiveRange(targetCardId);
  }
  if (type === "level" && (state.attachments[targetCardId] ?? []).some((id) => cardHasEffectIdentityV2(state, id, "BP01-030") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) return 6;
  if (type === "range" && inBattleZone(state, targetCardId)) {
    const quantumEntanglement = (state.attachments[targetCardId] ?? []).find((id) => cardHasEffectIdentityV2(state, id, "BP01-081") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
    if (quantumEntanglement) return 1;
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null && state.players[actor].field.vanguard.includes(targetCardId) && fieldZones.flatMap((zone) => state.players[actor].field[zone]).some((id) => cardHasEffectIdentityV2(state, id, "BP01-097") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) return 3;
    if (actor !== null) {
      const source = fieldZones.flatMap((zone) => state.players[state.activePlayer].field[zone]).find((id) => cardHasEffectIdentityV2(state, id, "BP01-049") && !isCardEffectSuppressedV2(state, id));
      const enemy = state.activePlayer === 0 ? 1 : 0;
      if (source && (targetCardId === source || state.players[enemy].field.rear.includes(targetCardId))) return 1;
    }
    if (actor !== null && (state.players[actor].field.flankLeft.includes(targetCardId) || state.players[actor].field.flankRight.includes(targetCardId))) {
      const left = state.players[actor].field.flankLeft[0]; const right = state.players[actor].field.flankRight[0];
      const sourcePresent = presentFaceUpIds(state).some((id) => cardControllerV2(state, id) === actor && cardHasEffectIdentityV2(state, id, "BP01-029") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
      if (sourcePresent && left && right && state.cards[left]?.level === state.cards[right]?.level) return 2;
    }
    if (actor !== null && fieldZones.flatMap((zone) => state.players[actor].field[zone]).some((id) => cardHasEffectIdentityV2(state, id, "SP01-045") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) {
      return fieldZones.flatMap((zone) => state.players[actor].field[zone]).filter((id) => state.cards[id]?.power === 500).length;
    }
    if (actor !== null && state.cards[targetCardId]?.name.includes("钢铁侠") && fieldZones.flatMap((zone) => state.players[actor].field[zone]).some((id) => cardHasEffectIdentityV2(state, id, "BP01-024") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) return 2;
  }
  return null;
}

/** Continuous-value layer for promotional and booster cards; returns deltas only. */
export function promoContinuousDeltaV2(
  state: GameStateV2,
  targetCardId: string,
  type: ModifierStateV2["type"],
  keywordCount: (cardId: string) => number = () => 0,
  effectiveLevel: (cardId: string) => number = (cardId) => state.cards[cardId]?.level ?? 0,
  effectiveRange: (cardId: string) => number = (cardId) => state.cards[cardId]?.range ?? 0,
  effectivePower: (cardId: string) => number = (cardId) => state.cards[cardId]?.power ?? 0,
): number {
  const target = state.cards[targetCardId];
  if (!target) return 0;
  let delta = 0;
  if (type === "level" && state.players[target.owner].hand.includes(targetCardId) && cardHasEffectIdentityV2(state, targetCardId, "BP01-046") && !isCardEffectSuppressedV2(state, targetCardId)) {
    delta -= [...state.players[target.owner].baseCards, ...fieldZones.flatMap((zone) => state.players[target.owner].field[zone])]
      .filter((id) => state.cards[id]?.features.some((feature) => feature.includes("复仇者联盟"))).length;
  }
  if (type === "level" && state.players[target.owner].hand.includes(targetCardId) && target.features.some((feature) => feature.includes("神奇四侠"))) {
    const sourcePresent = presentFaceUpIds(state).some((id) => cardControllerV2(state, id) === target.owner && cardHasEffectIdentityV2(state, id, "BP01-075") && !isCardEffectSuppressedV2(state, id));
    if (sourcePresent) delta -= 1;
  }
  if (!isFaceUpRole(state, targetCardId)) return delta;
  const targetEffectsActive = !isCardEffectSuppressedV2(state, targetCardId) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, targetCardId);
  if (type === "power") {
    const targetController = cardControllerV2(state, targetCardId);
    const suppressors = presentFaceUpIds(state).filter((id) => cardHasEffectIdentityV2(state, id, "SP01-032") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id) && cardControllerV2(state, id) !== targetController);
    if (suppressors.length > 0) {
      const webAttachments = (state.attachments[targetCardId] ?? []).filter((id) => state.cards[id]?.features.some((feature) => feature.includes("蛛网"))).length;
      delta -= webAttachments * 1000 * suppressors.length;
    }
  }

  const attached = state.attachments[targetCardId] ?? [];
  if (type === "power" && attached.some((id) => cardHasEffectIdentityV2(state, id, "SP01-033") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) delta += 1000;
  if (type === "range" && attached.some((id) => cardHasEffectIdentityV2(state, id, "SP01-033") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) delta += 1;
  if (type === "range" && attached.some((id) => cardHasEffectIdentityV2(state, id, "SP01-037") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) delta += 2;
  if (type === "power" && attached.some((id) => cardHasEffectIdentityV2(state, id, "SP01-036") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) delta += 1000;
  if (type === "power" && attached.some((id) => cardHasEffectIdentityV2(state, id, "BP01-023") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) delta += 1000;
  if (type === "power") {
    const riot = attached.find((id) => cardHasEffectIdentityV2(state, id, "SP01-053") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
    if (riot && target.features.some((feature) => feature.includes("人类"))) delta -= target.range * 1000;
  }

  if (!inBattleZone(state, targetCardId)) return delta;

  if (type === "range") {
    const targetController = cardControllerV2(state, targetCardId);
    const vanguard = targetController === null ? null : state.players[targetController].field.vanguard[0];
    if (vanguard === targetCardId) {
      const enemy = targetController === 0 ? 1 : 0;
      const suppressor = fieldZones.flatMap((zone) => state.players[enemy].field[zone]).find((id) => cardHasEffectIdentityV2(state, id, "SP01-041") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
      if (suppressor) delta -= (state.attachments[suppressor] ?? []).length;
    }
  }

  const mentorActive = presentFaceUpIds(state).some((id) => cardHasEffectIdentityV2(state, id, "SP01-033") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id) && inBattleZone(state, id) && cardControllerV2(state, id) === cardControllerV2(state, targetCardId));
  const actor = cardControllerV2(state, targetCardId);
  if (actor !== null && mentorActive && state.activePlayer === actor && target.features.some((feature) => feature.includes("蛛网"))) {
    const enemy = actor === 0 ? 1 : 0;
    const ownCount = fieldZones.flatMap((zone) => state.players[actor].field[zone]).length;
    const enemyCount = fieldZones.flatMap((zone) => state.players[enemy].field[zone]).length;
    if (ownCount === enemyCount) {
      if (type === "power") delta += 1000;
      if (type === "range") delta += 1;
    }
  }

  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "PB01-004")) {
    const count = guardianCountBesides(state, targetCardId);
    if (type === "range") delta += count;
    if (type === "power") delta += count * 1000;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "PB01-006") && type === "power") {
    delta -= state.players[target.owner].hand.length * 1000;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "SP01-005") && type === "power") {
    delta += state.players[target.owner].retreat.filter((id) => state.cards[id]?.deckKind === "main" && state.cards[id]?.name.includes("装甲")).length * 1000;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "SP01-047")) {
    const count = (state.attachments[targetCardId] ?? []).length;
    if (type === "range") delta += count;
    if (type === "power") delta += count * 1000;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "BP01-004")) {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null) {
      const ownRoles = [...state.players[actor].baseCards, ...fieldZones.flatMap((zone) => state.players[actor].field[zone])];
      if (ownRoles.length > 0 && ownRoles.every((id) => state.cards[id]?.attribute === 1)) {
        const enemy = actor === 0 ? 1 : 0;
        const x = fieldZones.flatMap((zone) => state.players[enemy].field[zone]).length;
        if (type === "level") delta += x;
        if (type === "power") delta += x * 1000;
      }
    }
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "BP01-006")) {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null) {
      if (state.players[actor].hand.length % 2 === 1 && type === "range") delta += 2;
      if (state.players[actor].hand.length % 2 === 0 && type === "power") delta += 5500;
    }
  }
  {
    const targetController = cardControllerV2(state, targetCardId);
    const inFlank = targetController !== null && (state.players[targetController].field.flankLeft.includes(targetCardId) || state.players[targetController].field.flankRight.includes(targetCardId));
    if (targetController !== null && inFlank && target.features.some((feature) => feature.includes("机械"))) {
      const curse = fieldZones.flatMap((zone) => state.players[targetController].field[zone]).find((id) => cardHasEffectIdentityV2(state, id, "BP01-031") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
      if (curse) {
        if (type === "power") delta += 1000;
        if (type === "range" && target.name.includes("奥创")) delta += 1;
      }
    }
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "BP01-036") && type === "power") {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null) delta += fieldZones.flatMap((zone) => state.players[actor].field[zone]).filter((id) => id !== targetCardId && state.cards[id]?.attribute === 2).length * 1000;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "BP01-055") && type === "range") {
    const actor = cardControllerV2(state, targetCardId);
    const enemy = actor === 0 ? 1 : 0;
    const vanguard = actor === null ? null : state.players[enemy].field.vanguard[0];
    if (vanguard) delta += Math.floor(effectivePower(vanguard) / 3000);
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "BP01-056") && type === "power") {
    const actor = cardControllerV2(state, targetCardId);
    const enemy = actor === 0 ? 1 : 0;
    const vanguard = actor === null ? null : state.players[enemy].field.vanguard[0];
    if (vanguard && effectiveRange(vanguard) === 1) delta += 1500;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "BP01-058") && type === "power") {
    const actor = cardControllerV2(state, targetCardId);
    const enemy = actor === 0 ? 1 : 0;
    if (actor !== null && fieldZones.flatMap((zone) => state.players[enemy].field[zone]).reduce((sum, id) => sum + effectiveRange(id), 0) >= 3) delta += 3500;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "BP01-064") && type === "power" && inBattleZone(state, targetCardId) && state.flow.kind.startsWith("BATTLE_")) {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null && fieldZones.flatMap((zone) => state.players[actor].field[zone]).some((id) => id !== targetCardId && state.cards[id]?.attribute === 3)) delta += 2500;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "BP01-071")) {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null && type === "power" && state.players[actor].field.vanguard.includes(targetCardId)) delta += 1000;
    if (actor !== null && type === "range" && (state.players[actor].field.flankLeft.includes(targetCardId) || state.players[actor].field.flankRight.includes(targetCardId))) delta += 2;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "BP01-076") && type === "power") {
    delta += state.players[target.owner].retreat.filter((id) => state.cards[id]?.name.includes("洛基")).length * 1000;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "SP01-073") && type === "power" && inBattleZone(state, targetCardId)) {
    const enemy = target.owner === 0 ? 1 : 0;
    if (fieldZones.flatMap((zone) => state.players[enemy].field[zone]).some((id) => state.cards[id]?.features.some((feature) => feature.includes("蛛网")))) delta -= 3000;
  }
  if (type === "power") {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null && state.players[actor].field.vanguard.includes(targetCardId) && target.features.some((feature) => feature.includes("人类"))) {
      const enemy = actor === 0 ? 1 : 0;
      const sensory = fieldZones.flatMap((zone) => state.players[enemy].field[zone]).some((id) => cardHasEffectIdentityV2(state, id, "BP01-082") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
      const tactical = presentFaceUpIds(state).some((id) => cardControllerV2(state, id) === actor && cardHasEffectIdentityV2(state, id, "BP01-086") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
      if (sensory) delta -= 500;
      if (tactical) delta += 500;
    }
  }
  if (type === "power" && inBattleZone(state, targetCardId)) {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null && effectiveLevel(targetCardId) <= 4) {
      const enemy = actor === 0 ? 1 : 0;
      const freedom = fieldZones.flatMap((zone) => state.players[enemy].field[zone]).some((sourceId) => cardHasEffectIdentityV2(state, sourceId, "BP01-107") && !isCardEffectSuppressedV2(state, sourceId) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, sourceId));
      const greenPower = fieldZones.flatMap((zone) => state.players[enemy].field[zone]).some((id) => state.cards[id]?.attribute === 4 && effectivePower(id) >= 4000);
      if (freedom && greenPower) delta -= 500;
    }
  }
  if (type === "level") {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null && state.players[actor].field.rear.includes(targetCardId)) {
      const enemy = actor === 0 ? 1 : 0;
      const trickster = presentFaceUpIds(state).some((id) => cardControllerV2(state, id) === enemy && cardHasEffectIdentityV2(state, id, "BP01-115") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
      if (trickster) delta -= 2;
    }
  }
  if (type === "range") {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null && state.players[actor].field.vanguard.includes(targetCardId)) {
      const source = fieldZones.flatMap((zone) => state.players[actor].field[zone]).find((id) => cardHasEffectIdentityV2(state, id, "BP01-117") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
      const enemy = actor === 0 ? 1 : 0;
      const enemyVanguard = state.players[enemy].field.vanguard[0];
      if (source && enemyVanguard && state.cards[enemyVanguard]?.attribute !== state.cards[source]?.attribute) delta += 1;
    }
  }
  if (type === "range" && targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "BP01-088") && inBattleZone(state, targetCardId)) {
    const enemy = target.owner === 0 ? 1 : 0;
    if (fieldZones.flatMap((zone) => state.players[enemy].field[zone]).some((id) => effectivePower(id) >= 5000)) delta += 3;
  }
  if (type === "range") {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null && state.players[actor].field.vanguard.includes(targetCardId)) {
      const enemy = actor === 0 ? 1 : 0;
      const sourcePresent = fieldZones.flatMap((zone) => state.players[actor].field[zone]).some((id) => cardHasEffectIdentityV2(state, id, "BP01-084") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
      if (sourcePresent && fieldZones.flatMap((zone) => state.players[actor].field[zone]).length === fieldZones.flatMap((zone) => state.players[enemy].field[zone]).length) delta += 1;
    }
  }
  if (type === "range") {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null) {
      const enemy = actor === 0 ? 1 : 0;
      const enemyRoles = fieldZones.flatMap((zone) => state.players[enemy].field[zone]);
      if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "BP01-089") && inBattleZone(state, targetCardId) && enemyRoles.length === 1 && effectiveLevel(enemyRoles[0]) === 6) delta += 1;
      const sources = enemyRoles.filter((id) => cardHasEffectIdentityV2(state, id, "BP01-089") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
      const ownerRoles = fieldZones.flatMap((zone) => state.players[actor].field[zone]);
      if (effectiveLevel(targetCardId) === 6 && ownerRoles.length === 1 && sources.length > 0) delta -= sources.length;
    }
  }
  if (type === "range") {
    const actor = cardControllerV2(state, targetCardId);
    if (actor !== null && state.players[actor].field.rear.includes(targetCardId)) {
      const sourcePresent = presentFaceUpIds(state).some((id) => cardControllerV2(state, id) === actor && cardHasEffectIdentityV2(state, id, "BP01-079") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id));
      const enemy = actor === 0 ? 1 : 0;
      if (sourcePresent && [...fieldZones.flatMap((zone) => state.players[enemy].field[zone]), ...state.players[enemy].baseCards].some((id) => effectivePower(id) >= 5000)) delta += 1;
    }
  }
  if (type === "power") {
    const targetController = cardControllerV2(state, targetCardId);
    if (targetController !== null && state.players[targetController].field.vanguard.includes(targetCardId)) {
      const enemy = targetController === 0 ? 1 : 0;
      const coordinated = fieldZones.flatMap((zone) => state.players[enemy].field[zone]).some((sourceId) => {
        if (!cardHasEffectIdentityV2(state, sourceId, "BP01-027") || isCardEffectSuppressedV2(state, sourceId) || isCardProtectedFromLevelOneEffectV2(state, targetCardId, sourceId)) return false;
        const left = state.players[enemy].field.flankLeft[0];
        const right = state.players[enemy].field.flankRight[0];
        return Boolean(left && right && state.cards[left]?.level === state.cards[right]?.level);
      });
      if (coordinated) delta -= 1000;
    }
  }
  if (type === "range") {
    const attached = state.attachments[targetCardId] ?? [];
    if (attached.some((id) => cardHasEffectIdentityV2(state, id, "SP01-007") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id)) && target.features.some((feature) => feature.includes("蛛网"))) delta += 1;
  }
  if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "SP01-018") && type === "power" && state.flow.kind.startsWith("BATTLE_")) {
    const opponent = target.owner === 0 ? 1 : 0;
    delta += fieldZones.flatMap((zone) => state.players[opponent].field[zone]).reduce((total, id) => total + keywordCount(id), 0) * 1000;
  }
  if (type === "power") {
    if (target.features.some((feature) => feature.includes("机械")) && attached.some((id) => cardHasEffectIdentityV2(state, id, "SP01-024") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) delta -= 1000;
    if (targetEffectsActive && cardHasEffectIdentityV2(state, targetCardId, "SP01-027")) {
      delta += state.players[target.owner].void.filter((id) => state.cards[id]?.name !== target.name && state.cards[id]?.features.some((feature) => feature.includes("蛛网"))).length * 500;
    }
    if (attached.length === 1 && cardHasEffectIdentityV2(state, attached[0], "SP01-029") && !isCardEffectSuppressedV2(state, attached[0]) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, attached[0]) && effectiveLevel(targetCardId) === 4) delta += 3000;
  }
  if (type === "range") {
    if (attached.some((id) => cardHasEffectIdentityV2(state, id, "SP01-028") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, targetCardId, id))) delta -= 1;
  }
  return delta;
}

export function promoContinuousKeywordsV2(state: GameStateV2, cardId: string): OfficialKeywordV2[] {
  const card = state.cards[cardId];
  if (!card) return [];
  const gained: OfficialKeywordV2[] = [];
  const ownEffectsActive = !isCardEffectSuppressedV2(state, cardId) && !isCardProtectedFromLevelOneEffectV2(state, cardId, cardId);
  if (ownEffectsActive && cardHasEffectIdentityV2(state, cardId, "PB01-008") && state.players[card.owner].hand.includes(cardId)) {
    const roles = fieldZones.flatMap((zone) => state.players[card.owner].field[zone]);
    if (roles.length > 0 && roles.every((id) => state.cards[id]?.attribute === 2)) gained.push("counter");
  }
  if ((state.attachments[cardId] ?? []).some((id) => cardHasEffectIdentityV2(state, id, "SP01-007") && !isCardEffectSuppressedV2(state, id) && !isCardProtectedFromLevelOneEffectV2(state, cardId, id))) gained.push("assault");
  if (ownEffectsActive && inBattleZone(state, cardId) && cardHasEffectIdentityV2(state, cardId, "SP01-051")) {
    const enemy = cardControllerV2(state, cardId) === 0 ? 1 : 0;
    const enemyFaceUp = [...state.players[enemy].baseCards, ...fieldZones.flatMap((zone) => state.players[enemy].field[zone])];
    if (enemyFaceUp.some((id) => state.cards[id]?.level === 1)) gained.push("combo");
    if (fieldZones.flatMap((zone) => state.players[enemy].field[zone]).some((id) => state.cards[id]?.level === 6)) gained.push("assault");
  }
  if (ownEffectsActive && inBattleZone(state, cardId) && cardHasEffectIdentityV2(state, cardId, "BP01-025")) {
    const actor = cardControllerV2(state, cardId);
    if (actor !== null && fieldZones.flatMap((zone) => state.players[actor].field[zone]).length === 1) gained.push("combo");
  }
  return gained;
}
