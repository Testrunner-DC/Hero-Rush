import { afterEach, describe, expect, it } from "vitest";
import type { Card } from "../../types/card";
import {
  advanceAutomaticFlowV2,
  ATOMIC_OPERATION_CATALOG_V2,
  applyAtomicOperationsV2,
  assertReplayEquivalentV2,
  clearEffectRegistryForTestsV2,
  createGameV2,
  effectiveValueV2,
  executeAuthoritativeCommandV2,
  hashStateV2,
  projectBattleViewV2,
  registerEffectV2,
  rebuildGameV2,
  validateStateInvariantsV2,
  validateAtomicOperationsV2,
} from "../index";
import type { AcceptedJournalEntryV2, CreateGameInputV2, GameCommandV2, GameStateV2, PlayerIndex } from "../index";

function definition(id: string, type: 1 | 2): Card {
  return {
    id, card_no: id, name: id, card_type: type, card_type_name: "测试", cost: 1, cost_name: "1",
    attribute: 1, attribute_name: "测试", attribute_color: "#000", pp_value: null, dp_value: null,
    power: type === 1 ? "1000" : null, signal_color: null, signal_color_text: null,
    feature: null, feature_text: null, effect: type === 1 ? "测试效果" : "", package: "TEST",
    package_short: "T", rarity: 1, rarity_code: "C", rarity_cn: "普通", rarity_color: "#000",
    image_url: `/cards/${id}.png`, r: 1,
  };
}

function fixtureInput(): CreateGameInputV2 {
  const main0 = Array.from({ length: 50 }, (_, index) => `A-${index}`);
  const rush0 = Array.from({ length: 9 }, (_, index) => `AR-${index}`);
  const main1 = Array.from({ length: 50 }, (_, index) => `B-${index}`);
  const rush1 = Array.from({ length: 9 }, (_, index) => `BR-${index}`);
  return {
    matchId: "m4", seed: "m4", cardDefinitions: [
      ...main0.map((id) => definition(id, 1)), ...rush0.map((id) => definition(id, 2)),
      ...main1.map((id) => definition(id, 1)), ...rush1.map((id) => definition(id, 2)),
    ],
    players: [{ name: "A", mainDeck: main0, rushDeck: rush0 }, { name: "B", mainDeck: main1, rushDeck: rush1 }],
  };
}

function submit(state: GameStateV2, actor: PlayerIndex, command: GameCommandV2) {
  return executeAuthoritativeCommandV2(state, {
    actor, commandId: `m4-${state.revision}`, expectedRevision: state.revision, command,
  });
}

function actionState(): GameStateV2 {
  let state = createGameV2(fixtureInput());
  for (let index = 0; index < 2; index += 1) {
    const actor = state.decision?.actor;
    if (actor === undefined) throw new Error("missing mulligan");
    const result = submit(state, actor, { type: "SUBMIT_MULLIGAN", cardIds: [] });
    if (!result.ok) throw new Error(result.message);
    state = result.state;
  }
  return state;
}

function expectDecisionReconnectStable(state: GameStateV2, actor: PlayerIndex): void {
  const restored = JSON.parse(JSON.stringify(state)) as GameStateV2;
  const stateHash = hashStateV2(state);
  expect(hashStateV2(restored)).toBe(stateHash);
  expect(validateStateInvariantsV2(restored)).toEqual([]);
  const other: PlayerIndex = actor === 0 ? 1 : 0;
  const actorView = projectBattleViewV2(restored, actor, stateHash);
  const otherView = projectBattleViewV2(restored, other, stateHash);
  expect(actorView.pendingDecision?.kind).toBe(state.decision?.kind);
  expect(actorView.availableActions).toEqual(state.decision?.kind === "EFFECT_TARGETS"
    ? ["ANSWER_DECISION", "CANCEL_EFFECT_TARGETS"]
    : ["ANSWER_DECISION"]);
  expect(otherView.pendingDecision).toBeNull();
  expect(otherView.decisionCards).toEqual([]);
  expect(otherView.availableActions).toEqual([]);
  expect(actorView.players[other].hand).toEqual([]);
  expect(otherView.players[actor].hand).toEqual([]);
}

