import type { AtomicOperationV2, FieldZoneV2, GameEventV2, GameStateV2, PlayerIndex } from "../model";
import { effectiveValueV2 } from "../effects/atomicOps";
import { cardControllerV2 } from "../control";
import { registerEffectV2, type EffectContextV2, type EffectDefinitionV2 } from "../effects/registry";

const fieldZones: readonly FieldZoneV2[] = ["vanguard", "flankLeft", "flankRight", "rear"];
const battleRoles = (state: GameStateV2, actor: PlayerIndex): string[] => fieldZones.flatMap((zone) => state.players[actor].field[zone]);
const faceUpRoles = (state: GameStateV2, actor: PlayerIndex): string[] => [...battleRoles(state, actor), ...state.players[actor].baseCards];
const opponentOf = (actor: PlayerIndex): PlayerIndex => actor === 0 ? 1 : 0;
const hasFeature = (state: GameStateV2, cardId: string, feature: string): boolean => state.cards[cardId]?.features.some((value) => value.includes(feature)) ?? false;
const eventOf = <T extends GameEventV2["type"]>(context: EffectContextV2 | undefined, type: T): Extract<GameEventV2, { type: T }> | null => context?.triggerEvent?.type === type ? context.triggerEvent as Extract<GameEventV2, { type: T }> : null;
const useKey = (source: string, effectId: string): string => `${source}:${effectId}`;
const zoneChoice = (zone: FieldZoneV2): string => `zone:${zone}`;
const parseZone = (choice: string): FieldZoneV2 => choice.replace(/^zone:/, "") as FieldZoneV2;
const openFieldZones = (state: GameStateV2, actor: PlayerIndex): FieldZoneV2[] => fieldZones.filter((zone) => state.players[actor].field[zone].length === 0);

function attachmentCards(state: GameStateV2, actor: PlayerIndex): string[] {
  return faceUpRoles(state, actor).flatMap((host) => state.attachments[host] ?? []);
}

function allFaceUpCards(state: GameStateV2, actor: PlayerIndex): string[] {
  return [...faceUpRoles(state, actor), ...attachmentCards(state, actor)];
}

function retreatedFromField(context: EffectContextV2 | undefined, source: string): boolean {
  const event = eventOf(context, "CARDS_RETREATED");
  return Boolean(event?.cardIds.includes(source) && (event.fromFieldCardIds?.includes(source) ?? ["battle", "state"].includes(event.reason)));
}

function modifier(source: string, target: string, type: "power" | "range" | "level", value: number, suffix: string): AtomicOperationV2 {
  return { kind: "ADD_MODIFIER", modifier: { id: `promo:${source}:${suffix}:${target}`, sourceCardId: source, targetCardId: target, type, value, mode: "delta", duration: "turn" } };
}

