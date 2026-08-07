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
    <section className={`battle-sidebar-section ${last ? "battle-sidebar-section--last" : ""} shrink-0`}>
      <div className="battle-sidebar-section__header flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-bold text-white/70 tracking-[0.16em]">{label}</span>
        {badge && <span className="battle-sidebar-section__badge text-[11px] text-amber-100/75 font-mono tabular-nums">{badge}</span>}
      </div>
      <div className="battle-sidebar-section__body px-3 py-2 max-h-32 overflow-y-auto">{children}</div>
    </section>
  );
}