afterEach(() => clearEffectRegistryForTestsV2());

describe("V2 M4 效果运行时骨架", () => {
  it("公开稳定的原子目录、参数校验和逐步执行轨迹", () => {
    const state = actionState();
    expect(ATOMIC_OPERATION_CATALOG_V2.map((atom) => atom.kind)).toEqual([
      "DRAW", "DISCARD", "DISCARD_DECK_TOP", "BANISH_DECK_TOP", "REVEAL_RANDOM_HAND", "RETREAT_RANDOM_BASE_COVERED", "COVER_RANDOM_HAND", "RETREAT", "BANISH", "MOVE_TO_BASE", "PLACE_FIELD", "COVER", "REVEAL", "FLIP_BASE_FACE_UP", "MOVE_TO_DECK_BOTTOM", "MOVE_TO_DECK_TOP", "MOVE_FIELD", "MOVE_BATTLE_BASE", "RETURN_TO_HAND", "MOVE_TO_HAND", "SWAP_POSITIONS", "ADD_MODIFIER", "REMOVE_MODIFIER", "GRANT_KEYWORD", "REMOVE_KEYWORD", "ATTACH", "DETACH", "MARK_EFFECT_USED", "FORBID_SUMMON_PAYMENT", "FORBID_HIGH_LEVEL_SUMMON_PAYMENT", "FORBID_MOVE", "REORDER_DECK_CARDS", "GRANT_COPIED_EFFECTS", "GRANT_ADDITIONAL_CHARACTER_ATTACK", "REDIRECT_ATTACK_TARGET", "SKIP_BATTLE_PHASE", "FORBID_ATTACK",
    ]);
    expect(validateAtomicOperationsV2(state, [{ kind: "DRAW", actor: state.activePlayer, count: 0 }])).toContain(
      "原子 1（DRAW）：抽牌数量必须是正整数",
    );
    const result = applyAtomicOperationsV2(state, [{ kind: "DRAW", actor: state.activePlayer, count: 1 }]);
    expect(result.trace).toEqual([expect.objectContaining({ index: 0, kind: "DRAW", validationIssues: [] })]);
    expect(result.trace[0].emittedEvents).toContain("TURN_CARDS_DRAWN");
  });

  it("未登记效果以稳定错误码拒绝，且不改变 stateHash", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const sourceCardId = state.players[actor].hand[0];
    const before = hashStateV2(state);
    const result = submit(state, actor, { type: "ACTIVATE_EFFECT", sourceCardId, effectId: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EFFECT_NOT_IMPLEMENTED");
    expect(hashStateV2(state)).toBe(before);
  });

  it("登记效果进入序列化队列，经原子操作结算并记录已解析实例", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const sourceCardId = state.players[actor].hand[0];
    const cardNo = state.cards[sourceCardId].cardNo;
    registerEffectV2({
      cardNo,
      effectId: "self-power",
      activation: "action",
      buildOperations: (_state, _actor, source) => [{
        kind: "ADD_MODIFIER",
        modifier: {
          id: `modifier:${source}`,
          sourceCardId: source,
          targetCardId: source,
          type: "power",
          value: 1500,
          duration: "turn",
        },
      }],
    });
    const result = submit(state, actor, { type: "ACTIVATE_EFFECT", sourceCardId, effectId: "self-power" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(effectiveValueV2(result.state, sourceCardId, "power")).toBe(2500);
    expect(result.state.effects.queue).toEqual([]);
    expect(result.state.effects.resolving).toBe(false);
    expect(result.state.effects.resolvedEffectIds).toHaveLength(1);
    expect(result.events.map((event) => event.type)).toEqual(["EFFECT_QUEUED", "EFFECT_RESOLVED"]);
    expect(JSON.parse(JSON.stringify(result.state.effects))).toEqual(result.state.effects);
  });

  it("带目标效果只接受服务端候选，并把选择作为可恢复决策写入状态", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const sourceCardId = state.players[actor].hand[0];
    const targetCardId = state.players[defender].hand.shift()!;
    state.players[defender].field.vanguard = [targetCardId];
    registerEffectV2({
      cardNo: state.cards[sourceCardId].cardNo,
      effectId: "targeted-retreat",
      activation: "action",
      sourceZones: ["hand"],
      targeting: () => ({ choices: [targetCardId], min: 1, max: 1, prompt: "选择 1 名敌方角色" }),
      buildOperations: (_state, _actor, _source, targets) => [{ kind: "RETREAT", cardIds: [...targets] }],
    });
    const requested = submit(state, actor, { type: "ACTIVATE_EFFECT", sourceCardId, effectId: "targeted-retreat" });
    expect(requested.ok).toBe(true);
    if (!requested.ok || requested.state.decision?.kind !== "EFFECT_TARGETS") return;
    expectDecisionReconnectStable(requested.state, actor);
    expect(JSON.parse(JSON.stringify(requested.state.decision))).toEqual(requested.state.decision);
    const cancelled = submit(requested.state, actor, {
      type: "CANCEL_EFFECT_TARGETS",
      decisionId: requested.state.decision.id,
    });
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) {
      expect(cancelled.state.decision).toBeNull();
      expect(cancelled.state.players[defender].field.vanguard).toContain(targetCardId);
      expect(cancelled.events).toContainEqual(expect.objectContaining({ type: "EFFECT_TARGETS_CANCELLED", effectId: "targeted-retreat" }));
    }
    const before = hashStateV2(requested.state);
    const forged = submit(requested.state, actor, {
      type: "ANSWER_DECISION",
      decisionId: requested.state.decision.id,
      cardIds: [sourceCardId],
    });
    expect(forged.ok).toBe(false);
    expect(hashStateV2(requested.state)).toBe(before);
    const resolved = submit(requested.state, actor, {
      type: "ANSWER_DECISION",
      decisionId: requested.state.decision.id,
      cardIds: [targetCardId],
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.state.players[defender].retreat).toContain(targetCardId);
  });

  it("每个原子操作后执行状态检查，战力降到 0 的角色立即锁定撤退", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const sourceCardId = state.players[actor].hand[0];
    const targetCardId = state.players[defender].hand[0];
    state.players[defender].hand = state.players[defender].hand.slice(1);
    state.players[defender].field.vanguard = [targetCardId];
    registerEffectV2({
      cardNo: state.cards[sourceCardId].cardNo,
      effectId: "zero-power",
      activation: "action",
      buildOperations: () => [{
        kind: "ADD_MODIFIER",
        modifier: {
          id: "zero-target",
          sourceCardId,
          targetCardId,
          type: "power",
          value: -1000,
          duration: "turn",
        },
      }],
    });
    const result = submit(state, actor, { type: "ACTIVATE_EFFECT", sourceCardId, effectId: "zero-power" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[defender].field.vanguard).toEqual([]);
    expect(result.state.players[defender].retreat).toContain(targetCardId);
    expect(result.events.some((event) => event.type === "STATE_BASED_RETREAT")).toBe(true);
  });

  it("END_EXPIRE 统一移除本回合修改器而保留永久修改器", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const source = state.players[actor].hand[0];
    state.modifiers = [
      { id: "turn", sourceCardId: source, targetCardId: source, type: "power", value: 1000, duration: "turn" },
      { id: "permanent", sourceCardId: source, targetCardId: source, type: "power", value: 500, duration: "permanent" },
    ];
    state.flow = { kind: "END_EXPIRE", actor };
    const result = advanceAutomaticFlowV2(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.modifiers.map((modifier) => modifier.id)).toEqual(["permanent"]);
  });

  it("同一玩家的同时触发效果进入显式排序决策，并按提交顺序结算", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const sourceCardId = state.players[actor].hand[0];
    const deployCardId = state.players[actor].hand[1];
    state.players[actor].hand = state.players[actor].hand.filter((id) => id !== sourceCardId);
    state.players[actor].baseCards = [sourceCardId];
    const cardNo = state.cards[sourceCardId].cardNo;
    for (const [effectId, value] of [["first", 100], ["second", 200]] as const) {
      registerEffectV2({
        cardNo,
        effectId,
        trigger: "BASE_DEPLOYED",
        sourceZones: ["base"],
        buildOperations: (_state, _actor, source) => [{
          kind: "ADD_MODIFIER",
          modifier: {
            id: `modifier:${effectId}`,
            sourceCardId: source,
            targetCardId: source,
            type: "power",
            value,
            duration: "turn",
          },
        }],
      });
    }
    const deployed = submit(state, actor, { type: "DEPLOY_BASE", cardId: deployCardId });
    expect(deployed.ok).toBe(true);
    if (!deployed.ok) return;
    expect(deployed.state.decision?.kind).toBe("ORDER_TRIGGERS");
    if (deployed.state.decision?.kind !== "ORDER_TRIGGERS") return;
    expectDecisionReconnectStable(deployed.state, actor);
    const reversed = [...deployed.state.decision.choices].reverse();
    const ordered = submit(deployed.state, actor, {
      type: "ANSWER_DECISION",
      decisionId: deployed.state.decision.id,
      cardIds: reversed,
    });
    expect(ordered.ok).toBe(true);
    if (!ordered.ok) return;
    expect(ordered.state.effects.resolvedEffectIds.slice(-2)).toEqual(reversed);
    expect(ordered.events.some((event) => event.type === "TRIGGERS_ORDERED")).toBe(true);
  });

  it("可选触发效果必须由控制者显式处理或跳过", () => {
    const initial = actionState();
    const actor = initial.activePlayer;
    const sourceCardId = initial.players[actor].hand[0];
    const deployCardId = initial.players[actor].hand[1];
    initial.players[actor].hand = initial.players[actor].hand.filter((id) => id !== sourceCardId);
    initial.players[actor].baseCards = [sourceCardId];
    registerEffectV2({
      cardNo: initial.cards[sourceCardId].cardNo,
      effectId: "optional-draw",
      trigger: "BASE_DEPLOYED",
      sourceZones: ["base"],
      optional: true,
      buildOperations: () => [{ kind: "DRAW", actor, count: 1 }],
    });
    const requested = submit(initial, actor, { type: "DEPLOY_BASE", cardId: deployCardId });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    expect(requested.state.decision?.kind).toBe("OPTIONAL_EFFECT");
    if (requested.state.decision?.kind !== "OPTIONAL_EFFECT") return;
    expectDecisionReconnectStable(requested.state, actor);
    const handCount = requested.state.players[actor].hand.length;
    const resolved = submit(requested.state, actor, {
      type: "ANSWER_DECISION",
      decisionId: requested.state.decision.id,
      cardIds: ["resolve"],
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.players[actor].hand).toHaveLength(handCount + 1);
    expect(resolved.events).toContainEqual(expect.objectContaining({ type: "OPTIONAL_EFFECT_CHOSEN", resolved: true }));

    const skippedBase = actionState();
    const skippedActor = skippedBase.activePlayer;
    const skippedSource = skippedBase.players[skippedActor].hand[0];
    const skippedDeploy = skippedBase.players[skippedActor].hand[1];
    skippedBase.players[skippedActor].hand = skippedBase.players[skippedActor].hand.filter((id) => id !== skippedSource);
    skippedBase.players[skippedActor].baseCards = [skippedSource];
    const skippedRequest = submit(skippedBase, skippedActor, { type: "DEPLOY_BASE", cardId: skippedDeploy });
    expect(skippedRequest.ok).toBe(true);
    if (!skippedRequest.ok || skippedRequest.state.decision?.kind !== "OPTIONAL_EFFECT") return;
    const skippedHandCount = skippedRequest.state.players[skippedActor].hand.length;
    const skipped = submit(skippedRequest.state, skippedActor, {
      type: "ANSWER_DECISION",
      decisionId: skippedRequest.state.decision.id,
      cardIds: ["skip"],
    });
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(skipped.state.players[skippedActor].hand).toHaveLength(skippedHandCount);
    expect(skipped.events).toContainEqual(expect.objectContaining({ type: "OPTIONAL_EFFECT_CHOSEN", resolved: false }));
  });

  it("触发效果产生的新事件会继续收集触发，形成确定性嵌套链", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const deploySource = state.players[actor].hand[0];
    const nestedSource = state.players[actor].hand[1];
    const deployedCard = state.players[actor].hand[2];
    state.players[actor].hand = state.players[actor].hand.filter((id) => id !== deploySource);
    state.players[actor].baseCards = [deploySource];
    const target = state.players[defender].hand[0];
    state.players[defender].hand = state.players[defender].hand.slice(1);
    state.players[defender].field.vanguard = [target];
    registerEffectV2({
      cardNo: state.cards[deploySource].cardNo,
      effectId: "retreat-on-deploy",
      trigger: "BASE_DEPLOYED",
      sourceZones: ["base"],
      buildOperations: () => [{
        kind: "ADD_MODIFIER",
        modifier: { id: "nested-zero", sourceCardId: deploySource, targetCardId: target, type: "power", value: -1000, duration: "turn" },
      }],
    });
    registerEffectV2({
      cardNo: state.cards[nestedSource].cardNo,
      effectId: "draw-after-retreat",
      trigger: "STATE_BASED_RETREAT",
      sourceZones: ["hand"],
      buildOperations: () => [{ kind: "DRAW", actor, count: 1 }],
    });
    const result = submit(state, actor, { type: "DEPLOY_BASE", cardId: deployedCard });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.map((event) => event.type)).toContain("STATE_BASED_RETREAT");
    expect(result.events.map((event) => event.type)).toContain("TURN_CARDS_DRAWN");
    expect(result.state.effects.resolvedEffectIds).toHaveLength(2);
  });

  it("触发效果在实际结算时挂起目标选择，并可从该稳定点继续", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const defender: PlayerIndex = actor === 0 ? 1 : 0;
    const source = state.players[actor].hand[0];
    const deployedCard = state.players[actor].hand[1];
    state.players[actor].hand = state.players[actor].hand.filter((id) => id !== source);
    state.players[actor].baseCards = [source];
    const target = state.players[defender].hand.shift()!;
    state.players[defender].field.rear = [target];
    registerEffectV2({
      cardNo: state.cards[source].cardNo,
      effectId: "trigger-target",
      trigger: "BASE_DEPLOYED",
      sourceZones: ["base"],
      targeting: () => ({ choices: [target], min: 1, max: 1, prompt: "选择触发目标" }),
      buildOperations: (_state, _actor, _source, targets) => [{ kind: "RETREAT", cardIds: [...targets] }],
    });
    const requested = submit(state, actor, { type: "DEPLOY_BASE", cardId: deployedCard });
    expect(requested.ok).toBe(true);
    if (!requested.ok || requested.state.decision?.kind !== "EFFECT_TARGETS") return;
    expectDecisionReconnectStable(requested.state, actor);
    expect(requested.state.decision.continuation.kind).toBe("RESUME_TRIGGER_EFFECT_TARGETS");
    const answered = submit(requested.state, actor, {
      type: "ANSWER_DECISION",
      decisionId: requested.state.decision.id,
      cardIds: [target],
    });
    expect(answered.ok).toBe(true);
    if (answered.ok) expect(answered.state.players[defender].retreat).toContain(target);
  });

  it("数值层先应用替换值，再叠加增减值，且允许最终 R 为 0", () => {
    const state = actionState();
    const actor = state.activePlayer;
    const cardId = state.players[actor].hand[0];
    state.modifiers = [
      { id: "replace", sourceCardId: cardId, targetCardId: cardId, type: "range", value: 1, mode: "replace", duration: "turn" },
      { id: "delta", sourceCardId: cardId, targetCardId: cardId, type: "range", value: -1, mode: "delta", duration: "turn" },
    ];
    expect(effectiveValueV2(state, cardId, "range")).toBe(0);
  });

  it("宿主撤退时结附链一并进入拥有者撤退区", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const host = state.players[actor].hand[0];
    const attached = state.players[actor].hand[1];
    state.players[actor].hand = state.players[actor].hand.slice(2);
    state.players[actor].field.vanguard = [host];
    state.players[actor].hand.push(attached);
    const attachedResult = applyAtomicOperationsV2(state, [{ kind: "ATTACH", cardId: attached, hostCardId: host }]);
    expect(attachedResult.state.attachments[host]).toEqual([attached]);
    const retreated = applyAtomicOperationsV2(attachedResult.state, [{ kind: "RETREAT", cardIds: [host] }]);
    expect(retreated.state.players[actor].retreat).toEqual(expect.arrayContaining([host, attached]));
    expect(retreated.state.attachments).toEqual({});
  });

  it("隐藏区效果候选只向决策者投影完整卡牌，卡组重排分界不会泄露给对手", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer; const other: PlayerIndex = actor === 0 ? 1 : 0;
    const sourceCardId = state.players[actor].hand[0];
    const top = state.players[actor].deck.slice(0, 3);
    registerEffectV2({
      cardNo: state.cards[sourceCardId].cardNo,
      effectId: "hidden-deck-reorder",
      activation: "action",
      sourceZones: ["hand"],
      targeting: () => ({ choices: [...top, "split:0", "split:1", "split:2", "split:3"], min: 4, max: 4, prompt: "重排卡组顶", choiceKind: "deck_reorder" }),
      buildOperations: () => [],
    });
    const requested = submit(state, actor, { type: "ACTIVATE_EFFECT", sourceCardId, effectId: "hidden-deck-reorder" });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    const actorView = projectBattleViewV2(requested.state, actor, hashStateV2(requested.state));
    const otherView = projectBattleViewV2(requested.state, other, hashStateV2(requested.state));
    expect(actorView.pendingDecision?.kind).toBe("EFFECT_TARGETS");
    expect(actorView.decisionCards.map((card) => card.instanceId)).toEqual(top);
    expect(otherView.pendingDecision).toBeNull();
    expect(otherView.decisionCards).toEqual([]);
    expect(validateStateInvariantsV2(requested.state)).toEqual([]);
  });

  it("官方裁定：角色当回合进场后结附，解除结附恢复角色时仍不能战基移动", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const host = state.players[actor].hand.shift()!;
    const cardId = state.players[actor].hand.shift()!;
    state.players[actor].field.vanguard = [host];
    state.players[actor].field.rear = [cardId];
    state.usage.enteredThisTurn = [cardId];

    const attached = applyAtomicOperationsV2(state, [{ kind: "ATTACH", cardId, hostCardId: host }]);
    expect(attached.state.usage.enteredThisTurn).toContain(cardId);
    const detached = applyAtomicOperationsV2(attached.state, [{ kind: "DETACH", cardId, destination: "base" }]);
    expect(detached.state.usage.enteredThisTurn).toContain(cardId);

    const moved = submit(detached.state, actor, { type: "MOVE_BATTLE_BASE", cardId, from: "base", destination: "flankLeft" });
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.code).toBe("CARD_ENTERED_THIS_TURN");
  });

  it("官方裁定：以结附卡身份当回合进场，解除结附恢复角色时可以战基移动", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const host = state.players[actor].hand.shift()!;
    const cardId = state.players[actor].hand.shift()!;
    state.players[actor].field.vanguard = [host];

    const attached = applyAtomicOperationsV2(state, [{ kind: "ATTACH", cardId, hostCardId: host }]);
    expect(attached.state.usage.enteredThisTurn).not.toContain(cardId);
    const detached = applyAtomicOperationsV2(attached.state, [{ kind: "DETACH", cardId, destination: "base" }]);
    const moved = submit(detached.state, actor, { type: "MOVE_BATTLE_BASE", cardId, from: "base", destination: "flankLeft" });

    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.state.players[actor].field.flankLeft).toEqual([cardId]);
  });

  it("官方裁定：角色当回合进场后盖放会失去进场限制，翻开恢复角色时可以战基移动", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const cardId = state.players[actor].hand.shift()!;
    state.players[actor].field.rear = [cardId];
    state.usage.enteredThisTurn = [cardId];

    const covered = applyAtomicOperationsV2(state, [{ kind: "COVER", cardId }]);
    expect(covered.state.players[actor].baseCovered).toContain(cardId);
    expect(covered.state.usage.enteredThisTurn).not.toContain(cardId);
    const flipped = applyAtomicOperationsV2(covered.state, [{ kind: "FLIP_BASE_FACE_UP", cardId }]);
    expect(flipped.state.usage.enteredThisTurn).not.toContain(cardId);
    const moved = submit(flipped.state, actor, { type: "MOVE_BATTLE_BASE", cardId, from: "base", destination: "flankLeft" });

    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.state.players[actor].field.flankLeft).toEqual([cardId]);
  });

  it("来源在场时持续的修改器会在来源离场后立即失效", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const source = state.players[actor].hand.shift()!;
    const target = state.players[actor].hand.shift()!;
    state.players[actor].field.vanguard = [source];
    state.players[actor].field.rear = [target];
    const added = applyAtomicOperationsV2(state, [{
      kind: "ADD_MODIFIER",
      modifier: { id: "while-source", sourceCardId: source, targetCardId: target, type: "power", value: 500, duration: "while_source_present" },
    }]);
    expect(effectiveValueV2(added.state, target, "power")).toBe(1500);
    const removed = applyAtomicOperationsV2(added.state, [{ kind: "RETREAT", cardIds: [source] }]);
    expect(removed.state.modifiers.some((modifier) => modifier.id === "while-source")).toBe(false);
    expect(effectiveValueV2(removed.state, target, "power")).toBe(1000);
  });

  it("状态检查会同时锁定并撤退所有战力归零角色", () => {
    const state = structuredClone(actionState());
    const actor = state.activePlayer;
    const other: PlayerIndex = actor === 0 ? 1 : 0;
    const first = state.players[actor].hand.shift()!;
    const second = state.players[other].hand.shift()!;
    state.players[actor].field.vanguard = [first];
    state.players[other].field.vanguard = [second];
    const result = applyAtomicOperationsV2(state, [
      { kind: "ADD_MODIFIER", modifier: { id: "zero-first", sourceCardId: first, targetCardId: first, type: "power", value: -1000, duration: "turn" } },
      { kind: "ADD_MODIFIER", modifier: { id: "zero-second", sourceCardId: first, targetCardId: second, type: "power", value: -1000, duration: "turn" } },
    ]);
    expect(result.state.players[actor].retreat).toContain(first);
    expect(result.state.players[other].retreat).toContain(second);
  });

  it("包含目标选择的多阶段效果可由命令日志重放到相同状态", () => {
    const gameInput = fixtureInput();
    let state = createGameV2(gameInput);
    const journal: AcceptedJournalEntryV2[] = [];
    const accept = (actor: PlayerIndex, gameCommand: GameCommandV2) => {
      const envelope = { actor, commandId: `replay-${state.revision}`, expectedRevision: state.revision, command: gameCommand };
      const result = executeAuthoritativeCommandV2(state, envelope);
      if (!result.ok) throw new Error(result.message);
      journal.push({ ...envelope, stateHash: result.stateHash });
      state = result.state;
    };
    for (let index = 0; index < 2; index += 1) {
      const actor = state.decision?.actor;
      if (actor === undefined) throw new Error("missing mulligan");
      accept(actor, { type: "SUBMIT_MULLIGAN", cardIds: [] });
    }
    const actor = state.activePlayer;
    const [source, target] = state.players[actor].hand;
    registerEffectV2({
      cardNo: state.cards[source].cardNo,
      effectId: "replay-target",
      activation: "action",
      sourceZones: ["hand"],
      targeting: () => ({ choices: [target], min: 1, max: 1, prompt: "选择目标" }),
      buildOperations: (_state, _actor, _source, targets) => [{ kind: "RETREAT", cardIds: [...targets] }],
    });
    accept(actor, { type: "ACTIVATE_EFFECT", sourceCardId: source, effectId: "replay-target" });
    if (state.decision?.kind !== "EFFECT_TARGETS") throw new Error("missing target decision");
    accept(actor, { type: "ANSWER_DECISION", decisionId: state.decision.id, cardIds: [target] });
    const rebuilt = rebuildGameV2(gameInput, journal);
    assertReplayEquivalentV2(state, rebuilt);
    expect(rebuilt).toEqual(state);
  });
});
