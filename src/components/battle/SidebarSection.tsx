/**
 * SidebarSection — 侧边栏分区组件
 *
 * 带标题行（可选 badge）和可滚动内容区的侧边栏分区容器。
 */

import type React from "react";

interface SidebarSectionProps {
  label: string;
  badge?: string;
  children: React.ReactNode;
  last?: boolean;
}

export default function SidebarSection({ label, badge, children, last = false }: SidebarSectionProps) {
  return (
    <div className={`${last ? "" : "border-b border-white/5"} shrink-0`}>
      <div className="flex items-center justify-between px-2 py-1 bg-white/5">
        <span className="text-xs font-bold text-white/50 tracking-wider">{label}</span>
        {badge && <span className="text-[11px] text-white/30 font-mono">{badge}</span>}
      </div>
      <div className="p-1.5 max-h-28 overflow-y-auto">{children}</div>
    </div>
  );
}
