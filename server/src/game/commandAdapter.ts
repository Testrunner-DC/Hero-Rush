import {
  createGameReducer,
  shuffleDeterministic,
  type BattleState,
  type CardDatabase,
  type GameAction,
} from "@hero-rush/game-core";
import type { GameCommand } from "@hero-rush/protocol";

export interface PreparedCommand {
  state: BattleState;
  action: GameAction;
}

function findCardOwner(state: BattleState, cardId: string): 0 | 1 | null {
  for (const seat of [0, 1] as const) {
    const player = state.players[seat];
    const locations = [
      player.deck,
      player.rushDeck,
      player.hand,
      player.baseCards,
      player.baseCovered,
      player.timeline,
      player.retreat,
      player.void,
      ...Object.values(player.field),
    ];
    if (locations.some((cards) => cards.includes(cardId))) return seat;
  }
  return null;
}

export function authorizeCommand(state: BattleState, command: GameCommand, seat: 0 | 1): string | null {
  if (state.isGameOver) return "对局已经结束";

  if (command.type === "DEPLOY_TO_BASE" || command.type === "SUMMON_TO_FIELD") {
    if (!state.players[seat].hand.includes(command.cardId)) return "指定卡牌不在你的手牌中";
  }

  if (command.type === "MULLIGAN_SELECT" || command.type === "MULLIGAN_CONFIRM") {
    const expectedSeat = state.setupPhase === "MULLIGAN_P1" ? 0 : state.setupPhase === "MULLIGAN_P2" ? 1 : null;
    return expectedSeat === seat ? null : "当前不是你的调度阶段";
  }

  if (command.type === "SELECT_TARGETS" || command.type === "CANCEL_TARGET_SELECTION") {
    const effectCardId = state.pendingTargetSelection?.effectCardId;
    return effectCardId && findCardOwner(state, effectCardId) === seat ? null : "当前不是你选择目标";
  }

  if (command.type === "CONFIRM_EFFECT" || command.type === "DECLINE_EFFECT") {
    return state.pendingEffectConfirmation?.playerIdx === seat ? null : "当前不是你处理选发效果";
  }

  if (command.type === "PASS_COUNTER" || command.type === "TRIGGER_COUNTER" || command.type === "RESOLVE_COUNTER") {
    if (!state.pendingCounter) return "当前没有应对窗口";
    return seat === 1 - state.pendingCounter.summoningPlayerIdx ? null : "当前由对手处理应对窗口";
  }

  return state.activePlayerIndex === seat ? null : "当前不是你的回合";
}

export function prepareCommand(
  state: BattleState,
  command: GameCommand,
  seat: 0 | 1,
): PreparedCommand {
  switch (command.type) {
    case "DRAW_CARDS": return { state, action: command };
    case "ADVANCE_PHASE": return { state, action: command };
    case "END_TURN": return { state, action: command };
    case "DEPLOY_TO_BASE": return {
      state,
      action: { type: command.type, playerIdx: seat, handIndex: state.players[seat].hand.indexOf(command.cardId) },
    };
    case "SUMMON_TO_FIELD": return {
      state,
      action: {
        type: command.type,
        playerIdx: seat,
        handIndex: state.players[seat].hand.indexOf(command.cardId),
        zone: command.zone,
      },
    };
    case "MOVE_CHARACTER": return { state, action: { ...command, playerIdx: seat } };
    case "MOVE_CARD": return { state, action: { ...command, playerIdx: seat } };
    case "SET_ATTACK_ZONE": return { state, action: command };
    case "START_ATTACK": return { state, action: { ...command, playerIdx: seat } };
    case "CONFIRM_ATTACK": return { state, action: { ...command, targetPlayerIdx: 1 - seat } };
    case "SKIP_ZONE": return { state, action: command };
    case "START_ATTACK_SUBPHASE": return { state, action: command };
    case "CLEAR_ATTACK_TARGET": return { state, action: command };
    case "SELECT_RETREAT": return { state, action: command };
    case "CANCEL_SUMMON": return { state, action: command };
    case "MULLIGAN_SELECT": return { state, action: { ...command, playerIdx: seat } };
    case "MULLIGAN_CONFIRM": {
      if (!state.randomState) throw new Error("对局缺少确定性随机数状态");
      const selected = state.mulliganSelected ?? [];
      const shuffled = shuffleDeterministic([...state.players[seat].deck, ...selected], state.randomState);
      return {
        state: { ...state, randomState: shuffled.state },
        action: { type: "MULLIGAN_CONFIRM", playerIdx: seat, shuffledDeck: shuffled.items },
      };
    }
    case "TRIGGER_COUNTER": return { state, action: { ...command, playerIdx: seat } };
    case "RESOLVE_COUNTER": return { state, action: { ...command, playerIdx: seat } };
    case "PASS_COUNTER": return { state, action: { ...command, playerIdx: seat } };
    case "ACTIVATE_EFFECT": return { state, action: { ...command, playerIdx: seat } };
    case "SELECT_TARGETS": return { state, action: { ...command, playerIdx: seat } };
    case "CANCEL_TARGET_SELECTION": return { state, action: { ...command, playerIdx: seat } };
    case "CONFIRM_EFFECT": return { state, action: { ...command, playerIdx: seat } };
    case "DECLINE_EFFECT": return { state, action: { ...command, playerIdx: seat } };
  }
}

export function applyPreparedCommand(
  prepared: PreparedCommand,
  db: CardDatabase,
): BattleState | null {
  return createGameReducer(db)(prepared.state, prepared.action);
}

export function describeCommand(command: GameCommand, playerName: string): string {
  const labels: Record<GameCommand["type"], string> = {
    DRAW_CARDS: "完成抽卡",
    ADVANCE_PHASE: "推进阶段",
    END_TURN: "结束回合",
    DEPLOY_TO_BASE: "部署了一张基地牌",
    SUMMON_TO_FIELD: "号召了一名角色",
    MOVE_CHARACTER: "调整了角色位置",
    MOVE_CARD: "进行了战基移动",
    SET_ATTACK_ZONE: "选择了攻击区域",
    START_ATTACK: "选择了攻击者",
    CONFIRM_ATTACK: "发起攻击",
    SKIP_ZONE: "跳过攻击区域",
    START_ATTACK_SUBPHASE: "进入攻击阶段",
    CLEAR_ATTACK_TARGET: "取消攻击选择",
    SELECT_RETREAT: "选择撤退角色",
    CANCEL_SUMMON: "取消号召",
    MULLIGAN_SELECT: "选择调度手牌",
    MULLIGAN_CONFIRM: "完成调度",
    TRIGGER_COUNTER: "发动应对",
    RESOLVE_COUNTER: "结算应对",
    PASS_COUNTER: "应对窗口选择不行动",
    ACTIVATE_EFFECT: "发动卡牌效果",
    SELECT_TARGETS: "确认效果目标",
    CANCEL_TARGET_SELECTION: "取消目标选择",
    CONFIRM_EFFECT: "确认发动效果",
    DECLINE_EFFECT: "放弃发动效果",
  };
  return `${playerName} ${labels[command.type]}`;
}
