import type { Card } from "../types/card";
import { createRandomState, nextRandom, shuffleDeterministic } from "./random";
import { assertStateInvariantsV2, otherPlayerV2 } from "./invariants";
import { extractPrintedKeywordsV2 } from "./effects/keywords";
import type {
  CardInstanceIdV2,
  CardInstanceV2,
  GameStateV2,
  MulliganDecisionV2,
  PlayerIndex,
  PlayerStateV2,
} from "./model";

export interface CreateGamePlayerInputV2 {
  name: string;
  mainDeck: string[];
  rushDeck: string[];
}

export interface CreateGameInputV2 {
  matchId: string;
  seed: string;
  cardDefinitions: readonly Card[];
  players: [CreateGamePlayerInputV2, CreateGamePlayerInputV2];
  cardDataVersion?: string;
  engineVersion?: string;
}

function validateDeckV2(
  seat: PlayerIndex,
  player: CreateGamePlayerInputV2,
  definitions: Map<string, Card>,
): void {
  if (player.mainDeck.length !== 50) {
    throw new Error(`玩家 ${seat} 主卡组必须正好 50 张`);
  }
  if (player.rushDeck.length !== 9) {
    throw new Error(`玩家 ${seat} 冲击卡组必须正好 9 张`);
  }
  for (const definitionId of player.mainDeck) {
    const card = definitions.get(definitionId);
    if (!card) throw new Error(`玩家 ${seat} 使用了未知卡牌定义：${definitionId}`);
    if (card.card_type !== 1) throw new Error(`玩家 ${seat} 主卡组包含非角色卡：${definitionId}`);
  }
  const exactNameCounts = new Map<string, number>();
  for (const definitionId of player.mainDeck) {
    const name = definitions.get(definitionId)!.name;
    exactNameCounts.set(name, (exactNameCounts.get(name) ?? 0) + 1);
  }
  const overLimitName = [...exactNameCounts.entries()].find(([, count]) => count > 3)?.[0];
  if (overLimitName) throw new Error(`玩家 ${seat} 名称完全相同的角色卡合计最多投入 3 张：${overLimitName}`);
  for (const definitionId of player.rushDeck) {
    const card = definitions.get(definitionId);
    if (!card) throw new Error(`玩家 ${seat} 使用了未知卡牌定义：${definitionId}`);
    if (card.card_type !== 2) throw new Error(`玩家 ${seat} 冲击卡组包含非冲击卡：${definitionId}`);
  }
}

function instantiateDeckV2(
  definitionIds: readonly string[],
  owner: PlayerIndex,
  deckKind: "main" | "rush",
  cards: Record<CardInstanceIdV2, CardInstanceV2>,
  definitions: Map<string, Card>,
): CardInstanceIdV2[] {
  return definitionIds.map((definitionId, index) => {
    const instanceId = `p${owner}-${deckKind}-${index.toString().padStart(3, "0")}`;
    const definition = definitions.get(definitionId);
    if (!definition) throw new Error(`卡牌定义不存在：${definitionId}`);
    const power = Number.parseInt(definition.power ?? "0", 10);
    cards[instanceId] = {
      instanceId,
      definitionId,
      cardNo: definition.card_no,
      name: definition.name,
      owner,
      deckKind,
      level: definition.cost,
      range: definition.r ?? 1,
      power: Number.isFinite(power) ? power : 0,
      attribute: definition.attribute,
      features: (definition.feature_text ?? definition.feature ?? "").split("/").map((value) => value.trim()).filter(Boolean),
      hasEffectText: definition.effect.trim().length > 0,
      effectText: definition.effect,
      printedKeywords: extractPrintedKeywordsV2(definition.effect),
    };
    return instanceId;
  });
}

function createPlayerStateV2(
  name: string,
  deck: CardInstanceIdV2[],
  rushDeck: CardInstanceIdV2[],
): PlayerStateV2 {
  return {
    name,
    deck: deck.slice(6),
    rushDeck,
    hand: deck.slice(0, 6),
    baseCards: [],
    baseCovered: [],
    field: { vanguard: [], flankLeft: [], flankRight: [], rear: [] },
    timeline: [],
    retreat: [],
    void: [],
  };
}

