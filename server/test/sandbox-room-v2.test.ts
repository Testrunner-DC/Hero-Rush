import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { Card, CardDatabase, PlayerIndex } from "@hero-rush/game-core";
import { PROTOCOL_VERSION_V2, ServerMessageV2Schema, type ClientMessageV2 } from "@hero-rush/protocol";
import { SandboxRoomV2 } from "../src/game/SandboxRoomV2.js";

type SandboxCommand = Extract<ClientMessageV2, { type: "SANDBOX_COMMAND_V2" }>;
type Message = Record<string, any> & { type: string };

class FakeSocket {
  readyState = WebSocket.OPEN;
  readonly messages: Message[] = [];

  send(payload: string): void {
    const raw = JSON.parse(payload);
    const parsed = ServerMessageV2Schema.parse(raw);
    this.messages.push(parsed as Message);
  }

  take(type: string): Message {
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
    cost: cardType === 1 ? 1 : null,
    cost_name: cardType === 1 ? "1" : "",
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

function fixture() {
  const mainDecks = [0, 1].map((seat) => Array.from({ length: 50 }, (_, index) => `P${seat}-M-${index}`)) as [string[], string[]];
  const rushDecks = [0, 1].map((seat) => Array.from({ length: 9 }, (_, index) => `P${seat}-R-${index}`)) as [string[], string[]];
  const cards = [
    ...mainDecks.flatMap((deck) => deck.map((id) => makeCard(id, 1))),
    ...rushDecks.flatMap((deck) => deck.map((id) => makeCard(id, 2))),
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
  const socket = new FakeSocket();
  const room = new SandboxRoomV2({
    ownerUserId: "sandbox-owner",
    ws: socket as unknown as WebSocket,
    catalog,
    seed: "sandbox-layout-regression",
    players: [
      { name: "玩家一", deck: mainDecks[0], rushDeck: rushDecks[0] },
      { name: "玩家二", deck: mainDecks[1], rushDeck: rushDecks[1] },
    ],
  });
  return { room, socket };
}

describe("V2 权威沙盒战区调整", () => {
  it("确认布局返回可解析消息并推进至攻击机会", async () => {
    const { room, socket } = fixture();
    room.sendCreated("create-layout-test");
    let current = socket.take("SANDBOX_CREATED_V2");
    const send = async (payload: SandboxCommand["payload"], label: string) => {
      const message: SandboxCommand = {
        type: "SANDBOX_COMMAND_V2",
        protocolVersion: PROTOCOL_VERSION_V2,
        requestId: `${label}-request`,
        matchId: current.matchId,
        commandId: `${label}-command`,
        expectedRevision: current.revision,
        payload,
      };
      room.enqueue(message);
      await room.whenIdle();
      current = socket.take("COMMAND_ACCEPTED_V2");
      return current;
    };

    await send({ kind: "FINISH_MULLIGAN" }, "finish-mulligan");
    const first = current.state.activePlayer as PlayerIndex;
    const second: PlayerIndex = first === 0 ? 1 : 0;
    const firstCard = current.state.players[first].hand[0].instanceId as string;
    await send({ kind: "ATOMIC", operations: [{ kind: "PLACE_FIELD", cardId: firstCard, destination: "vanguard" }] }, "place-first");
    await send({ kind: "GAME", actor: first, command: { type: "END_ACTION_PHASE" } }, "end-first-action");
    await send({ kind: "GAME", actor: second, command: { type: "PASS_PRIORITY" } }, "pass-first-priority");
    await send({ kind: "GAME", actor: first, command: { type: "PASS_PRIORITY" } }, "pass-second-priority");

    const secondCard = current.state.players[second].hand[0].instanceId as string;
    await send({ kind: "ATOMIC", operations: [{ kind: "PLACE_FIELD", cardId: secondCard, destination: "vanguard" }] }, "place-second");
    await send({ kind: "GAME", actor: second, command: { type: "END_ACTION_PHASE" } }, "end-second-action");
    expect(current.state.flow.kind).toBe("BATTLE_ADJUST");

    const accepted = await send({
      kind: "GAME",
      actor: second,
      command: {
        type: "SUBMIT_BATTLE_LAYOUT",
        layout: { vanguard: secondCard, flankLeft: null, flankRight: null, rear: null },
      },
    }, "confirm-layout");

    expect(accepted.events).toContainEqual(expect.objectContaining({ type: "BATTLE_LAYOUT_SUBMITTED", actor: second }));
    expect(accepted.state.flow.kind).toBe("BATTLE_ATTACK");
    expect(accepted.state.availableActions).toEqual(["DECLARE_ATTACK", "PASS_ATTACK_OPPORTUNITY"]);
  });
});
