import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("V2 battle workspace contracts", () => {
  it("routes the primary battle entry to the V2 lobby without a V1 route", () => {
    const source = readSource("App.tsx");
    expect(source).toContain('path="/battle"');
    expect(source).toContain("<BattlePageV2");
    expect(source).not.toContain('path="/battle-legacy"');
    expect(source).toContain('path="/battle/sandbox"');
    expect(source).toContain('path="/admin"');
  });

  it("keeps deck selection inside each mode panel and exposes the three required modes", () => {
    const source = readSource("pages/BattlePageV2.tsx");
    expect(source).toContain('useState<LobbyMode>("friend")');
    expect(source.match(/本局卡组/g)).toHaveLength(2);
    expect(source).toContain("休闲匹配");
    expect(source).toContain("好友房");
    expect(source).toContain("测试沙盒");
    expect(source).toContain("玩家 1 卡组");
    expect(source).toContain("玩家 2 卡组");
    expect(source).not.toContain("选择卡组与卡背");
    expect(source).not.toContain("card-back-main.png");
    expect(source).toContain("mainDeck.length === 50");
  });

  it("uses the authoritative V2 kernel and exposes atomic traces in the sandbox", () => {
    const source = readSource("pages/BattleSandboxPageV2.tsx");
    const lobby = readSource("pages/BattlePageV2.tsx");
    const hook = readSource("hooks/useSandboxBattleV2.ts");
    expect(source).toContain("useSandboxBattleV2");
    expect(hook).toContain('type: "SANDBOX_COMMAND_V2"');
    expect(hook).toContain('type: "SANDBOX_CLOSE_V2"');
    expect(hook).toContain("sessionStorage.removeItem(sandboxMatchKey)");
    expect(hook).toContain('kind: "ATOMIC"');
    expect(source).toContain("ATOMIC_OPERATION_CATALOG_V2");
    expect(source).toContain("服务端状态哈希");
    expect(source).toContain('data-ui-contract="hero-rush-v2-fullscreen-sandbox"');
    expect(source).toContain("omniscient");
    expect(source).toContain("orientationSeat={0}");
    expect(source).toContain("GM 面板");
    expect(source).not.toContain("切换席位");
    expect(lobby).toContain('data-ui-contract="hero-rush-v2-lobby-sandbox-setup"');
    expect(lobby).toContain("玩家 2 卡组");
    expect(lobby).toContain('navigate("/battle/sandbox", { state })');
    expect(lobby).toContain("user?.username");
    expect(source).toContain("isSandboxLaunchStateV2");
    expect(source).toContain('data-ui-contract="hero-rush-v2-sandbox-launching"');
    expect(source).toContain('{ name: launch.players[0].name');
    expect(source).toContain('{ name: launch.players[1].name');
    expect(source).not.toContain("选择双方卡组");
  });

  it("keeps the live battlefield on a fitted Legion-style 1440 by 900 stage", () => {
    const screen = readSource("components/battle-v2/BattleScreenV2.tsx");
    const board = readSource("components/battle-v2/PlayerBoardV2.tsx");
    expect(screen).toContain("const STAGE_WIDTH = 1440");
    expect(screen).toContain("const STAGE_HEIGHT = 900");
    expect(screen).toContain('data-ui-contract="hero-rush-v2-fit-viewport"');
    expect(screen).toContain('transformOrigin: "top left"');
    expect(screen).toContain('transform: compactViewport ? undefined : "translate(-50%, -50%)"');
    expect(screen).toContain('grid-cols-[220px_62px_minmax(0,1fr)_200px]');
    expect(screen).toContain('data-ui-contract="hero-rush-v2-vertical-phase-rail"');
    expect(screen).toContain('data-active-side={activeSide}');
    expect(screen).toContain('activeSide === "self" ? "bg-red-600 text-white shadow" : "bg-blue-600 text-white shadow"');
    expect(screen).toContain('{ label: "行动" }');
    expect(screen).toContain('{ label: "调整", role: "reminder" }');
    expect(screen).toContain('{ label: "战斗" }');
    expect(screen).toContain('data-phase-role={step.role ?? "phase"}');
    expect(screen).toContain('BATTLE_ADJUST: "战区调整"');
    expect(screen).not.toContain('kind === "ADJUST"');
    expect(screen).toContain('data-ui-contract="hero-rush-v2-battle-divider"');
    expect(screen).toContain('data-ui-contract="hero-rush-v2-accurate-attack-line"');
    expect(screen).toContain('data-ui-contract="hero-rush-v2-battle-notice-lane"');
    expect(screen).toContain("right-[176px]");
    expect(screen).toContain('data-ui-contract="hero-rush-v2-action-info-lane"');
    expect(screen).toContain("view.actionUsage.summonsUsed");
    expect(screen).toContain("view.actionUsage.baseDeploymentsUsed");
    expect(screen).toContain('querySelectorAll<HTMLElement>("[data-card-instance]")');
    expect(screen).toContain('stroke="url(#battle-line-gradient-v2)"');
    expect(screen).toContain(" Q ${curve.x} ${curve.y} ");
    expect(screen).not.toContain("strokeDasharray");
    expect(screen).not.toContain("const zoneX");
    expect(screen).toContain('from-blue-500/75 to-red-500/75');
    expect(screen).toContain('side="opponent"');
    expect(screen).toContain('side="self"');
    expect(screen).not.toContain('data-ui-contract="hero-rush-v2-phase-seam"');
    expect(screen).toContain("对局记录");
    expect(board).toContain("侧翼区");
    expect(board).toContain("先锋区");
    expect(board).toContain("后卫区");
    expect(board).toContain("基地区");
    expect(board).toContain("时间线");
    expect(board).toContain("card-back-main.png");
    expect(board).toContain("card-back-rush.png");
  });

  it("keeps mulligan and phase controls above the battlefield without cropping card art", () => {
    const screen = readSource("components/battle-v2/BattleScreenV2.tsx");
    const mulligan = readSource("components/battle-v2/MulliganPanelV2.tsx");
    const board = readSource("components/battle-v2/PlayerBoardV2.tsx");
    const actions = readSource("components/battle-v2/ActionPanelV2.tsx");
    const battle = readSource("components/battle-v2/BattlePanelV2.tsx");
    expect(mulligan).toContain('role="dialog"');
    expect(mulligan).toContain('aria-modal="true"');
    expect(mulligan).toContain('data-ui-contract="hero-rush-v2-mulligan-six-card-grid"');
    expect(mulligan).toContain("lg:grid-cols-6");
    expect(mulligan).not.toContain("scrollBy");
    expect(mulligan).not.toContain("向左查看手牌");
    expect(mulligan).not.toContain("向右查看手牌");
    expect(screen).toContain('view.pendingDecision?.kind === "MULLIGAN"');
    expect(screen).toContain("window.scrollTo({ top: 0, left: 0 })");
    expect(board).not.toContain("object-cover");
    expect(board).not.toContain("-ml-");
    expect(board).toContain("object-contain");
    expect(actions).toContain('data-ui-contract="hero-rush-v2-decision-modal"');
    expect(actions).toContain('data-ui-contract={isResponse ? "hero-rush-v2-inline-response-controls" : "hero-rush-v2-action-controls"}');
    expect(battle).not.toContain('data-ui-contract="hero-rush-v2-priority-controls"');
    expect(actions).toContain('data-ui-contract="hero-rush-v2-restore-decision"');
    expect(actions).toContain('label="高等级号召支付" tone="border-amber-300/35" boardInteractive');
    expect(actions).toContain('label="结束阶段弃牌" tone="border-rose-300/35" boardInteractive');
    expect(actions).toContain('data-board-interactive={boardInteractive || undefined}');
    expect(actions).not.toContain("bg-stone-950/97");
    expect(actions).not.toContain("bg-stone-950/58");
    expect(mulligan).toContain('var(--hero-rush-v2-detail-inset, 232px)');
    expect(actions).toContain('var(--hero-rush-v2-detail-inset, 232px)');
    expect(board).toContain('var(--hero-rush-v2-detail-inset, 232px)');
    expect(screen).toContain('DETAIL_INSET_CSS_VAR');
    expect(screen).toContain('phaseRailLeft');
    expect(screen).not.toContain('pl-[280px]');
    expect(mulligan).not.toContain('pl-[252px]');
  });

  it("uses card-driven actions, curved hands, and host-bound attachments", () => {
    const screen = readSource("components/battle-v2/BattleScreenV2.tsx");
    const board = readSource("components/battle-v2/PlayerBoardV2.tsx");
    const actions = readSource("components/battle-v2/ActionPanelV2.tsx");
    expect(screen).toContain("summonPlacementCardId");
    expect(screen).toContain("attachments={view.attachments}");
    expect(board).toContain('data-ui-contract="hero-rush-v2-card-actions"');
    expect(board).toContain("actions.canDeploy");
    expect(board).toContain("actions.canSummon");
    expect(board).toContain("actions.effectIds");
    expect(board).toContain('actions.effectLabel ?? "起动效果"');
    expect(screen).toContain('effectLabel: responsePriority === actor ? "应对·起动" : "起动效果"');
    expect(screen).toContain('const canShowSelectedCardActions = view.flow.kind === "ACTION" || responsePriority === actor');
    expect(actions).not.toContain("onChooseSummon");
    expect(board).toContain("起动效果");
    expect(screen).toContain("setBaseChoiceCardId(activeSummon.cardId)");
    expect(actions).toContain('decision.choiceKind === "field_location"');
    expect(actions).toContain('data-ui-contract="hero-rush-v2-direct-location-choice"');
    expect(actions).toContain('type: "CANCEL_EFFECT_TARGETS"');
    expect(actions).toContain("取消发动");
    expect(screen).toContain("cardIds: [effectChoice]");
    expect(actions).not.toContain(">号召至{fieldLabels[zone]}</button>");
    expect(board).toContain('data-ui-contract="hero-rush-v2-hand-fan"');
    expect(board).toContain('className="relative z-50 h-[80px] shrink-0 overflow-visible"');
    expect(board).toContain("fanTransform(index, cardCount, mirrored)");
    expect(board).toContain("w-[64px]");
    expect(board).toContain("attachments[card.instanceId]");
    expect(board).toContain("data-attached-to={card.instanceId}");
    expect(board).toContain('data-ui-contract="hero-rush-v2-horizontal-attachments"');
    expect(board).toContain('className="absolute left-0 top-0"');
    expect(board).not.toContain('className="absolute top-3"');
    expect(board).not.toContain('SideZone label="结附卡"');
    expect(board).toContain("rounded-[5px]");
    expect(board).not.toContain("战{card.effectivePower}");
    expect(board).toContain(">R{card.effectiveRange}</span>");
    expect(board).toContain("const showCharacterStats = definition?.card_type !== 2");
    expect(board).toContain("bg-black/90");
    expect(board).toContain("bg-emerald-800 text-white");
    expect(board).toContain("bg-red-800 text-white");
    expect(board).toContain('aria-label="点击基地区作为合法落点"');
    expect(board).not.toContain(">放置</button>");
    expect(board).toContain("count <= 6 ? 60 : count <= 10 ? 52");
  });

  it("mirrors the opponent layout across the horizontal phase boundary without flipping content", () => {
    const board = readSource("components/battle-v2/PlayerBoardV2.tsx");
    expect(board).toContain('data-board-layout={mirrored ? "mirrored-top" : "bottom"}');
    expect(board).toContain('border-blue-400/70');
    expect(board).toContain('border-red-400/70');
    expect(board).toContain('data-hand-edge={edge}');
    expect(board).toContain('data-ui-contract="hero-rush-v2-mirrored-field"');
    expect(board).toContain('activeTurn ? "brightness-100" : "brightness-[.85]"');
    expect(board).toContain('mirrored ? <>{hand}{baseZone}{fieldZones}</> : <>{fieldZones}{baseZone}{hand}</>');
    expect(board).toContain('zone={mirrored ? "rear" : "vanguard"}');
    expect(board).toContain('zone={mirrored ? "vanguard" : "rear"}');
    expect(board).toContain("grid-cols-[repeat(3,minmax(0,137px))] grid-rows-4");
    expect(board).toContain('label="侧翼区"');
    expect(board).not.toContain('label="左侧翼"');
    expect(board).not.toContain('label="右侧翼"');
    expect(board).toContain('className="col-start-1 row-start-2 row-span-2"');
    expect(board).toContain('className="col-start-3 row-start-2 row-span-2"');
    expect(board).toContain('className="col-start-2 row-start-1 row-span-2"');
    expect(board).toContain('className="col-start-2 row-start-3 row-span-2"');
    expect(board).not.toContain("scaleY(-1)");
    expect(board).not.toContain("rotate(180deg)");
  });

  it("keeps the phase seam clear and places regular actions in the lower-right process rail", () => {
    const screen = readSource("components/battle-v2/BattleScreenV2.tsx");
    const actions = readSource("components/battle-v2/ActionPanelV2.tsx");
    expect(screen).toContain('title="对局进程与操作"');
    expect(screen).toContain('<ActionPanelV2 view={view}');
    expect(actions).toContain('hero-rush-v2-inline-response-controls');
    expect(actions).toContain("PASS_ATTACK_OPPORTUNITY");
    expect(actions).toContain("PASS_PRIORITY");
    expect(actions).toContain("否，跳过应对");
    expect(actions).toContain('decision?.kind === "SUMMON_DESTINATION"');
    expect(actions).toContain("素材腾出的战区也会亮起");
    expect(actions).toContain('onClear();');
    expect(actions).toContain("不要求用满号召或基地部署次数");
    expect(screen).toContain('...(adjustingBattleLayout && selectedId ? fieldZones : [])');
    expect(screen).toContain('[sourceZone]: current[destination]');
    expect(actions).toContain("effectPresentation(view, cardByDefinitionId");
    expect(actions).toContain("{presentation.text}");
    expect(actions).not.toContain('aria-label={isResponse ? "对战应对确认"');
    expect(actions).not.toContain("top-1/2 mx-auto max-w-4xl");
  });

  it("selects battlefield and base targets directly while opening retreat and void pickers", () => {
    const screen = readSource("components/battle-v2/BattleScreenV2.tsx");
    const actions = readSource("components/battle-v2/ActionPanelV2.tsx");
    expect(screen).toContain("onToggleCard={toggleCard}");
    expect(actions).toContain("locateEffectChoiceCards");
    expect(actions).toContain('data-ui-contract="hero-rush-v2-zone-effect-picker"');
    expect(actions).toContain('data-effect-choice-zone={zone}');
    expect(actions).toContain('new Set<EffectChoiceZoneV2>(["撤退区", "虚空区"])');
    expect(actions).toContain("effectChoiceCards.filter((item) => pickerZones.has(item.zone))");
    expect(actions).toContain("boardInteractive={needsBoardSelection}");
    expect(actions).toContain("其余目标直接点击场上高亮卡牌或位置");
    expect(actions).toContain("从{zoneLabel}选择效果目标");
    expect(actions).toContain("直接在{directZoneLabel}点选目标");
    expect(actions).toContain('data-ui-contract="hero-rush-v2-effect-target-controls"');
    expect(actions).not.toContain("在战场选择效果目标");
  });

  it("stacks timeline cards clockwise and opens public discard zones in dialogs", () => {
    const board = readSource("components/battle-v2/PlayerBoardV2.tsx");
    expect(board).toContain('data-ui-contract="hero-rush-v2-timeline-stack"');
    expect(board).toContain('transform: "translateX(-50%) rotate(90deg)"');
    expect(board).toContain("top: 30 + index * 18");
    expect(board).toContain('className="relative z-50 h-[80px] shrink-0 overflow-visible"');
    expect(board).toContain("grid min-h-0 grid-rows-3 gap-1.5");
    expect(board).toContain("grid-rows-[80px_98px_minmax(0,1fr)]");
    expect(board).toContain("grid-rows-[minmax(0,1fr)_98px_80px]");
    expect(board).toContain('className="row-span-2 min-h-0"');
    expect(board).toContain('aria-label={`查看${label}`}');
    expect(board).toContain('role="dialog" aria-modal="true" aria-label={`${label}卡牌明细`}');
    expect(board).toContain("const lastCard = cards[cards.length - 1]");
    expect(board).not.toContain("<CardDetailSidebar card={selectedDefinition ?? null}");
    expect(board).toContain("common.onCardFocus?.(card)");
    expect(board).toContain("createPortal(");
    expect(board).toContain('data-ui-contract="hero-rush-v2-known-base-resource"');
    expect(board).toContain('data-ui-contract="hero-rush-v2-hidden-base-resource"');
    expect(board).toContain('className="pointer-events-none aspect-[746/1041]');
    expect(board).toContain("基地 · 1");
    expect(board).toContain("brightness-[.7]");
    expect(board).toContain("rotate-[10deg]");
    expect(board).toContain('data-ui-contract="hero-rush-v2-gained-keywords"');
    expect(board).toContain("card.gainedKeywords.map");
    expect(board).toContain("new Set(player.exhaustedCardIds)");
    expect(board).toContain("dimmed={!selectable}");
    expect(board).not.toContain("grayscale");
  });

  it("anchors layout confirmation to the left of the active void zone and highlights adjustable characters", () => {
    const screen = readSource("components/battle-v2/BattleScreenV2.tsx");
    const board = readSource("components/battle-v2/PlayerBoardV2.tsx");
    const panel = readSource("components/battle-v2/BattlePanelV2.tsx");
    expect(screen).toContain('data-ui-contract="hero-rush-v2-confirm-layout"');
    expect(screen).toContain('emphasis.set(card.instanceId, "adjustable")');
    expect(board).toContain('data-ui-contract="hero-rush-v2-void-left-control"');
    expect(board).toContain('right-[calc(100%+8px)] top-0');
    expect(board).toContain('data-emphasis={emphasis}');
    expect(board).toContain('ring-[3px] ring-violet-400');
    expect(panel).not.toContain('type: "SUBMIT_BATTLE_LAYOUT"');
  });

  it("lets the active player choose which flank attacks first without a persisted flank order", () => {
    const screen = readSource("components/battle-v2/BattleScreenV2.tsx");
    const battle = readSource("components/battle-v2/BattlePanelV2.tsx");
    expect(screen).toContain('view.flow.kind === "BATTLE_FLANK_CHOICE"');
    expect(screen).toContain('type: "CHOOSE_FLANK_ATTACKER"');
    expect(battle).toContain("选择先攻击的侧翼");
    expect(battle).not.toContain("战区整体调整");
    expect(battle).not.toContain("侧翼顺序");
  });

  it("shows color, traits, type, and series in selected-card details", () => {
    const screen = readSource("components/battle-v2/BattleScreenV2.tsx");
    const detail = readSource("components/CardDetailSidebar.tsx");
    expect(screen).toContain("<CardDetailSidebar");
    expect(screen).toContain("compact showAddButton={false}");
    expect(screen).toContain('data-ui-contract="hero-rush-v2-floating-card-detail"');
    expect(screen).toContain('data-ui-contract="hero-rush-v2-card-detail-reserved-column"');
    expect(screen).not.toContain('title="选中卡牌"');
    expect(screen).toContain("{focusedDefinition && createPortal(");
    expect(screen).toContain("baseChoiceMinimized");
    expect(screen).toContain("恢复：选择基地操作");
    expect(detail).toContain('data-ui-contract="hero-rush-unified-card-detail"');
    expect(detail).toContain("currentCard.attribute_name");
    expect(detail).toContain("currentCard.attribute_color");
    expect(detail).toContain("currentCard.feature_text");
    expect(detail).toContain("currentCard.card_type_name");
    expect(detail).toContain("currentCard.package_short");
    expect(detail).toContain("if (compact) return [card]");
    expect(detail).toContain('compact ? "176px" : "260px"');
    expect(detail).toContain('compact ? "text-[11px]" : "text-[13px]"');
    expect(screen).not.toContain("eventLabels[type] ?? type");
    expect(screen).toContain('default: return "对局状态已更新"');
  });

  it("routes effect battle/base movement destinations through the pending decision", () => {
    const screen = readSource("components/battle-v2/BattleScreenV2.tsx");
    expect(screen).toContain("pendingEffectDestinationChoices");
    expect(screen).toContain("effectTargetableDestinations");
    expect(screen).toContain('const effectChoice = `zone:${destination}`');
    expect(screen).toContain("view.pendingDecision.choices.includes(effectChoice)");
    expect(screen).toContain("toggleSelection(effectChoice)");
    expect(screen).toContain('view.pendingDecision.choiceKind === "field_location"');
    expect(screen).toContain("cardIds: [effectChoice]");
    const actions = readSource("components/battle-v2/ActionPanelV2.tsx");
    expect(actions).toContain('data-ui-contract="hero-rush-v2-direct-location-choice"');
    expect(actions).not.toContain('<DecisionModalV2 label="选择放置战区"');
  });

  it("keeps mulligan clear of the floating card detail and lets every choice dialog minimize", () => {
    const mulligan = readSource("components/battle-v2/MulliganPanelV2.tsx");
    expect(mulligan).toContain('paddingLeft: "calc(var(--hero-rush-v2-detail-inset, 232px) + 16px)"');
    expect(mulligan).not.toContain("pl-[252px]");
    expect(mulligan).toContain("setMinimized(true)");
    expect(mulligan).toContain("恢复起始手牌调度");
    expect(mulligan).toContain('data-ui-contract="hero-rush-v2-restore-decision"');
  });

  it("presents authoritative card effects without covering actions and shows the nine-rush-card result", () => {
    const screen = readSource("components/battle-v2/BattleScreenV2.tsx");
    const effectPresentation = readSource("components/battle-v2/EffectPresentationV2.tsx");
    const gameResult = readSource("components/battle-v2/GameResultOverlayV2.tsx");
    expect(screen).toContain("<EffectPresentationV2");
    expect(screen).toContain("<GameResultOverlayV2");
    expect(effectPresentation).toContain('type: "EFFECT_PRESENTED"');
    expect(effectPresentation).toContain("pointer-events-none");
    expect(effectPresentation).toContain('data-ui-contract="hero-rush-v2-effect-presentation"');
    expect(effectPresentation).toContain("active.effectLabel");
    expect(gameResult).toContain('view.status !== "finished"');
    expect(gameResult).toContain("view.winner");
    expect(gameResult).toContain("获得 9 张冲击卡");
    expect(gameResult).toContain('data-ui-contract="hero-rush-v2-game-result"');
    expect(gameResult).toContain("查看最终场面");
    expect(gameResult).toContain("返回对战大厅");
  });

  it("keeps the administrator surface limited to V2 operations and coverage", () => {
    const source = readSource("pages/AdminPage.tsx");
    expect(source).toContain('label="V2 服务"');
    expect(source).toContain("效果原子目录");
    expect(source).toContain("已登记卡效");
    expect(source).toContain("卡池准入");
  });
});
