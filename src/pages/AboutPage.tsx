/**
 * AboutPage — 关于页面 (MSA Light Theme)
 *
 * 应用信息、版本号、技术栈、致谢、免责声明
 */

interface TechItem {
  name: string;
  desc: string;
  icon: string;
}

const TECH_STACK: TechItem[] = [
  { name: "React 19", desc: "UI 框架", icon: "⚛" },
  { name: "TypeScript", desc: "类型安全", icon: "TS" },
  { name: "Vite", desc: "构建工具", icon: "⚡" },
  { name: "Tailwind CSS", desc: "样式系统", icon: "🎨" },
  { name: "WebRTC", desc: "P2P 对战", icon: "🔗" },
];

interface FeatureItem {
  title: string;
  desc: string;
}

const FEATURES: FeatureItem[] = [
  { title: "卡牌图鉴", desc: "全卡牌浏览，多维度筛选，高清图鉴" },
  { title: "智能组卡", desc: "拖拽式组卡，实时合规校验，卡组分享" },
  { title: "卡组广场", desc: "官方预组、社区卡组、卡组码导入导出" },
  { title: "在线对战", desc: "WebRTC P2P 实时对战，房间制匹配" },
  { title: "社区聊天", desc: "策略交流、对战约战、新手答疑" },
  { title: "本地存储", desc: "卡组、聊天、设置全部本地保存，无需注册" },
];

export default function AboutPage() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-[#fcfaf7]">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* ── App identity ────────────────────────────────────── */}
        <div className="text-center py-6">
          <img
            src="/logo.png"
            alt="斗界竞技场"
            className="inline-block w-16 h-16 rounded-2xl shadow-lg border-2 border-red-200 mb-4 object-contain bg-white"
          />
          <h1 className="text-2xl font-black text-stone-800 mb-1">
            斗界竞技场
          </h1>
          <p className="text-sm text-stone-500">
            漫威对战卡牌：超英击战 TCG
          </p>
          <p className="text-sm text-stone-400">
            卡牌图鉴 · 智能组卡 · 在线对战
          </p>
          <div className="inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full bg-white border border-stone-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-xs text-stone-500">Version 1.0.0</span>
          </div>
        </div>

        {/* ── Features ────────────────────────────────────────── */}
        <Section title="核心功能" icon="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z">
          <div className="grid grid-cols-2 gap-2.5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-stone-50 rounded-lg border border-stone-100 p-3"
              >
                <h4 className="text-sm font-medium text-stone-800 mb-0.5">{f.title}</h4>
                <p className="text-xs text-stone-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Tech stack ──────────────────────────────────────── */}
        <Section title="技术栈" icon="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z">
          <div className="flex flex-wrap gap-2">
            {TECH_STACK.map((tech) => (
              <div
                key={tech.name}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-50 border border-stone-100"
              >
                <span className="text-sm font-bold text-red-600 w-6 text-center">{tech.icon}</span>
                <div>
                  <p className="text-xs font-medium text-stone-700">{tech.name}</p>
                  <p className="text-[10px] text-stone-400">{tech.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Game rules quick reference ──────────────────────── */}
        <Section title="卡组规则速查" icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z">
          <div className="space-y-2">
            <RuleRow label="主卡组" value="50 张角色卡" />
            <RuleRow label="冲击卡组" value="9 张冲击卡" />
            <RuleRow label="同名卡上限" value="每种 3 张" />
            <RuleRow label="属性限制" value="最多 2 种属性" />
            <RuleRow label="冲击卡上限" value="每种 9 张" />
          </div>
        </Section>

        {/* ── Disclaimer ──────────────────────────────────────── */}
        <Section title="免责声明" icon="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z">
          <div className="space-y-2 text-xs text-stone-500 leading-relaxed">
            <p>
              本应用是一个非商业性质的同好工具，仅供学习交流使用。
            </p>
            <p>
              卡牌数据、图片等素材版权归原作者所有。本应用不存储任何用户隐私数据，
              所有数据均保存在浏览器本地。
            </p>
            <p>
              在线对战功能基于 WebRTC P2P 技术，不经过任何中间服务器，
              连接信息仅在对战双方之间传输。
            </p>
          </div>
        </Section>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div className="text-center py-4">
          <p className="text-xs text-stone-400">
            斗界竞技场 · 漫威对战卡牌：超英击战 · 2025
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-card">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-stone-100">
        <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <h2 className="text-sm font-bold text-stone-800">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-stone-500">{label}</span>
      <span className="text-sm text-stone-700 font-medium">{value}</span>
    </div>
  );
}
