import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  assertReplayEquivalentV2,
  rebuildGameV2,
  type Card,
  type CardDatabase,
  type PlayerIndex,
} from "@hero-rush/game-core";
import {
  PROTOCOL_VERSION_V2,
  ServerMessageV2Schema,
  type GameCommandV2Message,
  type GameCommandEnvelopeV2Message,
} from "@hero-rush/protocol";
import { MatchRoomV2 } from "../src/game/MatchRoomV2.js";
import {
  InMemoryMatchStoreV2,
  type MatchEventRecordV2,
} from "../src/store/matchStoreV2.js";
import type { MatchParticipant } from "../src/types.js";

type MessageV2 = Record<string, any> & { type: string };

class FakeSocket {
  readyState: number = WebSocket.OPEN;
  readonly messages: MessageV2[] = [];

  send(payload: string): void {
    const message = JSON.parse(payload) as MessageV2;
    ServerMessageV2Schema.parse(message);
    this.messages.push(message);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
  }

  take(type: string): MessageV2 {
    const index = this.messages.findIndex((message) => message.type === type);
    if (index < 0) throw new Error(`未收到 ${type}`);
    return this.messages.splice(index, 1)[0];
  }
}

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
    power: cardType === 1 ? "1000" : null,
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

function fixture(store = new InMemoryMatchStoreV2()) {
  const main0 = Array.from({ length: 50 }, (_, index) => `P0-M-${index}`);
  const rush0 = Array.from({ length: 9 }, (_, index) => `P0-R-${index}`);
  const main1 = Array.from({ length: 50 }, (_, index) => `P1-M-${index}`);
  const rush1 = Array.from({ length: 9 }, (_, index) => `P1-R-${index}`);
  const cards = [
    ...main0.map((id) => makeCard(id, 1)),
    ...rush0.map((id) => makeCard(id, 2)),
    ...main1.map((id) => makeCard(id, 1)),
    ...rush1.map((id) => makeCard(id, 2)),
  ];
  const catalog: CardDatabase = {
    total_cards: cards.length,
    total_variants: cards.length,
    packages: ["TEST"],
    attributes: {},
    rarities: {},
    cards,
    card_groups: Object.fromEntries(cards.map((card) => [card.card_no, [card.id]])),
  };
  const sockets = [new FakeSocket(), new FakeSocket()] as const;
  const players: [MatchParticipant, MatchParticipant] = [
    {
      userId: "user-0",
      name: "玩家零",
      deck: main0,
      rushDeck: rush0,
      ws: sockets[0] as unknown as WebSocket,
    },
    {
      userId: "user-1",
      name: "玩家一",
      deck: main1,
      rushDeck: rush1,
      ws: sockets[1] as unknown as WebSocket,
    },
  ];
  const room = new MatchRoomV2({
    id: "match-v2-test",
    mode: "private",
    catalog,
    players,
    store,
    seed: "fixed-room-seed",
    cardDataVersion: "test-cards",
    engineVersion: "test-engine",
  });
  return { room, sockets, store };
}

function command(
  room: MatchRoomV2,
  actor: PlayerIndex,
  commandId: string,
  cardIds: string[],
): GameCommandEnvelopeV2Message {
  return {
    protocolVersion: PROTOCOL_VERSION_V2,
    requestId: `request-${commandId}`,
    matchId: room.id,
    commandId,
    expectedRevision: room.currentRevision,
    command: { type: "SUBMIT_MULLIGAN", cardIds },
  };
}

function actionCommand(
  room: MatchRoomV2,
  commandId: string,
  gameCommand: GameCommandV2Message,
): GameCommandEnvelopeV2Message {
  return {
    protocolVersion: PROTOCOL_VERSION_V2,
    requestId: `request-${commandId}`,
    matchId: room.id,
    commandId,
    expectedRevision: room.currentRevision,
    command: gameCommand,
  };
}

