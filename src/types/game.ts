/**
 * 对战引擎 — 游戏状态类型定义（基于超英击战综合规则书 1.00）
 */

import type { EventListener, Ability } from "../game/types";
import type { Modifier } from "../game/effects/types";

/** 战区类型 — 先锋 / 侧翼左 / 侧翼右 / 后卫 */
export type Zone = "vanguard" | "flankLeft" | "flankRight" | "rear";

/** 待完成的号召信息（Lv4+需手动撤退时使用） */
export interface PendingSummon {
  /** 发起号召的玩家 index */
  playerIdx: number;
  /** 手牌中的位置索引 */
  handIndex: number;
  /** 号召目标区域 */
  zone: Zone | "base";
  /** 号召的卡牌 id */
  cardId: string;
  /** 需要撤退的 Lv 总额 */
  requiredLv: number;
  /** 已选择撤退的卡牌 id 列表 */
  selectedRetreatIds: string[];
  /** 已选择撤退的 Lv 总额 */
  selectedLv: number;
}

/** 一位玩家的对战状态 */
export interface PlayerState {
  id: 1 | 2;
  name: string;
  /** 主卡组（50张角色卡，洗匀后盖放，id 列表） */
  deck: string[];
  /** 冲击卡组（9张冲击卡） */
  rushDeck: string[];
  /** 手牌 */
  hand: string[];
  /** 基地 — 正面向上的角色卡（通过号召放置到基地） */
  baseCards: string[];
  /** 基地 — 背面向上盖放的盖卡（通过基地部署放置） */
  baseCovered: string[];
  /** 战区 — 先锋区 / 侧翼左区 / 侧翼右区 / 后卫区 */
  field: {
    vanguard: string[];   // 先锋区（中上）
    flankLeft: string[];  // 侧翼左区（中左）
    flankRight: string[]; // 侧翼右区（中右）
    rear: string[];       // 后卫区（中下）
  };
  /** 时间线（被攻入的冲击卡） */
  timeline: string[];
  /** 撤退区 */
  retreat: string[];
  /** 虚空区 */
  void: string[];
  /** 是否为先攻玩家 */
  isFirstPlayer: boolean;
}

/** 回合阶段（按规则书 303.2 定义） */
export type TurnPhase =
  | "TURN_START"     // 回合开始：触发回合开始效果
  | "DRAW"           // 抽卡阶段：抽2张
  | "ACTION"         // 行动阶段：基地部署/号召(最多3次)/战基移动/起动效果
  | "CONFLICT"       // 冲突阶段：调整位置 → 先锋→侧翼→后卫攻击（先攻首回跳过）
  | "END_PHASE";     // 结束阶段：触发结束效果 → 手牌>9则弃至9张

/** 对战准备阶段（开局流程，规则书 303.1） */
export type SetupPhase =
  | "SHUFFLE"        // 双方洗混50角色卡+9冲击卡，盖放入区域
  | "FIRST_PLAYER"   // 决定先后手
  | "DRAW_HANDS"     // 已抽起始手牌
  | "MULLIGAN_P1"    // 玩家1调整手牌中
  | "MULLIGAN_P2"    // 玩家2调整手牌中
  | "DONE";          // 准备完成

/** 待处理的应对 */
export interface PendingCounter {
  /** 正在号召的玩家 index */
  summoningPlayerIdx: number;
  /** 正在号召的卡牌 ID */
  summoningCardId: string;
  /** 号召目标区域 */
  summoningZone: Zone | "base";
}

