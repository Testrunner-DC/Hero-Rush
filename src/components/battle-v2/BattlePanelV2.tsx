import { type BattleViewV2, type FieldZoneV2 } from "@hero-rush/game-core";

interface BattlePanelV2Props {
  view: BattleViewV2;
}

const zones: FieldZoneV2[] = ["vanguard", "flankLeft", "flankRight", "rear"];
const labels: Record<FieldZoneV2, string> = {
  vanguard: "先锋",
  flankLeft: "侧翼",
  flankRight: "侧翼",
  rear: "后卫",
};

export default function BattlePanelV2({ view }: BattlePanelV2Props) {
  const self = view.viewer;

  if (view.flow.kind === "BATTLE_FLANK_CHOICE" && view.activePlayer === self) {
    return (
      <aside className="pointer-events-none absolute right-[176px] top-1/2 z-[60] w-[112px] -translate-y-1/2 rounded-lg border border-rose-300/30 bg-stone-950/95 p-2 text-center text-white shadow-xl backdrop-blur" data-ui-contract="hero-rush-v2-battle-notice-lane">
        <strong className="text-[9px] text-rose-100">选择先攻击的侧翼</strong>
        <p className="mt-1 text-[7px] leading-3 text-white/50">点击红色高亮角色</p>
      </aside>
    );
  }

  if ((view.flow.kind === "BATTLE_ATTACK" || view.flow.kind === "BATTLE_TARGET") && view.activePlayer === self) {
    const attackFlow = view.flow;
    const attackerZone = attackFlow.kind === "BATTLE_ATTACK"
      ? attackFlow.zone
      : zones.find((zone) => view.players[self].field[zone].some((card) => card.instanceId === attackFlow.attackerId));
    if (!attackerZone) return null;
    const attacker = view.players[self].field[attackerZone].find((card) => card.instanceId === attackFlow.attackerId);
    if (!attacker) return null;
    const legalAttack = view.legalActions.find((action) => action.type === "DECLARE_ATTACK" && action.attackerId === attacker.instanceId) as Extract<BattleViewV2["legalActions"][number], { type: "DECLARE_ATTACK" }> | undefined;
    return (
      <aside className="pointer-events-none absolute right-[176px] top-1/2 z-[60] w-[112px] -translate-y-1/2 rounded-lg border border-rose-300/30 bg-stone-950/95 p-2 text-center text-white shadow-xl backdrop-blur" data-ui-contract="hero-rush-v2-attack-hint">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <strong className="block text-[9px] text-rose-100">{labels[attackerZone]}{attackFlow.kind === "BATTLE_TARGET" ? "重选目标" : "攻击机会"}<br />R{attacker.effectiveRange}</strong>
            <p className="mt-1 text-[7px] leading-3 text-white/50">点击红色目标或破绽<br />{legalAttack?.targets.length ?? 0} 个合法目标</p>
          </div>
        </div>
      </aside>
    );
  }

  return null;
}
