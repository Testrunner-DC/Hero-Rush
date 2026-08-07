/**
 * StatRow — 状态行组件
 *
 * 显示我方/敌方的数值对比行，用于右侧信息栏。
 */

interface StatRowProps {
  label: string;
  v1: number;
  v2: number;
  suffix?: string;
  highlight?: boolean;
}

export default function StatRow({ label, v1, v2, suffix = "", highlight = false }: StatRowProps) {
  return (
    <div className={`battle-stat-row flex items-center gap-2 text-xs ${highlight ? "battle-stat-row--highlight" : ""}`}>
      <span className="text-white/40 w-10 shrink-0">{label}</span>
      <span className="battle-stat-row__self text-cyan-200/85 font-mono tabular-nums w-7 text-center">{v1}</span>
      <span className="text-white/20">—</span>
      <span className="battle-stat-row__enemy text-rose-200/85 font-mono tabular-nums w-7 text-center">{v2}</span>
      {suffix && (
        <span className={`font-mono ${highlight ? "text-amber-200/80" : "text-white/25"}`}>{suffix}</span>
      )}
    </div>
  );
}
