/**
 * HelpPage — 游戏帮助页面（jinteki.net/help 风格 Q&A 分区）
 *
 * 深色主题，折叠面板，按主题分区展示超英击战规则。
 * 无外部依赖，纯受控组件。
 */

import { useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface QAItem {
  q: string;
  a: string;
}

interface QASection {
  id: string;
  title: string;
  icon: string;
  items: QAItem[];
}

// ─────────────────────────────────────────────────────────────────────────
// Content
// ─────────────────────────────────────────────────────────────────────────

const SECTIONS: QASection[] = [
  {
    id: "basics",
    title: "游戏基础",
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    items: [
      {
        q: "胜利条件是什么？",
        a: "当对方的时间线区域填满 9 张卡牌（即基地 HP 归零），或对方卡组耗尽无法抽牌时，你获得胜利。每张被击破的角色卡会进入对方的时间线，时间线满 9 张即视为基地被摧毁。",
      },
      {
        q: "回合流程是怎样的？",
        a: "每个回合分为四个阶段：\n1. 回合开始（TURN_START）— 进入新回合\n2. 抽卡阶段（DRAW）— 从卡组抽 2 张牌\n3. 主要阶段（ACTION）— 号召角色、部署基地、使用起动效果等（每回合最多号召 3 次、部署 1 次基地）\n4. 冲突阶段（CONFLICT）— 调整战区位置后发起攻击\n5. 结束阶段（END_PHASE）— 结束回合，换对方行动",
      },
      {
        q: "战区有哪些？分别有什么作用？",
        a: "场上共有 5 类战区：\n• 先锋区（Vanguard）— 正对敌方先锋，主要攻击位置\n• 侧翼左区（Flank Left）— 左侧攻击位置\n• 侧翼右区（Flank Right）— 右侧攻击位置\n• 后卫区（Rear）— 后方位置\n• 基地区（Base）— 最多放置 6 张卡，角色可从基地出击\n每个战区（基地除外）最多放置 1 张角色卡。",
      },
    ],
  },
  {
    id: "operations",
    title: "操作指南",
    icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    items: [
      {
        q: "如何号召角色到场上？",
        a: "在主要阶段（ACTION），点击手牌中的角色卡选中它，然后点击场上空的战区（先锋/侧翼左/侧翼右/后卫）或基地区即可号召。每回合最多号召 3 次，基地区每回合最多部署 1 次。",
      },
      {
        q: "如何发起攻击？",
        a: "在冲突阶段（CONFLICT）：\n1. 调整阶段 — 可移动场上角色位置（最多 4 次）\n2. 攻击阶段 — 依次选择要攻击的战区（先锋→侧翼左→侧翼右→后卫），选择攻击者，再选择目标\n攻击会对比双方角色的战力（DP），战力低的一方被击破并进入对方时间线。",
      },
      {
        q: "如何使用冲击卡？",
        a: "冲击卡存放于独立的冲击卡组中（9 张）。在合适的时机可以从冲击卡组发动冲击卡，发挥特殊效果。冲击卡具有 counter（反击）等类型，可在对方攻击时发动。",
      },
      {
        q: "Lv4+ 的角色号召时需要撤退吗？",
        a: "是的。Lv4 及以上的角色号召时，需要撤退场上总 Lv ≥ 该角色 Lv 的角色卡。被撤退的角色进入撤退区。例如：号召 Lv4 角色时，需撤退场上总 Lv ≥ 4 的角色（如两张 Lv2 角色，或一张 Lv3 + 一张 Lv1 角色）。",
      },
    ],
  },
  {
    id: "effects",
    title: "卡牌效果",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
    items: [
      {
        q: "卡牌有哪 4 类效果？",
        a: "• 触发效果（Trigger）— 满足特定条件时自动发动\n• 常驻效果（Static）— 只要卡牌在场上就持续生效\n• 起动效果（Active）— 在主要阶段主动发动\n• 反击效果（Counter）— 在对方攻击时发动，用于反击或干扰",
      },
      {
        q: "结附系统是什么？",
        a: "某些卡牌效果可以将自身结附到其他卡牌上，为目标卡牌提供持续的效果加成或特殊能力。结附卡牌跟随目标移动，当目标离开场时结附卡牌也会一同处理。",
      },
      {
        q: "R 值是什么？有什么作用？",
        a: "R 值是角色的基础属性之一，代表角色的抵抗力。R 值影响某些效果的计算，例如受到伤害时的判定。如果卡牌数据中没有明确 R 值，默认为 1。",
      },
    ],
  },
  {
    id: "deckbuilding",
    title: "组卡规则",
    icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    items: [
      {
        q: "卡组的构成要求是什么？",
        a: "一套合法卡组由两部分组成：\n• 主卡组：50 张角色卡（card_type = 1）\n• 冲击卡组：9 张冲击卡（card_type = 2）\n两部分独立计算，不能混用。",
      },
      {
        q: "同名卡牌最多可以放几张？",
        a: "同名牌（相同 card_no）最多可以放入 3 张。不同稀有度的同名卡视为同一张牌，共享这个限制。",
      },
      {
        q: "颜色（属性）有什么限制？",
        a: "主卡组中最多只能包含 2 种不同颜色（属性）的卡牌。例如：红色 + 蓝色是合法的，但红色 + 蓝色 + 绿色则不合法。组卡器会自动检测颜色数量并提示。",
      },
      {
        q: "如何判断卡组是否合规？",
        a: "组卡器顶部的统计栏会实时显示卡组合规状态：\n• 主卡组 50/50 ✓\n• 冲击卡 9/9 ✓\n• 颜色 ≤ 2 种 ✓\n• 同名牌 ≤ 3 张 ✓\n所有条件满足时显示「✓ 合规」标记。",
      },
    ],
  },
  {
    id: "faq",
    title: "常见问题",
    icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    items: [
      {
        q: "如何分享我的卡组给朋友？",
        a: "在组卡器中编辑好卡组后，点击顶部的「分享」按钮，系统会自动生成一个分享链接并复制到剪贴板。将链接发给朋友，他们打开即可导入你的卡组。",
      },
      {
        q: "如何导入别人分享的卡组码？",
        a: "在组卡器左侧栏的「导入卡组码」输入框中，粘贴卡组码或分享链接（如 https://...#deck=xxx），然后点击「导入」按钮即可加载到编辑区。",
      },
      {
        q: "如何使用官方预组卡组？",
        a: "在组卡器左侧栏的「官方预组」区域，点击 SD01 或 SD02 卡组即可加载到编辑区。预组卡组是官方提供的开箱即用卡组，适合新手快速上手。",
      },
      {
        q: "保存的卡组存在哪里？",
        a: "卡组保存在浏览器的 localStorage 中（键名 marvel-tcg-decks）。注意：清除浏览器数据会导致保存的卡组丢失。建议使用分享功能备份重要卡组。",
      },
      {
        q: "对战大厅中如何选择卡组？",
        a: "在对战大厅中，可以选择使用官方预组（SD01/SD02）或从已保存的卡组中选择。选择卡组和先后手后，点击「开始对战」即可进入游戏准备阶段。",
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [openSection, setOpenSection] = useState<string | null>("basics");
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(["basics-0"]));

  const toggleSection = useCallback((sectionId: string) => {
    setOpenSection((prev) => (prev === sectionId ? null : sectionId));
  }, []);

  const toggleItem = useCallback((itemId: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-[#0f1923]">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        {/* Page header */}
        <div className="text-center py-4">
          <h1 className="text-2xl font-bold text-[#e8eaed] flex items-center justify-center gap-2">
            <span className="text-red-500">⚡</span>
            游戏帮助
          </h1>
          <p className="text-sm text-[#667788] mt-1.5">
            超英击战规则指南 · 点击问题展开/收起
          </p>
        </div>

        {/* Q&A sections */}
        {SECTIONS.map((section) => {
          const isSectionOpen = openSection === section.id;
          return (
            <div
              key={section.id}
              className="bg-[#131f2e] rounded-xl border border-[#1e2d42] overflow-hidden"
            >
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1a2535] transition"
              >
                <div className="w-8 h-8 rounded-lg bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-4 h-4 text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={section.icon}
                    />
                  </svg>
                </div>
                <span className="flex-1 text-left text-sm font-bold text-[#e8eaed]">
                  {section.title}
                </span>
                <svg
                  className={`w-4 h-4 text-[#667788] transition-transform ${
                    isSectionOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Section items */}
              {isSectionOpen && (
                <div className="border-t border-[#1e2d42] divide-y divide-[#1e2d42]">
                  {section.items.map((item, idx) => {
                    const itemId = `${section.id}-${idx}`;
                    const isItemOpen = openItems.has(itemId);
                    return (
                      <div key={itemId}>
                        <button
                          onClick={() => toggleItem(itemId)}
                          className="w-full flex items-start gap-2.5 px-4 py-2.5 hover:bg-[#1a2535] transition text-left"
                        >
                          <span
                            className={`text-xs font-bold mt-0.5 transition-colors ${
                              isItemOpen ? "text-red-400" : "text-[#445566]"
                            }`}
                          >
                            Q
                          </span>
                          <span className="flex-1 text-sm text-[#c9cdd4] font-medium">
                            {item.q}
                          </span>
                          <svg
                            className={`w-3.5 h-3.5 text-[#667788] mt-0.5 transition-transform flex-shrink-0 ${
                              isItemOpen ? "rotate-180" : ""
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isItemOpen && (
                          <div className="px-4 pb-3 pl-10">
                            <div className="flex items-start gap-2.5">
                              <span className="text-xs font-bold mt-0.5 text-green-400">
                                A
                              </span>
                              <p className="flex-1 text-sm text-[#8899aa] leading-relaxed whitespace-pre-line">
                                {item.a}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Footer */}
        <div className="text-center py-4 text-xs text-[#445566]">
          <p>超英击战 TCG · 卡牌对战模拟器</p>
          <p className="mt-1">如有更多问题，请参考游戏规则书或联系开发者</p>
        </div>
      </div>
    </div>
  );
}
