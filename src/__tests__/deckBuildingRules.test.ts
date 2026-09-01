import { describe, expect, it } from "vitest";
import type { Card, DeckEntry } from "../types/card";
import { compareCardsByDefaultDeckOrder, countDeckCardsWithExactName } from "../utils/deckBuilding";

function card(cardNo: string, name: string, attribute: number, cost: number, power: number): Card {
  return {
    id: `${cardNo}-C`, card_no: cardNo, name, card_type: 1, card_type_name: "角色卡",
    cost, cost_name: `Lv${cost}`, attribute, attribute_name: String(attribute), attribute_color: "#000",
    pp_value: null, dp_value: null, power: String(power), signal_color: null, signal_color_text: null,
    feature: null, feature_text: null, effect: "", package: "TEST", package_short: "T",
    rarity: 1, rarity_code: "C", rarity_cn: "普通", rarity_color: "#000", image_url: "", r: 1,
  };
}

describe("构筑同名上限与默认排序", () => {
  it("不同编号但名称完全相同的卡共享 3 张上限", () => {
    const first = card("A-001", "蜘蛛侠", 1, 2, 2000);
    const second = card("B-009", "蜘蛛侠", 2, 4, 4000);
    const different = card("C-001", "蜘蛛侠2099", 1, 2, 2000);
    const cards = new Map([[first.card_no, first], [second.card_no, second], [different.card_no, different]]);
    const deck: DeckEntry[] = [{ card_no: first.card_no, count: 2 }, { card_no: second.card_no, count: 1 }, { card_no: different.card_no, count: 3 }];
    expect(countDeckCardsWithExactName(deck, cards, "蜘蛛侠")).toBe(3);
    expect(countDeckCardsWithExactName(deck, cards, "蜘蛛侠2099")).toBe(3);
  });

  it("默认依次按颜色、等级、战力、编号升序", () => {
    const cards = [
      card("A-010", "甲", 2, 1, 1000),
      card("A-004", "乙", 1, 3, 1000),
      card("A-003", "丙", 1, 2, 3000),
      card("A-002", "丁", 1, 2, 2000),
      card("A-001", "戊", 1, 2, 2000),
    ];
    expect(cards.sort(compareCardsByDefaultDeckOrder).map((item) => item.card_no)).toEqual(["A-001", "A-002", "A-003", "A-004", "A-010"]);
  });
});
