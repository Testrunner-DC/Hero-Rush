import { describe, expect, it } from "vitest";
import type { Card } from "../../types/card";
import {
  assertReplayEquivalentV2,
  createGameV2,
  executeAuthoritativeCommandV2,
  executeCommandV2,
  hashStateV2,
  projectBattleViewV2,
  rebuildGameV2,
  validateStateInvariantsV2,
} from "../index";
import type {
  AcceptedJournalEntryV2,
  CommandEnvelopeV2,
  CreateGameInputV2,
  GameStateV2,
  PlayerIndex,
} from "../index";

function makeCard(id: string, cardType: 1 | 2): Card {
  return {
    id,
    card_no: id,
    name: id,
    card_type: cardType,
    card_type_name: cardType === 1 ? "角色卡" : "冲击卡",
    cost: 1,
    cost_name: "1",
    attribute: 1,
    attribute_name: "测试",
    attribute_color: "#000000",
    pp_value: cardType === 1 ? 1000 : null,
    dp_value: cardType === 1 ? 1000 : null,
    power: null,
    signal_color: null,
    signal_color_text: null,
    feature: null,
    feature_text: null,
    effect: "",
    package: "TEST",
    package_short: "T",
    rarity: 1,
    rarity_code: "C",
    rarity_cn: "普通",
    rarity_color: "#000000",
    image_url: `/cards/${id}.png`,
  };
}

function makeInput(seed = "m1-seed"): CreateGameInputV2 {
  const main0 = Array.from({ length: 50 }, (_, index) => `P0-M-${index}`);
  const rush0 = Array.from({ length: 9 }, (_, index) => `P0-R-${index}`);
  const main1 = Array.from({ length: 50 }, (_, index) => `P1-M-${index}`);
  const rush1 = Array.from({ length: 9 }, (_, index) => `P1-R-${index}`);
  return {
    matchId: "match-m1",
    seed,
    cardDataVersion: "test-cards",
    engineVersion: "test-engine",
    cardDefinitions: [
      ...main0.map((id) => makeCard(id, 1)),
      ...rush0.map((id) => makeCard(id, 2)),
      ...main1.map((id) => makeCard(id, 1)),
      ...rush1.map((id) => makeCard(id, 2)),
    ],
    players: [
      { name: "先手候选 A", mainDeck: main0, rushDeck: rush0 },
      { name: "先手候选 B", mainDeck: main1, rushDeck: rush1 },
    ],
  };
}

function submit(
  state: GameStateV2,
  actor: PlayerIndex,
  cardIds: string[],
  commandId = `command-${state.revision}`,
): CommandEnvelopeV2 {
  return {
    actor,
    commandId,
    expectedRevision: state.revision,
    command: { type: "SUBMIT_MULLIGAN", cardIds },
  };
}

