import { describe, expect, it } from "vitest";
import type { Card } from "../../types/card";
import { cardCoverageReportV2, validateDeckCardPoolV2 } from "../index";

function card(id: string, cardNo: string): Card {
  return {
    id, card_no: cardNo, name: cardNo, card_type: 1, card_type_name: "角色卡", cost: 1, cost_name: "1",
    attribute: 1, attribute_name: "测试", attribute_color: "#000", pp_value: null, dp_value: null,
    power: "1000", signal_color: null, signal_color_text: null, feature: null, feature_text: null,
    effect: "测试效果", package: "TEST", package_short: "T", rarity: 1, rarity_code: "C",
    rarity_cn: "普通", rarity_color: "#000", image_url: `/cards/${id}.png`,
  };
}

describe("V2 M5 卡池准入", () => {
  it("按 cardNo 合并不同稀有度变体统计覆盖，不把单个效果登记误判为整卡完成", () => {
    const cards = [card("A-C", "A"), card("A-UR", "A"), card("B-C", "B")];
    const report = cardCoverageReportV2(cards, [{
      cardNo: "A", ruleRefs: ["303.2.a.3"], effectIds: ["effect-a"], tests: ["a.test"],
    }]);
    expect(report.totalCharacterCardNos).toBe(2);
    expect(report.implementedCardNos).toBe(1);
    expect(report.missingCardNos).toEqual(["B"]);
  });

  it("缺少规则、效果或测试证据的登记仍被卡池门禁拒绝", () => {
    const cards = [card("A-C", "A"), card("A-UR", "A"), card("B-C", "B")];
    const result = validateDeckCardPoolV2(["A-C", "A-UR", "B-C"], cards, [{
      cardNo: "A", ruleRefs: [], effectIds: [], tests: [],
    }]);
    expect(result).toEqual({ ok: false, missingCardNos: ["A", "B"] });
  });

  it("完整登记才允许效果卡进入卡组", () => {
    const cards = [card("A-C", "A")];
    const result = validateDeckCardPoolV2(["A-C"], cards, [{
      cardNo: "A", ruleRefs: ["303.2.a.3"], effectIds: ["effect-a"], tests: ["a.test.ts"],
    }]);
    expect(result).toEqual({ ok: true });
  });
});
