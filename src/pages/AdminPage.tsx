import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { hasAdminSession, loadAdminOverview, loginAdmin, logoutAdmin, type AdminOverview } from "../lib/adminApi";

export default function AdminPage() {
  const [username, setUsername] = useState("Admin");
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setOverview(await loadAdminOverview()); }
    catch (reason) { setOverview(null); setError(reason instanceof Error ? reason.message : "后台读取失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (hasAdminSession()) void refresh(); }, [refresh]);
  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(null);
    try { await loginAdmin(username, password); setPassword(""); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "管理员登录失败"); setLoading(false); }
  };
  const logout = async () => { await logoutAdmin(); setOverview(null); setError(null); };

  return (
    <div className="h-full overflow-y-auto bg-[var(--msa-bg)] p-4 scrollbar-thin">
      <div className="mx-auto max-w-6xl space-y-4 pb-12">
        <header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold tracking-[0.18em] text-red-500">HERO RUSH OPERATIONS</p><h1 className="mt-1 text-2xl font-bold">管理后台</h1><p className="mt-1 text-xs text-[var(--msa-text-muted)]">只提供 V2 服务、房间和卡牌效果原子化所需的运行信息。</p></div><Link to="/battle" className="rounded-lg border border-[var(--msa-border)] bg-white px-4 py-2 text-xs">← 返回对战大厅</Link></header>

        {!overview ? <form onSubmit={login} className="mx-auto mt-16 max-w-sm rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)] p-6 shadow-sm"><h2 className="text-lg font-bold">管理员登录</h2><p className="mt-1 text-xs text-[var(--msa-text-muted)]">凭据只发送到本机后端，前端不会保存密码。</p><label className="mt-5 block text-xs text-[var(--msa-text-muted)]">名称<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="mt-1 w-full rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-3 py-2 text-sm" /></label><label className="mt-3 block text-xs text-[var(--msa-text-muted)]">密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-1 w-full rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-3 py-2 text-sm" /></label><button disabled={loading || !username || !password} className="mt-5 w-full rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-40">{loading ? "正在验证…" : "登录后台"}</button>{error && <p className="mt-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}</form> : <>
          <div className="flex items-center justify-between rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)] p-3"><span className="text-xs text-[var(--msa-text-muted)]">当前管理员：<b className="text-[var(--msa-text-primary)]">{overview.username}</b></span><div className="flex gap-2"><button onClick={() => void refresh()} disabled={loading} className="rounded-lg border border-[var(--msa-border)] bg-white px-3 py-1.5 text-xs">刷新</button><button onClick={() => void logout()} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">退出</button></div></div>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="V2 服务" value={overview.service.battleV2Enabled ? "运行中" : "未启用"} detail={`规则 ${overview.service.rulesetVersion}`} good={overview.service.battleV2Enabled} /><Metric label="匹配队列" value={String(overview.service.queuedPlayers)} detail="等待玩家" /><Metric label="好友房" value={String(overview.service.privateRooms)} detail="等待加入" /><Metric label="进行中" value={String(overview.service.activeMatches)} detail="权威对局" /></section>

          <section className="rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)] p-4"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[9px] font-semibold tracking-[0.16em] text-red-500">ATOMIC EFFECTS</p><h2 className="text-lg font-bold">效果原子目录</h2><p className="mt-1 text-xs text-[var(--msa-text-muted)]">每个原子执行后立即检查状态动作，服务器仅暴露描述，不暴露可执行回调。</p></div><Link to="/battle/sandbox" className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white">进入规则沙盒</Link></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{overview.effects.atoms.map((atom) => <article key={atom.kind} className="rounded-lg border border-[var(--msa-border)] bg-[var(--msa-bg-alt)] p-3"><span className="text-[9px] text-red-500">{atom.category}</span><h3 className="mt-1 text-sm font-bold">{atom.label}</h3><code className="text-[9px] text-[var(--msa-text-muted)]">{atom.kind}</code><p className="mt-2 text-[10px] leading-5 text-[var(--msa-text-muted)]">{atom.description}</p></article>)}</div></section>

          <section className="grid gap-3 lg:grid-cols-2"><div className="rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)] p-4"><h2 className="text-base font-bold">已登记卡效</h2><p className="mt-1 text-xs text-[var(--msa-text-muted)]">{overview.effects.registeredEffects.length} 个可执行效果定义</p>{overview.effects.registeredEffects.length ? <div className="mt-3 space-y-2">{overview.effects.registeredEffects.map((effect) => <article key={`${effect.cardNo}:${effect.effectId}`} className="rounded border border-[var(--msa-border)] p-2 text-xs"><b>{effect.cardNo} · {effect.label}</b><code className="mt-1 block text-[9px] text-[var(--msa-text-muted)]">{effect.effectId}</code></article>)}</div> : <p className="mt-4 rounded bg-amber-50 p-3 text-xs text-amber-700">当前生产卡效登记为 0。原子运行时已建立，但具体卡牌必须逐张按规则书实现和验收。</p>}</div><div className="rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)] p-4"><h2 className="text-base font-bold">卡池准入</h2><p className="mt-1 text-xs text-[var(--msa-text-muted)]">只有同时具备规则映射、效果定义和自动化证据的卡号才能进入严格 V2 卡池。</p><strong className="mt-5 block text-4xl text-red-600">{overview.effects.implementedCards.length}</strong><span className="text-xs text-[var(--msa-text-muted)]">张卡已达到严格准入条件</span></div></section>
        </>}
      </div>
    </div>
  );
}

function Metric({ label, value, detail, good }: { label: string; value: string; detail: string; good?: boolean }) {
  return <article className="rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)] p-4"><small className="text-[10px] text-[var(--msa-text-muted)]">{label}</small><b className={`mt-1 block text-2xl ${good ? "text-emerald-600" : "text-[var(--msa-text-primary)]"}`}>{value}</b><span className="text-[10px] text-[var(--msa-text-muted)]">{detail}</span></article>;
}