export function createMulliganDecisionV2(
  actor: PlayerIndex,
  revision: number,
  choices: readonly CardInstanceIdV2[],
  nextActor: PlayerIndex | null = otherPlayerV2(actor),
): MulliganDecisionV2 {
  return {
    id: `mulligan:${actor}:${revision}`,
    kind: "MULLIGAN",
    actor,
    choices: [...choices],
    min: 0,
    max: 6,
    continuation: {
      kind: "AFTER_MULLIGAN",
      nextActor,
    },
  };
}

export function createGameV2(input: CreateGameInputV2): GameStateV2 {
  const definitions = new Map(input.cardDefinitions.map((card) => [card.id, card]));
  validateDeckV2(0, input.players[0], definitions);
  validateDeckV2(1, input.players[1], definitions);

  const cards: Record<CardInstanceIdV2, CardInstanceV2> = {};
  const main0 = instantiateDeckV2(input.players[0].mainDeck, 0, "main", cards, definitions);
  const rush0 = instantiateDeckV2(input.players[0].rushDeck, 0, "rush", cards, definitions);
  const main1 = instantiateDeckV2(input.players[1].mainDeck, 1, "main", cards, definitions);
  const rush1 = instantiateDeckV2(input.players[1].rushDeck, 1, "rush", cards, definitions);

  let randomState = createRandomState(`${input.matchId}:${input.seed}`);
  const shuffledMain0 = shuffleDeterministic(main0, randomState);
  randomState = shuffledMain0.state;
  const shuffledRush0 = shuffleDeterministic(rush0, randomState);
  randomState = shuffledRush0.state;
  const shuffledMain1 = shuffleDeterministic(main1, randomState);
  randomState = shuffledMain1.state;
  const shuffledRush1 = shuffleDeterministic(rush1, randomState);
  randomState = shuffledRush1.state;
  const firstRoll = nextRandom(randomState);
  randomState = firstRoll.state;
  const firstPlayer: PlayerIndex = firstRoll.value < 0.5 ? 0 : 1;

  const players: [PlayerStateV2, PlayerStateV2] = [
    createPlayerStateV2(input.players[0].name, shuffledMain0.items, shuffledRush0.items),
    createPlayerStateV2(input.players[1].name, shuffledMain1.items, shuffledRush1.items),
  ];

  const state: GameStateV2 = {
    match: {
      matchId: input.matchId,
      rulesetVersion: "1.02",
      cardDataVersion: input.cardDataVersion ?? "catalog-current",
      engineVersion: input.engineVersion ?? "2.0.0-framework-rc1",
    },
    revision: 0,
    status: "setup",
    firstPlayer,
    activePlayer: firstPlayer,
    turnNumber: 1,
    flow: { kind: "SETUP_MULLIGAN", actor: firstPlayer, completed: [false, false] },
    decision: createMulliganDecisionV2(firstPlayer, 0, players[firstPlayer].hand),
    battle: null,
    turnResponse: null,
    effects: { queue: [], resolving: false, resolvedEffectIds: [] },
    modifiers: [],
    keywordGrants: [],
    effectCopies: [],
    attachments: {},
    players,
    cards,
    randomState,
    usage: {
      summonsThisTurn: [0, 0],
      baseDeployedThisTurn: false,
      movedCardIds: [],
      movementBlockedCardIds: [],
      enteredThisTurn: [],
      interceptUsedCardIds: [],
      attackedCardIdsByPlayer: [[], []],
      attackedTargetCardIdsThisTurn: [],
      characterOnlyAdditionalAttackCardIds: [],
      summonPaymentBlockedCardIds: [],
      minimumSummonPaymentLevelBlockedThisTurn: [null, null],
      effectUseKeysThisTurn: [],
      battlePhaseSkippedThisTurn: false,
      attackBlockedCardIds: [],
    },
    winner: null,
  };
  assertStateInvariantsV2(state);
  return state;
}