describe("V2 M1 权威开局与调度", () => {
  it("相同输入创建可序列化、满足约束且拥有 118 个唯一实体的状态", () => {
    const first = createGameV2(makeInput());
    const second = createGameV2(makeInput());

    expect(first).toEqual(second);
    expect(hashStateV2(first)).toBe(hashStateV2(second));
    expect(validateStateInvariantsV2(first)).toEqual([]);
    expect(Object.keys(first.cards)).toHaveLength(118);
    expect(new Set(Object.keys(first.cards)).size).toBe(118);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first.decision?.actor).toBe(first.firstPlayer);
  });

  it("不同种子可覆盖两个座位先攻，首个决策始终属于真实先攻", () => {
    const states = Array.from({ length: 80 }, (_, index) => createGameV2(makeInput(`seed-${index}`)));
    expect(new Set(states.map((state) => state.firstPlayer))).toEqual(new Set([0, 1]));
    for (const state of states) expect(state.decision?.actor).toBe(state.firstPlayer);
  });

  it("拒绝错误决策者、过期版本、重复选择和伪造选择，且不改变原状态", () => {
    const state = createGameV2(makeInput());
    const actor = state.firstPlayer;
    const before = JSON.stringify(state);
    const wrongActor: PlayerIndex = actor === 0 ? 1 : 0;

    const cases: CommandEnvelopeV2[] = [
      submit(state, wrongActor, []),
      { ...submit(state, actor, []), expectedRevision: state.revision + 1 },
      submit(state, actor, [state.players[actor].hand[0], state.players[actor].hand[0]]),
      submit(state, actor, [state.players[actor].deck[0]]),
    ];
    const expectedCodes = [
      "NOT_DECISION_ACTOR",
      "STALE_REVISION",
      "DUPLICATE_CHOICE",
      "CHOICE_NOT_AVAILABLE",
    ];
    expect(cases.map((command) => {
      const result = executeCommandV2(state, command);
      return result.ok ? "OK" : result.code;
    })).toEqual(expectedCodes);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("按规则将选择牌置于牌库底、补等量，再洗混剩余牌库", () => {
    const state = createGameV2(makeInput());
    const actor = state.firstPlayer;
    const selected = state.players[actor].hand.slice(0, 2);
    const retained = state.players[actor].hand.slice(2);
    const expectedDrawn = state.players[actor].deck.slice(0, 2);
    const result = executeCommandV2(state, submit(state, actor, selected));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[actor].hand).toEqual([...retained, ...expectedDrawn]);
    expect(result.state.players[actor].deck).toHaveLength(44);
    expect(result.state.players[actor].deck).toEqual(
      expect.arrayContaining(selected),
    );
    expect(result.state.flow.kind).toBe("SETUP_MULLIGAN");
    expect(result.state.decision?.continuation.nextActor).toBeNull();
    expect(validateStateInvariantsV2(result.state)).toEqual([]);
  });

  it("先攻和后攻依次完成后进入先攻玩家的 TURN_START", () => {
    const initial = createGameV2(makeInput());
    const first = executeCommandV2(initial, submit(initial, initial.firstPlayer, []));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const secondActor: PlayerIndex = initial.firstPlayer === 0 ? 1 : 0;
    expect(first.state.decision?.actor).toBe(secondActor);

    const second = executeCommandV2(first.state, submit(first.state, secondActor, []));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.status).toBe("playing");
    expect(second.state.flow).toEqual({ kind: "TURN_START", actor: initial.firstPlayer });
    expect(second.state.activePlayer).toBe(initial.firstPlayer);
    expect(second.state.turnNumber).toBe(1);
    expect(second.state.decision).toBeNull();
    expect(validateStateInvariantsV2(second.state)).toEqual([]);
  });

  it("座位投影只暴露自己的手牌与隐藏区身份", () => {
    const state = createGameV2(makeInput());
    const hash = hashStateV2(state);
    const view0 = projectBattleViewV2(state, 0, hash);
    const view1 = projectBattleViewV2(state, 1, hash);

    expect(view0.players[0].hand).toHaveLength(6);
    expect(view0.players[1].hand).toEqual([]);
    expect(view1.players[1].hand).toHaveLength(6);
    expect(view1.players[0].hand).toEqual([]);
    expect(view0.players[1].deckCount).toBe(44);
    expect(view0.pendingDecision === null).toBe(state.firstPlayer !== 0);
    expect(view1.pendingDecision === null).toBe(state.firstPlayer !== 1);
  });

  it("从种子与已接受命令日志重放得到相同状态摘要", () => {
    const input = makeInput();
    let state = createGameV2(input);
    const journal: AcceptedJournalEntryV2[] = [];
    for (let step = 0; step < 2; step += 1) {
      const actor = state.decision?.actor;
      if (actor === undefined) throw new Error("缺少调度决策者");
      const envelope = submit(state, actor, state.players[actor].hand.slice(0, step + 1));
      const result = executeAuthoritativeCommandV2(state, envelope);
      if (!result.ok) throw new Error(result.message);
      journal.push({ ...envelope, stateHash: result.stateHash });
      state = result.state;
    }

    const rebuilt = rebuildGameV2(input, journal);
    assertReplayEquivalentV2(state, rebuilt);
    expect(rebuilt).toEqual(state);
  });

  it("不同种子会产生不同的初始状态摘要", () => {
    expect(hashStateV2(createGameV2(makeInput("seed-a"))))
      .not.toBe(hashStateV2(createGameV2(makeInput("seed-b"))));
  });
});
