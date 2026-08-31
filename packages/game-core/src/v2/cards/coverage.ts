import type { Card } from "../../types/card";
import {
  CARD_IMPLEMENTATIONS_V2,
  isCompleteCardImplementationV2,
  type CardImplementationRecordV2,
} from "./implementation";

export interface CardCoverageReportV2 {
  totalCharacterCardNos: number;
  effectCardNos: number;
  totalCardNos: number;
  implementedCardNos: number;
  missingCardNos: string[];
  admittedCardNos: string[];
  implemented: CardImplementationRecordV2[];
  invalidImplementations: CardImplementationRecordV2[];
}

export function cardCoverageReportV2(
  cards: readonly Card[],
  implementations: readonly CardImplementationRecordV2[] = CARD_IMPLEMENTATIONS_V2,
): CardCoverageReportV2 {
  const characterNos = [...new Set(cards.filter((card) => card.card_type === 1).map((card) => card.card_no))].sort();
  const effectNos = [...new Set(cards
    .filter((card) => card.card_type === 1 && card.effect.trim().length > 0)
    .map((card) => card.card_no))].sort();
  const complete = implementations.filter(isCompleteCardImplementationV2);
  const implementedByNo = new Map(complete.map((record) => [record.cardNo, record]));
  const implemented = effectNos.flatMap((cardNo) => {
    const record = implementedByNo.get(cardNo);
    return record ? [record] : [];
  });
  return {
    totalCharacterCardNos: characterNos.length,
    effectCardNos: effectNos.length,
    totalCardNos: effectNos.length,
    implementedCardNos: implemented.length,
    missingCardNos: effectNos.filter((cardNo) => !implementedByNo.has(cardNo)),
    admittedCardNos: characterNos.filter((cardNo) => !effectNos.includes(cardNo) || implementedByNo.has(cardNo)),
    implemented,
    invalidImplementations: implementations.filter((record) => !isCompleteCardImplementationV2(record)),
  };
}

export function validateDeckCardPoolV2(
  definitionIds: readonly string[],
  cards: readonly Card[],
  implementations: readonly CardImplementationRecordV2[] = CARD_IMPLEMENTATIONS_V2,
): { ok: true } | { ok: false; missingCardNos: string[] } {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const allowed = new Set(implementations.filter(isCompleteCardImplementationV2).map((record) => record.cardNo));
  const missing = [...new Set(definitionIds.flatMap((id) => {
    const card = byId.get(id);
    return card && card.effect.trim().length > 0 && !allowed.has(card.card_no) ? [card.card_no] : [];
  }))].sort();
  return missing.length === 0 ? { ok: true } : { ok: false, missingCardNos: missing };
}