describe("MatchRoomV2 M1 联机纵向切片", () => {
  it("按座位下发私有初始视图，并保存可重放的创建记录", async () => {
    const { room, sockets, store } = fixture();
    await room.sendInitial();
    const found0 = sockets[0].take("MATCH_FOUND_V2");
    const found1 = sockets[1].take("MATCH_FOUND_V2");

    expect(found0.stateHash).toBe(found1.stateHash);
    expect(found0.revision).toBe(0);
    expect(found0.state.players[0].hand).toHaveLength(6);
    expect(found0.state.players[1].hand).toEqual([]);
    expect(found1.state.players[1].hand).toHaveLength(6);
    expect(found1.state.players[0].hand).toEqual([]);
    expect(found0.state.pendingDecision === null).toBe(room.snapshot.firstPlayer !== 0);
    expect(found1.state.pendingDecision === null).toBe(room.snapshot.firstPlayer !== 1);
    expect(store.matches.get(room.id)?.initialState).toEqual(room.snapshot);
  });

  it("串行执行双方调度、持久化 journal、支持幂等重试和断线恢复", async () => {
    const { room, sockets, store } = fixture();
    await room.sendInitial();
    sockets[0].take("MATCH_FOUND_V2");
    sockets[1].take("MATCH_FOUND_V2");
    const firstActor = room.snapshot.firstPlayer;
    const secondActor: PlayerIndex = firstActor === 0 ? 1 : 0;
    const selected = room.snapshot.players[firstActor].hand.slice(0, 2);
    const firstCommand = command(room, firstActor, "mulligan-first", selected);

    room.enqueueCommand(firstActor, firstCommand);
    await room.whenIdle();
    const updated0 = sockets[0].take("STATE_UPDATED_V2");
    const updated1 = sockets[1].take("STATE_UPDATED_V2");
    expect(updated0.revision).toBe(1);
    expect(updated1.revision).toBe(1);
    expect(store.events.get(room.id)).toHaveLength(1);
    expect(room.journalSnapshot).toHaveLength(1);
    const secondView = secondActor === 0 ? updated0.state : updated1.state;
    expect(secondView.pendingDecision.actor).toBe(secondActor);

    const resumedSocket = new FakeSocket();
    await room.resume(secondActor, resumedSocket as unknown as WebSocket, "resume-request");
    const resumed = resumedSocket.take("RESUME_OK_V2");
    expect(resumed.revision).toBe(1);
    expect(resumed.state.pendingDecision.actor).toBe(secondActor);
    expect(resumed.state.players[secondActor].hand).toHaveLength(6);
    expect(resumed.state.players[firstActor].hand).toEqual([]);

    room.enqueueCommand(firstActor, firstCommand);
    await room.whenIdle();
    const duplicate = sockets[firstActor].take("COMMAND_ACCEPTED_V2");
    expect(duplicate.commandId).toBe("mulligan-first");
    expect(duplicate.revision).toBe(1);
    expect(store.events.get(room.id)).toHaveLength(1);

    const secondCommand = command(room, secondActor, "mulligan-second", []);
    room.enqueueCommand(secondActor, secondCommand);
    await room.whenIdle();
    expect(room.snapshot.status).toBe("playing");
    expect(room.snapshot.flow).toEqual({ kind: "ACTION", actor: firstActor });
    expect(room.snapshot.revision).toBe(3);
    expect(store.events.get(room.id)).toHaveLength(2);
    expect(store.events.get(room.id)?.[1].events).toEqual([
      { type: "MULLIGAN_SUBMITTED", actor: secondActor, replacedCount: 0 },
      { type: "TURN_CARDS_DRAWN", actor: firstActor, count: 2 },
    ]);

    const rebuilt = rebuildGameV2(room.replayInput, room.journalSnapshot);
    assertReplayEquivalentV2(room.snapshot, rebuilt);
    expect(rebuilt).toEqual(room.snapshot);
  });

  it("拒绝非决策玩家，且非法命令不写 journal、不推进 revision", async () => {
    const { room, sockets, store } = fixture();
    await room.sendInitial();
    sockets[0].take("MATCH_FOUND_V2");
    sockets[1].take("MATCH_FOUND_V2");
    const wrongActor: PlayerIndex = room.snapshot.firstPlayer === 0 ? 1 : 0;

    room.enqueueCommand(wrongActor, command(room, wrongActor, "wrong-actor", []));
    await room.whenIdle();
    const rejected = sockets[wrongActor].take("COMMAND_REJECTED_V2");
    expect(rejected.code).toBe("NOT_DECISION_ACTOR");
    expect(rejected.currentRevision).toBe(0);
    expect(room.currentRevision).toBe(0);
    expect(store.events.get(room.id)).toEqual([]);
  });

  it("联机执行基地部署、首回合号召和结束行动，并保持 journal 可重放", async () => {
    const { room, sockets, store } = fixture();
    await room.sendInitial();
    sockets[0].take("MATCH_FOUND_V2");
    sockets[1].take("MATCH_FOUND_V2");
    const actor = room.snapshot.firstPlayer;
    const other: PlayerIndex = actor === 0 ? 1 : 0;

    room.enqueueCommand(actor, command(room, actor, "m2-mulligan-first", []));
    await room.whenIdle();
    sockets[0].take("STATE_UPDATED_V2");
    sockets[1].take("STATE_UPDATED_V2");
    room.enqueueCommand(other, command(room, other, "m2-mulligan-second", []));
    await room.whenIdle();
    sockets[0].take("STATE_UPDATED_V2");
    sockets[1].take("STATE_UPDATED_V2");
    expect(room.snapshot.flow.kind).toBe("ACTION");

    const deployId = room.snapshot.players[actor].hand[0];
    room.enqueueCommand(actor, actionCommand(room, "m2-deploy", { type: "DEPLOY_BASE", cardId: deployId }));
    await room.whenIdle();
    sockets[0].take("STATE_UPDATED_V2");
    sockets[1].take("STATE_UPDATED_V2");
    expect(room.snapshot.players[actor].baseCovered).toContain(deployId);

    const summonId = room.snapshot.players[actor].hand[0];
    room.enqueueCommand(actor, actionCommand(room, "m2-summon", {
      type: "SUMMON_CHARACTER",
      cardId: summonId,
      destination: "vanguard",
    }));
    await room.whenIdle();
    sockets[0].take("STATE_UPDATED_V2");
    sockets[1].take("STATE_UPDATED_V2");
    expect(room.snapshot.players[actor].field.vanguard).toEqual([summonId]);

    room.enqueueCommand(actor, actionCommand(room, "m2-end-action", { type: "END_ACTION_PHASE" }));
    await room.whenIdle();
    sockets[0].take("STATE_UPDATED_V2");
    sockets[1].take("STATE_UPDATED_V2");
    expect(room.snapshot.flow).toEqual({ kind: "TURN_RESPONSE", actor, priority: other });
    expect(store.events.get(room.id)).toHaveLength(5);

    const rebuilt = rebuildGameV2(room.replayInput, room.journalSnapshot);
    assertReplayEquivalentV2(room.snapshot, rebuilt);
    expect(rebuilt).toEqual(room.snapshot);
  });

  it("联机完成首回合跳过战斗、次回合攻击判定，并可从完整 journal 重放", async () => {
    const { room, sockets, store } = fixture();
    await room.sendInitial();
    sockets[0].take("MATCH_FOUND_V2");
    sockets[1].take("MATCH_FOUND_V2");
    const first = room.snapshot.firstPlayer;
    const second: PlayerIndex = first === 0 ? 1 : 0;
    const activeSockets: [FakeSocket, FakeSocket] = [sockets[0], sockets[1]];
    const send = async (actor: PlayerIndex, id: string, gameCommand: GameCommandV2Message) => {
      room.enqueueCommand(actor, actionCommand(room, id, gameCommand));
      await room.whenIdle();
      activeSockets[0].take("STATE_UPDATED_V2");
      activeSockets[1].take("STATE_UPDATED_V2");
    };

    await send(first, "m3-mulligan-first", { type: "SUBMIT_MULLIGAN", cardIds: [] });
    await send(second, "m3-mulligan-second", { type: "SUBMIT_MULLIGAN", cardIds: [] });
    const firstCharacter = room.snapshot.players[first].hand[0];
    await send(first, "m3-first-summon", { type: "SUMMON_CHARACTER", cardId: firstCharacter, destination: "vanguard" });
    await send(first, "m3-first-end-action", { type: "END_ACTION_PHASE" });
    expect(room.snapshot.flow).toEqual({ kind: "TURN_RESPONSE", actor: first, priority: second });
    await send(second, "m3-first-response-pass-1", { type: "PASS_PRIORITY" });
    await send(first, "m3-first-response-pass-2", { type: "PASS_PRIORITY" });
    expect(room.snapshot.flow).toEqual({ kind: "ACTION", actor: second });

    const secondCharacter = room.snapshot.players[second].hand[0];
    await send(second, "m3-second-summon", { type: "SUMMON_CHARACTER", cardId: secondCharacter, destination: "vanguard" });
    await send(second, "m3-second-end-action", { type: "END_ACTION_PHASE" });
    expect(room.snapshot.flow.kind).toBe("BATTLE_ADJUST");
    const adjustSocket = new FakeSocket();
    await room.resume(second, adjustSocket as unknown as WebSocket, "m3-adjust-resume");
    const adjustResume = adjustSocket.take("RESUME_OK_V2");
    expect(adjustResume.state.flow.kind).toBe("BATTLE_ADJUST");
    expect(adjustResume.state.availableActions).toEqual(["SUBMIT_BATTLE_LAYOUT"]);
    activeSockets[second] = adjustSocket;
    await send(second, "m3-layout", {
      type: "SUBMIT_BATTLE_LAYOUT",
      layout: { vanguard: secondCharacter, flankLeft: null, flankRight: null, rear: null },
      flankOrder: ["flankLeft", "flankRight"],
    });
    expect(room.snapshot.flow.kind).toBe("BATTLE_ATTACK");
    const attackSocket = new FakeSocket();
    await room.resume(second, attackSocket as unknown as WebSocket, "m3-attack-resume");
    const attackResume = attackSocket.take("RESUME_OK_V2");
    expect(attackResume.state.flow.kind).toBe("BATTLE_ATTACK");
    expect(attackResume.state.availableActions).toEqual(["DECLARE_ATTACK", "PASS_ATTACK_OPPORTUNITY"]);
    activeSockets[second] = attackSocket;
    await send(second, "m3-declare", {
      type: "DECLARE_ATTACK",
      attackerId: secondCharacter,
      target: { kind: "character", cardId: firstCharacter },
    });
    const resumedSocket = new FakeSocket();
    await room.resume(first, resumedSocket as unknown as WebSocket, "m3-mid-battle-resume");
    const resumed = resumedSocket.take("RESUME_OK_V2");
    expect(resumed.state.flow.kind).toBe("BATTLE_RESPONSE");
    expect(resumed.state.battle.attackerId).toBe(secondCharacter);
    expect(resumed.state.battle.target).toEqual({ kind: "character", cardId: firstCharacter });
    expect(resumed.state.battle.priorityPlayer).toBe(first);
    expect(resumed.state.battle.responseSummoned).toEqual([false, false]);
    expect(resumed.state.availableActions).toEqual([
      "SUMMON_CHARACTER",
      "ACTIVATE_KEYWORD",
      "ACTIVATE_EFFECT",
      "PASS_PRIORITY",
    ]);
    activeSockets[first] = resumedSocket;
    await send(first, "m3-battle-pass-1", { type: "PASS_PRIORITY" });
    await send(second, "m3-battle-pass-2", { type: "PASS_PRIORITY" });
    expect(room.snapshot.players[first].retreat).toContain(firstCharacter);
    expect(room.snapshot.players[second].retreat).toContain(secondCharacter);
    expect(room.snapshot.flow.kind).toBe("TURN_RESPONSE");
    const turnResponseSocket = new FakeSocket();
    await room.resume(first, turnResponseSocket as unknown as WebSocket, "m3-turn-response-resume");
    const turnResponseResume = turnResponseSocket.take("RESUME_OK_V2");
    expect(turnResponseResume.state.flow.kind).toBe("TURN_RESPONSE");
    expect(turnResponseResume.state.availableActions).toEqual(["SUMMON_CHARACTER", "ACTIVATE_EFFECT", "PASS_PRIORITY"]);
    expect(turnResponseResume.state.players[second].hand).toEqual([]);
    activeSockets[first] = turnResponseSocket;
    expect(store.events.get(room.id)).toHaveLength(12);

    const rebuilt = rebuildGameV2(room.replayInput, room.journalSnapshot);
    assertReplayEquivalentV2(room.snapshot, rebuilt);
    expect(rebuilt).toEqual(room.snapshot);
  });

  it("journal 写入失败时不提交内存状态，并向玩家返回可重试错误", async () => {
    class FailingStore extends InMemoryMatchStoreV2 {
      override async appendEvent(_record: MatchEventRecordV2): Promise<void> {
        throw new Error("storage offline");
      }
    }
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { room, sockets } = fixture(new FailingStore());
    await room.sendInitial();
    sockets[0].take("MATCH_FOUND_V2");
    sockets[1].take("MATCH_FOUND_V2");
    const actor = room.snapshot.firstPlayer;
    const before = room.snapshot;

    room.enqueueCommand(actor, command(room, actor, "persist-failure", []));
    await room.whenIdle();
    const rejected = sockets[actor].take("COMMAND_REJECTED_V2");
    expect(rejected.code).toBe("PERSISTENCE_FAILED");
    expect(room.snapshot).toEqual(before);
    expect(room.currentRevision).toBe(0);
    expect(room.journalSnapshot).toEqual([]);
    errorLog.mockRestore();
  });
});
