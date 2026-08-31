import { describe, expect, it } from "vitest";
import type { Card } from "../types/card";
import { deckEligibleVariant, groupCardVariants, ORDINARY_CARD_VARIANT_ACCESS } from "../utils/cardVariants";

function card(id: string, cardNo: string, rarity: number): Card {
  return {
    id, card_no: cardNo, name: cardNo, card_type: 1, card_type_name: "角色卡",
    cost: 1, cost_name: "1", attribute: 1, attribute_name: "红", attribute_color: "#f00",
    pp_value: null, dp_value: null, power: "1000", signal_color: null, signal_color_text: null,
    feature: null, feature_text: null, effect: "", package: "TEST", package_short: "T",
    rarity, rarity_code: `R${rarity}`, rarity_cn: String(rarity), rarity_color: "#000",
    image_url: `/cards/${id}.png`, r: 1,
  };
}

describe("同编号罕贵卡图", () => {
  it("无论数据库顺序如何都默认最低罕贵", () => {
    const groups = groupCardVariants([card("high", "T-001", 9), card("low", "T-001", 2), card("mid", "T-001", 5)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].variants.map((variant) => variant.id)).toEqual(["low", "mid", "high"]);
    expect(groups[0].lowest.id).toBe("low");
  });

  it("普通玩家即使预览高罕贵，加入卡组仍解析为最低罕贵", () => {
    const group = groupCardVariants([card("premium", "T-001", 8), card("ordinary", "T-001", 1)])[0];
    expect(deckEligibleVariant(group, ORDINARY_CARD_VARIANT_ACCESS, group.variants[1]).id).toBe("ordinary");
    expect(deckEligibleVariant(group, { canUsePremiumVariants: true }, group.variants[1]).id).toBe("premium");
  });
});
