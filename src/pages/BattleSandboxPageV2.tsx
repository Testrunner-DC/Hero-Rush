import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  ATOMIC_OPERATION_CATALOG_V2,
  type CardDatabase,
  type FieldZoneV2,
  type PlayerIndex,
} from "@hero-rush/game-core";
import type { GameCommandV2Message } from "@hero-rush/protocol";
import BattleScreenV2 from "../components/battle-v2/BattleScreenV2";
import { isSandboxLaunchStateV2 } from "../battle-v2/sandboxLaunchV2";
import { useSandboxBattleV2 } from "../hooks/useSandboxBattleV2";

export default function BattleSandboxPageV2({ db }: { db: CardDatabase }) {
  const location = useLocation();
  const launch = isSandboxLaunchStateV2(location.state) ? location.state : null;
  const [seed, setSeed] = useState(() => launch?.seed ?? "hero-rush-sandbox");
  const [gmOpen, setGmOpen] = useState(false);
  const [gmTarget, setGmTarget] = useState<PlayerIndex>(0);
  const [gmCardId, setGmCardId] = useState("");
  const [gmDestination, setGmDestination] = useState<FieldZoneV2>("vanguard");
  const autoCreateRef = useRef(false);
  const sandbox = useSandboxBattleV2();

  const reset = () => {
    if (!launch) return;
    sandbox.createSandbox(
      seed,
      [
        { name: launch.players[0].name, deck: launch.players[0].deck, rushDeck: launch.players[0].rushDeck },
        { name: launch.players[1].name, deck: launch.players[1].deck, rushDeck: launch.players[1].rushDeck },
      ],
    );
  };

  useEffect(() => {
    if (!launch || sandbox.view || sandbox.status !== "connected" || autoCreateRef.current) return;
    autoCreateRef.current = true;
    sandbox.createSandbox(
      launch.seed,
      [
        { name: launch.players[0].name, deck: launch.players[0].deck, rushDeck: launch.players[0].rushDeck },
        { name: launch.players[1].name, deck: launch.players[1].deck, rushDeck: launch.players[1].rushDeck },
      ],
    );
  }, [launch, sandbox.status, sandbox.view]);

  const submit = (actor: PlayerIndex, command: GameCommandV2Message, label: string = command.type) => (
    sandbox.submitGameCommand(actor, command, label)
  );

  const finishMulligan = () => sandbox.finishMulligan();

  const runDrawAtom = () => {
    sandbox.applyAtomicOperations([{ kind: "DRAW", actor: gmTarget, count: 1 }], "GM · 目标玩家抽 1 张");
  };

  const view = sandbox.view;
  const responsePriority = view && (view.flow.kind === "BATTLE_RESPONSE" || view.flow.kind === "TURN_RESPONSE")
    ? view.flow.priority
    : undefined;
  const actor = view?.pendingDecision?.actor ?? responsePriority ?? view?.flow.actor ?? view?.activePlayer ?? 0;
  const gmFieldCards = view ? Object.values(view.players[gmTarget].field).flat() : [];
  const gmPublicCards = view ? [
    ...view.players[gmTarget].baseCards,
    ...view.players[gmTarget].baseCovered,
    ...gmFieldCards,
    ...view.players[gmTarget].timeline,
    ...view.players[gmTarget].retreat,
    ...view.players[gmTarget].void,
    ...view.players[gmTarget].attached,
  ] : [];
  const cardName = (definitionId: string) => db.cards.find((card) => card.id === definitionId)?.name ?? definitionId;

  useEffect(() => {
    if (!gmPublicCards.some((card) => card.instanceId === gmCardId)) setGmCardId(gmPublicCards[0]?.instanceId ?? "");
  }, [gmCardId, gmTarget, view?.revision]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "t" && !event.ctrlKey && !event.metaKey && !event.altKey) setGmOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!launch) return <Navigate to="/battle" replace />;

  return (
    <div className="relative h-full overflow-hidden bg-[#eeeae4]" data-ui-contract="hero-rush-v2-fullscreen-sandbox">
      {!view && <main className="grid h-full place-items-center bg-[radial-gradient(circle_at_top,rgba(220,38,38,.11),transparent_38%),linear-gradient(135deg,#f5f1eb,#e7e1d8)] p-5" data-ui-contract="hero-rush-v2-sandbox-launching"><section className="rounded-xl border border-stone-300 bg-white/95 px-8 py-7 text-center shadow-xl"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-red-600" /><h1 className="mt-4 text-lg font-black text-stone-900">正在建立沙盒对局</h1><p className="mt-2 text-xs text-stone-500">{launch.players[0].name} · {launch.players[0].deckName}<br />对阵<br />{launch.players[1].name} · {launch.players[1].deckName}</p><Link to="/battle" className="mt-4 inline-block text-xs font-bold text-red-700">取消并返回大厅</Link></section></main>}

      {view && <BattleScreenV2
        view={view}
        db={db}
        omniscient
        orientationSeat={0}
        events={sandbox.logs.flatMap((log) => log.events)}
        onSubmitMulligan={(cardIds) => {
          if (view?.pendingDecision?.kind === "MULLIGAN") submit(actor, { type: "SUBMIT_MULLIGAN", cardIds }, `玩家 ${actor + 1} 提交调度`);
        }}
        onSubmitGameCommand={(command: GameCommandV2Message) => submit(actor, command)}
      />}

      {view && <div className="absolute right-3 top-3 z-[80] flex items-center gap-2">
        <Link to="/battle" className="rounded-md border border-stone-300 bg-white/95 px-3 py-2 text-[10px] font-bold text-stone-700 shadow">返回大厅</Link>
        <button onClick={() => setGmOpen(true)} className="rounded-md bg-red-700 px-3 py-2 text-[10px] font-bold text-white shadow">GM · T</button>
      </div>}

      {gmOpen && <aside className="absolute bottom-3 right-3 top-3 z-[90] flex w-[360px] flex-col overflow-hidden rounded-xl border border-stone-300 bg-[#fcfaf7]/[.98] shadow-2xl" aria-label="GM 面板">
        <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3"><div><p className="text-[9px] font-bold tracking-[.16em] text-red-600">SANDBOX CONTROL</p><h1 className="text-base font-bold">GM 面板</h1></div><button onClick={() => setGmOpen(false)} className="rounded border border-stone-300 px-2 py-1 text-xs">关闭 · T</button></header>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
          <section className="space-y-2"><h2 className="text-xs font-bold">沙盒配置</h2>
            <div className="grid grid-cols-2 gap-2 text-[9px]"><p className="rounded border border-stone-200 bg-white p-2"><span className="block text-stone-500">{launch.players[0].name}</span><b className="mt-1 block truncate text-stone-800">{launch.players[0].deckName}</b></p><p className="rounded border border-stone-200 bg-white p-2"><span className="block text-stone-500">{launch.players[1].name}</span><b className="mt-1 block truncate text-stone-800">{launch.players[1].deckName}</b></p></div>
            <input value={seed} onChange={(event) => setSeed(event.target.value)} className="w-full rounded border border-stone-300 bg-white px-3 py-2 font-mono text-xs" aria-label="随机种子" />
            <div className="grid grid-cols-2 gap-2"><button onClick={reset} className="rounded bg-red-700 px-3 py-2 text-xs font-bold text-white">重建沙盒</button><button onClick={finishMulligan} disabled={view?.pendingDecision?.kind !== "MULLIGAN"} className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-35">双方跳过调度</button></div>
          </section>

          <section className="space-y-2 border-t border-stone-200 pt-4"><h2 className="text-xs font-bold">GM 调度</h2>
            <div className="grid grid-cols-2 gap-2"><button onClick={() => setGmTarget(0)} className={`rounded border px-3 py-2 text-xs ${gmTarget === 0 ? "border-red-500 bg-red-50 text-red-700" : "border-stone-300 bg-white"}`}>玩家 1</button><button onClick={() => setGmTarget(1)} className={`rounded border px-3 py-2 text-xs ${gmTarget === 1 ? "border-red-500 bg-red-50 text-red-700" : "border-stone-300 bg-white"}`}>玩家 2</button></div>
            <button onClick={runDrawAtom} disabled={!view || view.status === "finished"} className="w-full rounded bg-stone-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-35">目标玩家抽 1 张</button>
            <label className="block text-[9px] font-bold text-stone-500">公开区域目标卡
              <select value={gmCardId} onChange={(event) => setGmCardId(event.target.value)} className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-xs font-normal text-stone-800">
                {gmPublicCards.length === 0 && <option value="">当前没有公开卡牌</option>}
                {gmPublicCards.map((card) => <option key={card.instanceId} value={card.instanceId}>{cardName(card.definitionId)} · {card.instanceId.slice(-6)}</option>)}
              </select>
            </label>
            <button onClick={() => sandbox.applyAtomicOperations([{ kind: "RETREAT", cardIds: [gmCardId] }], `GM · 撤退 ${gmCardId}`)} disabled={!gmCardId || !view || view.status === "finished"} className="w-full rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-35">将目标卡移至撤退区</button>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select value={gmDestination} onChange={(event) => setGmDestination(event.target.value as FieldZoneV2)} className="rounded border border-stone-300 bg-white px-3 py-2 text-xs">
                <option value="vanguard">先锋区</option><option value="flankLeft">左侧翼区</option><option value="flankRight">右侧翼区</option><option value="rear">后卫区</option>
              </select>
              <button onClick={() => sandbox.applyAtomicOperations([{ kind: "MOVE_FIELD", cardId: gmCardId, destination: gmDestination }], `GM · 移动 ${gmCardId}`)} disabled={!gmFieldCards.some((card) => card.instanceId === gmCardId) || !view || view.status === "finished"} className="rounded border border-stone-300 bg-white px-3 py-2 text-xs font-bold disabled:opacity-35">移动</button>
            </div>
            <p className="rounded bg-amber-50 px-3 py-2 text-[9px] leading-4 text-amber-800">GM 命令通过服务端原子执行并进入审计轨迹；普通对战操作仍走规则命令，不在浏览器本地改状态。</p>
          </section>

          <details className="border-t border-stone-200 pt-4"><summary className="cursor-pointer text-xs font-bold">状态诊断</summary><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><small className="text-stone-500">修订</small><b className="block">{view?.revision ?? 0}</b></div><div><small className="text-stone-500">流程</small><b className="block truncate">{view?.flow.kind ?? "-"}</b></div></div><small className="mt-2 block text-[9px] text-stone-500">服务端状态哈希</small><code className="mt-1 block truncate rounded bg-stone-100 p-2 text-[8px]">{view?.stateHash ?? "-"}</code><small className="mt-2 block text-[9px] text-stone-500">连接状态：{sandbox.status}</small>{sandbox.invariantIssues.length ? <p className="mt-2 rounded bg-red-50 p-2 text-[10px] text-red-700">{sandbox.invariantIssues.join("；")}</p> : <p className="mt-2 rounded bg-emerald-50 p-2 text-[10px] text-emerald-700">服务端状态不变量通过</p>}</details>
          <details className="border-t border-stone-200 pt-4"><summary className="cursor-pointer text-xs font-bold">效果原子目录</summary><div className="mt-2 grid grid-cols-2 gap-1">{ATOMIC_OPERATION_CATALOG_V2.map((atom) => <div key={atom.kind} className="rounded border border-stone-200 bg-stone-50 p-2" title={atom.description}><b className="block text-[10px]">{atom.label}</b><code className="text-[8px] text-stone-500">{atom.kind}</code></div>)}</div></details>
          <details className="border-t border-stone-200 pt-4"><summary className="cursor-pointer text-xs font-bold">事件与原子轨迹</summary><div className="mt-2 max-h-72 space-y-1 overflow-y-auto">{[...sandbox.logs].reverse().map((log, index) => <details key={`${log.revision}-${index}`} className="rounded border border-stone-200 bg-stone-50 p-2"><summary className="cursor-pointer text-[10px] font-medium">r{log.revision} · {log.label}</summary><pre className="mt-2 whitespace-pre-wrap text-[8px] text-stone-500">{JSON.stringify({ events: log.events, trace: log.trace }, null, 2)}</pre></details>)}</div></details>
        </div>
      </aside>}

      {sandbox.lastError && <p className="absolute left-1/2 top-3 z-[100] -translate-x-1/2 rounded-lg border border-red-200 bg-red-50/95 px-4 py-2 text-xs text-red-700 shadow">{sandbox.lastError}</p>}
    </div>
  );
}
