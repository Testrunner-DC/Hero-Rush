import type { CardInstanceIdV2, GameStateV2, PlayerIndex } from "./model";
import { hasKeywordV2 } from "./effects/keywords";

function allZoneCards(state: GameStateV2): CardInstanceIdV2[] {
  return state.players.flatMap((player, seat) => [
    ...player.deck,
    ...player.rushDeck,
    ...player.hand,
    ...player.baseCards,
    ...player.baseCovered,
    ...Object.values(player.field).flat(),
    ...player.timeline,
    ...player.retreat,
    ...player.void,
    ...Object.values(state.attachments).flat().filter((id) => state.cards[id]?.owner === seat),
  ]);
}

export function validateStateInvariantsV2(state: GameStateV2): string[] {
  const errors: string[] = [];
  const zoneCards = allZoneCards(state);
  const seen = new Set<CardInstanceIdV2>();

  for (const id of zoneCards) {
    if (!state.cards[id]) errors.push(`区域中存在未知实体卡：${id}`);
    if (seen.has(id)) errors.push(`实体卡同时存在于多个区域：${id}`);
    seen.add(id);
  }

  for (const id of Object.keys(state.cards)) {
    if (!seen.has(id)) errors.push(`实体卡未处于任何区域：${id}`);
  }

  for (const actor of [0, 1] as const) {
    const owned = Object.values(state.cards).filter((card) => card.owner === actor);
    const main = owned.filter((card) => card.deckKind === "main");
    const rush = owned.filter((card) => card.deckKind === "rush");
    if (main.length !== 50) errors.push(`玩家 ${actor} 主卡实体数不是 50：${main.length}`);
    if (rush.length !== 9) errors.push(`玩家 ${actor} 冲击卡实体数不是 9：${rush.length}`);
  }

  if (state.status === "setup") {
    if (state.flow.kind !== "SETUP_MULLIGAN") errors.push("准备状态必须处于 SETUP_MULLIGAN");
    if (!state.decision || state.decision.kind !== "MULLIGAN") errors.push("准备状态必须存在调度决策");
    if (state.decision && state.flow.kind === "SETUP_MULLIGAN") {
      if (state.decision.actor !== state.flow.actor) errors.push("调度决策者与流程决策者不一致");
      const hand = new Set(state.players[state.decision.actor].hand);
      if (state.decision.choices.some((id) => !hand.has(id))) errors.push("调度候选包含非当前手牌");
    }
  }

  if (state.status === "playing") {
    if (state.flow.actor !== state.activePlayer) errors.push("流程行动者必须等于当前回合玩家");
    if (state.decision?.kind === "MULLIGAN") errors.push("进入游戏后不应残留调度决策");
    if (
      (state.decision?.kind === "SUMMON_PAYMENT" || state.decision?.kind === "SUMMON_DESTINATION")
      && !["ACTION", "BATTLE_RESPONSE", "TURN_RESPONSE"].includes(state.flow.kind)
    ) {
      errors.push("号召支付选择只能存在于号召或应对流程");
    }
    if (state.decision?.kind === "DISCARD_TO_LIMIT" && state.flow.kind !== "END_DISCARD") {
      errors.push("手牌上限选择只能存在于 END_DISCARD");
    }
    if (state.decision?.kind === "SUMMON_PAYMENT") {
      const player = state.players[state.decision.actor];
      const candidates = new Set([
        ...player.baseCards,
        ...player.baseCovered,
        ...Object.values(player.field).flat(),
      ]);
      if (new Set(state.decision.choices).size !== state.decision.choices.length) {
        errors.push("号召支付候选不能重复");
      }
      if (state.decision.choices.some((id) => !candidates.has(id))) {
        errors.push("号召支付候选必须仍在决策者场上");
      }
      if (!player.hand.includes(state.decision.continuation.cardId)) {
        errors.push("待支付号召卡必须仍在决策者手牌");
      }
      if (state.decision.requiredLevel < 4) errors.push("Lv3 或以下不应产生号召支付决策");
    }
    if (state.decision?.kind === "SUMMON_DESTINATION") {
      const player = state.players[state.decision.actor];
      if (!player.hand.includes(state.decision.continuation.cardId)) errors.push("待放置的高阶号召卡必须仍在手牌");
      if (state.decision.choices.length === 0 || state.decision.choices.some((choice) => !choice.startsWith("zone:"))) errors.push("高阶号召必须提供合法位置选择");
      if (state.decision.continuation.paymentCardIds.some((id) => !player.retreat.includes(id))) errors.push("高阶号召支付素材必须已经撤退");
    }
    if (state.decision?.kind === "DISCARD_TO_LIMIT") {
      if (state.decision.actor !== state.activePlayer) errors.push("弃至上限必须由当前回合玩家处理");
      const hand = new Set(state.players[state.decision.actor].hand);
      if (state.decision.choices.some((id) => !hand.has(id))) errors.push("弃牌候选必须仍在决策者手牌");
      if (state.decision.min !== state.decision.max) errors.push("弃至上限必须选择固定数量");
    }
    if (state.decision?.kind === "ORDER_TRIGGERS") {
      const current = state.decision.continuation.currentEffects;
      if (new Set(state.decision.choices).size !== state.decision.choices.length) errors.push("同时触发排序候选不能重复");
      if (current.some((effect) => effect.controller !== state.decision?.actor)) errors.push("同时触发排序只能包含决策者控制的效果");
      if (current.map((effect) => effect.id).join("|") !== state.decision.choices.join("|")) errors.push("同时触发排序候选与效果实例不一致");
      if (state.decision.min !== state.decision.choices.length || state.decision.max !== state.decision.choices.length) errors.push("同时触发排序必须覆盖全部候选");
    }
    if (state.decision?.kind === "OPTIONAL_EFFECT") {
      if (state.decision.continuation.effect.controller !== state.decision.actor) errors.push("可选效果必须由控制者决定");
      if (state.decision.choices.join("|") !== "resolve|skip") errors.push("可选效果决策选项非法");
    }
    if (state.decision?.kind === "EFFECT_TARGETS") {
      if (new Set(state.decision.choices).size !== state.decision.choices.length) errors.push("效果目标候选不能重复");
      if ((state.decision.choiceKind ?? "card") === "card" && state.decision.choices.some((id) => !state.cards[id])) errors.push("卡牌效果目标候选必须是已知实体卡");
      if (state.decision.choiceKind === "field_location" && state.decision.choices.some((id) => !/^zone:(vanguard|flankLeft|flankRight|rear|base)$/.test(id))) errors.push("效果位置候选必须是合法场上区域");
      const sourceCardId = state.decision.continuation.kind === "RESUME_EFFECT_TARGETS"
        ? state.decision.continuation.sourceCardId
        : state.decision.continuation.effect.sourceCardId;
      const source = state.cards[sourceCardId];
      if (!source || source.owner !== state.decision.actor) errors.push("效果目标决策来源必须由决策者控制");
    }

    const battleFlows = new Set(["BATTLE_ADJUST", "BATTLE_NEXT", "BATTLE_FLANK_CHOICE", "BATTLE_ATTACK", "BATTLE_TARGET", "BATTLE_RESPONSE"]);
    if (battleFlows.has(state.flow.kind) !== Boolean(state.battle)) errors.push("战斗流程与 BattleContext 不一致");
    if ((state.flow.kind === "TURN_RESPONSE") !== Boolean(state.turnResponse)) errors.push("回合应对流程与上下文不一致");
  }

  for (const [seat, player] of state.players.entries()) {
    if (player.baseCards.length + player.baseCovered.length > 6) errors.push("基地区超过 6 张");
    for (const [zone, cards] of Object.entries(player.field)) {
      if (cards.length > 1) errors.push(`${zone} 超过 1 张角色`);
    }
    const onField = [
      ...player.baseCards,
      ...Object.values(player.field).flat(),
      ...Object.values(state.attachments).flat().filter((id) => state.cards[id]?.owner === seat),
    ];
    const uniqueNames = new Set(onField.filter((id) => hasKeywordV2(state, id, "unique")).map((id) => state.cards[id]?.cardNo));
    if ([...uniqueNames].some((cardNo) => onField.filter((id) => state.cards[id]?.cardNo === cardNo).length > 1)) {
      errors.push(`玩家 ${seat} 场上存在重复【唯一】同名卡`);
    }
  }
  for (const [seat, attackedIds] of (state.usage.attackedCardIdsByPlayer ?? [[], []]).entries()) {
    if (new Set(attackedIds).size !== attackedIds.length) errors.push(`玩家 ${seat} 的已攻击角色记录重复`);
    if (attackedIds.some((id) => !state.cards[id] || state.cards[id].owner !== seat)) errors.push(`玩家 ${seat} 的已攻击角色记录包含无效卡牌`);
  }

  if (state.firstPlayer !== 0 && state.firstPlayer !== 1) errors.push("先攻玩家索引非法");
  if (state.status === "finished" && state.winner === null) errors.push("已结束对局必须有胜者");
  for (const card of Object.values(state.cards)) {
    if (card.level < 0 || card.range < 0 || card.power < 0) errors.push(`卡牌数值不能为负：${card.instanceId}`);
  }
  if (new Set(state.modifiers.map((modifier) => modifier.id)).size !== state.modifiers.length) {
    errors.push("修改器 ID 不能重复");
  }
  for (const modifier of state.modifiers) {
    if (!state.cards[modifier.sourceCardId] || !state.cards[modifier.targetCardId]) errors.push(`修改器引用未知卡牌：${modifier.id}`);
  }
  const keywordGrants = state.keywordGrants ?? [];
  if (new Set(keywordGrants.map((grant) => grant.id)).size !== keywordGrants.length) errors.push("关键词授予 ID 不能重复");
  for (const grant of keywordGrants) {
    if (!state.cards[grant.sourceCardId] || !state.cards[grant.targetCardId]) errors.push(`关键词授予引用未知卡牌：${grant.id}`);
  }
  for (const cardId of state.usage.interceptUsedCardIds ?? []) {
    if (!state.cards[cardId]) errors.push(`拦截使用记录引用未知卡牌：${cardId}`);
  }
  if (new Set(state.effects.queue.map((effect) => effect.id)).size !== state.effects.queue.length) {
    errors.push("效果队列 ID 不能重复");
  }
  if (state.effects.queue.some((effect) => !state.cards[effect.sourceCardId])) errors.push("效果队列引用未知来源卡牌");
  if (state.effects.resolving && state.effects.queue.length === 0) errors.push("空效果队列不应保持 resolving");
  const attachedIds = Object.values(state.attachments).flat();
  if (new Set(attachedIds).size !== attachedIds.length) errors.push("同一张结附卡不能拥有多个宿主");
  for (const [hostId, cardIds] of Object.entries(state.attachments)) {
    if (!state.cards[hostId]) errors.push(`结附宿主不存在：${hostId}`);
    if (cardIds.includes(hostId)) errors.push(`卡牌不能结附于自身：${hostId}`);
    if (cardIds.some((id) => !state.cards[id])) errors.push(`结附关系包含未知卡牌：${hostId}`);
  }
  const visits = new Set<string>();
  const visiting = new Set<string>();
  const hasAttachmentCycle = (hostId: string): boolean => {
    if (visiting.has(hostId)) return true;
    if (visits.has(hostId)) return false;
    visiting.add(hostId);
    const cyclic = (state.attachments[hostId] ?? []).some(hasAttachmentCycle);
    visiting.delete(hostId);
    visits.add(hostId);
    return cyclic;
  };
  if (Object.keys(state.attachments).some(hasAttachmentCycle)) errors.push("结附关系不能形成循环");
  return errors;
}

export function assertStateInvariantsV2(state: GameStateV2): void {
  const errors = validateStateInvariantsV2(state);
  if (errors.length > 0) throw new Error(`V2 状态约束失败：${errors.join("；")}`);
}

export function otherPlayerV2(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}
