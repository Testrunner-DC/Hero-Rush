import { describe, expect, it } from "vitest";
import type { Card, CardDatabase } from "@hero-rush/game-core";
import { validateDeckSelectionV2 } from "../src/matchmaking/deckValidationV2.js";

function card(id: string, name: string, type: 1 | 2, attribute = 1, effect = ""): Card {
  return {
    id, card_no: id, name, card_type: type, card_type_name: type === 1 ? "角色卡" : "冲击卡",
    cost: 1, cost_name: "1", attribute, attribute_name: String(attribute), attribute_color: "#000",
    pp_value: null, dp_value: null, power: type === 1 ? "1000" : null, signal_color: null,
    signal_color_text: null, feature: null, feature_text: null, effect, package: "TEST",
    package_short: "T", rarity: 1, rarity_code: "C", rarity_cn: "普通", rarity_color: "#000",
    image_url: `/cards/${id}.png`,
  };
}

function fixture() {
  const mainCards = Array.from({ length: 17 }, (_, index) => card(`M-${index}`, `角色-${index}`, 1, index % 2 + 1));
  const rushCards = Array.from({ length: 9 }, (_, index) => card(`R-${index}`, `冲击-${index}`, 2));
  const deck = mainCards.flatMap((item, index) => Array(index === 16 ? 2 : 3).fill(item.id));
  const catalog: CardDatabase = {
    total_cards: 26, total_variants: 26, packages: ["TEST"], attributes: {}, rarities: {},
    cards: [...mainCards, ...rushCards], card_groups: {},
  };
  return { catalog, deck, rushDeck: rushCards.map((item) => item.id) };
}

describe("V2 服务端卡组准入", () => {
  it("接受满足 50+9、同名上限和双色上限的快照", () => {
    const { catalog, deck, rushDeck } = fixture();
    expect(validateDeckSelectionV2({ deck, rushDeck }, catalog, false)).toEqual({ deck, rushDeck });
  });

  it("跨卡号按名称合计并拒绝第 4 张同名角色", () => {
    const { catalog, deck, rushDeck } = fixture();
    catalog.cards.push(card("M-variant", "角色-0", 1));
    deck[deck.length - 1] = "M-variant";
    expect(validateDeckSelectionV2({ deck, rushDeck }, catalog, false)).toEqual({ error: "名称相同的角色卡合计最多投入 3 张" });
  });

  it("拒绝第三种属性、未知卡和错误卡种", () => {
    const thirdColor = fixture();
    thirdColor.catalog.cards.find((item) => item.id === "M-16")!.attribute = 3;
    expect(validateDeckSelectionV2(thirdColor, thirdColor.catalog, false)).toEqual({ error: "主卡组最多包含 2 种属性" });

    const unknown = fixture();
    unknown.deck[0] = "UNKNOWN";
    expect(validateDeckSelectionV2(unknown, unknown.catalog, false)).toEqual({ error: "卡组包含服务器目录中不存在的卡牌" });

    const wrongType = fixture();
    wrongType.deck[0] = wrongType.rushDeck[0];
    expect(validateDeckSelectionV2(wrongType, wrongType.catalog, false)).toEqual({ error: "主卡组或冲击卡组包含错误类型的卡牌" });
  });

  it("启用完整卡池门禁时拒绝尚无规则和测试证据的效果卡", () => {
    const { catalog, deck, rushDeck } = fixture();
    catalog.cards.find((item) => item.id === deck[0])!.effect = "测试效果";
    expect(validateDeckSelectionV2({ deck, rushDeck }, catalog, true)).toEqual({
      error: `卡组包含尚未完成 V2 效果实现的卡牌：${deck[0]}`,
    });
  });
});
