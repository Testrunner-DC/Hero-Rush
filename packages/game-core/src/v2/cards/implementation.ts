import implementationRecords from "./implementations.v2.json";

export interface CardImplementationRecordV2 {
  cardNo: string;
  ruleRefs: string[];
  effectIds: string[];
  tests: string[];
}

export function isCompleteCardImplementationV2(
  record: CardImplementationRecordV2,
): boolean {
  return record.cardNo.trim().length > 0
    && record.ruleRefs.length > 0
    && record.ruleRefs.every((value) => value.trim().length > 0)
    && record.effectIds.length > 0
    && record.effectIds.every((value) => value.trim().length > 0)
    && record.tests.length > 0
    && record.tests.every((value) => value.trim().length > 0);
}

/**
 * 只有完成全部效果、规则映射和自动化的卡号才能加入此清单。
 * 变体共用 cardNo；禁止仅因某个效果已登记就自动视为整张卡完成。
 */
export const CARD_IMPLEMENTATIONS_V2: readonly CardImplementationRecordV2[] = implementationRecords;
