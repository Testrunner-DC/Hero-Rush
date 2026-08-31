import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BattleBaseLocationV2, BattleViewV2, CardDatabase, FieldZoneV2, PlayerIndex, PlayerViewV2, VisibleCardV2 } from "@hero-rush/game-core";
import type { GameCommandV2Message } from "@hero-rush/protocol";
import CardDetailSidebar from "../CardDetailSidebar";
import ActionPanelV2 from "./ActionPanelV2";
import BattlePanelV2 from "./BattlePanelV2";
import MulliganPanelV2 from "./MulliganPanelV2";
import PlayerBoardV2, { type CardEmphasisV2 } from "./PlayerBoardV2";

const STAGE_WIDTH = 1440;
const STAGE_HEIGHT = 900;
const DETAIL_INSET_CSS_VAR = "--hero-rush-v2-detail-inset";

interface BattleScreenV2Props {
  view: BattleViewV2;
  db: CardDatabase;
  submitting?: boolean;
  omniscient?: boolean;
  orientationSeat?: PlayerIndex;
  events?: readonly unknown[];
  onSubmitMulligan: (cardIds: string[]) => void;
  onSubmitGameCommand: (command: GameCommandV2Message) => void;
}

const eventLabels: Record<string, string> = {
  MULLIGAN_SUBMITTED: "完成起始调度",
  TURN_CARDS_DRAWN: "完成回合抽牌",
  CARDS_DISCARDED: "舍弃卡牌",
  CARDS_RETREATED: "卡牌撤退",
  CARDS_BANISHED: "裁剪卡牌",
  CARDS_REVEALED: "展示卡牌",
  CARDS_COVERED: "盖伏卡牌",
  BASE_CARD_FLIPPED: "翻开基地盖卡",
  CARDS_PLACED_IN_BASE: "效果放置基地",
  CARD_PLACED_FIELD_BY_EFFECT: "效果放置战区",
  CARD_MOVED_TO_DECK_BOTTOM: "卡牌移至主卡组底",
  CARD_VALUE_CHANGED: "角色数值变化",
  EFFECT_USE_MARKED: "记录回合一次",
  BASE_DEPLOYED: "背面部署基地卡",
  CHARACTER_SUMMONED: "号召角色",
  SUMMON_PAYMENT_CANCELLED: "取消高等级号召",
  EFFECT_TARGETS_CANCELLED: "取消效果发动",
  SUMMON_DESTINATION_REQUESTED: "高等级号召支付完成，选择位置",
  BATTLE_BASE_MOVED: "移动角色",
  ACTION_PHASE_ENDED: "结束行动阶段",
  BATTLE_PHASE_STARTED: "进入战斗阶段",
  BATTLE_LAYOUT_SUBMITTED: "完成战区调整",
  FLANK_ATTACKER_CHOSEN: "选择先攻击的侧翼",
  ATTACK_DECLARED: "宣告攻击",
  ATTACK_OPPORTUNITY_PASSED: "放弃攻击机会",
  PRIORITY_PASSED: "放弃应对",
  BREACH_HIT: "破绽命中",
  CHARACTERS_RETREATED_BY_BATTLE: "角色因战斗撤退",
  CHARACTER_BATTLE_RESOLVED: "角色战斗判定完成",
  TURN_ENDED: "结束回合",
  EFFECT_QUEUED: "卡牌效果进入处理",
  EFFECT_RESOLVED: "卡牌效果处理完成",
  STATE_BASED_RETREAT: "角色因状态撤退",
  GAME_WON: "对局结束",
};

function battleEventText(event: unknown, view: BattleViewV2, db: CardDatabase): string {
  if (!event || typeof event !== "object") return "收到对局更新";
  const value = event as Record<string, unknown>;
  const type = typeof value.type === "string" ? value.type : "UNKNOWN";
  const actor = value.actor === 0 || value.actor === 1 ? view.players[value.actor].name : "系统";
  const count = typeof value.count === "number" ? ` · ${value.count} 张` : "";
  const revealed = type === "CARDS_REVEALED" && Array.isArray(value.cards)
    ? ` · ${value.cards.map((item) => {
        const definitionId = item && typeof item === "object" ? (item as Record<string, unknown>).definitionId : null;
        return typeof definitionId === "string" ? db.cards.find((card) => card.id === definitionId)?.name ?? definitionId : "未知卡牌";
      }).join("、")}`
    : "";
  return `${actor} · ${eventLabels[type] ?? type}${count}${revealed}`;
}

function flowLabel(kind: BattleViewV2["flow"]["kind"]): string {
  const labels: Partial<Record<BattleViewV2["flow"]["kind"], string>> = {
    SETUP_MULLIGAN: "起始调度",
    TURN_START: "回合开始",
    ACTION: "行动阶段",
    BATTLE_START: "战斗阶段",
    BATTLE_ADJUST: "战区调整",
    BATTLE_NEXT: "战斗阶段",
    BATTLE_FLANK_CHOICE: "选择侧翼",
    BATTLE_ATTACK: "攻击机会",
    BATTLE_TARGET: "选择目标",
    BATTLE_RESPONSE: "战斗应对",
    TURN_RESPONSE_START: "回合应对",
    TURN_RESPONSE: "回合应对",
    END_TRIGGER: "回合结束",
    END_EXPIRE: "回合结束",
    END_DISCARD: "回合结束",
    TURN_SWITCH: "回合结束",
    FINISHED: "对局结束",
  };
  return labels[kind] ?? kind;
}

