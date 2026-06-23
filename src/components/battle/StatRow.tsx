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
    <div className="flex items-center gap-1 text-[11px]">
      <span className="text-white/25 w-8 shrink-0">{label}</span>
      <span className="text-blue-400/70 font-mono tabular-nums w-4 text-right">{v1}</span>
      <span className="text-white/15">:</span>
      <span className="text-red-400/70 font-mono tabular-nums w-4 text-right">{v2}</span>
      {suffix && (
        <span className={`font-mono ${highlight ? "text-amber-400/60" : "text-white/20"}`}>{suffix}</span>
      )}
    </div>
  );
}
