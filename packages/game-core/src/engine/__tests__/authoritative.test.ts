import { describe, expect, it } from "vitest";
import type { Card, CardDatabase } from "../../types/card";
import { createAuthoritativeGame, createMatchCardDatabase } from "../authoritative";

function makeCard(id: string, cardType: 1 | 2): Card {
  return {
    id,
    card_no: id.split("-").slice(0, 2).join("-"),
    name: id,
    card_type: cardType,
    card_type_name: cardType === 1 ? "角色" : "冲击",
    cost: 1,
    cost_name: "1",
    attribute: 1,
    attribute_name: "红",
    attribute_color: "#f00",
    pp_value: null,
    dp_value: null,
    power: cardType === 1 ? "1000" : null,
    signal_color: null,
    signal_color_text: null,
    feature: null,
    feature_text: null,
    effect: "",
    package: "TEST",
    package_short: "TEST",
    rarity: 1,
    rarity_code: "R",
    rarity_cn: "普通",
    rarity_color: "#999",
    image_url: `/cards/${id}.png`,
  };
}

const mainCard = makeCard("TEST-001-R", 1);
const rushCard = makeCard("TEST-101-R", 2);
const catalog: CardDatabase = {
  total_cards: 2,
  total_variants: 2,
  packages: ["TEST"],
  attributes: {},
  rarities: {},
  cards: [mainCard, rushCard],
  card_groups: { "TEST-001": [mainCard.id], "TEST-101": [rushCard.id] },
};

const setup = {
  matchId: "00000000-0000-4000-8000-000000000001",
  seed: "fixed-seed",
  players: [
    { name: "玩家一", deck: Array(50).fill(mainCard.id), rushDeck: Array(9).fill(rushCard.id) },
    { name: "玩家二", deck: Array(50).fill(mainCard.id), rushDeck: Array(9).fill(rushCard.id) },
  ] as const,
};

describe("权威对局初始化", () => {
  it("同一种子生成完全一致的状态", () => {
    const first = createAuthoritativeGame(catalog, setup);
    const second = createAuthoritativeGame(catalog, setup);
    expect(first.state).toEqual(second.state);
  });

  it("每张实体卡都拥有唯一实例 ID", () => {
    const { state } = createAuthoritativeGame(catalog, setup);
    const ids = Object.keys(state.cardInstances ?? {});
    expect(ids).toHaveLength(118);
    expect(new Set(ids).size).toBe(118);
    expect(state.players[0].hand).toHaveLength(6);
    expect(state.players[0].deck).toHaveLength(44);
  });

  it("状态可 JSON 序列化，并可恢复实例数据库", () => {
    const { state } = createAuthoritativeGame(catalog, setup);
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored.eventListeners).toEqual([]);
    expect(restored.registeredAbilities).toEqual([]);
    const matchDb = createMatchCardDatabase(catalog, restored.cardInstances);
    expect(matchDb.cards).toHaveLength(118);
    expect(matchDb.cards[0].id).not.toBe(mainCard.id);
  });
});
