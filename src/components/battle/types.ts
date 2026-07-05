/**
 * 战场组件 Props 类型定义
 *
 * 包含 PlayerArea 等组件的 Props 接口。
 */

import type { CardDatabase, Card } from "../../types/card";
import type { PlayerState, Zone, PendingSummon, AttackTarget } from "../../engine";
import type { ActionMode } from "./constants";

/** PlayerArea 组件的 Props */
export interface BoardProps {
  player: PlayerState;
  isActive: boolean;
  db: CardDatabase;
  isActionPhase: boolean;
  isConflictPhase: boolean;
  isConflictAdjust: boolean;
  isConflictAttack: boolean;
  conflictSubPhase: "adjust" | "attack";
  conflictZonesCompleted: Zone[];
  conflictAttackedCards: string[];
  currentAttackZone: Zone | null;
  canZoneAttack: (zone: Zone) => boolean;
  actionMode: ActionMode;
  playerIdx: number;
  onHandCardClick: (playerIdx: number, cardId: string, handIndex: number) => void;
  onFieldCardClick: (playerIdx: number, zone: Zone, cardId: string) => void;
  onDeploy: (playerIdx: number, handIndex: number) => void;
  onSummon: (playerIdx: number, handIndex: number, zone: Zone | "base") => void;
  onMove: (playerIdx: number, fromZone: Zone, cardId: string, toZone: Zone) => void;
  onMoveCard: (playerIdx: number, fromLoc: Zone | "base", cardId: string, toLoc: Zone | "base") => void;
  attackTarget: AttackTarget | null;
  onConfirmAttack: (targetPlayerIdx: number, targetZone: Zone, targetCardId?: string) => void;
  onZoneAttack: (zone: Zone) => void;
  onZoneSkip: (zone: Zone) => void;
  onCardHover: (card: Card | null) => void;
  isEnemy: boolean;
  /** 本回合进场的卡牌 ID 列表（这些卡不能进行战基移动） */
  enteredThisTurn: string[];
  /** 待完成的号召信息（Lv4+需手动撤退时使用） */
  pendingSummon: PendingSummon | null;
  /** 玩家选择撤退一张场上角色或基地盖卡 */
  onSelectRetreat: (cardId: string, loc: Zone | "base") => void;
}