const definitions: EffectDefinitionV2[] = [
  {
    cardNo: "SP01-001",
    effectId: "spider-nemesis-carnage-return",
    label: "蜘蛛宿敌·卡耐基回归",
    trigger: "CARDS_RETREATED",
    sourceZones: ["retreat"],
    optional: true,
    ruleRefs: ["301.13", "301.14", "301.25", "301.32", "304.1", "305.6"],
    eventFilter: (_state, _actor, source, context) => retreatedFromField(context, source),
    condition: (state, actor) => state.players[actor].hand.length > 0 && faceUpRoles(state, actor).some((id) => state.cards[id].level <= 5 && hasFeature(state, id, "人类")),
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand, ...faceUpRoles(state, actor).filter((id) => state.cards[id].level <= 5 && hasFeature(state, id, "人类"))], min: 2, max: 2, prompt: "选择 1 张手牌舍弃，并选择 1 张原本 Lv5 或以下【人类】角色作为结附宿主", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].hand.includes(id)).length === 1 && selected.filter((id) => faceUpRoles(state, actor).includes(id) && state.cards[id].level <= 5 && hasFeature(state, id, "人类")).length === 1 ? null : "必须分别选择 1 张手牌和 1 张合法【人类】宿主",
    buildOperations: (state, actor, source, selected) => {
      const hand = selected.find((id) => state.players[actor].hand.includes(id))!;
      const host = selected.find((id) => faceUpRoles(state, actor).includes(id))!;
      return [{ kind: "DISCARD", cardIds: [hand] }, { kind: "ATTACH", cardId: source, hostCardId: host, requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-001",
    effectId: "spider-nemesis-carnage-pressure",
    label: "蜘蛛宿敌·卡耐基压制",
    trigger: "CARD_ATTACHED",
    sourceZones: ["attachment"],
    ruleRefs: ["301.25", "301.32", "301.41", "304.1"],
    eventFilter: (state, actor, source, context) => {
      const event = eventOf(context, "CARD_ATTACHED");
      return Boolean(event?.cardId === source && event.hostCardId && battleRoles(state, actor).includes(event.hostCardId));
    },
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => {
      const enemies = battleRoles(state, opponentOf(actor));
      const minimum = Math.min(...enemies.map((id) => effectiveValueV2(state, id, "power")));
      return { choices: enemies.filter((id) => effectiveValueV2(state, id, "power") === minimum), min: 1, max: 1, prompt: "选择敌方战区战力最低的 1 张角色，本回合战力 -2000" };
    },
    buildOperations: (_state, _actor, source, targets) => [modifier(source, targets[0], "power", -2000, "carnage-pressure")],
  },
  {
    cardNo: "SP01-002",
    effectId: "spider-nemesis-mysterio-illusion",
    label: "蜘蛛宿敌·神秘客",
    trigger: "CARD_ATTACHED",
    sourceZones: ["field"],
    usage: "turn_once",
    ruleRefs: ["301.12", "301.28", "301.32", "304.1", "305.6"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARD_ATTACHED")?.hostCardId === source,
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-mysterio-illusion")) && state.players[actor].hand.some((id) => state.cards[id]?.attribute === 1),
    targeting: (state, actor, source) => {
      const red = state.players[actor].hand.filter((id) => state.cards[id]?.attribute === 1);
      const canPlace = red.some((id) => effectiveValueV2(state, id, "level") === effectiveValueV2(state, source, "level")) && openFieldZones(state, actor).length > 0;
      return { choices: [...red, ...(canPlace ? openFieldZones(state, actor).map(zoneChoice) : [])], min: 1, max: canPlace ? 2 : 1, prompt: "展示 1 张红色手牌；若与此卡 Lv 相同，同时选择其放置战区", choiceKind: "mixed" as const };
    },
    validateTargets: (state, actor, source, selected) => {
      const red = selected.filter((id) => state.players[actor].hand.includes(id) && state.cards[id]?.attribute === 1);
      const zones = selected.filter((id) => id.startsWith("zone:"));
      if (red.length !== 1) return "必须选择 1 张红色手牌展示";
      const sameLevel = effectiveValueV2(state, red[0], "level") === effectiveValueV2(state, source, "level");
      if (!sameLevel) return selected.length === 1 ? null : "Lv 不同时不能选择放置战区";
      return zones.length === 1 && openFieldZones(state, actor).includes(parseZone(zones[0])) ? null : "Lv 相同时必须选择 1 个空战区放置该角色";
    },
    buildOperations: (state, actor, source, selected) => {
      const shown = selected.find((id) => state.players[actor].hand.includes(id))!;
      const zone = selected.find((id) => id.startsWith("zone:"));
      return [
        { kind: "REVEAL", cardIds: [shown], sourceCardId: source },
        ...(zone ? [{ kind: "PLACE_FIELD" as const, cardId: shown, destination: parseZone(zone), sourceCardId: source, requiresPreviousSuccess: true }] : []),
        { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-mysterio-illusion"), requiresPreviousSuccess: true },
      ];
    },
  },
  {
    cardNo: "SP01-003",
    effectId: "phoenix-host-return",
    label: "凤凰宿主·回归",
    activation: "action",
    sourceZones: ["retreat"],
    ruleRefs: ["301.12", "301.14", "301.32", "304.2", "305.6"],
    canActivate: (state, actor) => battleRoles(state, actor).length < battleRoles(state, opponentOf(actor)).length && battleRoles(state, actor).some((id) => effectiveValueV2(state, id, "level") === 6) && openFieldZones(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: [...battleRoles(state, actor).filter((id) => effectiveValueV2(state, id, "level") === 6), ...openFieldZones(state, actor).map(zoneChoice)], min: 2, max: 2, prompt: "选择我方战区 1 张 Lv6 角色撤退，并选择此卡的放置战区", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => {
      const costs = selected.filter((id) => battleRoles(state, actor).includes(id) && effectiveValueV2(state, id, "level") === 6);
      const zones = selected.filter((id) => id.startsWith("zone:"));
      return costs.length === 1 && zones.length === 1 && openFieldZones(state, actor).includes(parseZone(zones[0])) ? null : "必须选择 1 张己方 Lv6 角色和 1 个空战区";
    },
    buildOperations: (state, actor, source, selected) => {
      const cost = selected.find((id) => battleRoles(state, actor).includes(id))!;
      const destination = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      return [{ kind: "RETREAT", cardIds: [cost] }, { kind: "PLACE_FIELD", cardId: source, destination, sourceCardId: source, requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-003",
    effectId: "phoenix-host-arrival",
    label: "凤凰宿主·降临",
    trigger: "CARD_PLACED_FIELD_BY_EFFECT",
    sourceZones: ["field"],
    ruleRefs: ["301.14", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => {
      const event = eventOf(context, "CARD_PLACED_FIELD_BY_EFFECT");
      return Boolean(event && event.cardId === source && event.fromZone === "retreat");
    },
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") === 6) && state.players[actor].hand.length > 0,
    targeting: (state, actor) => ({ choices: [...battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") === 6), ...state.players[actor].hand], min: 2, max: 2, prompt: "选择敌方战区 1 张 Lv6 角色撤退，并选择我方 1 张手牌移回卡组底", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => battleRoles(state, opponentOf(actor)).includes(id) && effectiveValueV2(state, id, "level") === 6).length === 1 && selected.filter((id) => state.players[actor].hand.includes(id)).length === 1 ? null : "必须分别选择敌方 Lv6 角色和己方手牌各 1 张",
    buildOperations: (state, actor, source, selected) => {
      const enemy = selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id))!;
      const hand = selected.find((id) => state.players[actor].hand.includes(id))!;
      return [
        { kind: "RETREAT", cardIds: [enemy] },
        { kind: "MOVE_TO_DECK_BOTTOM", cardId: hand, requiresPreviousSuccess: true },
        { kind: "FORBID_SUMMON_PAYMENT", cardId: source, requiresPreviousSuccess: true },
      ];
    },
  },
  {
    cardNo: "SP01-004",
    effectId: "top-assassin-elektra-arrival",
    label: "顶级刺客·入场",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["hand"],
    optional: true,
    ruleRefs: ["301.12", "301.15", "301.32", "304.1"],
    eventFilter: (state, actor, _source, context) => {
      const event = eventOf(context, "CHARACTER_PLACED");
      return Boolean(event && event.actor === opponentOf(actor) && effectiveValueV2(state, event.cardId, "level") <= 3 && hasFeature(state, event.cardId, "人类"));
    },
    condition: (state, actor) => openFieldZones(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: openFieldZones(state, actor).map(zoneChoice), min: 1, max: 1, prompt: "选择我方 1 个空战区放置此卡", choiceKind: "field_location" as const }),
    validateTargets: (state, actor, _source, selected) => selected.length === 1 && selected[0].startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(selected[0])) ? null : "必须选择 1 个空战区",
    buildOperations: (state, actor, source, selected, context) => {
      const enemy = eventOf(context, "CHARACTER_PLACED")!.cardId;
      const hasDaredevil = faceUpRoles(state, actor).some((id) => state.cards[id]?.name.includes("夜魔侠"));
      return [{ kind: "PLACE_FIELD", cardId: source, destination: parseZone(selected[0]), sourceCardId: source }, ...(hasDaredevil ? [{ kind: "BANISH" as const, cardIds: [enemy], sourceCardId: source, requiresPreviousSuccess: true }] : [])];
    },
  },
  {
    cardNo: "SP01-004",
    effectId: "top-assassin-elektra-legacy",
    label: "顶级刺客·余势",
    trigger: "CARDS_RETREATED",
    sourceZones: ["retreat"],
    ruleRefs: ["301.14", "301.32", "301.41", "304.1"],
    eventFilter: (_state, _actor, source, context) => retreatedFromField(context, source) && eventOf(context, "CARDS_RETREATED")?.reason === "effect",
    condition: (state, actor) => faceUpRoles(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: faceUpRoles(state, actor), min: 1, max: 1, prompt: "选择我方场上 1 张角色，本回合 R+1" }),
    buildOperations: (_state, _actor, source, targets) => [modifier(source, targets[0], "range", 1, "elektra-legacy")],
  },
  {
    cardNo: "SP01-005",
    effectId: "endgame-iron-man-arrival",
    label: "终局之战",
    activation: "response",
    sourceZones: ["hand"],
    ruleRefs: ["301.12", "301.14", "301.32", "304.2", "305.6"],
    canActivate: (state, actor) => openFieldZones(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: openFieldZones(state, actor).map(zoneChoice), min: 1, max: 1, prompt: "选择我方 1 个破绽放置此卡", choiceKind: "field_location" as const }),
    validateTargets: (state, actor, _source, selected) => selected.length === 1 && selected[0].startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(selected[0])) ? null : "必须选择我方 1 个破绽",
    buildOperations: (state, actor, source, selected) => {
      const armors = allFaceUpCards(state, actor).filter((id) => state.cards[id]?.name.includes("装甲"));
      return [...(armors.length ? [{ kind: "RETREAT" as const, cardIds: armors }] : []), { kind: "PLACE_FIELD", cardId: source, destination: parseZone(selected[0]), sourceCardId: source, ...(armors.length ? { requiresPreviousSuccess: true } : {}) }];
    },
  },
  {
    cardNo: "SP01-006",
    effectId: "spider-nemesis-red-goblin",
    label: "蜘蛛宿敌·红魔",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.15", "301.25", "301.32", "304.2"],
    canActivate: (state, actor, source) => {
      if (state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-red-goblin"))) return false;
      const others = allFaceUpCards(state, actor).filter((id) => id !== source);
      const enemies = battleRoles(state, opponentOf(actor));
      return others.some((other) => enemies.some((enemy) => effectiveValueV2(state, enemy, "level") === effectiveValueV2(state, source, "level") + effectiveValueV2(state, other, "level")));
    },
    targeting: (state, actor, source) => {
      const others = allFaceUpCards(state, actor).filter((id) => id !== source);
      const sums = new Set(others.map((id) => effectiveValueV2(state, source, "level") + effectiveValueV2(state, id, "level")));
      const enemies = battleRoles(state, opponentOf(actor)).filter((id) => sums.has(effectiveValueV2(state, id, "level")));
      return { choices: [...others, ...enemies], min: 2, max: 2, prompt: "选择我方另 1 张场上角色或结附卡，并选择敌方战区 1 张 Lv 等于裁剪合计值的角色", choiceKind: "mixed" as const };
    },
    validateTargets: (state, actor, source, selected) => {
      const others = selected.filter((id) => id !== source && allFaceUpCards(state, actor).includes(id));
      const enemies = selected.filter((id) => battleRoles(state, opponentOf(actor)).includes(id));
      if (others.length !== 1 || enemies.length !== 1) return "必须分别选择己方其他场上卡和敌方战区角色各 1 张";
      const total = effectiveValueV2(state, source, "level") + effectiveValueV2(state, others[0], "level");
      return effectiveValueV2(state, enemies[0], "level") === total ? null : "敌方角色 Lv 必须等于本效果裁剪卡牌的 Lv 合计";
    },
    buildOperations: (state, actor, source, selected) => {
      const other = selected.find((id) => id !== source && allFaceUpCards(state, actor).includes(id))!;
      const enemy = selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id))!;
      return [{ kind: "BANISH", cardIds: [source, other], sourceCardId: source }, { kind: "BANISH", cardIds: [enemy], sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-red-goblin"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-007",
    effectId: "spider-companion-flower-web-boost",
    label: "蜘蛛伴侣·花网",
    activation: "response",
    usage: "turn_once",
    sourceZones: ["field", "base", "attachment"],
    ruleRefs: ["301.14", "301.25", "301.32", "301.41", "304.2", "305.4"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-companion-flower-web-boost")) && faceUpRoles(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: faceUpRoles(state, actor), min: 1, max: 1, prompt: "选择我方场上 1 张角色，本回合战力 +2000" }),
    buildOperations: (_state, _actor, source, targets) => [{ ...modifier(source, targets[0], "power", 2000, "flower-web-boost") }, { kind: "RETREAT", cardIds: [source], requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-companion-flower-web-boost"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-008",
    effectId: "spider-companion-silver-sable-draw",
    label: "蜘蛛伴侣·西尔弗",
    trigger: "CARDS_RETREATED",
    sourceZones: ["field", "base"],
    optional: true,
    usage: "turn_once",
    ruleRefs: ["301.13", "301.14", "301.32", "304.1", "305.6"],
    eventFilter: (state, actor, _source, context) => {
      const event = eventOf(context, "CARDS_RETREATED");
      return Boolean(event?.fromFieldCardIds?.some((id) => state.cards[id]?.owner === actor && hasFeature(state, id, "人类")));
    },
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-companion-silver-sable-draw")) && state.players[actor].baseCards.length + state.players[actor].baseCovered.length > 0 && state.players[actor].deck.length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].baseCards, ...state.players[actor].baseCovered], min: 1, max: 1, prompt: "选择我方基地 1 张卡撤退；如此做后抽 1 张" }),
    buildOperations: (_state, actor, source, targets) => [{ kind: "RETREAT", cardIds: [targets[0]] }, { kind: "DRAW", actor, count: 1, sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-companion-silver-sable-draw"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-009",
    effectId: "spider-ally-black-panther-rebind",
    label: "蜘蛛战友·黑豹",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.25", "301.32", "304.2"],
    canActivate: (state, actor, source) => {
      if (state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-ally-black-panther-rebind"))) return false;
      const sourceAttached = state.attachments[source] ?? [];
      const otherAttached = attachmentCards(state, actor).filter((id) => !sourceAttached.includes(id));
      return otherAttached.length > 0 || (sourceAttached.length > 0 && battleRoles(state, actor).some((id) => id !== source));
    },
    targeting: (state, actor, source) => ({ choices: [...attachmentCards(state, actor), ...battleRoles(state, actor)], min: 2, max: 2, prompt: "选择 1 张结附卡及合法的新宿主", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, source, selected) => {
      const attached = selected.filter((id) => attachmentCards(state, actor).includes(id));
      const hosts = selected.filter((id) => battleRoles(state, actor).includes(id));
      if (attached.length !== 1 || hosts.length !== 1) return "必须选择 1 张结附卡和 1 张战区宿主";
      const currentHost = Object.entries(state.attachments).find(([, cards]) => cards.includes(attached[0]))?.[0];
      const destination = hosts[0];
      const legalToSource = destination === source && currentHost !== source;
      const legalFromSource = currentHost === source && destination !== source;
      return legalToSource || legalFromSource ? null : "只能把其他结附卡移到此卡，或把此卡的结附卡移给其他战区角色";
    },
    buildOperations: (state, actor, source, selected) => {
      const attached = selected.find((id) => attachmentCards(state, actor).includes(id))!;
      const host = selected.find((id) => battleRoles(state, actor).includes(id))!;
      return [{ kind: "ATTACH", cardId: attached, hostCardId: host, sourceCardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-ally-black-panther-rebind"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-009",
    effectId: "spider-ally-black-panther-mill",
    label: "蜘蛛战友·黑豹舍弃",
    trigger: "CARD_ATTACHED",
    sourceZones: ["field"],
    ruleRefs: ["301.13", "301.25", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => {
      const event = eventOf(context, "CARD_ATTACHED");
      return Boolean(event && event.hostCardId === source && event.sourceCardId === source);
    },
    condition: (state, actor) => state.players[opponentOf(actor)].deck.length >= 2,
    buildOperations: (_state, actor) => [{ kind: "DISCARD_DECK_TOP", actor: opponentOf(actor), count: 2 }],
  },
  {
    cardNo: "SP01-010",
    effectId: "spider-ally-jessica-random-reveal",
    label: "蜘蛛战友·杰西卡随机展示",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.12", "301.28", "301.32", "304.2", "305.6"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-ally-jessica-random-reveal")) && state.players[opponentOf(actor)].hand.length > 0,
    buildOperations: (_state, actor, source) => [
      { kind: "REVEAL_RANDOM_HAND", actor: opponentOf(actor), count: 1, sourceCardId: source },
      { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-ally-jessica-random-reveal"), requiresPreviousSuccess: true },
    ],
  },
  {
    cardNo: "SP01-010",
    effectId: "spider-ally-jessica-cover",
    label: "蜘蛛战友·杰西卡盖放",
    trigger: "CARDS_REVEALED",
    sourceZones: ["field"],
    ruleRefs: ["301.12", "301.28", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_REVEALED")?.sourceCardId === source,
    condition: (state, actor, _source, context) => {
      const shown = eventOf(context, "CARDS_REVEALED")?.cards[0]?.instanceId;
      return Boolean(shown && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6
        && state.players[actor].retreat.some((id) => effectiveValueV2(state, id, "level") === effectiveValueV2(state, shown, "level")));
    },
    targeting: (state, actor, _source, context) => {
      const shown = eventOf(context, "CARDS_REVEALED")!.cards[0].instanceId;
      return { choices: state.players[actor].retreat.filter((id) => effectiveValueV2(state, id, "level") === effectiveValueV2(state, shown, "level")), min: 1, max: 1, prompt: "选择我方撤退区 1 张与展示手牌 Lv 相同的角色，盖放进我方基地" };
    },
    buildOperations: (_state, _actor, _source, selected) => [{ kind: "MOVE_TO_BASE", cardId: selected[0], face: "down" }],
  },
  {
    cardNo: "SP01-011",
    effectId: "killing-intent-hulk",
    label: "杀意解放",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.13", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => {
      const count = battleRoles(state, opponentOf(actor)).length;
      return !state.usage.effectUseKeysThisTurn.includes(useKey(source, "killing-intent-hulk")) && state.players[actor].hand.length >= count;
    },
    targeting: (state, actor) => {
      const count = battleRoles(state, opponentOf(actor)).length;
      return { choices: state.players[actor].hand, min: count, max: count, prompt: count > 0 ? `选择 ${count} 张手牌舍弃` : "敌方战区没有角色，无需舍弃手牌" };
    },
    buildOperations: (state, actor, source, selected) => {
      const count = battleRoles(state, opponentOf(actor)).length;
      const gated = count > 0;
      return [
        ...(gated ? [{ kind: "DISCARD" as const, cardIds: [...selected] }] : []),
        { ...modifier(source, source, "level", count, "killing-intent-level"), ...(gated ? { requiresPreviousSuccess: true } : {}) },
        modifier(source, source, "range", count, "killing-intent-range"),
        modifier(source, source, "power", count * 1000, "killing-intent-power"),
        { kind: "MARK_EFFECT_USED", key: useKey(source, "killing-intent-hulk") },
      ];
    },
  },
  {
    cardNo: "SP01-012",
    effectId: "spider-ally-magik",
    label: "蜘蛛战友·秘客",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.14", "301.15", "301.32", "304.2", "305.6"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-ally-magik")) && battleRoles(state, actor).some((id) => hasFeature(state, id, "人类")),
    targeting: (state, actor) => {
      const costs = battleRoles(state, actor).filter((id) => hasFeature(state, id, "人类"));
      const afterCostIsFewer = battleRoles(state, actor).length - 1 < battleRoles(state, opponentOf(actor)).length;
      const enemies = afterCostIsFewer ? battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 3) : [];
      return { choices: [...costs, ...enemies], min: 1, max: enemies.length ? 2 : 1, prompt: enemies.length ? "选择己方 1 张【人类】角色撤退；并选择敌方 1 张 Lv3 或以下角色裁剪" : "选择己方战区 1 张【人类】角色撤退", choiceKind: "mixed" as const };
    },
    validateTargets: (state, actor, _source, selected) => {
      const costs = selected.filter((id) => battleRoles(state, actor).includes(id) && hasFeature(state, id, "人类"));
      const afterCostIsFewer = battleRoles(state, actor).length - 1 < battleRoles(state, opponentOf(actor)).length;
      const legalEnemies = battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 3);
      const enemies = selected.filter((id) => legalEnemies.includes(id));
      if (costs.length !== 1) return "必须选择己方 1 张【人类】角色撤退";
      if (afterCostIsFewer && legalEnemies.length > 0) return enemies.length === 1 && selected.length === 2 ? null : "我方角色较少时必须选择敌方 1 张 Lv3 或以下角色";
      return selected.length === 1 ? null : "当前不处理敌方裁剪目标";
    },
    buildOperations: (state, actor, source, selected) => {
      const cost = selected.find((id) => battleRoles(state, actor).includes(id))!;
      const enemy = selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id));
      return [{ kind: "RETREAT", cardIds: [cost] }, ...(enemy ? [{ kind: "BANISH" as const, cardIds: [enemy], sourceCardId: source, requiresPreviousSuccess: true }] : []), { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-ally-magik"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-014",
    effectId: "shadow-rescue-follow-retreat",
    label: "暗影救援·跟随撤退",
    trigger: "CARDS_RETREATED",
    sourceZones: ["retreat"],
    ruleRefs: ["301.14", "301.25", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_RETREATED")?.followedAttachmentCardIds?.includes(source) ?? false,
    condition: (state, actor) => state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6
      && [...state.players[actor].retreat, ...state.players[actor].void].some((id) => effectiveValueV2(state, id, "level") <= 3 && hasFeature(state, id, "蛛网")),
    targeting: (state, actor) => ({ choices: [...state.players[actor].retreat, ...state.players[actor].void].filter((id) => effectiveValueV2(state, id, "level") <= 3 && hasFeature(state, id, "蛛网")), min: 1, max: 1, prompt: "选择我方撤退区或虚空区 1 张 Lv3 或以下【蛛网】角色，放置进我方基地" }),
    buildOperations: (_state, _actor, _source, selected) => [{ kind: "MOVE_TO_BASE", cardId: selected[0], face: "up" }],
  },
  {
    cardNo: "SP01-014",
    effectId: "shadow-rescue-covered-return",
    label: "暗影救援·回收盖卡",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.13", "301.14", "301.32", "304.2"],
    canActivate: (state, actor) => state.players[actor].baseCovered.length > 0,
    targeting: (state, actor) => ({ choices: state.players[actor].baseCovered, min: 1, max: 1, prompt: "舍弃此卡，并选择我方基地 1 张盖卡移回手牌" }),
    buildOperations: (_state, _actor, source, selected) => [
      { kind: "DISCARD", cardIds: [source] },
      { kind: "RETURN_TO_HAND", cardIds: [selected[0]], requiresPreviousSuccess: true },
    ],
  },
  {
    cardNo: "SP01-015",
    effectId: "destiny-pull-attack-mill",
    label: "命运牵引·攻击裁剪",
    trigger: "ATTACK_DECLARED",
    sourceZones: ["attachment"],
    optional: true,
    ruleRefs: ["301.13", "301.25", "301.32", "304.1", "305.6"],
    eventFilter: (state, _actor, source, context) => {
      const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(source))?.[0];
      return Boolean(host && eventOf(context, "ATTACK_DECLARED")?.attackerId === host);
    },
    buildOperations: (_state, actor) => [
      { kind: "DISCARD_DECK_TOP", actor, count: 1 },
      { kind: "DISCARD_DECK_TOP", actor: opponentOf(actor), count: 1 },
    ],
  },
  {
    cardNo: "SP01-015",
    effectId: "destiny-pull-web-placement-mill",
    label: "命运牵引·蛛网放置裁剪",
    trigger: "CARD_PLACED_FIELD_BY_EFFECT",
    sourceZones: ["field"],
    optional: true,
    ruleRefs: ["301.13", "301.23", "301.32", "304.1", "305.6"],
    eventFilter: (state, _actor, source, context) => {
      const event = eventOf(context, "CARD_PLACED_FIELD_BY_EFFECT");
      return Boolean(event?.cardId === source && event.sourceCardId && hasFeature(state, event.sourceCardId, "蛛网"));
    },
    buildOperations: (_state, actor) => [
      { kind: "DISCARD_DECK_TOP", actor, count: 3 },
      { kind: "DISCARD_DECK_TOP", actor: opponentOf(actor), count: 3 },
    ],
  },
  {
    cardNo: "SP01-016",
    effectId: "spider-ally-luke-cage",
    label: "蜘蛛战友·卢克·凯奇",
    trigger: "CARDS_PLACED_IN_BASE",
    sourceZones: ["field"],
    usage: "turn_once",
    ruleRefs: ["301.12", "301.32", "301.41", "304.1"],
    eventFilter: (_state, actor, _source, context) => eventOf(context, "CARDS_PLACED_IN_BASE")?.actor === actor,
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-ally-luke-cage")) && faceUpRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: faceUpRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "选择敌方场上 1 张角色，本回合战力 -500" }),
    buildOperations: (_state, _actor, source, targets) => [modifier(source, source, "range", 1, "luke-cage-range"), modifier(source, targets[0], "power", -500, "luke-cage-power"), { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-ally-luke-cage") }],
  },
  {
    cardNo: "SP01-019",
    effectId: "spider-companion-silver-sable-flank",
    label: "蜘蛛伴侣·银貂侧翼协攻",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.14", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => {
      const onFlank = state.players[actor].field.flankLeft.includes(source) || state.players[actor].field.flankRight.includes(source);
      const partner = [...state.players[actor].field.flankLeft, ...state.players[actor].field.flankRight].some((id) => id !== source && effectiveValueV2(state, id, "range") >= 2);
      const enemy = [...state.players[opponentOf(actor)].field.flankLeft, ...state.players[opponentOf(actor)].field.flankRight, ...state.players[opponentOf(actor)].field.rear].some((id) => effectiveValueV2(state, id, "level") <= 5);
      return onFlank && partner && enemy && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-companion-silver-sable-flank"));
    },
    targeting: (state, actor, source) => ({
      choices: [
        ...[...state.players[actor].field.flankLeft, ...state.players[actor].field.flankRight].filter((id) => id !== source && effectiveValueV2(state, id, "range") >= 2),
        ...[...state.players[opponentOf(actor)].field.flankLeft, ...state.players[opponentOf(actor)].field.flankRight, ...state.players[opponentOf(actor)].field.rear].filter((id) => effectiveValueV2(state, id, "level") <= 5),
      ],
      min: 2,
      max: 2,
      prompt: "选择我方另一张侧翼 R2 或以上角色，与此卡一同撤退；再选择敌方侧翼或后卫 1 张 Lv5 或以下角色",
      choiceKind: "mixed" as const,
    }),
    validateTargets: (state, actor, source, selected) => {
      const partner = selected.filter((id) => id !== source && [...state.players[actor].field.flankLeft, ...state.players[actor].field.flankRight].includes(id) && effectiveValueV2(state, id, "range") >= 2);
      const enemy = selected.filter((id) => [...state.players[opponentOf(actor)].field.flankLeft, ...state.players[opponentOf(actor)].field.flankRight, ...state.players[opponentOf(actor)].field.rear].includes(id) && effectiveValueV2(state, id, "level") <= 5);
      return partner.length === 1 && enemy.length === 1 ? null : "必须分别选择合法的我方侧翼角色与敌方侧翼/后卫角色";
    },
    buildOperations: (state, actor, source, selected) => {
      const partner = selected.find((id) => [...state.players[actor].field.flankLeft, ...state.players[actor].field.flankRight].includes(id))!;
      const enemy = selected.find((id) => [...state.players[opponentOf(actor)].field.flankLeft, ...state.players[opponentOf(actor)].field.flankRight, ...state.players[opponentOf(actor)].field.rear].includes(id))!;
      return [{ kind: "RETREAT", cardIds: [source, partner] }, { kind: "RETREAT", cardIds: [enemy], requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-companion-silver-sable-flank"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-020",
    effectId: "spider-nemesis-tarantula-cover",
    label: "蜘蛛宿敌·狼蛛盖伏",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["base"],
    ruleRefs: ["301.12", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-tarantula-cover"))
      && state.players[opponentOf(actor)].baseCards.some((id) => effectiveValueV2(state, id, "level") <= effectiveValueV2(state, source, "level") && hasFeature(state, id, "人类")),
    targeting: (state, actor, source) => ({ choices: state.players[opponentOf(actor)].baseCards.filter((id) => effectiveValueV2(state, id, "level") <= effectiveValueV2(state, source, "level") && hasFeature(state, id, "人类")), min: 1, max: 1, prompt: "选择敌方基地 1 张 Lv 不高于此卡的【人类】角色盖伏" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "COVER", cardId: selected[0] }, { kind: "COVER", cardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-tarantula-cover"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-021",
    effectId: "web-of-destiny-attach",
    label: "命运之网·结附",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["base"],
    optional: true,
    usage: "turn_once",
    ruleRefs: ["301.12", "301.25", "301.32", "304.1", "305.6"],
    eventFilter: (state, actor, _source, context) => {
      const event = eventOf(context, "CHARACTER_PLACED");
      return Boolean(event?.actor === actor && hasFeature(state, event.cardId, "蛛网"));
    },
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "web-of-destiny-attach"))
      && state.players[actor].hand.some((id) => hasFeature(state, id, "蛛网")) && faceUpRoles(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand.filter((id) => hasFeature(state, id, "蛛网")), ...faceUpRoles(state, actor)], min: 2, max: 2, prompt: "选择 1 张【蛛网】手牌及场上 1 张角色作为结附宿主", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].hand.includes(id) && hasFeature(state, id, "蛛网")).length === 1 && selected.filter((id) => faceUpRoles(state, actor).includes(id)).length === 1 ? null : "必须分别选择【蛛网】手牌和场上宿主各 1 张",
    buildOperations: (state, actor, source, selected) => {
      const card = selected.find((id) => state.players[actor].hand.includes(id))!;
      const host = selected.find((id) => faceUpRoles(state, actor).includes(id))!;
      return [{ kind: "ATTACH", cardId: card, hostCardId: host, sourceCardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "web-of-destiny-attach"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-021",
    effectId: "web-of-destiny-return",
    label: "命运之网·虚空归来",
    trigger: "CARDS_BANISHED",
    sourceZones: ["void"],
    optional: true,
    ruleRefs: ["301.15", "301.32", "304.1", "305.6"],
    eventFilter: (state, actor, source, context) => {
      const event = eventOf(context, "CARDS_BANISHED");
      return Boolean(event?.cardIds.includes(source) && event.sourceCardId && state.cards[event.sourceCardId]?.owner === actor);
    },
    condition: (state, actor) => state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6,
    buildOperations: (_state, _actor, source) => [{ kind: "MOVE_TO_BASE", cardId: source, face: "up" }],
  },
  {
    cardNo: "SP01-022",
    effectId: "phantom-strike-attach-combo",
    label: "瞬击魅影·结附连击",
    trigger: "CARD_ATTACHED",
    sourceZones: ["attachment"],
    ruleRefs: ["301.25", "301.32", "304.1", "305.3"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARD_ATTACHED")?.cardId === source,
    buildOperations: (_state, _actor, source, _selected, context) => {
      const host = eventOf(context, "CARD_ATTACHED")!.hostCardId;
      return [{ kind: "GRANT_KEYWORD", grant: { id: `promo:${source}:phantom-combo:${host}`, sourceCardId: source, targetCardId: host, keyword: "combo", duration: "turn" } }];
    },
  },
  {
    cardNo: "SP01-022",
    effectId: "phantom-strike-victory-swap",
    label: "瞬击魅影·胜利替换",
    trigger: "CHARACTER_BATTLE_RESOLVED",
    sourceZones: ["hand"],
    optional: true,
    ruleRefs: ["301.20", "301.23", "301.32", "304.1", "305.3", "305.6"],
    eventFilter: (state, actor, _source, context) => {
      const event = eventOf(context, "CHARACTER_BATTLE_RESOLVED");
      return Boolean(event && event.winnerCardId === event.attackerId && state.cards[event.attackerId]?.owner === actor && hasFeature(state, event.attackerId, "蛛网"));
    },
    buildOperations: (_state, _actor, source, _selected, context) => {
      const attacker = eventOf(context, "CHARACTER_BATTLE_RESOLVED")!.attackerId;
      return [
        { kind: "SWAP_POSITIONS", cardIds: [source, attacker], sourceCardId: source },
        { kind: "GRANT_KEYWORD", grant: { id: `promo:${source}:phantom-victory-combo`, sourceCardId: source, targetCardId: source, keyword: "combo", duration: "turn" }, requiresPreviousSuccess: true },
      ];
    },
  },
  {
    cardNo: "SP01-023",
    effectId: "spider-nemesis-venom-knull",
    label: "蜘蛛宿敌·毒液吞噬纳尔",
    trigger: "CARD_ATTACHED",
    sourceZones: ["attachment"],
    ruleRefs: ["301.14", "301.25", "301.32", "304.1"],
    eventFilter: (state, _actor, source, context) => {
      const event = eventOf(context, "CARD_ATTACHED");
      return Boolean(event?.cardId === source && state.cards[event.hostCardId]?.name.includes("纳尔"));
    },
    buildOperations: (_state, _actor, _source, _selected, context) => [{ kind: "RETREAT", cardIds: [eventOf(context, "CARD_ATTACHED")!.hostCardId] }],
  },
  {
    cardNo: "SP01-023",
    effectId: "spider-nemesis-venom-boost",
    label: "蜘蛛宿敌·毒液吞噬增幅",
    activation: "response",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.15", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-venom-boost")) && battleRoles(state, actor).some((id) => effectiveValueV2(state, id, "level") <= 3 && hasFeature(state, id, "人类")),
    targeting: (state, actor) => ({ choices: battleRoles(state, actor).filter((id) => effectiveValueV2(state, id, "level") <= 3 && hasFeature(state, id, "人类")), min: 1, max: 1, prompt: "选择我方战区 1 张 Lv3 或以下【人类】角色裁剪" }),
    buildOperations: (state, _actor, source, selected) => {
      const power = effectiveValueV2(state, selected[0], "power");
      return [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }, { ...modifier(source, source, "power", power, "venom-boost"), requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-venom-boost"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-024",
    effectId: "mecha-pilot-penny-return",
    label: "驾驶机甲·潘妮回归",
    trigger: "CARDS_RETREATED",
    sourceZones: ["retreat"],
    optional: true,
    ruleRefs: ["301.12", "301.25", "301.32", "304.1", "305.6"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_RETREATED")?.followedAttachmentCardIds?.includes(source) ?? false,
    condition: (state, actor, source) => openFieldZones(state, actor).length > 0 && state.players[actor].retreat.some((id) => id !== source && hasFeature(state, id, "机械")),
    targeting: (state, actor, source) => ({ choices: [...openFieldZones(state, actor).map(zoneChoice), ...state.players[actor].retreat.filter((id) => id !== source && hasFeature(state, id, "机械"))], min: 2, max: 2, prompt: "选择此卡的放置战区，并选择我方撤退区 1 张【机械】角色结附于此卡", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, source, selected) => selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id))).length === 1 && selected.filter((id) => id !== source && state.players[actor].retreat.includes(id) && hasFeature(state, id, "机械")).length === 1 ? null : "必须选择 1 个空战区和 1 张撤退区【机械】角色",
    buildOperations: (state, actor, source, selected) => {
      const zone = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      const machine = selected.find((id) => state.players[actor].retreat.includes(id) && id !== source)!;
      return [{ kind: "PLACE_FIELD", cardId: source, destination: zone, sourceCardId: source }, { kind: "ATTACH", cardId: machine, hostCardId: source, sourceCardId: source, requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-025",
    effectId: "gunfire-negotiation-attack-banish",
    label: "枪火谈判·攻击裁剪",
    trigger: "ATTACK_DECLARED",
    sourceZones: ["attachment"],
    ruleRefs: ["301.15", "301.25", "301.32", "304.1"],
    eventFilter: (state, _actor, source, context) => {
      const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(source))?.[0];
      return Boolean(host && eventOf(context, "ATTACK_DECLARED")?.attackerId === host);
    },
    condition: (state, actor) => state.players[actor].deck.length > 0,
    buildOperations: (_state, actor, source) => [{ kind: "BANISH_DECK_TOP", actor, count: 1, sourceCardId: source }],
  },
  {
    cardNo: "SP01-025",
    effectId: "gunfire-negotiation-summon-search",
    label: "枪火谈判·号召检索",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field", "base"],
    ruleRefs: ["301.12", "301.15", "301.28", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_SUMMONED")?.cardId === source,
    condition: (state, actor) => state.players[actor].deck.length > 0,
    targeting: (state, actor) => {
      const top = state.players[actor].deck.slice(0, 3);
      const web = top.filter((id) => hasFeature(state, id, "蛛网"));
      return { choices: web, min: web.length > 0 ? 1 : 0, max: web.length > 0 ? 1 : 0, prompt: web.length > 0 ? "从展示的卡组顶 3 张中选择 1 张【蛛网】角色加入手牌" : "卡组顶 3 张没有【蛛网】角色，全部裁剪" };
    },
    buildOperations: (state, actor, source, selected) => {
      const top = state.players[actor].deck.slice(0, 3);
      const chosen = selected[0];
      const rest = top.filter((id) => id !== chosen);
      return [
        { kind: "REVEAL", cardIds: top, sourceCardId: source },
        ...(chosen ? [{ kind: "MOVE_TO_HAND" as const, cardIds: [chosen], sourceCardId: source, requiresPreviousSuccess: true }] : []),
        ...(rest.length ? [{ kind: "BANISH" as const, cardIds: rest, sourceCardId: source, requiresPreviousSuccess: true }] : []),
      ];
    },
  },
  {
    cardNo: "SP01-026",
    effectId: "watch-beloved-attachment-swap",
    label: "守望挚爱·结附替换",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["attachment"],
    ruleRefs: ["301.23", "301.25", "301.32", "304.2"],
    canActivate: (state, _actor, source) => {
      const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(source))?.[0];
      return Boolean(host && hasFeature(state, host, "人类") && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "watch-beloved-attachment-swap")));
    },
    buildOperations: (state, _actor, source) => {
      const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(source))![0];
      return [{ kind: "SWAP_POSITIONS", cardIds: [source, host], sourceCardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "watch-beloved-attachment-swap"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-026",
    effectId: "watch-beloved-hand-swap",
    label: "守望挚爱·手牌应对替换",
    activation: "response",
    sourceZones: ["hand"],
    ruleRefs: ["301.20", "301.23", "301.32", "301.41", "304.2"],
    canActivate: (state, actor) => faceUpRoles(state, actor).some((id) => state.cards[id]?.name.includes("幽灵蜘蛛") || state.cards[id]?.name.includes("格温")) && battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: [...faceUpRoles(state, actor).filter((id) => state.cards[id]?.name.includes("幽灵蜘蛛") || state.cards[id]?.name.includes("格温")), ...battleRoles(state, opponentOf(actor))], min: 2, max: 2, prompt: "选择我方场上【幽灵蜘蛛】或【格温】互相替换，并选择敌方战区 1 张角色战力 -1000", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => faceUpRoles(state, actor).includes(id) && (state.cards[id]?.name.includes("幽灵蜘蛛") || state.cards[id]?.name.includes("格温"))).length === 1 && selected.filter((id) => battleRoles(state, opponentOf(actor)).includes(id)).length === 1 ? null : "必须分别选择合法的我方替换角色和敌方战区角色",
    buildOperations: (state, actor, source, selected) => {
      const ally = selected.find((id) => faceUpRoles(state, actor).includes(id))!;
      const enemy = selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id))!;
      return [{ kind: "SWAP_POSITIONS", cardIds: [source, ally], sourceCardId: source }, { ...modifier(source, enemy, "power", -1000, "watch-beloved"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-027",
    effectId: "symbiote-suit-detach",
    label: "共生战衣·解除至战区",
    trigger: "CARD_ATTACHED",
    sourceZones: ["attachment"],
    optional: true,
    ruleRefs: ["301.23", "301.25", "301.32", "304.1", "305.6"],
    eventFilter: (state, _actor, source, context) => {
      const event = eventOf(context, "CARD_ATTACHED");
      return Boolean(event?.cardId === source && hasFeature(state, event.hostCardId, "蛛网"));
    },
    condition: (state, actor) => openFieldZones(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: openFieldZones(state, actor).map(zoneChoice), min: 1, max: 1, prompt: "选择此卡解除后的空战区", choiceKind: "field_location" as const }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "PLACE_FIELD", cardId: source, destination: parseZone(selected[0]), sourceCardId: source }],
  },
  {
    cardNo: "SP01-028",
    effectId: "web-warrior-ultimate-return",
    label: "纵横二代·跟随回场",
    trigger: "CARDS_RETREATED",
    sourceZones: ["retreat"],
    optional: true,
    ruleRefs: ["301.12", "301.25", "301.32", "304.1", "305.6"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_RETREATED")?.followedAttachmentCardIds?.includes(source) ?? false,
    condition: (state, actor) => openFieldZones(state, actor).length > 0,
    targeting: (state, actor) => ({ choices: openFieldZones(state, actor).map(zoneChoice), min: 1, max: 1, prompt: "选择此卡返回的空战区", choiceKind: "field_location" as const }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "PLACE_FIELD", cardId: source, destination: parseZone(selected[0]), sourceCardId: source }],
  },
  {
    cardNo: "SP01-029",
    effectId: "spider-mecha-attach",
    label: "蜘蛛机甲·基地结附",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["base"],
    ruleRefs: ["301.25", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-mecha-attach")) && faceUpRoles(state, actor).some((id) => id !== source),
    targeting: (state, actor, source) => ({ choices: faceUpRoles(state, actor).filter((id) => id !== source), min: 1, max: 1, prompt: "选择我方场上 1 张角色作为结附宿主，本回合该角色 R+1" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "ATTACH", cardId: source, hostCardId: selected[0], sourceCardId: source }, { ...modifier(source, selected[0], "range", 1, "spider-mecha-range"), requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-mecha-attach"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-030",
    effectId: "multiverse-invitation-attach-draw",
    label: "多元邀请·结附裁剪抽牌",
    trigger: "CARD_ATTACHED",
    sourceZones: ["attachment"],
    optional: true,
    ruleRefs: ["301.12", "301.15", "301.25", "301.32", "304.1", "305.6"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARD_ATTACHED")?.cardId === source,
    condition: (state, actor, source) => state.players[actor].retreat.some((id) => id !== source && hasFeature(state, id, "蛛网")) && state.players[actor].deck.length >= 2,
    targeting: (state, actor, source) => ({ choices: state.players[actor].retreat.filter((id) => id !== source && hasFeature(state, id, "蛛网")), min: 1, max: 1, prompt: "选择我方撤退区 1 张【蛛网】角色，与此卡一同裁剪；如此做后抽 2 张" }),
    buildOperations: (_state, actor, source, selected) => [{ kind: "BANISH", cardIds: [source, selected[0]], sourceCardId: source }, { kind: "DRAW", actor, count: 2, sourceCardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-030",
    effectId: "multiverse-invitation-action-draw",
    label: "多元邀请·手牌裁剪抽牌",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.12", "301.15", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "multiverse-invitation-action-draw")) && state.players[actor].hand.some((id) => hasFeature(state, id, "蛛网")) && state.players[actor].deck.length > 0,
    targeting: (state, actor) => ({ choices: state.players[actor].hand.filter((id) => hasFeature(state, id, "蛛网")), min: 1, max: 1, prompt: "选择 1 张【蛛网】手牌裁剪；如此做后抽 1 张" }),
    buildOperations: (_state, actor, source, selected) => [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }, { kind: "DRAW", actor, count: 1, sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "multiverse-invitation-action-draw"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-031",
    effectId: "stand-righteous-defeat-banish",
    label: "坚守正道·战败裁剪",
    trigger: "CHARACTER_BATTLE_RESOLVED",
    sourceZones: ["retreat"],
    ruleRefs: ["301.15", "301.20", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_BATTLE_RESOLVED")?.defeatedCardIds.includes(source) ?? false,
    condition: (state, actor) => state.players[actor].deck.length >= 3,
    buildOperations: (_state, actor, source) => [{ kind: "BANISH_DECK_TOP", actor, count: 3, sourceCardId: source }],
  },
  {
    cardNo: "SP01-031",
    effectId: "stand-righteous-void-return",
    label: "坚守正道·虚空援军",
    trigger: "CARDS_BANISHED",
    sourceZones: ["retreat"],
    ruleRefs: ["301.12", "301.15", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_BANISHED")?.sourceCardId === source,
    condition: (state, actor) => openFieldZones(state, actor).length > 0 && state.players[actor].void.some((id) => hasFeature(state, id, "蛛网")),
    targeting: (state, actor) => {
      const web = state.players[actor].void.filter((id) => hasFeature(state, id, "蛛网"));
      const minimum = Math.min(...web.map((id) => effectiveValueV2(state, id, "level")));
      return { choices: [...web.filter((id) => effectiveValueV2(state, id, "level") === minimum), ...openFieldZones(state, actor).map(zoneChoice)], min: 2, max: 2, prompt: "选择虚空区 Lv 最低的 1 张【蛛网】角色及其放置战区", choiceKind: "mixed" as const };
    },
    validateTargets: (state, actor, _source, selected) => {
      const web = state.players[actor].void.filter((id) => hasFeature(state, id, "蛛网"));
      const minimum = Math.min(...web.map((id) => effectiveValueV2(state, id, "level")));
      return selected.filter((id) => web.includes(id) && effectiveValueV2(state, id, "level") === minimum).length === 1 && selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id))).length === 1 ? null : "必须选择虚空区 Lv 最低的【蛛网】角色和 1 个空战区";
    },
    buildOperations: (_state, _actor, source, selected) => [{ kind: "PLACE_FIELD", cardId: selected.find((id) => !id.startsWith("zone:"))!, destination: parseZone(selected.find((id) => id.startsWith("zone:"))!), sourceCardId: source }],
  },
  {
    cardNo: "SP01-032",
    effectId: "alliance-leader-void-draw",
    label: "联盟领袖·蛛网虚空抽牌",
    trigger: "CARDS_BANISHED",
    sourceZones: ["void"],
    optional: true,
    ruleRefs: ["301.12", "301.15", "301.32", "304.1", "305.6"],
    eventFilter: (state, actor, source, context) => {
      const event = eventOf(context, "CARDS_BANISHED");
      return Boolean(event?.cardIds.includes(source) && event.sourceCardId && hasFeature(state, event.sourceCardId, "蛛网") && state.cards[event.sourceCardId]?.owner === actor);
    },
    condition: (state, actor) => state.players[actor].deck.length >= 3,
    buildOperations: (_state, actor, source) => [{ kind: "BANISH_DECK_TOP", actor, count: 3, sourceCardId: source }, { kind: "DRAW", actor, count: 1, sourceCardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-034",
    effectId: "ultimate-mode-clear-attachments",
    label: "终极模式·清除结附",
    trigger: "CARD_ATTACHED",
    sourceZones: ["attachment"],
    ruleRefs: ["301.14", "301.25", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARD_ATTACHED")?.cardId === source,
    condition: (state, _actor, source, context) => (state.attachments[eventOf(context, "CARD_ATTACHED")!.hostCardId] ?? []).some((id) => id !== source),
    buildOperations: (state, _actor, source, _selected, context) => [{ kind: "RETREAT", cardIds: (state.attachments[eventOf(context, "CARD_ATTACHED")!.hostCardId] ?? []).filter((id) => id !== source) }],
  },
  {
    cardNo: "SP01-034",
    effectId: "ultimate-mode-response-boost",
    label: "终极模式·应对增幅",
    activation: "response",
    usage: "turn_once",
    sourceZones: ["attachment"],
    ruleRefs: ["301.15", "301.25", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "ultimate-mode-response-boost")) && state.players[actor].retreat.some((id) => hasFeature(state, id, "蛛网")) && Boolean(Object.entries(state.attachments).find(([, cards]) => cards.includes(source))),
    targeting: (state, actor) => ({ choices: state.players[actor].retreat.filter((id) => hasFeature(state, id, "蛛网")), min: 1, max: 1, prompt: "选择我方撤退区 1 张【蛛网】角色裁剪；如此做后宿主本回合战力 +1000" }),
    buildOperations: (state, _actor, source, selected) => {
      const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(source))![0];
      return [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }, { ...modifier(source, host, "power", 1000, "ultimate-mode"), requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "ultimate-mode-response-boost"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-035",
    effectId: "destiny-mirror-prowler",
    label: "命运镜像·蜘蛛侠替身",
    trigger: "CHARACTER_BATTLE_RESOLVED",
    sourceZones: ["field"],
    optional: true,
    ruleRefs: ["301.15", "301.20", "301.32", "304.1", "305.6"],
    eventFilter: (state, actor, _source, context) => {
      const event = eventOf(context, "CHARACTER_BATTLE_RESOLVED");
      return Boolean(event?.defeatedCardIds.some((id) => state.cards[id]?.owner === actor && hasFeature(state, id, "人类")));
    },
    condition: (state, actor) => openFieldZones(state, actor).length > 0 && state.players[actor].void.some((id) => effectiveValueV2(state, id, "level") === 3 && state.cards[id]?.name.includes("蜘蛛侠")),
    targeting: (state, actor) => ({ choices: [...state.players[actor].void.filter((id) => effectiveValueV2(state, id, "level") === 3 && state.cards[id]?.name.includes("蜘蛛侠")), ...openFieldZones(state, actor).map(zoneChoice)], min: 2, max: 2, prompt: "裁剪此卡，并选择虚空区 1 张 Lv3【蜘蛛侠】及其放置战区", choiceKind: "mixed" as const }),
    buildOperations: (_state, _actor, source, selected) => {
      const card = selected.find((id) => !id.startsWith("zone:"))!;
      const zone = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      return [{ kind: "BANISH", cardIds: [source], sourceCardId: source }, { kind: "PLACE_FIELD", cardId: card, destination: zone, sourceCardId: source, requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-036",
    effectId: "spider-sense-return-yellow",
    label: "蜘蛛感应·黄色人类回手",
    activation: "response",
    usage: "turn_once",
    sourceZones: ["attachment"],
    ruleRefs: ["301.15", "301.25", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-sense-return-yellow")) && faceUpRoles(state, actor).some((id) => state.cards[id]?.attribute === 2 && hasFeature(state, id, "人类")),
    targeting: (state, actor) => ({ choices: faceUpRoles(state, actor).filter((id) => state.cards[id]?.attribute === 2 && hasFeature(state, id, "人类")), min: 1, max: 1, prompt: "裁剪此卡，并选择我方场上 1 张黄色【人类】角色移回手牌" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "BANISH", cardIds: [source], sourceCardId: source }, { kind: "RETURN_TO_HAND", cardIds: [selected[0]], requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-sense-return-yellow"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-037",
    effectId: "spider-mentor-woman-return",
    label: "蜘蛛导师·蜘蛛女侠回基地",
    trigger: "CARDS_RETREATED",
    sourceZones: ["retreat"],
    optional: true,
    ruleRefs: ["301.12", "301.25", "301.32", "304.1", "305.6"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_RETREATED")?.followedAttachmentCardIds?.includes(source) ?? false,
    condition: (state, actor) => state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6,
    buildOperations: (_state, _actor, source) => [{ kind: "MOVE_TO_BASE", cardId: source, face: "up", sourceCardId: source }],
  },
  {
    cardNo: "SP01-038",
    effectId: "spider-nemesis-boomerang",
    label: "蜘蛛宿敌·回旋镖",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.12", "301.14", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-boomerang")) && faceUpRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: faceUpRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "撤退此卡，并选择敌方场上 1 张角色本回合战力 -1000" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "RETREAT", cardIds: [source] }, { ...modifier(source, selected[0], "power", -1000, "boomerang"), requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-boomerang"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-038",
    effectId: "spider-nemesis-boomerang-draw",
    label: "蜘蛛宿敌·回旋镖额外抽牌",
    trigger: "CARDS_RETREATED",
    sourceZones: ["retreat"],
    ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => {
      const event = eventOf(context, "CARDS_RETREATED");
      return event?.reason === "state" && event.sourceCardId === source;
    },
    condition: (state, actor) => state.players[actor].deck.length > 0,
    buildOperations: (_state, actor, source) => [{ kind: "DRAW", actor, count: 1, sourceCardId: source }],
  },
  {
    cardNo: "SP01-039",
    effectId: "consciousness-spore-ultron",
    label: "意识孢子·奥创扩散",
    trigger: "CARD_PLACED_FIELD_BY_EFFECT",
    sourceZones: ["field"],
    ruleRefs: ["301.12", "301.23", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => {
      const event = eventOf(context, "CARD_PLACED_FIELD_BY_EFFECT");
      return event?.cardId === source && event.fromZone === "retreat";
    },
    condition: (state, actor, source) => state.players[actor].baseCards.length + state.players[actor].baseCovered.length <= 3 && openFieldZones(state, actor).length > 0 && state.players[actor].retreat.some((id) => id !== source && state.cards[id]?.name.includes("奥创")),
    targeting: (state, actor, source) => ({ choices: [...state.players[actor].retreat.filter((id) => id !== source && state.cards[id]?.name.includes("奥创")), ...openFieldZones(state, actor).map(zoneChoice)], min: 2, max: 2, prompt: "选择撤退区另一张【奥创】及其放置战区；如此做后盖放全部手牌", choiceKind: "mixed" as const }),
    buildOperations: (state, actor, source, selected) => {
      const ultron = selected.find((id) => !id.startsWith("zone:"))!;
      const zone = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      return [{ kind: "PLACE_FIELD", cardId: ultron, destination: zone, sourceCardId: source }, ...state.players[actor].hand.map((cardId) => ({ kind: "MOVE_TO_BASE" as const, cardId, face: "down" as const, sourceCardId: source }))];
    },
  },
  {
    cardNo: "SP01-040",
    effectId: "suppression-device-hulk",
    label: "抑制装置·班纳",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.12", "301.15", "301.32", "301.41", "304.2"],
    canActivate: (state, actor) => openFieldZones(state, actor).length > 0 && battleRoles(state, actor).some((id) => state.cards[id]?.name.includes("浩克")),
    targeting: (state, actor) => ({ choices: [...battleRoles(state, actor).filter((id) => state.cards[id]?.name.includes("浩克")), ...openFieldZones(state, actor).map(zoneChoice), ...battleRoles(state, opponentOf(actor))], min: 3, max: 3, prompt: "选择我方战区【浩克】裁剪、此卡放置战区，以及敌方 1 张与该浩克 Lv 相同的角色", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => {
      const hulks = selected.filter((id) => battleRoles(state, actor).includes(id) && state.cards[id]?.name.includes("浩克"));
      const zones = selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id)));
      const enemies = selected.filter((id) => battleRoles(state, opponentOf(actor)).includes(id));
      return hulks.length === 1 && zones.length === 1 && enemies.length === 1 && effectiveValueV2(state, enemies[0], "level") === effectiveValueV2(state, hulks[0], "level") ? null : "必须选择【浩克】、空战区及与其 Lv 相同的敌方角色";
    },
    buildOperations: (state, actor, source, selected) => {
      const hulk = selected.find((id) => battleRoles(state, actor).includes(id))!;
      const enemy = selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id))!;
      const zone = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      const level = effectiveValueV2(state, hulk, "level");
      return [{ kind: "BANISH", cardIds: [hulk], sourceCardId: source }, { kind: "PLACE_FIELD", cardId: source, destination: zone, sourceCardId: source, requiresPreviousSuccess: true }, { ...modifier(source, enemy, "power", -level * 1000, "suppression-device"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-041",
    effectId: "spider-nemesis-octopus-victory",
    label: "蜘蛛宿敌·章鱼博士战胜",
    trigger: "CHARACTER_BATTLE_RESOLVED",
    sourceZones: ["field"],
    ruleRefs: ["301.15", "301.20", "301.23", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_BATTLE_RESOLVED")?.winnerCardId === source,
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "power") <= 4000 && !state.usage.enteredThisTurn.includes(id) && !state.usage.movedCardIds.includes(id)) && state.players[opponentOf(actor)].baseCards.length + state.players[opponentOf(actor)].baseCovered.length < 6,
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "power") <= 4000 && !state.usage.enteredThisTurn.includes(id) && !state.usage.movedCardIds.includes(id)), min: 1, max: 1, prompt: "选择敌方战区 1 张战力 4000 或以下角色移动至敌方基地" }),
    buildOperations: (state, _actor, source, selected) => {
      const machinePresent = allFaceUpCards(state, 0).some((id) => hasFeature(state, id, "机械")) || allFaceUpCards(state, 1).some((id) => hasFeature(state, id, "机械"));
      return [{ kind: "MOVE_BATTLE_BASE", cardId: selected[0], destination: "base" }, ...(machinePresent ? [{ kind: "BANISH" as const, cardIds: [selected[0]], sourceCardId: source, requiresPreviousSuccess: true }] : [])];
    },
  },
  {
    cardNo: "SP01-042",
    effectId: "spider-nemesis-green-goblin-infiltrate",
    label: "蜘蛛宿敌·绿魔潜入",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.12", "301.15", "301.23", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-green-goblin-infiltrate")) && state.players[actor].deck.length >= 3 && state.players[opponentOf(actor)].baseCards.length + state.players[opponentOf(actor)].baseCovered.length < 6,
    buildOperations: (_state, actor, source) => [{ kind: "BANISH_DECK_TOP", actor, count: 1, sourceCardId: source }, { kind: "DRAW", actor, count: 2, sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MOVE_TO_BASE", cardId: source, face: "up", controller: opponentOf(actor), sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-green-goblin-infiltrate"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-042",
    effectId: "spider-nemesis-green-goblin-bottom-banish",
    label: "蜘蛛宿敌·绿魔卡组底裁剪",
    trigger: "TURN_CARDS_DRAWN",
    sourceZones: ["base"],
    usage: "turn_once",
    ruleRefs: ["301.15", "301.32", "304.1"],
    eventFilter: (state, actor, source, context) => eventOf(context, "TURN_CARDS_DRAWN")?.actor === actor && state.cards[source]?.owner !== actor,
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-green-goblin-bottom-banish")) && state.players[actor].deck.length >= 3,
    buildOperations: (state, actor, source) => [{ kind: "BANISH", cardIds: state.players[actor].deck.slice(-3), sourceCardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-green-goblin-bottom-banish"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-043",
    effectId: "spider-nemesis-kingpin",
    label: "蜘蛛宿敌·金并援军",
    activation: "response",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.12", "301.13", "301.32", "304.2", "305.6"],
    canActivate: (state, actor, source) => state.players[actor].field.rear.includes(source) && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-kingpin")) && state.players[actor].hand.length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand, ...openFieldZones(state, actor).map(zoneChoice)], min: 1, max: 3, prompt: "选择 1 张手牌舍弃；可再选择另一张名称含【宿敌】的手牌及其放置战区", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => {
      const hand = selected.filter((id) => state.players[actor].hand.includes(id));
      const zones = selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id)));
      if (hand.length === 1 && zones.length === 0) return null;
      if (hand.length === 2 && new Set(hand).size === 2 && zones.length === 1 && hand.some((id) => state.cards[id]?.name.includes("宿敌"))) return null;
      return "必须选择 1 张手牌舍弃；若放置援军，还需选择另一张【宿敌】手牌和 1 个空战区";
    },
    buildOperations: (state, actor, source, selected) => {
      const hand = selected.filter((id) => state.players[actor].hand.includes(id));
      const reinforcement = hand.length === 2 ? hand.find((id) => state.cards[id]?.name.includes("宿敌")) : undefined;
      const discard = reinforcement ? hand.find((id) => id !== reinforcement)! : hand[0];
      const zone = selected.find((id) => id.startsWith("zone:"));
      return [{ kind: "DISCARD", cardIds: [discard] }, ...(reinforcement && zone ? [{ kind: "PLACE_FIELD" as const, cardId: reinforcement, destination: parseZone(zone), sourceCardId: source, requiresPreviousSuccess: true }] : []), { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-kingpin"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-044",
    effectId: "spider-nemesis-electro-arrival",
    label: "蜘蛛宿敌·电王入场",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["field"],
    optional: true,
    ruleRefs: ["301.12", "301.32", "301.41", "304.1", "305.6"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_PLACED")?.cardId === source,
    condition: (state) => state.players.flatMap((player) => player.baseCards).some((id) => state.cards[id]?.level <= 3),
    targeting: (state) => ({ choices: state.players.flatMap((player) => player.baseCards).filter((id) => state.cards[id]?.level <= 3), min: 1, max: 1, prompt: "选择任一基地 1 张原本 Lv3 或以下角色盖伏" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "COVER", cardId: selected[0] }, { ...modifier(source, source, "range", 3, "electro-range"), requiresPreviousSuccess: true }, { ...modifier(source, source, "power", 3000, "electro-power"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-046",
    effectId: "chaos-entropy-arrival",
    label: "混沌熵增·入场",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["field"],
    ruleRefs: ["301.15", "301.32", "301.41", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_PLACED")?.cardId === source,
    condition: (state, actor) => {
      const x = state.players[actor].baseCovered.length;
      return state.players[opponentOf(actor)].baseCards.some((id) => effectiveValueV2(state, id, "level") <= x);
    },
    targeting: (state, actor) => {
      const x = state.players[actor].baseCovered.length;
      return { choices: state.players[opponentOf(actor)].baseCards.filter((id) => effectiveValueV2(state, id, "level") <= x), min: 1, max: 1, prompt: `选择敌方基地 1 张 Lv${x} 或以下角色裁剪` };
    },
    buildOperations: (state, actor, source, selected) => {
      const x = state.players[actor].baseCovered.length;
      return [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }, { ...modifier(source, source, "range", x, "chaos-entropy-range"), requiresPreviousSuccess: true }, { ...modifier(source, source, "power", x * 1000, "chaos-entropy-power"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-047",
    effectId: "symbiote-god-knull-arrival",
    label: "共生体之神·纳尔降临",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.12", "301.13", "301.25", "301.32", "304.2", "305.6"],
    canActivate: (state, actor) => openFieldZones(state, actor).length > 0 && state.players[actor].retreat.filter((id) => hasFeature(state, id, "共生体")).length >= 4,
    targeting: (state, actor) => {
      const symbiotes = state.players[actor].retreat.filter((id) => hasFeature(state, id, "共生体"));
      return { choices: [...openFieldZones(state, actor).map(zoneChoice), ...symbiotes], min: 1, max: 1 + symbiotes.length, prompt: "选择纳尔的放置战区，并可选择任意张名称互不相同的撤退区【共生体】角色结附", choiceKind: "mixed" as const };
    },
    validateTargets: (state, actor, _source, selected) => {
      const zones = selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id)));
      const symbiotes = selected.filter((id) => state.players[actor].retreat.includes(id) && hasFeature(state, id, "共生体"));
      const distinctNames = new Set(symbiotes.map((id) => state.cards[id]?.name));
      return zones.length === 1 && selected.length === zones.length + symbiotes.length && distinctNames.size === symbiotes.length ? null : "必须选择 1 个空战区，且所选共生体角色名称不能重复";
    },
    buildOperations: (state, actor, source, selected) => {
      const zone = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      const symbiotes = selected.filter((id) => state.players[actor].retreat.includes(id));
      return [{ kind: "PLACE_FIELD", cardId: source, destination: zone, sourceCardId: source }, ...symbiotes.map((cardId) => ({ kind: "ATTACH" as const, cardId, hostCardId: source, sourceCardId: source, requiresPreviousSuccess: true }))];
    },
  },
  {
    cardNo: "SP01-047",
    effectId: "symbiote-god-knull-copy",
    label: "共生体之神·效果同化",
    activation: "response",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.25", "301.32", "304.2", "305.6"],
    canActivate: (state, _actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "symbiote-god-knull-copy")) && (state.attachments[source] ?? []).length > 0,
    targeting: (state, _actor, source) => ({ choices: [...(state.attachments[source] ?? [])], min: 1, max: 1, prompt: "选择纳尔的 1 张结附卡；纳尔本回合获得该卡的全部效果" }),
    buildOperations: (state, _actor, source, selected) => [{ kind: "GRANT_COPIED_EFFECTS", grant: { id: `promo:${source}:copied-effects`, sourceCardId: source, targetCardId: source, copiedFromCardId: selected[0], copiedCardNo: state.cards[selected[0]].cardNo, duration: "turn" } }, { kind: "MARK_EFFECT_USED", key: useKey(source, "symbiote-god-knull-copy"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-048",
    effectId: "spider-ally-daredevil-draw",
    label: "蜘蛛战友·夜魔侠",
    activation: "response",
    usage: "turn_once",
    sourceZones: ["base"],
    ruleRefs: ["301.12", "301.14", "301.32", "304.2", "305.6"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-ally-daredevil-draw")) && faceUpRoles(state, actor).some((id) => hasFeature(state, id, "人类")) && state.players[actor].deck.length > 0,
    targeting: (state, actor) => ({ choices: faceUpRoles(state, actor).filter((id) => hasFeature(state, id, "人类")), min: 1, max: 1, prompt: "选择我方场上 1 张【人类】角色撤退；如此做后抽 1 张" }),
    buildOperations: (_state, actor, source, selected) => [{ kind: "RETREAT", cardIds: [selected[0]] }, { kind: "DRAW", actor, count: 1, sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-ally-daredevil-draw"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-049",
    effectId: "spider-ally-harry-balance",
    label: "蜘蛛战友·哈利平衡",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.12", "301.13", "301.32", "304.2"],
    canActivate: (state, _actor, source) => battleRoles(state, 0).length !== battleRoles(state, 1).length && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-ally-harry-balance")),
    buildOperations: (state, _actor, source) => {
      const beneficiary: PlayerIndex = battleRoles(state, 0).length < battleRoles(state, 1).length ? 0 : 1;
      const bottom = state.players[beneficiary].deck.at(-1);
      return [{ kind: "DRAW", actor: beneficiary, count: 1, sourceCardId: source }, ...(bottom ? [{ kind: "DISCARD" as const, cardIds: [bottom], requiresPreviousSuccess: true }] : []), { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-ally-harry-balance"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-050",
    effectId: "spider-nemesis-devour-summon",
    label: "蜘蛛宿敌·吞噬夺取",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field"],
    optional: true,
    ruleRefs: ["301.12", "301.13", "301.25", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_SUMMONED")?.cardId === source,
    condition: (state, actor) => openFieldZones(state, actor).length > 0 && state.players[opponentOf(actor)].retreat.some((id) => effectiveValueV2(state, id, "level") === 3 && hasFeature(state, id, "人类")),
    targeting: (state, actor) => ({ choices: [...state.players[opponentOf(actor)].retreat.filter((id) => effectiveValueV2(state, id, "level") === 3 && hasFeature(state, id, "人类")), ...openFieldZones(state, actor).map(zoneChoice)], min: 2, max: 2, prompt: "选择敌方撤退区 1 张 Lv3【人类】角色和我方 1 个空战区；放置后吞噬结附于该角色", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[opponentOf(actor)].retreat.includes(id) && effectiveValueV2(state, id, "level") === 3 && hasFeature(state, id, "人类")).length === 1 && selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id))).length === 1 ? null : "必须选择敌方撤退区 1 张 Lv3 人类和我方 1 个空战区",
    buildOperations: (state, actor, source, selected) => {
      const target = selected.find((id) => state.players[opponentOf(actor)].retreat.includes(id))!;
      const zone = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      return [{ kind: "PLACE_FIELD", cardId: target, destination: zone, controller: actor, sourceCardId: source }, { kind: "ATTACH", cardId: source, hostCardId: target, sourceCardId: source, requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-053",
    effectId: "spider-nemesis-riot-attach",
    label: "蜘蛛宿敌·暴乱侵附",
    trigger: "ATTACK_DECLARED",
    sourceZones: ["hand"],
    optional: true,
    ruleRefs: ["301.13", "301.25", "301.32", "304.1", "305.6"],
    eventFilter: (state, actor, _source, context) => {
      const event = eventOf(context, "ATTACK_DECLARED");
      return Boolean(event && state.cards[event.attackerId]?.owner === opponentOf(actor) && state.cards[event.attackerId]?.power <= 3000 && hasFeature(state, event.attackerId, "人类"));
    },
    condition: (state, actor) => state.players[actor].deck.length >= 3,
    buildOperations: (state, actor, source, _selected, context) => {
      const attacker = eventOf(context, "ATTACK_DECLARED")!.attackerId;
      return [{ kind: "DISCARD", cardIds: state.players[actor].deck.slice(-3) }, { kind: "ATTACH", cardId: source, hostCardId: attacker, sourceCardId: source, requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-054",
    effectId: "spider-nemesis-lash-move",
    label: "蜘蛛宿敌·皮鞭移动压制",
    trigger: "BATTLE_BASE_MOVED",
    sourceZones: ["field"],
    ruleRefs: ["301.23", "301.32", "301.41", "304.1"],
    eventFilter: (state, actor, _source, context) => {
      const event = eventOf(context, "BATTLE_BASE_MOVED");
      return Boolean(event && event.actor === opponentOf(actor));
    },
    buildOperations: (_state, _actor, source, _selected, context) => [{ ...modifier(source, eventOf(context, "BATTLE_BASE_MOVED")!.cardId, "power", -1000, "lash-move") }],
  },
  {
    cardNo: "SP01-054",
    effectId: "spider-nemesis-lash-banish",
    label: "蜘蛛宿敌·皮鞭撤退裁剪",
    trigger: "CARDS_RETREATED",
    sourceZones: ["field"],
    ruleRefs: ["301.15", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => {
      const event = eventOf(context, "CARDS_RETREATED");
      return event?.reason === "state" && event.sourceCardId === source;
    },
    condition: (_state, _actor, _source, context) => (eventOf(context, "CARDS_RETREATED")?.cardIds.length ?? 0) > 0,
    buildOperations: (_state, _actor, source, _selected, context) => [{ kind: "BANISH", cardIds: [...eventOf(context, "CARDS_RETREATED")!.cardIds], sourceCardId: source }],
  },
  {
    cardNo: "SP01-055",
    effectId: "spider-nemesis-vulture-move",
    label: "蜘蛛宿敌·秃鹫回收机械",
    trigger: "BATTLE_BASE_MOVED",
    sourceZones: ["field", "base"],
    optional: true,
    usage: "turn_once",
    ruleRefs: ["301.13", "301.23", "301.25", "301.32", "304.1", "305.6"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "BATTLE_BASE_MOVED")?.cardId === source,
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-vulture-move")) && state.players[actor].hand.length >= 3 && state.players[actor].retreat.some((id) => hasFeature(state, id, "机械")),
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand, ...state.players[actor].retreat.filter((id) => hasFeature(state, id, "机械"))], min: 4, max: 4, prompt: "选择 3 张手牌舍弃，并选择撤退区 1 张【机械】角色结附于此卡", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].hand.includes(id)).length === 3 && selected.filter((id) => state.players[actor].retreat.includes(id) && hasFeature(state, id, "机械")).length === 1 ? null : "必须选择 3 张手牌和 1 张撤退区【机械】角色",
    buildOperations: (state, actor, source, selected) => {
      const hand = selected.filter((id) => state.players[actor].hand.includes(id));
      const machine = selected.find((id) => state.players[actor].retreat.includes(id))!;
      return [{ kind: "DISCARD", cardIds: hand }, { kind: "ATTACH", cardId: machine, hostCardId: source, sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-vulture-move"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-056",
    effectId: "spider-nemesis-rhino-move",
    label: "蜘蛛宿敌·犀牛人冲撞",
    trigger: "BATTLE_BASE_MOVED",
    sourceZones: ["field", "base"],
    usage: "turn_once",
    ruleRefs: ["301.14", "301.23", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "BATTLE_BASE_MOVED")?.cardId === source,
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-rhino-move")) && state.players[opponentOf(actor)].baseCovered.length > 0,
    buildOperations: (_state, actor, source) => [{ kind: "RETREAT_RANDOM_BASE_COVERED", actor: opponentOf(actor), sourceCardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-rhino-move"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-057",
    effectId: "burn-loot-hand",
    label: "烧杀掳掠·手合众",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["hand"],
    optional: true,
    ruleRefs: ["301.13", "301.14", "301.32", "304.1", "305.6"],
    eventFilter: (state, actor, _source, context) => {
      const event = eventOf(context, "CHARACTER_PLACED");
      return Boolean(event?.actor === opponentOf(actor) && effectiveValueV2(state, event.cardId, "level") === 2 && hasFeature(state, event.cardId, "人类"));
    },
    buildOperations: (_state, _actor, source, _selected, context) => [{ kind: "DISCARD", cardIds: [source] }, { kind: "RETREAT", cardIds: [eventOf(context, "CHARACTER_PLACED")!.cardId], requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-058",
    effectId: "spider-nemesis-tombstone-flanks",
    label: "蜘蛛宿敌·墓碑侧翼压制",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.13", "301.32", "301.41", "304.2"],
    canActivate: (state, actor, source) => {
      const x = state.players[opponentOf(actor)].field.flankLeft.length + state.players[opponentOf(actor)].field.flankRight.length;
      return state.players[actor].field.vanguard.includes(source) && x > 0 && state.players[actor].deck.length >= x && state.players[opponentOf(actor)].deck.length >= x && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-tombstone-flanks"));
    },
    buildOperations: (state, actor, source) => {
      const x = state.players[opponentOf(actor)].field.flankLeft.length + state.players[opponentOf(actor)].field.flankRight.length;
      return [{ kind: "DISCARD", cardIds: state.players[actor].deck.slice(-x) }, { kind: "DISCARD", cardIds: state.players[opponentOf(actor)].deck.slice(-x), requiresPreviousSuccess: true }, { ...modifier(source, source, "range", x, "tombstone-flanks"), requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-tombstone-flanks"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-059",
    effectId: "genetic-backlash-attach",
    label: "基因反噬·人形蜘蛛结附",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.25", "301.32", "301.41", "304.2"],
    canActivate: (state) => [...faceUpRoles(state, 0), ...faceUpRoles(state, 1)].some((id) => hasFeature(state, id, "人类")),
    targeting: (state) => ({ choices: [...faceUpRoles(state, 0), ...faceUpRoles(state, 1)].filter((id) => hasFeature(state, id, "人类")), min: 1, max: 1, prompt: "选择场上 1 张【人类】角色作为宿主，本回合战力 +1000" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "ATTACH", cardId: source, hostCardId: selected[0], sourceCardId: source }, { ...modifier(source, selected[0], "power", 1000, "genetic-backlash"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-059",
    effectId: "genetic-backlash-end-banish",
    label: "基因反噬·未攻击裁剪",
    trigger: "END_TRIGGERS_PROCESSED",
    sourceZones: ["attachment"],
    ruleRefs: ["301.15", "301.25", "301.32", "304.1"],
    eventFilter: (state, actor, source, context) => {
      const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(source))?.[0];
      const event = eventOf(context, "END_TRIGGERS_PROCESSED");
      return Boolean(host && event?.actor === actor && !(state.usage.attackedCardIdsByPlayer[actor] ?? []).includes(host));
    },
    buildOperations: (state, _actor, source) => [{ kind: "BANISH", cardIds: [Object.entries(state.attachments).find(([, cards]) => cards.includes(source))![0]], sourceCardId: source }],
  },
  {
    cardNo: "SP01-060",
    effectId: "spider-nemesis-lizard-move",
    label: "蜘蛛宿敌·蜥蜴盖卡转化",
    trigger: "BATTLE_BASE_MOVED",
    sourceZones: ["field", "base"],
    usage: "turn_once",
    ruleRefs: ["301.12", "301.28", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "BATTLE_BASE_MOVED")?.cardId === source,
    condition: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-lizard-move")) && state.players[actor].baseCovered.some((covered) => state.players[actor].retreat.some((id) => effectiveValueV2(state, id, "level") === effectiveValueV2(state, covered, "level"))) && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6,
    targeting: (state, actor) => ({ choices: [...state.players[actor].baseCovered, ...state.players[actor].retreat], min: 2, max: 2, prompt: "选择我方基地 1 张盖卡展示，并选择撤退区 1 张同 Lv 角色盖放基地", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => {
      const covered = selected.filter((id) => state.players[actor].baseCovered.includes(id));
      const retreat = selected.filter((id) => state.players[actor].retreat.includes(id));
      return covered.length === 1 && retreat.length === 1 && effectiveValueV2(state, covered[0], "level") === effectiveValueV2(state, retreat[0], "level") ? null : "必须选择 1 张盖卡和 1 张同 Lv 撤退区角色";
    },
    buildOperations: (state, actor, source, selected) => {
      const covered = selected.find((id) => state.players[actor].baseCovered.includes(id))!;
      const retreat = selected.find((id) => state.players[actor].retreat.includes(id))!;
      return [{ kind: "REVEAL", cardIds: [covered], sourceCardId: source }, { kind: "MOVE_TO_BASE", cardId: retreat, face: "down", sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-lizard-move"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-061",
    effectId: "spider-nemesis-negative-hand-arrival",
    label: "蜘蛛宿敌·底片先生降临",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.12", "301.28", "301.32", "304.2"],
    canActivate: (state, actor) => state.usage.summonsThisTurn[actor] === 0 && state.players[actor].baseCovered.length === faceUpRoles(state, actor).length && (["flankLeft", "flankRight"] as const).some((zone) => state.players[actor].field[zone].length === 0),
    targeting: (state, actor) => ({ choices: (["flankLeft", "flankRight"] as const).filter((zone) => state.players[actor].field[zone].length === 0).map(zoneChoice), min: 1, max: 1, prompt: "选择我方 1 个空侧翼区放置底片先生；随后翻面我方基地全部卡牌", choiceKind: "field_location" as const }),
    buildOperations: (state, actor, source, selected) => [
      { kind: "PLACE_FIELD", cardId: source, destination: parseZone(selected[0]), sourceCardId: source },
      ...state.players[actor].baseCards.map((cardId) => ({ kind: "COVER" as const, cardId, requiresPreviousSuccess: true })),
      ...state.players[actor].baseCovered.map((cardId) => ({ kind: "FLIP_BASE_FACE_UP" as const, cardId, requiresPreviousSuccess: true })),
    ],
  },
  {
    cardNo: "SP01-061",
    effectId: "spider-nemesis-negative-payment-lock",
    label: "蜘蛛宿敌·底片先生支付封锁",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["field"],
    ruleRefs: ["301.23", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => {
      const event = eventOf(context, "CHARACTER_PLACED");
      return event?.actor === actor && event.cardId === source;
    },
    buildOperations: (_state, actor) => [{ kind: "FORBID_HIGH_LEVEL_SUMMON_PAYMENT", actor, minimumLevel: 5 }],
  },
  {
    cardNo: "SP01-062",
    effectId: "hell-lord-mephisto-banish-draw",
    label: "地狱之王·人类献祭",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["base"],
    ruleRefs: ["301.13", "301.15", "301.32", "304.2", "305.6"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "hell-lord-mephisto-banish-draw")) && state.players[actor].hand.some((id) => hasFeature(state, id, "人类")) && state.players[actor].deck.length > 0,
    targeting: (state, actor) => ({ choices: state.players[actor].hand.filter((id) => hasFeature(state, id, "人类")), min: 1, max: 1, prompt: "选择我方手牌 1 张【人类】角色裁剪；随后抽 1 张" }),
    buildOperations: (state, actor, source, selected) => {
      const level = effectiveValueV2(state, selected[0], "level");
      return [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "hell-lord-mephisto-banish-draw"), requiresPreviousSuccess: true }, { kind: "DRAW", actor, count: 1, sourceCardId: source, contextValue: level, requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-062",
    effectId: "hell-lord-mephisto-place",
    label: "地狱之王·等阶降临",
    trigger: "TURN_CARDS_DRAWN",
    sourceZones: ["base"],
    optional: true,
    ruleRefs: ["301.12", "301.32", "304.1", "305.6"],
    eventFilter: (_state, actor, source, context) => {
      const event = eventOf(context, "TURN_CARDS_DRAWN");
      return event?.actor === actor && event.sourceCardId === source && event.contextValue !== undefined;
    },
    condition: (state, actor, _source, context) => {
      const level = eventOf(context, "TURN_CARDS_DRAWN")?.contextValue;
      return level !== undefined && openFieldZones(state, actor).length > 0 && state.players[actor].hand.some((id) => effectiveValueV2(state, id, "level") === level && !state.cards[id]?.hasEffectText);
    },
    targeting: (state, actor, _source, context) => {
      const level = eventOf(context, "TURN_CARDS_DRAWN")!.contextValue!;
      return { choices: [...state.players[actor].hand.filter((id) => effectiveValueV2(state, id, "level") === level && !state.cards[id]?.hasEffectText), ...openFieldZones(state, actor).map(zoneChoice)], min: 2, max: 2, prompt: `选择手牌 1 张 Lv${level}、不拥有效果的角色及其放置战区`, choiceKind: "mixed" as const };
    },
    validateTargets: (state, actor, _source, selected, context) => {
      const level = eventOf(context, "TURN_CARDS_DRAWN")!.contextValue!;
      const roles = selected.filter((id) => state.players[actor].hand.includes(id) && effectiveValueV2(state, id, "level") === level && !state.cards[id]?.hasEffectText);
      const zones = selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id)));
      return roles.length === 1 && zones.length === 1 ? null : `必须选择 1 张 Lv${level} 无效果角色和 1 个空战区`;
    },
    buildOperations: (state, actor, source, selected) => [{ kind: "PLACE_FIELD", cardId: selected.find((id) => state.players[actor].hand.includes(id))!, destination: parseZone(selected.find((id) => id.startsWith("zone:"))!), sourceCardId: source }],
  },
  {
    cardNo: "SP01-063",
    effectId: "spider-companion-black-cat-arrival",
    label: "蜘蛛伴侣·黑猫入场",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["hand"],
    optional: true,
    ruleRefs: ["301.12", "301.32", "304.1", "305.6"],
    eventFilter: (state, actor, _source, context) => {
      const event = eventOf(context, "CHARACTER_PLACED");
      return Boolean(event?.actor === actor && hasFeature(state, event.cardId, "蛛网"));
    },
    condition: (state, actor) => openFieldZones(state, actor).length > 0 || state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6,
    targeting: (state, actor) => ({ choices: [...openFieldZones(state, actor).map(zoneChoice), ...(state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6 ? ["zone:base"] : [])], min: 1, max: 1, prompt: "选择黑猫放置进我方战区或基地", choiceKind: "field_location" as const }),
    buildOperations: (_state, _actor, source, selected) => selected[0] === "zone:base"
      ? [{ kind: "MOVE_TO_BASE", cardId: source, face: "up", sourceCardId: source }]
      : [{ kind: "PLACE_FIELD", cardId: source, destination: parseZone(selected[0]), sourceCardId: source }],
  },
  {
    cardNo: "SP01-063",
    effectId: "spider-companion-black-cat-random-cover",
    label: "蜘蛛伴侣·黑猫随机盖手牌",
    trigger: "CHARACTER_PLACED",
    sourceZones: ["field", "base"],
    ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_PLACED")?.cardId === source,
    condition: (state, actor) => state.players[opponentOf(actor)].hand.length > 0 && state.players[opponentOf(actor)].baseCards.length + state.players[opponentOf(actor)].baseCovered.length < 6,
    buildOperations: (_state, actor, source) => [{ kind: "COVER_RANDOM_HAND", actor: opponentOf(actor), sourceCardId: source }],
  },
  {
    cardNo: "SP01-064",
    effectId: "dual-destiny-action-swap",
    label: "二重命运·主动替换",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["attachment"],
    ruleRefs: ["301.23", "301.25", "301.32", "304.2", "305.5"],
    canActivate: (state, _actor, source) => {
      const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(source))?.[0];
      return Boolean(host && hasFeature(state, host, "蛛网") && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "dual-destiny-action-swap")));
    },
    buildOperations: (state, _actor, source) => {
      const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(source))![0];
      return [{ kind: "SWAP_POSITIONS", cardIds: [source, host], sourceCardId: source }, { kind: "GRANT_KEYWORD", grant: { id: `promo:${source}:dual-destiny-air-raid`, sourceCardId: source, targetCardId: source, keyword: "airRaid", duration: "turn" }, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "dual-destiny-action-swap"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-064",
    effectId: "dual-destiny-turn-swap",
    label: "二重命运·敌方回合替换",
    trigger: "TURN_CARDS_DRAWN",
    sourceZones: ["field"],
    usage: "turn_once",
    ruleRefs: ["301.23", "301.25", "301.32", "304.1", "305.2"],
    eventFilter: (_state, actor, _source, context) => eventOf(context, "TURN_CARDS_DRAWN")?.actor === opponentOf(actor),
    condition: (state, _actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "dual-destiny-turn-swap")) && (state.attachments[source] ?? []).some((id) => hasFeature(state, id, "蛛网")),
    targeting: (state, _actor, source) => ({ choices: (state.attachments[source] ?? []).filter((id) => hasFeature(state, id, "蛛网")), min: 1, max: 1, prompt: "选择此卡 1 张【蛛网】结附卡与此卡互相替换" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "SWAP_POSITIONS", cardIds: [selected[0], source], sourceCardId: source }, { kind: "GRANT_KEYWORD", grant: { id: `promo:${source}:dual-destiny-intercept`, sourceCardId: source, targetCardId: selected[0], keyword: "intercept", duration: "turn" }, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "dual-destiny-turn-swap"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-065",
    effectId: "destiny-resonance-return",
    label: "命运共鸣·蛛网回手",
    trigger: "CARD_ATTACHED",
    sourceZones: ["attachment"],
    ruleRefs: ["301.14", "301.25", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARD_ATTACHED")?.cardId === source,
    condition: (state, actor) => [...state.players[actor].retreat, ...state.players[actor].void].some((id) => hasFeature(state, id, "蛛网")),
    targeting: (state, actor) => ({ choices: [...state.players[actor].retreat, ...state.players[actor].void].filter((id) => hasFeature(state, id, "蛛网")), min: 1, max: 1, prompt: "选择我方撤退区或虚空区 1 张【蛛网】角色移回手牌" }),
    buildOperations: (_state, _actor, _source, selected) => [{ kind: "RETURN_TO_HAND", cardIds: [selected[0]] }],
  },
  {
    cardNo: "SP01-065",
    effectId: "destiny-resonance-breach",
    label: "命运共鸣·破绽降临",
    activation: "action",
    sourceZones: ["hand"],
    ruleRefs: ["301.12", "301.14", "301.15", "301.32", "304.2"],
    canActivate: (state, actor) => openFieldZones(state, actor).length > 0 && state.players[actor].retreat.filter((id) => hasFeature(state, id, "蛛网")).length >= 5 && faceUpRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[actor].retreat.filter((id) => hasFeature(state, id, "蛛网")), ...openFieldZones(state, actor).map(zoneChoice), ...faceUpRoles(state, opponentOf(actor))], min: 7, max: 7, prompt: "选择撤退区 5 张【蛛网】角色裁剪、1 个破绽放置此卡，并选择敌方场上 1 张角色撤退", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => state.players[actor].retreat.includes(id) && hasFeature(state, id, "蛛网")).length === 5 && selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id))).length === 1 && selected.filter((id) => faceUpRoles(state, opponentOf(actor)).includes(id)).length === 1 ? null : "必须选择 5 张蛛网费用、1 个破绽和 1 张敌方场上角色",
    buildOperations: (state, actor, source, selected) => {
      const costs = selected.filter((id) => state.players[actor].retreat.includes(id));
      const zone = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      const enemy = selected.find((id) => faceUpRoles(state, opponentOf(actor)).includes(id))!;
      return [{ kind: "BANISH", cardIds: costs, sourceCardId: source }, { kind: "PLACE_FIELD", cardId: source, destination: zone, sourceCardId: source, requiresPreviousSuccess: true }, { kind: "RETREAT", cardIds: [enemy], requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-066",
    effectId: "multiverse-repair-strange",
    label: "多元修复·奇异博士",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.13", "301.23", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "multiverse-repair-strange")) && state.players[actor].hand.length > 0 && openFieldZones(state, actor).length > 0 && state.players[actor].void.some((id) => hasFeature(state, id, "多元")),
    targeting: (state, actor) => ({ choices: [...state.players[actor].hand, ...state.players[actor].void.filter((id) => hasFeature(state, id, "多元")), ...openFieldZones(state, actor).map(zoneChoice)], min: 3, max: 4, prompt: "选择 1 张手牌舍弃、1 张虚空区【多元】角色及其放置战区；若角色 Lv4 以上，再选择另 1 张手牌", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => {
      const hand = selected.filter((id) => state.players[actor].hand.includes(id));
      const roles = selected.filter((id) => state.players[actor].void.includes(id) && hasFeature(state, id, "多元"));
      const zones = selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id)));
      const requiredHand = roles.length === 1 && effectiveValueV2(state, roles[0], "level") >= 4 ? 2 : 1;
      return hand.length === requiredHand && roles.length === 1 && zones.length === 1 ? null : `该角色需要舍弃 ${requiredHand} 张手牌，并选择 1 个空战区`;
    },
    buildOperations: (state, actor, source, selected) => {
      const hand = selected.filter((id) => state.players[actor].hand.includes(id));
      const role = selected.find((id) => state.players[actor].void.includes(id))!;
      const zone = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      return [{ kind: "DISCARD", cardIds: hand }, { kind: "PLACE_FIELD", cardId: role, destination: zone, sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "multiverse-repair-strange"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-067",
    effectId: "spider-ally-anti-venom-attach",
    label: "蜘蛛战友·反毒液结附",
    trigger: "CHARACTER_SUMMONED",
    sourceZones: ["field"],
    optional: true,
    ruleRefs: ["301.12", "301.25", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_SUMMONED")?.cardId === source,
    condition: (state, _actor, source) => ([0, 1] as const).some((seat) => faceUpRoles(state, seat).some((id) => id !== source)),
    targeting: (state, _actor, source) => ({ choices: ([0, 1] as const).flatMap((seat) => faceUpRoles(state, seat)).filter((id) => id !== source), min: 1, max: 1, prompt: "选择场上 1 张角色，使战区的反毒液结附于该角色" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "ATTACH", cardId: source, hostCardId: selected[0], sourceCardId: source }],
  },
  {
    cardNo: "SP01-068",
    effectId: "responsibility-inheritance-defeat",
    label: "责任继承·战败寄生",
    trigger: "CHARACTER_BATTLE_RESOLVED",
    sourceZones: ["retreat"],
    ruleRefs: ["301.20", "301.25", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CHARACTER_BATTLE_RESOLVED")?.defeatedCardIds.includes(source) ?? false,
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "选择敌方战区 1 张角色，把撤退区的此卡结附于该角色" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "ATTACH", cardId: source, hostCardId: selected[0], sourceCardId: source }],
  },
  {
    cardNo: "SP01-068",
    effectId: "responsibility-inheritance-attach",
    label: "责任继承·宿主移动",
    trigger: "CARD_ATTACHED",
    sourceZones: ["attachment"],
    ruleRefs: ["301.12", "301.23", "301.25", "301.32", "304.1"],
    eventFilter: (state, _actor, source, context) => {
      const event = eventOf(context, "CARD_ATTACHED");
      return Boolean(event?.cardId === source && battleRoles(state, cardControllerV2(state, event.hostCardId) ?? 0).includes(event.hostCardId) && effectiveValueV2(state, event.hostCardId, "power") <= 4000);
    },
    condition: (state, _actor, _source, context) => {
      const host = eventOf(context, "CARD_ATTACHED")!.hostCardId;
      const controller = cardControllerV2(state, host);
      return controller !== null && state.players[controller].baseCards.length + state.players[controller].baseCovered.length < 6 && !state.usage.enteredThisTurn.includes(host) && !state.usage.movedCardIds.includes(host);
    },
    buildOperations: (state, _actor, source, _selected, context) => {
      const host = eventOf(context, "CARD_ATTACHED")!.hostCardId;
      const machinePresent = [...allFaceUpCards(state, 0), ...allFaceUpCards(state, 1)].some((id) => id !== source && hasFeature(state, id, "机械"));
      return [{ kind: "MOVE_BATTLE_BASE", cardId: host, destination: "base" }, ...(machinePresent ? [{ kind: "COVER" as const, cardId: host, requiresPreviousSuccess: true }] : [])];
    },
  },
  {
    cardNo: "SP01-069",
    effectId: "spider-companion-mary-jane",
    label: "蜘蛛伴侣·玛丽简支援",
    activation: "response",
    usage: "turn_once",
    sourceZones: ["base"],
    ruleRefs: ["301.12", "301.32", "301.41", "304.2", "305.6"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-companion-mary-jane")) && faceUpRoles(state, actor).some((id) => hasFeature(state, id, "蛛网")),
    targeting: (state, actor) => ({ choices: faceUpRoles(state, actor).filter((id) => hasFeature(state, id, "蛛网")), min: 1, max: 1, prompt: "选择我方场上 1 张【蛛网】角色，本回合 R+1、战力+500" }),
    buildOperations: (_state, _actor, source, selected) => [{ ...modifier(source, selected[0], "range", 1, "mary-jane-range") }, modifier(source, selected[0], "power", 500, "mary-jane-power"), { kind: "COVER", cardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-companion-mary-jane") }],
  },
  {
    cardNo: "SP01-070",
    effectId: "multiverse-sense-attach-mill",
    label: "多元感应·结附舍弃",
    trigger: "CARD_ATTACHED",
    sourceZones: ["attachment"],
    ruleRefs: ["301.13", "301.25", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARD_ATTACHED")?.cardId === source,
    condition: (state, actor) => state.players[actor].deck.length >= 3,
    buildOperations: (_state, actor) => [{ kind: "DISCARD_DECK_TOP", actor, count: 3 }],
  },
  {
    cardNo: "SP01-070",
    effectId: "multiverse-sense-void-return",
    label: "多元感应·蛛网回场",
    trigger: "CARDS_BANISHED",
    sourceZones: ["field", "base", "attachment"],
    optional: true,
    ruleRefs: ["301.12", "301.13", "301.15", "301.32", "304.1", "305.6"],
    eventFilter: (state, actor, _source, context) => eventOf(context, "CARDS_BANISHED")?.cardIds.some((id) => state.cards[id]?.owner === actor && hasFeature(state, id, "蛛网")) ?? false,
    condition: (state, actor) => openFieldZones(state, actor).length > 0,
    targeting: (state, actor, _source, context) => {
      const web = eventOf(context, "CARDS_BANISHED")!.cardIds.filter((id) => state.cards[id]?.owner === actor && hasFeature(state, id, "蛛网"));
      const needsDiscard = web.some((id) => effectiveValueV2(state, id, "level") >= 4);
      return { choices: [...web, ...openFieldZones(state, actor).map(zoneChoice), ...(needsDiscard ? state.players[actor].hand : [])], min: 2, max: 3, prompt: "裁剪场上的此卡，选择本次进入虚空的【蛛网】角色及空战区；Lv4 以上再选择 1 张手牌舍弃", choiceKind: "mixed" as const };
    },
    validateTargets: (state, actor, _source, selected, context) => {
      const web = eventOf(context, "CARDS_BANISHED")!.cardIds.filter((id) => state.cards[id]?.owner === actor && hasFeature(state, id, "蛛网"));
      const roles = selected.filter((id) => web.includes(id));
      const zones = selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id)));
      const hand = selected.filter((id) => state.players[actor].hand.includes(id));
      const requiredHand = roles.length === 1 && effectiveValueV2(state, roles[0], "level") >= 4 ? 1 : 0;
      return roles.length === 1 && zones.length === 1 && hand.length === requiredHand ? null : `必须选择本次虚空蛛网角色、空战区${requiredHand ? "和 1 张手牌" : ""}`;
    },
    buildOperations: (state, actor, source, selected) => {
      const role = selected.find((id) => state.players[actor].void.includes(id))!;
      const zone = parseZone(selected.find((id) => id.startsWith("zone:"))!);
      const hand = selected.find((id) => state.players[actor].hand.includes(id));
      return [{ kind: "BANISH", cardIds: [source], sourceCardId: source }, { kind: "PLACE_FIELD", cardId: role, destination: zone, sourceCardId: source, requiresPreviousSuccess: true }, ...(hand ? [{ kind: "DISCARD" as const, cardIds: [hand], requiresPreviousSuccess: true }] : [])];
    },
  },
  {
    cardNo: "SP01-071",
    effectId: "venom-2099-retaliation",
    label: "毒液2099·减益反噬",
    trigger: "CARD_VALUE_CHANGED",
    sourceZones: ["attachment"],
    ruleRefs: ["301.32", "301.41", "304.1"],
    eventFilter: (state, actor, source, context) => {
      const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(source))?.[0];
      const event = eventOf(context, "CARD_VALUE_CHANGED");
      return Boolean(host && event?.targetCardId === host && event.valueType === "power" && event.delta < 0 && cardControllerV2(state, event.sourceCardId) === opponentOf(actor));
    },
    condition: (state, actor) => faceUpRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: faceUpRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "选择敌方场上 1 张角色，本回合失去等同宿主当前战力的战力" }),
    buildOperations: (state, _actor, source, selected) => {
      const host = Object.entries(state.attachments).find(([, cards]) => cards.includes(source))![0];
      return [modifier(source, selected[0], "power", -effectiveValueV2(state, host, "power"), "venom-2099")];
    },
  },
  {
    cardNo: "SP01-071",
    effectId: "venom-2099-response-attach",
    label: "毒液2099·应对侵附",
    activation: "response",
    sourceZones: ["hand"],
    ruleRefs: ["301.25", "301.32", "301.41", "304.2"],
    canActivate: (state, actor) => faceUpRoles(state, actor).some((id) => hasFeature(state, id, "人类")) && battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: [...faceUpRoles(state, actor).filter((id) => hasFeature(state, id, "人类")), ...battleRoles(state, opponentOf(actor))], min: 2, max: 2, prompt: "选择我方场上【人类】宿主，并选择敌方战区 1 张角色本回合 Lv-3", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => selected.filter((id) => faceUpRoles(state, actor).includes(id) && hasFeature(state, id, "人类")).length === 1 && selected.filter((id) => battleRoles(state, opponentOf(actor)).includes(id)).length === 1 ? null : "必须选择我方人类宿主和敌方战区角色各 1 张",
    buildOperations: (state, actor, source, selected) => {
      const host = selected.find((id) => faceUpRoles(state, actor).includes(id))!;
      const enemy = selected.find((id) => battleRoles(state, opponentOf(actor)).includes(id))!;
      return [{ kind: "ATTACH", cardId: source, hostCardId: host, sourceCardId: source }, { ...modifier(source, enemy, "level", -3, "venom-2099-level"), requiresPreviousSuccess: true }];
    },
  },
  {
    cardNo: "SP01-072",
    effectId: "top-hater-jameson-move",
    label: "头号黑粉·战基移动",
    activation: "action",
    usage: "turn_once",
    sourceZones: ["field"],
    ruleRefs: ["301.12", "301.23", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "top-hater-jameson-move")) && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6 && battleRoles(state, actor).some((id) => (hasFeature(state, id, "蛛网") || state.cards[id]?.name.includes("宿敌")) && !state.usage.enteredThisTurn.includes(id) && !state.usage.movedCardIds.includes(id)) && state.players[actor].deck.length > 0,
    targeting: (state, actor) => ({ choices: battleRoles(state, actor).filter((id) => (hasFeature(state, id, "蛛网") || state.cards[id]?.name.includes("宿敌")) && !state.usage.enteredThisTurn.includes(id) && !state.usage.movedCardIds.includes(id)), min: 1, max: 1, prompt: "选择我方战区 1 张【蛛网】或名称含【宿敌】的角色移动至基地；如此做后抽 1 张" }),
    buildOperations: (_state, actor, source, selected) => [{ kind: "MOVE_BATTLE_BASE", cardId: selected[0], destination: "base" }, { kind: "DRAW", actor, count: 1, sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "top-hater-jameson-move"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-074", effectId: "endgame-blip-attach", label: "终局烁灭·结附弃顶", trigger: "CARD_ATTACHED", sourceZones: ["attachment"], ruleRefs: ["301.13", "301.25", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARD_ATTACHED")?.cardId === source,
    condition: (state, actor) => state.players[actor].deck.length > 0,
    buildOperations: (_state, actor) => [{ kind: "DISCARD_DECK_TOP", actor, count: 2 }],
  },
  {
    cardNo: "SP01-074", effectId: "endgame-blip-action", label: "终局烁灭·蛛网换随机盖卡", activation: "action", usage: "turn_once", sourceZones: ["field"], ruleRefs: ["301.13", "301.32", "304.2"],
    canActivate: (state, actor, source) => !state.usage.effectUseKeysThisTurn.includes(useKey(source, "endgame-blip-action")) && state.players[actor].hand.some((id) => hasFeature(state, id, "蛛网")) && state.players[opponentOf(actor)].baseCovered.length > 0,
    targeting: (state, actor) => ({ choices: state.players[actor].hand.filter((id) => hasFeature(state, id, "蛛网")), min: 1, max: 1, prompt: "选择我方手牌 1 张蛛网角色舍弃，随后随机撤退敌方基地 1 张盖卡" }),
    buildOperations: (_state, actor, source, selected) => [{ kind: "DISCARD", cardIds: [selected[0]] }, { kind: "RETREAT_RANDOM_BASE_COVERED", actor: opponentOf(actor), sourceCardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "endgame-blip-action"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-075", effectId: "spider-nemesis-jackal-banish", label: "蜘蛛宿敌·胡狼裁剪", activation: "action", usage: "turn_once", sourceZones: ["field"], ruleRefs: ["301.15", "301.32", "304.2"],
    canActivate: (state, actor, source) => state.players[actor].field.rear.includes(source) && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "spider-nemesis-jackal-banish")) && state.players[actor].hand.some((id) => hasFeature(state, id, "人类")),
    targeting: (state, actor) => ({ choices: state.players[actor].hand.filter((id) => hasFeature(state, id, "人类")), min: 1, max: 1, prompt: "选择我方手牌 1 张人类角色裁剪" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "BANISH", cardIds: [selected[0]], sourceCardId: source }, { kind: "MARK_EFFECT_USED", key: useKey(source, "spider-nemesis-jackal-banish"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-075", effectId: "spider-nemesis-jackal-place", label: "蜘蛛宿敌·同名角色入场", trigger: "CARDS_BANISHED", sourceZones: ["field"], optional: true, ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_BANISHED")?.sourceCardId === source,
    condition: (state, actor, _source, context) => { const name = state.cards[eventOf(context, "CARDS_BANISHED")!.cardIds[0]]?.name; return Boolean(name && [...state.players[actor].hand, ...state.players[actor].retreat].some((id) => state.cards[id]?.name === name) && (openFieldZones(state, actor).length > 0 || state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6)); },
    targeting: (state, actor, _source, context) => { const name = state.cards[eventOf(context, "CARDS_BANISHED")!.cardIds[0]]?.name; return { choices: [...state.players[actor].hand.filter((id) => state.cards[id]?.name === name), ...state.players[actor].retreat.filter((id) => state.cards[id]?.name === name), ...openFieldZones(state, actor).map(zoneChoice), ...(state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6 ? ["zone:base"] : [])], min: 2, max: 2, prompt: "选择我方手牌或撤退区 1 张与裁剪角色同名的角色及其场上放置位置", choiceKind: "mixed" as const }; },
    validateTargets: (state, actor, _source, selected, context) => {
      const name = state.cards[eventOf(context, "CARDS_BANISHED")!.cardIds[0]]?.name;
      const cards = selected.filter((id) => (state.players[actor].hand.includes(id) || state.players[actor].retreat.includes(id)) && state.cards[id]?.name === name);
      const locations = selected.filter((id) => id === "zone:base" ? state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6 : id.startsWith("zone:") && openFieldZones(state, actor).includes(parseZone(id)));
      return cards.length === 1 && locations.length === 1 ? null : "必须选择 1 张同名角色和 1 个当前可用的战区或基地位置";
    },
    buildOperations: (state, actor, source, selected) => { const card = selected.find((id) => state.players[actor].hand.includes(id) || state.players[actor].retreat.includes(id))!; const location = selected.find((id) => id.startsWith("zone:"))!; return [location === "zone:base" ? { kind: "MOVE_TO_BASE", cardId: card, face: "up", sourceCardId: source } : { kind: "PLACE_FIELD", cardId: card, destination: parseZone(location), sourceCardId: source }]; },
  },
  {
    cardNo: "SP01-076", effectId: "spider-nemesis-morbius-return", label: "蜘蛛宿敌·莫比亚斯返场", activation: "action", sourceZones: ["retreat"], ruleRefs: ["301.12", "301.32", "304.2"],
    canActivate: (state, actor) => battleRoles(state, actor).some((id) => hasFeature(state, id, "人类")),
    targeting: (state, actor) => { const humans = battleRoles(state, actor).filter((id) => hasFeature(state, id, "人类")); const zones = [...new Set([...openFieldZones(state, actor), ...humans.map((id) => fieldZones.find((zone) => state.players[actor].field[zone].includes(id))!)])]; return { choices: [...humans, ...zones.map(zoneChoice)], min: 2, max: 2, prompt: "选择我方战区 1 张人类角色撤退，并选择莫比亚斯的放置战区", choiceKind: "mixed" as const }; },
    validateTargets: (state, actor, _source, selected) => { const human = selected.find((id) => battleRoles(state, actor).includes(id) && hasFeature(state, id, "人类")); const zone = selected.find((id) => id.startsWith("zone:")); const humanZone = human && fieldZones.find((candidate) => state.players[actor].field[candidate].includes(human)); return human && zone && (openFieldZones(state, actor).includes(parseZone(zone)) || parseZone(zone) === humanZone) ? null : "必须选择人类角色及其撤退后可用的战区"; },
    buildOperations: (_state, _actor, source, selected) => [{ kind: "RETREAT", cardIds: [selected.find((id) => !id.startsWith("zone:"))!], sourceCardId: source }, { kind: "PLACE_FIELD", cardId: source, destination: parseZone(selected.find((id) => id.startsWith("zone:"))!), sourceCardId: source, requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-076", effectId: "spider-nemesis-morbius-assault", label: "蜘蛛宿敌·莫比亚斯赋予强袭", trigger: "ATTACK_DECLARED", sourceZones: ["field"], ruleRefs: ["301.32", "304.1", "305.4"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "ATTACK_DECLARED"); return Boolean(event && event.actor === opponentOf(actor) && event.target.kind === "character" && event.target.cardId === source); },
    buildOperations: (_state, _actor, source, _selected, context) => { const attacker = eventOf(context, "ATTACK_DECLARED")!.attackerId; return [{ kind: "GRANT_KEYWORD", grant: { id: `promo:${source}:morbius-assault:${attacker}`, sourceCardId: source, targetCardId: attacker, keyword: "assault", duration: "turn" } }]; },
  },
  {
    cardNo: "SP01-077", effectId: "multiverse-reversal-punk", label: "多元逆转·蛛网区域转换", activation: "response", sourceZones: ["hand"], ruleRefs: ["301.13", "301.15", "301.32", "304.2"],
    canActivate: (state, actor) => state.players[actor].retreat.some((id) => hasFeature(state, id, "蛛网")) || state.players[actor].void.some((id) => hasFeature(state, id, "蛛网")),
    targeting: (state, actor) => ({ choices: [...(state.players[actor].retreat.some((id) => hasFeature(state, id, "蛛网")) ? ["mode:banish-retreat"] : []), ...(state.players[actor].void.some((id) => hasFeature(state, id, "蛛网")) ? ["mode:return-void"] : [])], min: 1, max: 1, prompt: "选择裁剪撤退区全部蛛网角色，或把虚空区全部蛛网角色放进撤退区", choiceKind: "mixed" as const }),
    buildOperations: (state, actor, source, selected) => [{ kind: "DISCARD", cardIds: [source] }, ...(selected[0] === "mode:banish-retreat" ? [{ kind: "BANISH" as const, cardIds: state.players[actor].retreat.filter((id) => hasFeature(state, id, "蛛网")), sourceCardId: source, requiresPreviousSuccess: true }] : [{ kind: "RETREAT" as const, cardIds: state.players[actor].void.filter((id) => hasFeature(state, id, "蛛网")), sourceCardId: source, requiresPreviousSuccess: true }])],
  },
  {
    cardNo: "SP01-078", effectId: "mind-harbor-may", label: "心灵港湾·蛛网盖放", activation: "action", usage: "turn_once", sourceZones: ["base"], ruleRefs: ["301.12", "301.32", "304.2"],
    canActivate: (state, actor, source) => state.players[actor].baseCards.includes(source) && !state.usage.effectUseKeysThisTurn.includes(useKey(source, "mind-harbor-may")) && state.players[actor].baseCards.length + state.players[actor].baseCovered.length < 6 && state.players[actor].retreat.some((id) => hasFeature(state, id, "蛛网")),
    targeting: (state, actor) => ({ choices: state.players[actor].retreat.filter((id) => hasFeature(state, id, "蛛网")), min: 1, max: 1, prompt: "选择撤退区 1 张蛛网角色盖放进基地，随后盖伏梅姨" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "MOVE_TO_BASE", cardId: selected[0], face: "down", sourceCardId: source }, { kind: "COVER", cardId: source, requiresPreviousSuccess: true }, { kind: "MARK_EFFECT_USED", key: useKey(source, "mind-harbor-may"), requiresPreviousSuccess: true }],
  },
  {
    cardNo: "SP01-079", effectId: "spider-companion-gwen-void", label: "蜘蛛伴侣·虚空压制", trigger: "CARDS_BANISHED", sourceZones: ["void"], ruleRefs: ["301.15", "301.32", "301.41", "304.1"],
    eventFilter: (_state, _actor, source, context) => eventOf(context, "CARDS_BANISHED")?.cardIds.includes(source) ?? false,
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)), min: 1, max: 1, prompt: "选择敌方战区 1 张角色，本回合战力 -1000" }),
    buildOperations: (_state, _actor, source, selected) => [modifier(source, selected[0], "power", -1000, "gwen-void")],
  },
  {
    cardNo: "SP01-080", effectId: "spider-nemesis-shocker-field", label: "蜘蛛宿敌·惊悚战区入场", trigger: "CHARACTER_SUMMONED", sourceZones: ["field"], optional: true, ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source && event.destination !== "base"; },
    condition: (state, actor) => battleRoles(state, opponentOf(actor)).some((id) => effectiveValueV2(state, id, "level") <= 3) && state.players[opponentOf(actor)].baseCards.length + state.players[opponentOf(actor)].baseCovered.length < 6,
    targeting: (state, actor) => ({ choices: battleRoles(state, opponentOf(actor)).filter((id) => effectiveValueV2(state, id, "level") <= 3), min: 1, max: 1, prompt: "选择敌方战区 1 张 Lv3 或以下角色移动至敌方基地" }),
    buildOperations: (_state, _actor, source, selected) => [{ kind: "MOVE_TO_BASE", cardId: selected[0], face: "up", sourceCardId: source }],
  },
  {
    cardNo: "SP01-080", effectId: "spider-nemesis-shocker-base", label: "蜘蛛宿敌·惊悚基地入场", trigger: "CHARACTER_SUMMONED", sourceZones: ["base"], optional: true, ruleRefs: ["301.12", "301.32", "304.1"],
    eventFilter: (_state, actor, source, context) => { const event = eventOf(context, "CHARACTER_SUMMONED"); return event?.actor === actor && event.cardId === source && event.destination === "base"; },
    condition: (state, actor) => state.players[opponentOf(actor)].baseCards.some((id) => effectiveValueV2(state, id, "level") <= 3) && openFieldZones(state, opponentOf(actor)).length > 0,
    targeting: (state, actor) => ({ choices: [...state.players[opponentOf(actor)].baseCards.filter((id) => effectiveValueV2(state, id, "level") <= 3), ...openFieldZones(state, opponentOf(actor)).map(zoneChoice)], min: 2, max: 2, prompt: "选择敌方基地 1 张 Lv3 或以下角色及其敌方战区放置位置", choiceKind: "mixed" as const }),
    validateTargets: (state, actor, _source, selected) => {
      const enemy = opponentOf(actor);
      const cards = selected.filter((id) => state.players[enemy].baseCards.includes(id) && effectiveValueV2(state, id, "level") <= 3);
      const zones = selected.filter((id) => id.startsWith("zone:") && openFieldZones(state, enemy).includes(parseZone(id)));
      return cards.length === 1 && zones.length === 1 ? null : "必须选择敌方基地 1 张 Lv3 或以下角色和 1 个敌方空战区";
    },
    buildOperations: (state, actor, source, selected) => [{ kind: "PLACE_FIELD", cardId: selected.find((id) => state.players[opponentOf(actor)].baseCards.includes(id))!, destination: parseZone(selected.find((id) => id.startsWith("zone:"))!), sourceCardId: source }],
  },
];

export function registerPromoEffectsSp01V2(): void {
  for (const definition of definitions) registerEffectV2(definition);
}

export const PROMO_EFFECT_DEFINITIONS_SP01_V2: readonly EffectDefinitionV2[] = definitions;
