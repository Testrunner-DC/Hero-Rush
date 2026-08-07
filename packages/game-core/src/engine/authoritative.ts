import type { Card, CardDatabase } from "../types/card";
import type { BattleState, PlayerState } from "./state";
import { createRandomState, nextRandom, shuffleDeterministic } from "./random";

export interface MatchPlayerInput {
  name: string;
  deck: string[];
  rushDeck: string[];
}

export interface AuthoritativeSetup {
  matchId: string;
  seed: string;
  players: [MatchPlayerInput, MatchPlayerInput];
  rulesetVersion?: string;
  cardDataVersion?: string;
  engineVersion?: string;
}

function instantiateCards(
  definitionIds: readonly string[],
  prefix: string,
  definitions: Map<string, Card>,
  references: Record<string, string>,
): string[] {
  return definitionIds.map((definitionId, index) => {
    if (!definitions.has(definitionId)) {
      throw new Error(`卡牌定义不存在：${definitionId}`);
    }
    const instanceId = `${prefix}-${index.toString().padStart(2, "0")}`;
    references[instanceId] = definitionId;
    return instanceId;
  });
}

export function createMatchCardDatabase(
  catalog: CardDatabase,
  references: Record<string, string>,
): CardDatabase {
  const definitions = new Map(catalog.cards.map((card) => [card.id, card]));
  const cards: Card[] = [];
  const cardGroups: Record<string, string[]> = {};

  for (const [instanceId, definitionId] of Object.entries(references)) {
    const definition = definitions.get(definitionId);
    if (!definition) throw new Error(`无法恢复卡牌实例 ${instanceId}：定义 ${definitionId} 不存在`);
    cards.push({ ...definition, id: instanceId });
    (cardGroups[definition.card_no] ??= []).push(instanceId);
  }

  return {
    ...catalog,
    total_cards: new Set(cards.map((card) => card.card_no)).size,
    total_variants: cards.length,
    cards,
    card_groups: cardGroups,
  };
}

function makePlayer(
  id: 1 | 2,
  name: string,
  deck: string[],
  rushDeck: string[],
  hand: string[],
  firstPlayer: number,
): PlayerState {
  return {
    id,
    name,
    deck,
    rushDeck,
    hand,
    baseCards: [],
    baseCovered: [],
    field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
    timeline: [],
    retreat: [],
    void: [],
    isFirstPlayer: firstPlayer === id - 1,
  };
}

/** 仅供权威服务端调用：实例化、洗牌并创建首个可同步快照。 */
export function createAuthoritativeGame(
  catalog: CardDatabase,
  setup: AuthoritativeSetup,
): { state: BattleState; db: CardDatabase } {
  const definitions = new Map(catalog.cards.map((card) => [card.id, card]));
  const references: Record<string, string> = {};
  let randomState = createRandomState(`${setup.matchId}:${setup.seed}`);

  const p0Main = instantiateCards(setup.players[0].deck, "p0-m", definitions, references);
  const p0Rush = instantiateCards(setup.players[0].rushDeck, "p0-r", definitions, references);
  const p1Main = instantiateCards(setup.players[1].deck, "p1-m", definitions, references);
  const p1Rush = instantiateCards(setup.players[1].rushDeck, "p1-r", definitions, references);

  const shuffled0 = shuffleDeterministic(p0Main, randomState);
  randomState = shuffled0.state;
  const shuffledRush0 = shuffleDeterministic(p0Rush, randomState);
  randomState = shuffledRush0.state;
  const shuffled1 = shuffleDeterministic(p1Main, randomState);
  randomState = shuffled1.state;
  const shuffledRush1 = shuffleDeterministic(p1Rush, randomState);
  randomState = shuffledRush1.state;
  const first = nextRandom(randomState);
  randomState = first.state;
  const firstPlayer = first.value < 0.5 ? 0 : 1;

  const hand0 = shuffled0.items.slice(0, 6);
  const hand1 = shuffled1.items.slice(0, 6);
  const deck0 = shuffled0.items.slice(6);
  const deck1 = shuffled1.items.slice(6);

  const state: BattleState = {
    isSetup: false,
    setupPhase: "DONE",
    turnPhase: "TURN_START",
    players: [
      makePlayer(1, setup.players[0].name, deck0, shuffledRush0.items, hand0, firstPlayer),
      makePlayer(2, setup.players[1].name, deck1, shuffledRush1.items, hand1, firstPlayer),
    ],
    activePlayerIndex: firstPlayer,
    turnNumber: 1,
    remainingSummons: firstPlayer === 0 ? 1 : 3,
    baseDeployedThisTurn: false,
    baseMovesUsed: {},
    conflictZonesCompleted: [],
    conflictAttackedCards: [],
    log: [
      "🎮 联机对战开始！",
      `📋 ${setup.players[0].name} vs ${setup.players[1].name}`,
      `🎲 ${setup.players[firstPlayer].name} 先攻`,
    ],
    isGameOver: false,
    winner: null,
    conflictSubPhase: "adjust",
    conflictMovesUsed: 0,
    currentAttackZone: null,
    pendingAttack: null,
    eventListeners: [],
    registeredAbilities: [],
    pendingSummon: null,
    modifiers: [],
    attachments: {},
    pendingCounter: null,
    enteredThisTurn: [],
    counterUsedThisTurn: [false, false],
    counterPassCount: 0,
    conflictAttackCount: {},
    temporaryAbilities: {},
    interceptUsedThisTurn: [],
    effectUsedThisTurn: [],
    activatedEffectsThisTurn: [],
    mulliganSelected: [],
    pendingTargetSelection: null,
    pendingEffectConfirmation: null,
    cardInstances: references,
    randomState,
    rulesetVersion: setup.rulesetVersion ?? "1.0.0",
    cardDataVersion: setup.cardDataVersion ?? "catalog-current",
    engineVersion: setup.engineVersion ?? "1.0.0",
  };

  return { state, db: createMatchCardDatabase(catalog, references) };
}
