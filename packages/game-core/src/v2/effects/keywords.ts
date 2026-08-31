import type { CardInstanceIdV2, GameStateV2, OfficialKeywordV2 } from "../model";
import { starterContinuousKeywordsV2 } from "../cards/starterContinuous";
import { promoContinuousKeywordsV2 } from "../cards/promoContinuous";
import { isCardEffectSuppressedV2 } from "./suppression";

export type KeywordRuleAtomV2 =
  | { kind: "PERMIT_RESPONSE_SUMMON" }
  | { kind: "REDIRECT_ATTACK_TARGET"; usage: "turn_once" }
  | { kind: "SET_ATTACK_OPPORTUNITY_LIMIT"; count: 2 }
  | { kind: "BREACH_AFTER_BATTLE_WIN" }
  | { kind: "PERMIT_OCCUPIED_BREACH" }
  | { kind: "PREVENT_SAME_NAME_ON_FIELD"; removable: false };

export interface OfficialKeywordDescriptorV2 {
  keyword: OfficialKeywordV2;
  label: string;
  aliases: string[];
  ruleRef: string;
  activeZone: "hand" | "battle" | "field";
  atom: KeywordRuleAtomV2;
  description: string;
}

/** 1.02 规则书能力的唯一机器可读目录。卡牌文本只负责声明能力，不重复实现语义。 */
export const OFFICIAL_KEYWORD_CATALOG_V2: readonly OfficialKeywordDescriptorV2[] = [
  { keyword: "counter", label: "应对", aliases: [], ruleRef: "305.1", activeZone: "hand", atom: { kind: "PERMIT_RESPONSE_SUMMON" }, description: "允许手牌中的角色在战斗应对步骤或回合应对阶段进行应对号召。" },
  { keyword: "intercept", label: "拦截", aliases: [], ruleRef: "305.2", activeZone: "battle", atom: { kind: "REDIRECT_ATTACK_TARGET", usage: "turn_once" }, description: "持有应对优先权时，把合法的当前攻击目标变更为此卡。" },
  { keyword: "combo", label: "连击", aliases: ["追击"], ruleRef: "305.3", activeZone: "field", atom: { kind: "SET_ATTACK_OPPORTUNITY_LIMIT", count: 2 }, description: "该角色在同一战斗阶段拥有第二次攻击机会。" },
  { keyword: "assault", label: "强袭", aliases: [], ruleRef: "305.4", activeZone: "field", atom: { kind: "BREACH_AFTER_BATTLE_WIN" }, description: "该角色通过攻击战胜敌方角色时，同时判定成功攻击破绽。" },
  { keyword: "airRaid", label: "空袭", aliases: [], ruleRef: "305.5", activeZone: "field", atom: { kind: "PERMIT_OCCUPIED_BREACH" }, description: "即使敌方战区存在角色，也可把该战区作为破绽攻击。" },
  { keyword: "unique", label: "唯一", aliases: [], ruleRef: "305.6", activeZone: "field", atom: { kind: "PREVENT_SAME_NAME_ON_FIELD", removable: false }, description: "己方场上不能存在其他同名卡牌，且该能力不能失去。" },
] as const;

const keywordOrder = OFFICIAL_KEYWORD_CATALOG_V2.map((item) => item.keyword);

/**
 * 只提取卡面直接印刷的能力行；“获得能力【强袭】”等动态效果必须通过
 * GRANT_KEYWORD 原子进入状态，不能被误判为永久印刷能力。
 */
export function extractPrintedKeywordsV2(effectText: string): OfficialKeywordV2[] {
  const lines = effectText.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  const found = new Set<OfficialKeywordV2>();
  for (const line of lines) {
    if (/^应对（常驻【手牌】/.test(line)) found.add("counter");
    if (/^唯一(?:\s|（|$)/.test(line)) found.add("unique");
    if (/^(?:唯一\s+)?拦截(?:\s|（|$)/.test(line)) found.add("intercept");
    if (/^(?:连击|追击)(?:\s|（|$)/.test(line)) found.add("combo");
    if (/^强袭(?:\s|（|$)/.test(line)) found.add("assault");
    if (/^空袭(?:\s|（|$)/.test(line)) found.add("airRaid");
  }
  return keywordOrder.filter((keyword) => found.has(keyword));
}

function continuousSourcePresentV2(state: GameStateV2, sourceCardId: CardInstanceIdV2): boolean {
  return state.players.some((player) => (
    player.baseCards.includes(sourceCardId)
    || Object.values(player.field).some((cards) => cards.includes(sourceCardId))
  )) || Object.values(state.attachments).some((cards) => cards.includes(sourceCardId));
}

export function effectiveKeywordsV2(state: GameStateV2, cardId: CardInstanceIdV2): OfficialKeywordV2[] {
  const printed = state.cards[cardId]?.printedKeywords ?? [];
  // 【唯一】按 1.02 规则不能失去；其余印刷能力随“失去效果”停止。
  const activePrinted = isCardEffectSuppressedV2(state, cardId) ? printed.filter((keyword) => keyword === "unique") : printed;
  const granted = (state.keywordGrants ?? [])
    .filter((grant) => grant.targetCardId === cardId)
    .filter((grant) => grant.duration !== "while_source_present" || continuousSourcePresentV2(state, grant.sourceCardId))
    .map((grant) => grant.keyword);
  const copiedPrinted = isCardEffectSuppressedV2(state, cardId) ? [] : (state.effectCopies ?? [])
    .filter((copy) => copy.targetCardId === cardId)
    .flatMap((copy) => state.cards[copy.copiedFromCardId]?.printedKeywords ?? []);
  const effective = new Set<OfficialKeywordV2>([...activePrinted, ...copiedPrinted, ...granted, ...starterContinuousKeywordsV2(state, cardId), ...promoContinuousKeywordsV2(state, cardId)]);
  return keywordOrder.filter((keyword) => effective.has(keyword));
}

export function hasKeywordV2(state: GameStateV2, cardId: CardInstanceIdV2, keyword: OfficialKeywordV2): boolean {
  return effectiveKeywordsV2(state, cardId).includes(keyword);
}

export function keywordRuleAtomsForCardV2(state: GameStateV2, cardId: CardInstanceIdV2): KeywordRuleAtomV2[] {
  const keywords = new Set(effectiveKeywordsV2(state, cardId));
  return OFFICIAL_KEYWORD_CATALOG_V2.filter((item) => keywords.has(item.keyword)).map((item) => item.atom);
}

export function attackOpportunityLimitV2(state: GameStateV2, cardId: CardInstanceIdV2): 1 | 2 {
  return hasKeywordV2(state, cardId, "combo") || (state.usage.characterOnlyAdditionalAttackCardIds ?? []).includes(cardId) ? 2 : 1;
}

export function consumedAttackOpportunitiesV2(state: GameStateV2, cardId: CardInstanceIdV2): number {
  return state.battle?.attackedCardIds.filter((id) => id === cardId).length ?? 0;
}