/** 完整对战状态 */
export interface BattleState {
  /** 当前是否在准备阶段 */
  isSetup: boolean;
  setupPhase: SetupPhase;
  turnPhase: TurnPhase;
  players: [PlayerState, PlayerState];
  /** 当前活跃玩家 index（0 = 玩家1, 1 = 玩家2） */
  activePlayerIndex: number;
  /** 回合计数（从1开始） */
  turnNumber: number;
  /** 行动阶段剩余号召次数（每回合最多3次，首回先攻1次） */
  remainingSummons: number;
  /** 本回合是否已进行基地部署 */
  baseDeployedThisTurn: boolean;
  /** 本回合已进行的战基移动次数（每角色每回合1次） */
  baseMovesUsed: Record<string, number>;
  /** 冲突阶段：已处理完毕的区域（攻击完毕或跳过） */
  conflictZonesCompleted: Zone[];
  /** 冲突阶段：当前区域中已攻击的卡牌 id */
  conflictAttackedCards: string[];
  /** 对战日志 */
  log: string[];
  /** 游戏是否结束 */
  isGameOver: boolean;
  winner: number | null;

  // ===== 新增字段（引擎层扩展） =====

  /** 冲突子阶段：位置调整 / 攻击（原 UI 状态，移入游戏状态） */
  conflictSubPhase: "adjust" | "attack";

  /** 冲突阶段已用调整次数（上限4次） */
  conflictMovesUsed: number;

  /** 当前选中的攻击区域（原 UI 状态 currentAttackZone） */
  currentAttackZone: Zone | null;

  /** 待确认的攻击选择（原 UI 状态 attackTarget） */
  pendingAttack: {
    attackerIdx: number;
    attackerZone: Zone;
    attackerCardId: string;
  } | null;

  /** 已注册的事件监听器（为卡牌效果预留） */
  eventListeners: EventListener[];

  /** 已注册的能力（为卡牌效果预留） */
  registeredAbilities: Ability[];

  /** 待完成的号召（Lv4+需手动撤退时使用） */
  pendingSummon: PendingSummon | null;

  /** 临时修改器（本回合战力/R值修改，回合结束时清除 duration='turn' 的） */
  modifiers: Modifier[];

  /** 结附关系：key = 宿主卡ID, value = 结附卡ID数组 */
  attachments: Record<string, string[]>;

  /** 待处理的应对（对手号召时检查是否有应对可用） */
  pendingCounter: PendingCounter | null;

  /** 本回合进场的卡牌 ID 列表（不可进行战基移动） */
  enteredThisTurn: string[];

  // ===== T01 新增字段（增量开发：引擎层扩展） =====

  /** 应对阶段：本回合双方是否已使用应对 [玩家0, 玩家1] */
  counterUsedThisTurn?: [boolean, boolean];

  /** 应对阶段：连续不行动计数（双方各 pass 一次则计数=2，结束应对窗口） */
  counterPassCount?: number;

  /** 连击追踪：本冲突阶段每张卡的已攻击次数 cardId → count */
  conflictAttackCount?: Record<string, number>;

  /** 临时能力：本回合获得的关键词能力 cardId → ["combo"|"assault"|"airRaid"|"intercept"] */
  temporaryAbilities?: Record<string, string[]>;

  /** 拦截使用追踪：本回合已使用拦截的卡 ID 列表 */
  interceptUsedThisTurn?: string[];

  /** 效果使用追踪：本回合已使用的"回合1次"效果，格式 `${cardNo}-${effectId}` */
  effectUsedThisTurn?: string[];

  /** 本回合已起动的效果列表，格式 `${cardNo}-${effectId}` */
  activatedEffectsThisTurn?: string[];

  /** 开局调度：当前选中要放回卡组底的手牌 ID 列表 */
  mulliganSelected?: string[];

  // ===== Q7 新增字段：目标选择 =====

  /** 待处理的目标选择（当卡效需要玩家手动选择目标时设置） */
  pendingTargetSelection?: {
    /** 需要选目标的卡效信息 */
    effectCardId: string;
    effectId: string;
    /** 可选目标列表 cardId[] */
    availableTargets: string[];
    /** 已选目标数量 / 需选数量 */
    minTargets: number;
    maxTargets: number;
    /** 目标所在玩家 idx */
    targetPlayerIdx: number;
    /** 选择回调类型（用于引擎判断） */
    selectionType: "effect_target" | "retreat_target" | "base_reveal";
    /** 已选中的目标 cardId[]（UI 层维护） */
    selectedTargetIds: string[];
  } | null;
}