function RailPanel({ title, children, className = "", side = "neutral" }: { title: string; children: React.ReactNode; className?: string; side?: "self" | "opponent" | "neutral" }) {
  const tone = side === "self"
    ? "border-red-300 bg-red-50/80 text-red-800"
    : side === "opponent"
      ? "border-blue-300 bg-blue-50/80 text-blue-800"
      : "border-stone-200 bg-stone-100/85 text-stone-500";
  return <section className={`overflow-hidden rounded-lg border border-stone-300 bg-white/90 shadow-[0_6px_16px_rgba(55,38,30,.12)] ${className}`}><h2 className={`border-b px-3 py-2 text-[9px] font-bold tracking-[.15em] ${tone}`}>{title}</h2>{children}</section>;
}

const fieldZones: FieldZoneV2[] = ["vanguard", "flankLeft", "flankRight", "rear"];

function CombatOverlayV2({ view, selfSeat }: { view: BattleViewV2; selfSeat: PlayerIndex }) {
  const combat = view.combat;
  const overlayRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const battlefield = overlay?.parentElement;
    const target = combat?.target;
    if (!overlay || !battlefield || !target) {
      setLine(null);
      return;
    }
    const update = () => {
      const cardElements = [...battlefield.querySelectorAll<HTMLElement>("[data-card-instance]")];
      const attackerElement = cardElements.find((element) => element.dataset.cardInstance === combat.attacker.cardId);
      const targetElement = target.kind === "character"
        ? cardElements.find((element) => element.dataset.cardInstance === target.cardId)
        : battlefield.querySelector<HTMLElement>(`[data-seat="${target.seat}"]`)?.querySelector<HTMLElement>(`[data-zone="${target.zone}"]`);
      if (!attackerElement || !targetElement) {
        setLine(null);
        return;
      }
      const battlefieldRect = battlefield.getBoundingClientRect();
      const attackerRect = attackerElement.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      setLine({
        x1: attackerRect.left + attackerRect.width / 2 - battlefieldRect.left,
        y1: attackerRect.top + attackerRect.height / 2 - battlefieldRect.top,
        x2: targetRect.left + targetRect.width / 2 - battlefieldRect.left,
        y2: targetRect.top + targetRect.height / 2 - battlefieldRect.top,
        width: battlefieldRect.width,
        height: battlefieldRect.height,
      });
    };
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(battlefield);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [combat?.attacker.cardId, combat?.target]);
  if (!combat) return null;
  const priorityName = combat.priorityPlayer === null ? null : view.players[combat.priorityPlayer].name;
  const attackerColor = combat.attacker.seat === selfSeat ? "#dc2626" : "#2563eb";
  const targetColor = combat.attacker.seat === selfSeat ? "#2563eb" : "#dc2626";
  const curve = line ? (() => {
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const bend = Math.min(38, distance * 0.1);
    return {
      x: (line.x1 + line.x2) / 2 - (dy / distance) * bend,
      y: (line.y1 + line.y2) / 2 + (dx / distance) * bend,
    };
  })() : null;
  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-30" data-ui-contract="hero-rush-v2-combat-presentation">
      {line && (
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${line.width} ${line.height}`} preserveAspectRatio="none" aria-hidden="true" data-ui-contract="hero-rush-v2-accurate-attack-line">
          <defs>
            <linearGradient id="battle-line-gradient-v2" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor={attackerColor} /><stop offset="100%" stopColor={targetColor} /></linearGradient>
            <marker id="battle-arrow-v2" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9,4.5 L0,9 z" fill={targetColor} /></marker>
          </defs>
          {curve && <path d={`M ${line.x1} ${line.y1} Q ${curve.x} ${curve.y} ${line.x2} ${line.y2}`} fill="none" stroke="url(#battle-line-gradient-v2)" strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#battle-arrow-v2)" />}
        </svg>
      )}
      {combat.target && <div className="absolute right-[176px] top-1/2 w-[112px] -translate-y-1/2 rounded-lg border border-rose-300/60 bg-stone-950/95 px-2 py-2 text-center text-white shadow-[0_0_18px_rgba(225,29,72,.28)] backdrop-blur" data-ui-contract="hero-rush-v2-battle-notice-lane">
        <div className="grid gap-0.5 text-[9px] font-black">
          <span className="text-amber-200">攻击 {combat.attacker.power}</span>
          <span className="text-rose-100">→ {combat.target.kind === "character" ? `防守 ${combat.target.power}` : "破绽"}</span>
        </div>
        <div className="mt-1 text-[7px] leading-3 text-white/55">R{combat.attacker.range}{combat.distance === null ? "" : ` · 距离 ${combat.distance}`}{priorityName ? <><br />优先权：{priorityName}</> : null}{combat.consecutivePasses ? <><br />连续放弃 {combat.consecutivePasses}</> : null}</div>
      </div>}
    </div>
  );
}

type PhaseRailStepV2 = {
  label: string;
  role?: "phase" | "reminder";
};

function PhaseRailV2({ view, steps, selfSeat }: { view: BattleViewV2; steps: readonly PhaseRailStepV2[]; selfSeat: PlayerIndex }) {
  const current = flowLabel(view.flow.kind);
  const activeSide = view.activePlayer === selfSeat ? "self" : "opponent";
  return (
    <aside className="flex min-h-0 flex-col items-center rounded-lg border border-stone-300 bg-gradient-to-b from-blue-50/90 via-white/95 to-red-50/90 px-2 py-3 shadow-[0_6px_16px_rgba(55,38,30,.12)]" data-active-side={activeSide} data-ui-contract="hero-rush-v2-vertical-phase-rail">
      <span className="text-[8px] font-bold tracking-[.18em] text-stone-400">阶段</span>
      <div className="mt-3 grid w-full flex-1 content-center gap-2">
        {steps.map((step) => {
          const active = current.includes(step.label.slice(0, 2));
          const reminder = step.role === "reminder";
          return (
            <span
              key={step.label}
              aria-label={reminder ? `${step.label}（战区整体调整提醒，非独立阶段）` : step.label}
              data-phase-role={step.role ?? "phase"}
              title={reminder ? "战区整体调整提醒（非独立阶段）" : undefined}
              className={`grid min-h-[38px] place-items-center rounded px-1 text-center text-[8px] font-bold leading-3 ${active ? activeSide === "self" ? "bg-red-600 text-white shadow" : "bg-blue-600 text-white shadow" : reminder ? "border border-dashed border-stone-300 bg-white/75 text-stone-500" : "bg-white/70 text-stone-400"}`}
            >
              {step.label}
            </span>
          );
        })}
      </div>
      <div className="mt-3 w-full rounded bg-stone-950 px-1 py-2 text-center text-white"><b className="block font-mono text-xs">{view.turnNumber}</b><span className="text-[7px] text-white/55">回合</span></div>
    </aside>
  );
}

export default function BattleScreenV2({ view, db, submitting = false, omniscient = false, orientationSeat, events = [], onSubmitMulligan, onSubmitGameCommand }: BattleScreenV2Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [compactViewport, setCompactViewport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [summonPlacementCardId, setSummonPlacementCardId] = useState<string | null>(null);
  const [baseChoiceCardId, setBaseChoiceCardId] = useState<string | null>(null);
  const [baseChoiceMinimized, setBaseChoiceMinimized] = useState(false);
  const [battleLayout, setBattleLayout] = useState<Record<FieldZoneV2, string | null>>(() => Object.fromEntries(fieldZones.map((zone) => [zone, view.players[view.viewer].field[zone][0]?.instanceId ?? null])) as Record<FieldZoneV2, string | null>);
  const [focusedCard, setFocusedCard] = useState<VisibleCardV2 | null>(null);
  const decisionId = view.pendingDecision?.id;
  const cardByDefinitionId = useMemo(() => new Map(db.cards.map((card) => [card.id, card])), [db]);
  const actor = view.viewer;
  const bottomSeat = orientationSeat ?? actor;
  const topSeat: PlayerIndex = bottomSeat === 0 ? 1 : 0;
  const focusedDefinition = focusedCard ? cardByDefinitionId.get(focusedCard.definitionId) : undefined;
  const eventLines = useMemo(() => events.slice(-30).map((event) => battleEventText(event, view, db)).reverse(), [db, events, view]);
  const attackAction = view.legalActions.find((action) => action.type === "DECLARE_ATTACK");
  const legalSourceIds = useMemo(() => new Set(view.legalActions.flatMap((action) => {
    if (action.type === "DEPLOY_BASE" || action.type === "SUMMON_CHARACTER" || action.type === "MOVE_BATTLE_BASE") return [action.cardId];
    if (action.type === "ACTIVATE_EFFECT") return [action.sourceCardId];
    if (action.type === "ACTIVATE_KEYWORD") return [action.sourceCardId];
    return [];
  })), [view.legalActions]);
  const attackTargetCardIds = useMemo(() => new Set(attackAction?.targets.flatMap((target) => target.kind === "character" ? [target.cardId] : []) ?? []), [attackAction]);
  const selectable = useMemo(() => {
    if (view.pendingDecision?.kind === "MULLIGAN") return new Set<string>();
    if (view.pendingDecision) return new Set(view.pendingDecision.choices);
    if (view.flow.kind === "BATTLE_ADJUST" && view.activePlayer === actor) return new Set(Object.values(view.players[actor].field).flat().map((card) => card.instanceId));
    if (view.flow.kind === "BATTLE_FLANK_CHOICE" && view.activePlayer === actor) return new Set(view.flow.choices.flatMap((zone) => view.players[actor].field[zone].map((card) => card.instanceId)));
    return new Set([...legalSourceIds, ...attackTargetCardIds]);
  }, [actor, attackTargetCardIds, legalSourceIds, view.activePlayer, view.flow.kind, view.pendingDecision, view.players]);
  const cardEmphasis = useMemo(() => {
    const emphasis = new Map<string, CardEmphasisV2>();
    if (view.flow.kind === "BATTLE_ADJUST" && view.activePlayer === actor) {
      for (const card of Object.values(view.players[actor].field).flat()) emphasis.set(card.instanceId, "adjustable");
    }
    if (view.pendingDecision?.kind === "EFFECT_TARGETS") {
      for (const cardId of view.pendingDecision.choices) emphasis.set(cardId, "effect-target");
    }
    if (view.combat?.attacker.cardId) emphasis.set(view.combat.attacker.cardId, "attacker");
    if (view.combat?.target?.kind === "character") emphasis.set(view.combat.target.cardId, "battle-target");
    if (view.flow.kind === "BATTLE_FLANK_CHOICE" && view.activePlayer === actor) {
      for (const zone of view.flow.choices) for (const card of view.players[actor].field[zone]) emphasis.set(card.instanceId, "attacker");
    }
    return emphasis;
  }, [actor, view.activePlayer, view.combat, view.flow, view.pendingDecision, view.players]);
  const responsePriority = view.flow.kind === "BATTLE_RESPONSE" || view.flow.kind === "TURN_RESPONSE" ? view.flow.priority : null;
  const adjustingBattleLayout = view.flow.kind === "BATTLE_ADJUST" && view.activePlayer === actor;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      const { width, height } = viewport.getBoundingClientRect();
      const compact = width < 820;
      const nextScale = compact
        ? Math.max(0.78, Math.min(1, height / STAGE_HEIGHT))
        : Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
      const stageLeft = compact ? 8 : Math.max(0, (width - STAGE_WIDTH * nextScale) / 2);
      const phaseRailLeft = stageLeft + (12 + 220 + 12) * nextScale;
      setCompactViewport(compact);
      setScale(nextScale);
      document.documentElement.style.setProperty(DETAIL_INSET_CSS_VAR, `${Math.max(176, Math.round(phaseRailLeft - 8))}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    update();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(DETAIL_INSET_CSS_VAR);
    };
  }, []);

  useLayoutEffect(() => {
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo({ top: 0, left: 0 });
  }, [decisionId, view.flow.kind, view.revision]);

  useEffect(() => {
    setSelected(new Set());
    setSummonPlacementCardId(null);
    setBaseChoiceCardId(null);
  }, [decisionId, view.revision]);
  useEffect(() => setBaseChoiceMinimized(false), [baseChoiceCardId]);
  useEffect(() => {
    if (!adjustingBattleLayout) return;
    setBattleLayout(Object.fromEntries(fieldZones.map((zone) => [zone, view.players[actor].field[zone][0]?.instanceId ?? null])) as Record<FieldZoneV2, string | null>);
  }, [actor, adjustingBattleLayout, view.revision]);
  useEffect(() => {
    const allVisible = [...view.players[0].hand, ...view.players[0].baseCards, ...view.players[0].baseCovered, ...Object.values(view.players[0].field).flat(), ...view.players[1].hand, ...view.players[1].baseCards, ...view.players[1].baseCovered, ...Object.values(view.players[1].field).flat()];
    if (!focusedCard || !allVisible.some((card) => card.instanceId === focusedCard.instanceId)) setFocusedCard(allVisible[0] ?? null);
  }, [focusedCard, view.players, view.revision]);

  const toggleSelection = (instanceId: string) => {
    if (submitting) return;
    if (!view.pendingDecision) {
      const deselecting = selected.has(instanceId);
      setSelected(deselecting ? new Set() : new Set([instanceId]));
      const canSummon = view.legalActions.some((action) => action.type === "SUMMON_CHARACTER" && action.cardId === instanceId);
      const summonCard = view.players[actor].hand.find((card) => card.instanceId === instanceId);
      setSummonPlacementCardId(!deselecting && canSummon && (summonCard?.effectiveLevel ?? 0) < 4 ? instanceId : null);
      setBaseChoiceCardId(null);
      return;
    }
    setSummonPlacementCardId(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(instanceId)) next.delete(instanceId);
      else {
        const max = view.pendingDecision?.max ?? 1;
        if (next.size < max) next.add(instanceId);
      }
      return next;
    });
  };

  const toggleCard = (instanceId: string) => {
    if (!selectable.has(instanceId) || submitting) return;
    const directResponse = responsePriority === actor && view.players[actor].hand.some((card) => card.instanceId === instanceId)
      ? view.legalActions.find((action) => action.type === "ACTIVATE_EFFECT" && action.sourceCardId === instanceId)
      : undefined;
    if (directResponse?.type === "ACTIVATE_EFFECT" && directResponse.effectIds.length === 1) {
      onSubmitGameCommand({ type: "ACTIVATE_EFFECT", sourceCardId: instanceId, effectId: directResponse.effectIds[0] });
      return;
    }
    if (view.flow.kind === "BATTLE_FLANK_CHOICE" && view.activePlayer === actor) {
      const zone = view.flow.choices.find((choice) => view.players[actor].field[choice].some((card) => card.instanceId === instanceId));
      if (zone) onSubmitGameCommand({ type: "CHOOSE_FLANK_ATTACKER", zone });
      return;
    }
    if (adjustingBattleLayout) {
      const first = selected.size === 1 ? [...selected][0] : null;
      if (!first || first === instanceId) {
        setSelected(first === instanceId ? new Set() : new Set([instanceId]));
        return;
      }
      const firstZone = fieldZones.find((zone) => battleLayout[zone] === first);
      const secondZone = fieldZones.find((zone) => battleLayout[zone] === instanceId);
      if (firstZone && secondZone) {
        setBattleLayout((current) => ({ ...current, [firstZone]: current[secondZone], [secondZone]: current[firstZone] }));
      }
      setSelected(new Set());
      return;
    }
    const directTarget = attackAction?.targets.find((target) => target.kind === "character" && target.cardId === instanceId);
    if (directTarget && attackAction) {
      onSubmitGameCommand({ type: "DECLARE_ATTACK", attackerId: attackAction.attackerId, target: directTarget });
      return;
    }
    toggleSelection(instanceId);
  };

  const selectedId = selected.size === 1 ? [...selected][0] : null;
  const selectedSummon = (selectedId ? view.legalActions.find((action) => action.type === "SUMMON_CHARACTER" && action.cardId === selectedId) : undefined) as Extract<BattleViewV2["legalActions"][number], { type: "SUMMON_CHARACTER" }> | undefined;
  const selectedSummonCard = selectedId ? view.players[actor].hand.find((card) => card.instanceId === selectedId) : undefined;
  const selectedDeploy = (selectedId ? view.legalActions.find((action) => action.type === "DEPLOY_BASE" && action.cardId === selectedId) : undefined) as Extract<BattleViewV2["legalActions"][number], { type: "DEPLOY_BASE" }> | undefined;
  const selectedMove = (selectedId ? view.legalActions.find((action) => action.type === "MOVE_BATTLE_BASE" && action.cardId === selectedId) : undefined) as Extract<BattleViewV2["legalActions"][number], { type: "MOVE_BATTLE_BASE" }> | undefined;
  const selectedEffect = (selectedId ? view.legalActions.find((action) => action.type === "ACTIVATE_EFFECT" && action.sourceCardId === selectedId) : undefined) as Extract<BattleViewV2["legalActions"][number], { type: "ACTIVATE_EFFECT" }> | undefined;
  const activeSummon = selectedSummon && selectedSummon.cardId === summonPlacementCardId ? selectedSummon : undefined;
  const pendingEffectDestinationChoices = view.pendingDecision?.kind === "EFFECT_TARGETS"
    ? view.pendingDecision.choices.filter((choice) => choice.startsWith("zone:")).map((choice) => choice.replace(/^zone:/, "") as BattleBaseLocationV2)
    : [];
  const pendingSummonDestinationChoices = view.pendingDecision?.kind === "SUMMON_DESTINATION"
    ? view.pendingDecision.choices.map((choice) => choice.replace(/^zone:/, "") as BattleBaseLocationV2)
    : [];
  const selectedEffectTargetId = view.pendingDecision?.kind === "EFFECT_TARGETS"
    ? [...selected].find((choice) => !choice.startsWith("zone:")) ?? null
    : null;
  const selectedEffectTargetInBase = selectedEffectTargetId
    ? view.players[actor].baseCards.some((card) => card.instanceId === selectedEffectTargetId)
      || view.players[actor].baseCovered.some((card) => card.instanceId === selectedEffectTargetId)
    : false;
  const selectedEffectTargetInField = selectedEffectTargetId
    ? Object.values(view.players[actor].field).flat().some((card) => card.instanceId === selectedEffectTargetId)
    : false;
  const effectTargetableDestinations = view.pendingDecision?.kind === "EFFECT_TARGETS" && view.pendingDecision.choiceKind === "field_location"
    ? pendingEffectDestinationChoices
    : selectedEffectTargetId
      ? pendingEffectDestinationChoices.filter((destination) => selectedEffectTargetInBase ? destination !== "base" : selectedEffectTargetInField ? destination === "base" : true)
      : [];
  const targetableDestinations = new Set<BattleBaseLocationV2>([
    ...(activeSummon?.destinations ?? []),
    ...(selectedMove?.destinations ?? []),
    ...(selectedDeploy ? ["base" as const] : []),
    ...effectTargetableDestinations,
    ...pendingSummonDestinationChoices,
    ...(adjustingBattleLayout && selectedId ? fieldZones : []),
  ]);
  const targetableBreachZones = new Set<FieldZoneV2>(attackAction?.targets.flatMap((target) => target.kind === "breach" ? [target.zone] : []) ?? []);
  const displayedSelection = new Set(selected);
  if (attackAction) displayedSelection.add(attackAction.attackerId);
  const canShowSelectedCardActions = view.flow.kind === "ACTION" || responsePriority === actor;
  const cardActions = canShowSelectedCardActions && selectedId && (selectedDeploy || selectedSummon || selectedEffect) ? {
    cardId: selectedId,
    canDeploy: Boolean(selectedDeploy),
    canSummon: Boolean(selectedSummon),
    effectIds: selectedEffect?.effectIds ?? [],
    effectLabel: responsePriority === actor ? "应对·起动" : "起动效果",
    onDeploy: () => onSubmitGameCommand({ type: "DEPLOY_BASE", cardId: selectedId }),
    onSummon: () => selectedSummonCard && selectedSummonCard.effectiveLevel >= 4
      ? onSubmitGameCommand({ type: "SUMMON_CHARACTER", cardId: selectedId })
      : setSummonPlacementCardId(selectedId),
    onActivateEffect: (effectId: string) => onSubmitGameCommand({ type: "ACTIVATE_EFFECT", sourceCardId: selectedId, effectId }),
  } : undefined;
  const submitDestination = (destination: BattleBaseLocationV2) => {
    const effectChoice = `zone:${destination}`;
    if (adjustingBattleLayout && destination !== "base" && selectedId) {
      const sourceZone = fieldZones.find((zone) => battleLayout[zone] === selectedId);
      if (!sourceZone || sourceZone === destination) {
        setSelected(new Set());
        return;
      }
      setBattleLayout((current) => ({
        ...current,
        [sourceZone]: current[destination],
        [destination]: selectedId,
      }));
      setSelected(new Set());
    }
    else if (view.pendingDecision?.kind === "SUMMON_DESTINATION" && view.pendingDecision.choices.includes(effectChoice)) {
      onSubmitGameCommand({ type: "ANSWER_DECISION", decisionId: view.pendingDecision.id, cardIds: [effectChoice] });
    }
    else if (view.pendingDecision?.kind === "EFFECT_TARGETS" && view.pendingDecision.choices.includes(effectChoice) && view.pendingDecision.choiceKind === "field_location") {
      onSubmitGameCommand({ type: "ANSWER_DECISION", decisionId: view.pendingDecision.id, cardIds: [effectChoice] });
    }
    else if (view.pendingDecision?.kind === "EFFECT_TARGETS" && view.pendingDecision.choices.includes(effectChoice)) toggleSelection(effectChoice);
    else if (destination === "base" && activeSummon && selectedDeploy) setBaseChoiceCardId(activeSummon.cardId);
    else if (activeSummon) onSubmitGameCommand({ type: "SUMMON_CHARACTER", cardId: activeSummon.cardId, destination });
    else if (destination === "base" && selectedDeploy && selectedId) onSubmitGameCommand({ type: "DEPLOY_BASE", cardId: selectedId });
    else if (selectedMove) onSubmitGameCommand({ type: "MOVE_BATTLE_BASE", cardId: selectedMove.cardId, from: selectedMove.from, destination });
  };
  const submitBreach = (zone: FieldZoneV2) => {
    if (attackAction?.targets.some((target) => target.kind === "breach" && target.zone === zone)) {
      onSubmitGameCommand({ type: "DECLARE_ATTACK", attackerId: attackAction.attackerId, target: { kind: "breach", zone } });
    }
  };

  const boardPlayers: [PlayerViewV2, PlayerViewV2] = (() => {
    if (!adjustingBattleLayout) return view.players;
    const cards = new Map(Object.values(view.players[actor].field).flat().map((card) => [card.instanceId, card]));
    const adjustedPlayer: PlayerViewV2 = {
      ...view.players[actor],
      field: Object.fromEntries(fieldZones.map((zone) => {
        const card = battleLayout[zone] ? cards.get(battleLayout[zone]!) : undefined;
        return [zone, card ? [card] : []];
      })) as PlayerViewV2["field"],
    };
    return actor === 0 ? [adjustedPlayer, view.players[1]] : [view.players[0], adjustedPlayer];
  })();
  const layoutConfirmControl = adjustingBattleLayout ? (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setSelected(new Set());
        onSubmitGameCommand({ type: "SUBMIT_BATTLE_LAYOUT", layout: battleLayout });
      }}
      disabled={submitting}
      className="whitespace-nowrap rounded-md border-0 bg-violet-600 px-3 py-2 text-[10px] font-black text-white shadow-[0_5px_15px_rgba(91,33,182,.38)] transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-55"
      data-ui-contract="hero-rush-v2-confirm-layout"
    >{submitting ? "确认中…" : "确认布局"}</button>
  ) : undefined;

  const phaseSteps: readonly PhaseRailStepV2[] = [
    { label: "回合开始" },
    { label: "抽卡" },
    { label: "行动" },
    { label: "调整", role: "reminder" },
    { label: "战斗" },
    { label: "应对" },
    { label: "回合结束" },
  ];
  return (
    <div ref={viewportRef} className={`relative h-full min-h-[480px] bg-[radial-gradient(circle_at_18%_50%,rgba(185,28,28,.09),transparent_31%),radial-gradient(circle_at_80%_42%,rgba(120,113,108,.11),transparent_34%),#eeeae4] text-stone-900 ${compactViewport ? "overflow-auto overscroll-contain" : "overflow-hidden"}`} data-ui-contract="hero-rush-v2-fit-viewport">
      <div className={compactViewport ? "relative m-2" : "absolute left-1/2 top-1/2"} style={{ width: STAGE_WIDTH * scale, height: STAGE_HEIGHT * scale, transform: compactViewport ? undefined : "translate(-50%, -50%)" }}>
      <div style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }} data-ui-contract="hero-rush-v2-1440x900-stage">
        <div className="grid h-full grid-cols-[220px_62px_minmax(0,1fr)_200px] gap-3 p-3">
          <aside aria-hidden="true" data-ui-contract="hero-rush-v2-card-detail-reserved-column" />

          <PhaseRailV2 view={view} steps={phaseSteps} selfSeat={bottomSeat} />

          <main className="relative grid min-h-0 grid-rows-2 gap-2 rounded-xl border border-stone-400/70 bg-[linear-gradient(to_bottom,rgba(219,234,254,.52)_0%,rgba(245,245,244,.62)_48%,rgba(254,226,226,.52)_52%,rgba(245,245,244,.62)_100%)] p-2 shadow-[inset_0_0_60px_rgba(82,59,47,.13),0_10px_28px_rgba(52,35,28,.18)]" data-ui-contract="hero-rush-v2-battlefield">
            <PlayerBoardV2 player={boardPlayers[topSeat]} db={db} playerSeat={topSeat} viewerOwnsBoard={omniscient || topSeat === actor} perspective="opponent" activeTurn={topSeat === view.activePlayer} cardByDefinitionId={cardByDefinitionId} attachments={view.attachments} selectedCardIds={displayedSelection} selectableCardIds={selectable} cardEmphasis={cardEmphasis} onCardClick={toggleCard} onCardFocus={setFocusedCard} targetableDestinations={topSeat === actor ? targetableDestinations : undefined} targetableBreachZones={topSeat !== actor ? targetableBreachZones : undefined} onZoneClick={submitDestination} onBreachClick={submitBreach} cardActions={topSeat === actor ? cardActions : undefined} voidLeftControl={topSeat === actor ? layoutConfirmControl : undefined} />
            <PlayerBoardV2 player={boardPlayers[bottomSeat]} db={db} playerSeat={bottomSeat} viewerOwnsBoard={omniscient || bottomSeat === actor} perspective="self" activeTurn={bottomSeat === view.activePlayer} cardByDefinitionId={cardByDefinitionId} attachments={view.attachments} selectedCardIds={displayedSelection} selectableCardIds={selectable} cardEmphasis={cardEmphasis} onCardClick={toggleCard} onCardFocus={setFocusedCard} targetableDestinations={bottomSeat === actor ? targetableDestinations : undefined} targetableBreachZones={bottomSeat !== actor ? targetableBreachZones : undefined} onZoneClick={submitDestination} onBreachClick={submitBreach} cardActions={bottomSeat === actor ? cardActions : undefined} voidLeftControl={bottomSeat === actor ? layoutConfirmControl : undefined} />
            <div className="pointer-events-none absolute inset-x-2 top-1/2 z-20 h-[2px] -translate-y-1/2 bg-gradient-to-b from-blue-500/75 to-red-500/75" data-ui-contract="hero-rush-v2-battle-divider" />
            <CombatOverlayV2 view={view} selfSeat={bottomSeat} />
            <BattlePanelV2 view={view} />
            {view.flow.kind === "ACTION" && <div className="pointer-events-none absolute right-[176px] top-1/2 z-30 w-[112px] -translate-y-1/2 rounded-lg border border-emerald-300/55 bg-stone-950/95 px-2 py-2 text-center text-white shadow-xl backdrop-blur" data-ui-contract="hero-rush-v2-action-info-lane"><div className="text-[9px] font-black text-emerald-200">行动信息</div><div className="mt-1 grid gap-0.5 text-[8px] text-white/75"><span>号召 {view.actionUsage.summonsUsed}/{view.actionUsage.summonLimit}</span><span>基地部署 {view.actionUsage.baseDeploymentsUsed}/{view.actionUsage.baseDeploymentLimit}</span></div></div>}
            {!view.combat && responsePriority !== null && <div className="pointer-events-none absolute right-[176px] top-1/2 z-30 w-[112px] -translate-y-1/2 rounded-lg border border-amber-300/60 bg-stone-950/95 px-2 py-2 text-center text-[8px] font-bold text-amber-100 shadow-xl" data-ui-contract="hero-rush-v2-priority">优先权<br />{view.players[responsePriority].name}</div>}
            {view.pendingDecision?.kind === "EFFECT_TARGETS" && view.pendingDecision.choiceKind !== "field_location" && <div className="pointer-events-none absolute right-[176px] top-1/2 z-30 w-[112px] -translate-y-1/2 rounded-lg border border-cyan-300/60 bg-stone-950/95 px-2 py-2 text-center text-[7px] font-bold leading-3 text-cyan-100 shadow-xl" data-ui-contract="hero-rush-v2-effect-targets">青色高亮为合法效果目标<br />已选 {selected.size} / {view.pendingDecision.min}-{view.pendingDecision.max}</div>}
          </main>

          <aside className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3">
            <RailPanel title="上方玩家" side="opponent"><div className="bg-blue-50/55 p-3"><strong className="block text-sm text-blue-800">{view.players[topSeat].name}</strong><span className="text-[9px] text-blue-700/65">手牌 {view.players[topSeat].handCount} · 主卡组 {view.players[topSeat].deckCount}</span></div></RailPanel>
            <RailPanel title="下方玩家" side="self"><div className="bg-red-50/55 p-3"><strong className="block text-sm text-red-800">{view.players[bottomSeat].name}</strong><span className="text-[9px] text-red-700/65">手牌 {view.players[bottomSeat].handCount} · 主卡组 {view.players[bottomSeat].deckCount}</span></div></RailPanel>
            <RailPanel title="对局记录" className="min-h-0"><div className="h-full space-y-1 overflow-y-auto p-2 scrollbar-thin">{eventLines.length ? eventLines.map((line, index) => <p key={`${line}-${index}`} className="border-l-2 border-stone-300 bg-stone-50 px-2 py-1.5 text-[8px] leading-4 text-stone-600">{line}</p>) : <p className="p-2 text-[9px] text-stone-400">等待对局操作</p>}</div></RailPanel>
            <RailPanel title="对局进程与操作">
              <dl className="grid grid-cols-[42px_1fr] gap-x-2 gap-y-1.5 p-3 text-[9px]"><dt className="text-stone-400">回合</dt><dd className="font-bold">{view.turnNumber}</dd><dt className="text-stone-400">流程</dt><dd className={`font-bold ${view.activePlayer === bottomSeat ? "text-red-700" : "text-blue-700"}`}>{flowLabel(view.flow.kind)}</dd><dt className="text-stone-400">行动方</dt><dd className={`truncate font-bold ${view.activePlayer === bottomSeat ? "text-red-700" : "text-blue-700"}`}>{view.players[view.activePlayer].name}</dd><dt className="text-stone-400">规则</dt><dd>{view.rulesetVersion}</dd></dl>
              <ActionPanelV2 view={view} cardByDefinitionId={cardByDefinitionId} selectedCardIds={selected} onToggleCard={toggleCard} onClear={() => { setSelected(new Set()); setSummonPlacementCardId(null); }} onSubmit={onSubmitGameCommand} />
            </RailPanel>
          </aside>
        </div>
      </div>
      </div>

      <MulliganPanelV2 view={view} cardByDefinitionId={cardByDefinitionId} selectedCardIds={selected} submitting={submitting} onToggle={toggleSelection} onCardFocus={setFocusedCard} onClear={() => setSelected(new Set())} onSubmit={onSubmitMulligan} />
      {focusedDefinition && createPortal(<aside className="fixed bottom-3 left-3 top-3 z-[121] flex min-w-[164px] max-w-[420px] flex-col overflow-hidden rounded-xl border border-stone-300 bg-white shadow-2xl" style={{ width: `calc(var(${DETAIL_INSET_CSS_VAR}, 232px) - 12px)` }} data-ui-contract="hero-rush-v2-floating-card-detail"><h2 className="border-b border-stone-200 bg-stone-100 px-3 py-2 text-[10px] font-bold tracking-[.12em] text-stone-500">卡牌详情</h2><CardDetailSidebar card={focusedDefinition} db={db} compact showAddButton={false} effectiveStats={focusedCard ? { level: focusedCard.effectiveLevel, power: focusedCard.effectivePower, range: focusedCard.effectiveRange } : null} /></aside>, document.body)}
      {baseChoiceCardId && baseChoiceMinimized && createPortal(<button type="button" onClick={() => setBaseChoiceMinimized(false)} className="fixed bottom-5 right-5 z-[120] rounded-full border border-amber-200 bg-stone-950 px-4 py-2 text-xs font-bold text-amber-100 shadow-2xl" data-ui-contract="hero-rush-v2-restore-decision">恢复：选择基地操作</button>, document.body)}
      {baseChoiceCardId && !baseChoiceMinimized && createPortal(
        <div className="fixed inset-0 z-[106] grid place-items-center bg-stone-950/[.58] py-5 pr-5 backdrop-blur-sm" style={{ paddingLeft: `calc(var(${DETAIL_INSET_CSS_VAR}, 232px) + 16px)` }} role="dialog" aria-modal="true" aria-label="选择基地操作" onMouseDown={(event) => { if (event.currentTarget === event.target) setBaseChoiceCardId(null); }}>
          <section className="w-full max-w-sm rounded-2xl border border-amber-200/45 bg-stone-950 p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-3"><strong className="text-sm text-amber-100">选择基地操作</strong><button type="button" onClick={() => setBaseChoiceMinimized(true)} className="rounded border border-white/15 px-2.5 py-1 text-[10px] text-white/70">最小化</button></div>
            <p className="mt-1 text-xs leading-5 text-white/55">这张手牌既可以号召到基地区，也可以背面进行基地部署。</p>
            <div className="mt-4 grid gap-2">
              <button type="button" onClick={() => { setBaseChoiceCardId(null); onSubmitGameCommand({ type: "SUMMON_CHARACTER", cardId: baseChoiceCardId, destination: "base" }); }} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold">号召到基地区</button>
              <button type="button" onClick={() => { setBaseChoiceCardId(null); onSubmitGameCommand({ type: "DEPLOY_BASE", cardId: baseChoiceCardId }); }} className="rounded-lg bg-amber-300 px-4 py-2 text-xs font-bold text-stone-950">基地部署</button>
              <button type="button" onClick={() => setBaseChoiceCardId(null)} className="rounded-lg border border-white/15 px-4 py-2 text-xs text-white/65">取消</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
