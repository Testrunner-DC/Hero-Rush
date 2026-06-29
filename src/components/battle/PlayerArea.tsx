/**
 * PlayerArea — 玩家区域核心渲染组件
 *
 * 包含战场区域（renderZone/renderFieldCard）、手牌区域、基地区域。
 * 处理以下交互模式：
 * - handSelect: 选中手牌后在战区空位显示"号召"按钮，基地区显示"部署"按钮
 * - moveMenu: 选中场上角色后显示移动目标选择菜单
 * - pendingSummon (撤退选择): Lv4+号召时玩家手动选择撤退目标
 * - 冲突阶段攻击/跳过/移动逻辑
 */

import { useState, useEffect } from "react";
import type { CardDatabase, Card } from "../../types/card";
import type { PlayerState, Zone } from "../../types/game";
import type { AttackTarget } from "../../game/types";
import type { ActionMode } from "./constants";
import { ZONE_LIST, ZONE_LABELS, ZONE_SHORT } from "./constants";
import type { BoardProps } from "./types";

export default function PlayerArea({
  player, isActive, db, isActionPhase, isConflictPhase, isConflictAdjust, isConflictAttack,
  conflictSubPhase, conflictZonesCompleted, conflictAttackedCards, currentAttackZone, canZoneAttack,
  actionMode, playerIdx,
  onHandCardClick, onFieldCardClick, onDeploy, onSummon, onMove, onMoveCard,
  attackTarget, onConfirmAttack, onZoneAttack, onZoneSkip, onCardHover, isEnemy,
  enteredThisTurn, pendingSummon, onSelectRetreat,
}: BoardProps) {
  const getCard = (id: string): Card | undefined => db.cards.find((c) => c.id === id);

  /** 战区 → 冲突攻击顺序编号 */
  const ZONE_ATTACK_ORDER: Record<Zone, string> = {
    vanguard: "①",
    flankLeft: "②",
    flankRight: "②",
    rear: "③",
  };

  const canActInAction = isActionPhase && isActive;
  const canMoveInConflict = isConflictAdjust && isActive;
  const isSelectingAttackTarget = attackTarget != null && attackTarget.attackerIdx !== playerIdx;

  /** handSelect 模式：当前玩家选中了一张手牌 */
  const handSelect = actionMode.type === "handSelect" && actionMode.playerIdx === playerIdx ? actionMode : null;
  /** moveMenu 模式：当前玩家选中了场上角色 */
  const moveMenu = actionMode.type === "moveMenu" && actionMode.playerIdx === playerIdx ? actionMode : null;
  /** 撤退选择模式：Lv4+号召时，当前玩家需要选择撤退目标 */
  const isRetreatSelectMode = pendingSummon != null && pendingSummon.playerIdx === playerIdx;

  /** 基站移动菜单状态：当前正在选择移动到哪个战区的基地卡 ID */
  const [baseMoveMenu, setBaseMoveMenu] = useState<string | null>(null);

  // 当不再满足移动条件时重置基站移动菜单
  useEffect(() => {
    if (
      (!canActInAction && !canMoveInConflict) ||
      handSelect != null ||
      actionMode.type === "none" ||
      actionMode.type === "moveMenu"  // 场上角色移动菜单打开时关闭基地移动菜单
    ) {
      setBaseMoveMenu(null);
    }
  }, [canActInAction, canMoveInConflict, handSelect, actionMode]);

  // ============================================================
  // 渲染卡牌图片（公共方法）
  // ============================================================

  const renderCardImg = (cardId: string, showStats = false) => {
    const card = getCard(cardId);
    return (
      <>
        {card ? (
          <img
            src={`/cards/${card.id}.png`}
            alt={card.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-stone-200 to-stone-300" />
        )}
        {card && showStats && (
          <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center leading-tight py-0.5">
            {card.power}
          </span>
        )}
      </>
    );
  };

  // ============================================================
  // 渲染场上角色卡
  // ============================================================

  const renderFieldCard = (zone: Zone, cardId: string, i: number) => {
    const card = getCard(cardId);
    const isSelectedAsAttacker = attackTarget?.attackerCardId === cardId && attackTarget?.attackerIdx === playerIdx;
    const hasAttacked = conflictAttackedCards.includes(cardId);
    const isInCurrentAttackZone = isConflictAttack && currentAttackZone === zone && isActive && !isEnemy;
    const isAttackableInConflict = isInCurrentAttackZone && !hasAttacked && !isSelectedAsAttacker;
    const isAttackTargetMode = isSelectingAttackTarget;
    const isAlreadyRetreatSelected = pendingSummon?.selectedRetreatIds.includes(cardId) ?? false;
    const isRetreatSelectable = isRetreatSelectMode && !isAlreadyRetreatSelected;

    return (
      <div
        key={`${cardId}-${i}`}
        className={`relative w-20 rounded border overflow-hidden shadow-md transition ${
          isAlreadyRetreatSelected
            ? "ring-2 ring-red-500 opacity-40 border-red-500/50"
            : isSelectedAsAttacker
            ? "ring-2 ring-red-400 bg-red-500/20 scale-110 z-10"
            : hasAttacked
            ? "opacity-40"
            : isRetreatSelectable
            ? "cursor-pointer hover:ring-2 hover:ring-red-400 hover:shadow-lg hover:scale-105 border-red-400/30"
            : isAttackableInConflict
            ? "cursor-pointer hover:ring-1 hover:ring-orange-400 hover:shadow-lg hover:scale-105"
            : isAttackTargetMode
            ? "cursor-crosshair hover:ring-1 hover:ring-red-500"
            : canActInAction || canMoveInConflict
            ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
            : ""
        } ${!isEnemy && !isActive ? "opacity-60" : ""}`}
        style={{ aspectRatio: "746 / 1041" }}
        onClick={(e) => {
          e.stopPropagation();
          // 撤退选择模式优先
          if (isRetreatSelectMode) {
            if (!isAlreadyRetreatSelected) {
              onSelectRetreat(cardId, zone);
            }
            return;
          }
          if (isSelectingAttackTarget) {
            onConfirmAttack(playerIdx, zone, cardId);
            return;
          }
          if (isAttackableInConflict || canActInAction || canMoveInConflict) {
            onFieldCardClick(playerIdx, zone, cardId);
          }
        }}
        onMouseEnter={() => card && onCardHover(card)}
        onMouseLeave={() => onCardHover(null)}
        title={`${card?.name || cardId} (Lv${card?.cost ?? "?"} 战力${card?.power ?? "?"})`}
      >
        {renderCardImg(cardId, true)}
        {hasAttacked && (
          <span className="absolute top-0.5 right-0.5 text-[10px] text-green-400/70">✓</span>
        )}
        {isAlreadyRetreatSelected && (
          <span className="absolute top-0.5 right-0.5 text-[10px] text-red-400">退</span>
        )}
      </div>
    );
  };

  // ============================================================
  // 渲染战区
  // ============================================================

  const renderZone = (zone: Zone, label: string) => {
    const cards = player.field[zone];
    const isBeingAttacked = isSelectingAttackTarget;
    const isCompleted = conflictZonesCompleted.includes(zone);
    const zoneCanAttack = canZoneAttack(zone);
    const isCurrentAtk = currentAttackZone === zone;
    const showButtons = isConflictAttack && isActive && !isEnemy && !isCompleted;
    const hasUnattackedChars = cards.some((id) => !conflictAttackedCards.includes(id));

    // handSelect 模式下，空区域显示号召按钮
    const showSummonButton = handSelect != null && cards.length === 0 && !isRetreatSelectMode;

    return (
      <div
        className={`relative rounded-lg p-1 flex flex-col items-center justify-center gap-0.5 transition ${
          isCompleted
            ? "bg-green-900/10 border border-green-500/20"
            : isCurrentAtk
            ? "bg-orange-900/20 border border-orange-400/40"
            : isBeingAttacked && cards.length === 0
            ? "border-2 border-dashed border-red-400/60 bg-red-900/20 animate-pulse cursor-crosshair"
            : isBeingAttacked
            ? "bg-white/10 border border-red-400/40 cursor-crosshair"
            : showSummonButton
            ? "bg-amber-900/10 border-2 border-dashed border-amber-400/40"
            : showButtons && zoneCanAttack
            ? "bg-white/5 border border-white/15"
            : "bg-white/5 border border-dashed border-white/10"
        }`}
        style={{ aspectRatio: "4 / 5" }}
        onClick={(e) => {
          e.stopPropagation();
          if (isSelectingAttackTarget) {
            onConfirmAttack(playerIdx, zone);
          }
        }}
      >
        {/* 标签 */}
        <span className={`text-[11px] select-none ${isCompleted ? "text-green-400/50" : "text-white/35"}`}>
          {isConflictAttack && isActive && !isEnemy ? `${ZONE_ATTACK_ORDER[zone]} ${label}` : label}
          {isCompleted && " ✓"}
        </span>

        {/* 卡牌或空位 */}
        {cards.length > 0 ? (
          cards.map((cardId, i) => renderFieldCard(zone, cardId, i))
        ) : (
          !isBeingAttacked && !showSummonButton && (
            <span className="text-[11px] text-white/10 select-none">破绽</span>
          )
        )}

        {/* handSelect 模式：号召按钮 */}
        {showSummonButton && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (handSelect) {
                onSummon(playerIdx, handSelect.handIndex, zone);
              }
            }}
            className="px-4 py-1.5 text-xs rounded bg-amber-600/80 text-amber-50 hover:bg-amber-500 transition font-medium shadow-md"
          >
            ⚔ 号召
          </button>
        )}

        {/* 冲突阶段按钮 */}
        {showButtons && (
          <div className="flex gap-0.5 mt-0.5">
            {hasUnattackedChars && zoneCanAttack && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onZoneAttack(zone);
                }}
                className={`px-2 py-0.5 text-[11px] rounded font-medium transition ${
                  isCurrentAtk
                    ? "bg-orange-500 text-white"
                    : "bg-orange-600/50 text-orange-200 hover:bg-orange-500/70"
                }`}
              >
                ⚔ 攻击
              </button>
            )}
            {zoneCanAttack && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onZoneSkip(zone);
                }}
                className="px-2 py-0.5 text-[11px] rounded bg-stone-600/50 text-white/60 hover:bg-stone-500/70 transition"
              >
                ⏭ 跳过
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // 渲染战场区域（3列布局：左翼紧贴中央，4战区等大）
  // ============================================================

  const borderColor = isEnemy
    ? isActive
      ? "border-t-2 border-t-red-500/50 bg-red-950/10"
      : "border-t border-white/5"
    : isActive
    ? "border-b-2 border-b-blue-500/50 bg-blue-950/10"
    : "border-b border-white/5";

  // 战场3列布局：
  // 我方: 左=flankLeft, 中=vanguard(上)+rear(下), 右=flankRight
  // 敌方: 左=flankLeft, 中=rear(上)+vanguard(下), 右=flankRight
  // 左翼/右翼紧贴中央，4个战区等大

  const renderFieldArea = () => (
    <div className="flex-1 min-h-0 grid grid-cols-[1fr_1fr_1fr] gap-0 p-1.5 relative h-full">
      {/* 左翼 — 紧贴中央列 */}
      <div className="flex items-center justify-center">
        {renderZone("flankLeft", ZONE_SHORT.flankLeft)}
      </div>

      {/* 中央 — 先锋在上，后卫在下（敌方倒置） */}
      <div className="flex flex-col items-center justify-center gap-1.5">
        {isEnemy ? renderZone("rear", ZONE_SHORT.rear) : renderZone("vanguard", ZONE_SHORT.vanguard)}
        {isEnemy ? renderZone("vanguard", ZONE_SHORT.vanguard) : renderZone("rear", ZONE_SHORT.rear)}
      </div>

      {/* 右翼 — 紧贴中央列 */}
      <div className="flex items-center justify-center">
        {renderZone("flankRight", ZONE_SHORT.flankRight)}
      </div>

      {/* 移动菜单 */}
      {moveMenu && (
        <div
          className="absolute z-30 bg-[#0a1120]/95 border border-blue-500/30 rounded-lg shadow-2xl py-1 min-w-[100px] backdrop-blur-sm"
          style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
        >
          <p className="px-3 py-0.5 text-[11px] text-[#667788] font-medium border-b border-[#1e2d42]">移动到</p>
          {ZONE_LIST.filter((z) => z !== moveMenu.zone).map((z) => (
            <button
              key={z}
              onClick={(e) => {
                e.stopPropagation();
                onMove(playerIdx, moveMenu.zone, moveMenu.cardId, z);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-blue-500/20 transition"
            >
              → {ZONE_LABELS[z]}
            </button>
          ))}
          {onMoveCard && (player.baseCards.length + player.baseCovered.length) < 6 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveCard(playerIdx, moveMenu.zone, moveMenu.cardId, "base");
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-amber-300/70 hover:bg-amber-500/20 transition border-t border-white/5"
            >
              → 基地
            </button>
          )}
        </div>
      )}
    </div>
  );

  // ============================================================
  // 渲染手牌区域
  // ============================================================

  const renderHandArea = () => (
    <div className="shrink-0 px-2 py-1.5 bg-black/30 border-y border-[#1e2d42]">
      <div className="flex items-center gap-1.5">
        <span className={`text-[11px] font-bold shrink-0 w-8 ${isEnemy ? "text-red-400/60" : "text-blue-400/60"}`}>
          手牌
        </span>
        <div className="flex gap-1 items-center overflow-x-auto min-h-[140px] flex-1 pb-0.5">
          {player.hand.length === 0 ? (
            <span className="text-xs text-white/15">无</span>
          ) : (
            player.hand.map((cardId, i) => {
              const card = getCard(cardId);
              const isSelected = handSelect?.handIndex === i;
              return (
                <div key={`${cardId}-${i}`} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                  <div
                    className={`w-24 rounded border overflow-hidden shadow-md transition ${
                      canActInAction && !isRetreatSelectMode
                        ? "cursor-pointer hover:border-amber-400 hover:shadow-lg hover:-translate-y-1 hover:z-10"
                        : "border-[#1e2d42]"
                    } ${isSelected ? "ring-2 ring-amber-400 border-amber-400 z-20 scale-105" : ""}`}
                    style={{ aspectRatio: "746 / 1041" }}
                    onClick={() => {
                      if (canActInAction && !isRetreatSelectMode) {
                        onHandCardClick(playerIdx, cardId, i);
                      }
                    }}
                    onMouseEnter={() => card && onCardHover(card)}
                    onMouseLeave={() => onCardHover(null)}
                    title={`${card?.name || cardId} (Lv${card?.cost ?? "?"} 战力${card?.power ?? "?"})`}
                  >
                    {renderCardImg(cardId)}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <span className="text-[11px] text-white/20 ml-auto tabular-nums shrink-0">{player.hand.length}</span>
      </div>
    </div>
  );

  // ============================================================
  // 渲染基地区域
  // ============================================================

  const renderBaseArea = () => {
    const showDeployButton = handSelect != null && !isRetreatSelectMode && (player.baseCards.length + player.baseCovered.length) < 6;

    return (
      <div className="shrink-0 px-2 py-1 bg-black/30 border-y border-[#1e2d42]">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-white/25 font-bold w-8 shrink-0">基地</span>
          <div
            className="flex gap-1 items-center min-h-[114px] flex-1 flex-wrap"
            onClick={() => {
              if (baseMoveMenu) setBaseMoveMenu(null);
            }}
          >
            {player.baseCards.length === 0 && player.baseCovered.length === 0 && !showDeployButton ? (
              <span className="text-xs text-white/10">无 (上限6)</span>
            ) : (
              <>
                {/* ===== 号召至基地的角色（公开信息，双方可见） ===== */}
                {player.baseCards.map((baseCardId) => {
                  const isBaseRetreatSelected = pendingSummon?.selectedRetreatIds.includes(baseCardId) ?? false;
                  const isBaseRetreatSelectable = isRetreatSelectMode && !isBaseRetreatSelected;
                  const baseCard = getCard(baseCardId);
                  return (
                    <div
                      key={baseCardId}
                      className={`relative w-[4.5rem] rounded shrink-0 shadow-md border flex items-center justify-center transition overflow-hidden ${
                        isBaseRetreatSelected
                          ? "ring-2 ring-red-500 opacity-40 border-red-500/50"
                          : isBaseRetreatSelectable
                          ? "cursor-pointer hover:ring-2 hover:ring-red-400 hover:border-red-400/50 border-[#2a3a50]"
                          : baseMoveMenu === baseCardId
                          ? "ring-2 ring-amber-400 border-amber-400 scale-105 z-10"
                          : "border-[#3a5a7a]/60 border-dashed bg-blue-950/20 cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
                      }`}
                      style={{ aspectRatio: "746 / 1041", maxHeight: "110px" }}
                      title={`[号召] ${baseCard?.name || baseCardId} (Lv${baseCard?.cost ?? "?"} 战力${baseCard?.power ?? "?"})`}
                      onClick={(e) => {
                        if (isBaseRetreatSelectable) {
                          e.stopPropagation();
                          onSelectRetreat(baseCardId, "base");
                        } else if ((canActInAction || canMoveInConflict) && !handSelect) {
                          e.stopPropagation();
                          setBaseMoveMenu(baseMoveMenu === baseCardId ? null : baseCardId);
                        } else if (baseCard) {
                          e.stopPropagation();
                          onCardHover(baseCard);
                        }
                      }}
                      onMouseEnter={() => baseCard && onCardHover(baseCard)}
                      onMouseLeave={() => onCardHover(null)}
                    >
                      {baseCard ? (
                        <>
                          <img
                            src={`/cards/${baseCard.id}.png`}
                            alt={baseCard.name}
                            className="w-full h-full object-cover opacity-85"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                          <span className="absolute bottom-0 left-0 right-0 bg-blue-950/70 text-blue-200 text-[10px] text-center leading-tight py-0.5">
                            Lv{baseCard.cost ?? "?"} {baseCard.power ?? "?"}
                          </span>
                          <span className="absolute top-0.5 left-0.5 bg-green-900/80 text-green-300 text-[8px] px-1 py-0.5 rounded-sm font-medium leading-none">
                            号召
                          </span>
                        </>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-stone-200 to-stone-300" />
                      )}
                      {isBaseRetreatSelected && (
                        <span className="absolute top-0.5 right-0.5 text-[10px] text-red-400">退</span>
                      )}
                    </div>
                  );
                })}

                {/* ===== 盖放部署的卡（隐藏信息：仅自己可见，对手不可见） ===== */}
                {player.baseCovered.map((baseCardId) => {
                  const isBaseRetreatSelected = pendingSummon?.selectedRetreatIds.includes(baseCardId) ?? false;
                  const isBaseRetreatSelectable = isRetreatSelectMode && !isBaseRetreatSelected;
                  const baseCard = getCard(baseCardId);
                  const showFaceDown = !isEnemy;
                  return (
                    <div
                      key={baseCardId}
                      className={`relative w-[4.5rem] rounded shrink-0 shadow-md border flex items-center justify-center transition overflow-hidden ${
                        isBaseRetreatSelected
                          ? "ring-2 ring-red-500 opacity-40 border-red-500/50"
                          : isBaseRetreatSelectable
                          ? "cursor-pointer hover:ring-2 hover:ring-red-400 hover:border-red-400/50 border-[#2a3a50]"
                          : baseMoveMenu === baseCardId
                          ? "ring-2 ring-amber-400 border-amber-400 scale-105 z-10"
                          : showFaceDown
                          ? "border-[#1e2d42] cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
                          : "border-[#1e2d42]"
                      }`}
                      style={{ aspectRatio: "746 / 1041", maxHeight: "110px" }}
                      title={showFaceDown
                        ? `[部署] ${baseCard?.name || baseCardId} (Lv${baseCard?.cost ?? "?"} 战力${baseCard?.power ?? "?"})`
                        : "盖放的基地卡"}
                      onClick={(e) => {
                        if (isBaseRetreatSelectable) {
                          e.stopPropagation();
                          onSelectRetreat(baseCardId, "base");
                        } else if ((canActInAction || canMoveInConflict) && !handSelect && showFaceDown) {
                          e.stopPropagation();
                          setBaseMoveMenu(baseMoveMenu === baseCardId ? null : baseCardId);
                        }
                      }}
                      onMouseEnter={() => showFaceDown && baseCard && onCardHover(baseCard)}
                      onMouseLeave={() => showFaceDown && onCardHover(null)}
                    >
                      {showFaceDown ? (
                        <>
                          {baseCard ? (
                            <img
                              src={`/cards/${baseCard.id}.png`}
                              alt={baseCard.name}
                              className="w-full h-full object-cover opacity-60"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-stone-600 to-stone-700" />
                          )}
                          <span className="absolute top-0.5 left-0.5 bg-stone-800/90 text-stone-300 text-[8px] px-1 py-0.5 rounded-sm font-medium leading-none">
                            部署
                          </span>
                        </>
                      ) : (
                        <span className="text-white/20 text-lg">🔒</span>
                      )}
                      {isBaseRetreatSelected && (
                        <span className="absolute top-0.5 right-0.5 text-[10px] text-red-400">退</span>
                      )}
                    </div>
                  );
                })}

                {/* 基站移动菜单：基地卡 → 战区 */}
                {baseMoveMenu && onMoveCard && (() => {
                  const availableZones = ZONE_LIST.filter((z) => player.field[z].length < 1);
                  return (
                    <div
                      className="absolute z-30 bg-[#0a1120]/95 border border-amber-500/30 rounded-lg shadow-2xl py-1 min-w-[100px] backdrop-blur-sm"
                      style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
                    >
                      <p className="px-3 py-0.5 text-[11px] text-amber-400/70 font-medium border-b border-amber-500/20">
                        移动到战区
                      </p>
                      {availableZones.length === 0 ? (
                        <p className="px-3 py-1.5 text-[11px] text-white/20">无可用位置</p>
                      ) : (
                        availableZones.map((z) => (
                          <button
                            key={z}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveCard(playerIdx, "base", baseMoveMenu, z);
                              setBaseMoveMenu(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-amber-300/70 hover:bg-amber-500/20 transition"
                          >
                            → {ZONE_LABELS[z]}
                          </button>
                        ))
                      )}
                    </div>
                  );
                })()}

                {/* handSelect 模式：部署/号召至基地按钮 */}
                {showDeployButton && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (handSelect) {
                          onDeploy(playerIdx, handSelect.handIndex);
                        }
                      }}
                      className="px-3 py-1.5 text-[11px] rounded bg-stone-600/80 text-stone-50 hover:bg-stone-500 transition font-medium shadow-md whitespace-nowrap"
                    >
                      🏚️ 部署
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (handSelect) {
                          onSummon(playerIdx, handSelect.handIndex, "base");
                        }
                      }}
                      className="px-3 py-1.5 text-[11px] rounded bg-green-600/80 text-green-50 hover:bg-green-500 transition font-medium shadow-md whitespace-nowrap"
                    >
                      🏠 号召至基地
                    </button>
                  </div>
                )}
              </>
            )}
            <span className="text-[11px] text-white/15 tabular-nums ml-auto">{(player.baseCards.length + player.baseCovered.length)}/6</span>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // 布局：我方(下) 战场→基地→手牌；敌方(上) 手牌→基地→战场
  // ============================================================

  return (
    <div className={`relative flex-1 flex flex-col border-l-2 border-r-2 ${borderColor} overflow-hidden`}>
      {isEnemy ? (
        <>
          {renderHandArea()}
          {renderBaseArea()}
          {renderFieldArea()}
        </>
      ) : (
        <>
          {renderFieldArea()}
          {renderBaseArea()}
          {renderHandArea()}
        </>
      )}
    </div>
  );
}
