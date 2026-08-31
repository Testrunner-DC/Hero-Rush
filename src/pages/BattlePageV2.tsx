import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Card, CardDatabase, Deck } from "@hero-rush/game-core";
import BattleScreenV2 from "../components/battle-v2/BattleScreenV2";
import { useOnlineBattleV2 } from "../hooks/useOnlineBattleV2";
import { loadOfficialBattleDecksV2, localBattleDecksV2, type BattleDeckOptionV2 } from "../battle-v2/decksV2";
import type { SandboxLaunchStateV2 } from "../battle-v2/sandboxLaunchV2";
import { useAuth } from "../hooks/useAuth";

type LobbyMode = "casual" | "friend" | "sandbox";

export default function BattlePageV2({ db, savedDecks, cardMap }: { db: CardDatabase; savedDecks: Deck[]; cardMap: Map<string, Card> }) {
  const { user, isLoading: authLoading } = useAuth();
  const online = useOnlineBattleV2(db);
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [sandboxOpponentName, setSandboxOpponentName] = useState("玩家2");
  const [officialDecks, setOfficialDecks] = useState<BattleDeckOptionV2[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [sandboxOpponentDeckId, setSandboxOpponentDeckId] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState<LobbyMode>("friend");
  const [deckError, setDeckError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOfficialBattleDecksV2(db)
      .then((decks) => {
        if (cancelled) return;
        setOfficialDecks(decks);
        setSelectedDeckId((current) => current || decks[0]?.id || "");
        setSandboxOpponentDeckId((current) => current || decks[1]?.id || decks[0]?.id || "");
      })
      .catch((error) => { if (!cancelled) setDeckError(error instanceof Error ? error.message : "官方预组读取失败"); });
    return () => { cancelled = true; };
  }, [db]);

  useEffect(() => {
    if (!authLoading) setPlayerName((current) => current || user?.username || "玩家1");
  }, [authLoading, user?.username]);

  const mine = useMemo(() => localBattleDecksV2(db, cardMap, savedDecks), [db, cardMap, savedDecks]);
  const deckOptions = useMemo(() => [...officialDecks, ...mine.filter((deck) => !officialDecks.some((official) => official.name === deck.name))], [officialDecks, mine]);
  const selectedDeck = deckOptions.find((deck) => deck.id === selectedDeckId) ?? deckOptions[0] ?? null;
  const sandboxOpponentDeck = deckOptions.find((deck) => deck.id === sandboxOpponentDeckId) ?? deckOptions[1] ?? deckOptions[0] ?? null;
  const serverLabel = online.status === "connected" ? "V2 服务器在线"
    : online.status === "connecting" ? "正在连接 V2"
      : online.status === "reconnecting" ? "正在恢复连接"
        : online.status === "error" ? "V2 连接异常" : "V2 对局服务运行中";
  const canEnter = Boolean(selectedDeck && selectedDeck.mainDeck.length === 50 && selectedDeck.rushDeck.length === 9);
  const canEnterSandbox = Boolean(canEnter
    && sandboxOpponentDeck
    && sandboxOpponentDeck.mainDeck.length === 50
    && sandboxOpponentDeck.rushDeck.length === 9
    && playerName.trim()
    && sandboxOpponentName.trim());
  const surrender = () => { if (window.confirm("确定投降并结束本局对战吗？")) online.surrender(); };

  if (online.status === "inGame" && online.battle.view) {
    return (
      <div className="relative h-full">
        {!online.opponentConnected && <div className="absolute left-1/2 top-3 z-[70] -translate-x-1/2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950">对手断线，等待恢复</div>}
        <div className="absolute right-3 top-3 z-[80] flex items-center gap-2 rounded-md border border-stone-300 bg-white/95 p-1.5 shadow"><span className={`flex items-center gap-1.5 px-2 text-[9px] font-bold ${online.opponentConnected ? "text-emerald-700" : "text-amber-700"}`}><i className="h-1.5 w-1.5 rounded-full bg-current" />对手{online.opponentConnected ? "在线" : "断线"}</span><button onClick={surrender} className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-[9px] font-bold text-red-700">投降</button></div>
        <BattleScreenV2 view={online.battle.view} db={db} events={online.battle.events} onSubmitMulligan={online.submitMulligan} onSubmitGameCommand={online.submitGameCommand} />
      </div>
    );
  }

  const joinCasual = () => { if (selectedDeck) online.joinQueue(selectedDeck.mainDeck, selectedDeck.rushDeck, playerName); };
  const createRoom = () => { if (selectedDeck) online.createPrivateRoom(selectedDeck.mainDeck, selectedDeck.rushDeck, playerName); };
  const joinRoom = () => { if (selectedDeck) online.joinPrivateRoom(roomCode, selectedDeck.mainDeck, selectedDeck.rushDeck, playerName); };
  const enterSandbox = () => {
    if (!selectedDeck || !sandboxOpponentDeck || !canEnterSandbox) return;
    const state: SandboxLaunchStateV2 = {
      source: "battle-lobby",
      seed: `hero-rush-sandbox-${Date.now()}`,
      players: [
        { name: playerName.trim(), deckName: selectedDeck.name, deck: selectedDeck.mainDeck, rushDeck: selectedDeck.rushDeck },
        { name: sandboxOpponentName.trim(), deckName: sandboxOpponentDeck.name, deck: sandboxOpponentDeck.mainDeck, rushDeck: sandboxOpponentDeck.rushDeck },
      ],
    };
    navigate("/battle/sandbox", { state });
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--msa-bg)] p-4 scrollbar-thin">
      <div className="mx-auto max-w-5xl space-y-4 pb-12">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-semibold tracking-[0.18em] text-red-500">HERO RUSH · RULE 1.02</p><h1 className="mt-1 text-2xl font-bold text-[var(--msa-text-primary)]">对战大厅</h1><p className="mt-1 text-xs text-[var(--msa-text-muted)]">选择卡组，进入 V2 匹配、好友房或本地规则沙盒。</p></div>
          <div className="flex items-center gap-3"><span className={`flex items-center gap-2 text-xs font-medium ${online.status === "connected" ? "text-emerald-600" : online.status === "error" ? "text-red-600" : "text-amber-600"}`}><i className="h-2 w-2 rounded-full bg-current" />{serverLabel}</span><Link to="/" className="rounded-lg border border-[var(--msa-border)] bg-white px-3 py-2 text-xs text-[var(--msa-text-muted)]">← 返回主页</Link></div>
        </header>

        <nav className="grid grid-cols-3 rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)] p-1" aria-label="对战模式">
          {([{ key: "casual", label: "休闲匹配" }, { key: "friend", label: "好友房" }, { key: "sandbox", label: "测试沙盒" }] as { key: LobbyMode; label: string }[]).map((item) => <button key={item.key} onClick={() => setMode(item.key)} className={`rounded-lg px-4 py-2.5 text-sm font-medium ${mode === item.key ? "bg-red-600 text-white shadow-sm" : "text-[var(--msa-text-muted)] hover:bg-[var(--msa-bg-alt)]"}`}>{item.label}</button>)}
        </nav>

        {online.status === "queuing" ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"><p className="text-xs text-amber-700">{online.privateRoomCode ? "好友房已建立，等待另一位玩家加入" : "正在寻找对手"}</p>{online.privateRoomCode && <strong className="my-3 block font-mono text-4xl tracking-[0.28em] text-amber-800">{online.privateRoomCode}</strong>}<button onClick={online.leaveQueue} className="rounded-lg border border-amber-300 bg-white px-5 py-2 text-sm font-medium text-amber-800">取消等待</button></section> : mode === "casual" ? (
          <section className="rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)] p-6"><p className="text-[10px] font-semibold tracking-[0.16em] text-red-500">V2 CASUAL</p><h2 className="mt-1 text-xl font-bold">休闲匹配</h2><p className="mt-2 max-w-2xl text-xs leading-6 text-[var(--msa-text-muted)]">服务器按 1.02 规则执行命令、保存事件日志并支持断线恢复。休闲匹配允许游客进入，不记录排位分。</p><div className="mt-5 grid max-w-3xl gap-3 md:grid-cols-2"><label className="text-xs text-[var(--msa-text-muted)]">本局卡组<select value={selectedDeck?.id ?? ""} onChange={(event) => setSelectedDeckId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-3 py-2 text-sm font-bold text-[var(--msa-text-primary)]">{deckOptions.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}{deck.source === "mine" ? " · 我的" : " · 官方"}</option>)}</select></label><label className="text-xs text-[var(--msa-text-muted)]">对战名称<input value={playerName} maxLength={24} onChange={(event) => setPlayerName(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-3 py-2 text-sm" /></label></div><div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--msa-text-muted)]"><span>{selectedDeck ? `${selectedDeck.mainDeck.length} 张主卡 · ${selectedDeck.rushDeck.length} 张冲击卡` : "尚无可用卡组"}</span><Link to="/plaza" className="font-bold text-red-600">管理卡组</Link></div><button disabled={!canEnter || online.status === "connecting" || online.status === "reconnecting"} onClick={joinCasual} className="mt-5 min-w-56 rounded-lg bg-red-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">进入休闲匹配</button></section>
        ) : mode === "friend" ? (
          <section className="rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)] p-6"><p className="text-[10px] font-semibold tracking-[0.16em] text-red-500">V2 PRIVATE ROOM</p><h2 className="mt-1 text-xl font-bold">好友房</h2><p className="mt-2 text-xs leading-6 text-[var(--msa-text-muted)]">创建房间后把六位房间码发给对手，双方使用各自锁定的 50+9 卡组快照进入对局。</p><div className="mt-5 grid gap-3 md:grid-cols-2"><label className="text-xs text-[var(--msa-text-muted)]">本局卡组<select value={selectedDeck?.id ?? ""} onChange={(event) => setSelectedDeckId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-3 py-2 text-sm font-bold text-[var(--msa-text-primary)]">{deckOptions.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}{deck.source === "mine" ? " · 我的" : " · 官方"}</option>)}</select></label><label className="text-xs text-[var(--msa-text-muted)]">对战名称<input value={playerName} maxLength={24} onChange={(event) => setPlayerName(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-3 py-2 text-sm" /></label></div><div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--msa-text-muted)]"><span>{selectedDeck ? `${selectedDeck.mainDeck.length} 张主卡 · ${selectedDeck.rushDeck.length} 张冲击卡` : "尚无可用卡组"}</span><Link to="/plaza" className="font-bold text-red-600">管理卡组</Link></div><div className="mt-5 grid gap-3 md:grid-cols-[auto_minmax(180px,1fr)_auto]"><button disabled={!canEnter} onClick={createRoom} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-40">创建房间</button><input value={roomCode} maxLength={6} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="输入六位房间码" className="rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-3 py-2 font-mono text-sm uppercase tracking-widest" /><button disabled={!canEnter || roomCode.trim().length !== 6} onClick={joinRoom} className="rounded-lg border border-red-300 bg-red-50 px-5 py-2 text-sm font-bold text-red-700 disabled:opacity-40">加入房间</button></div></section>
        ) : (
          <section className="rounded-xl border border-[var(--msa-border)] bg-[var(--msa-surface)] p-6" data-ui-contract="hero-rush-v2-lobby-sandbox-setup"><p className="text-[10px] font-semibold tracking-[0.16em] text-red-500">LOCAL V2 SANDBOX</p><h2 className="mt-1 text-xl font-bold">规则测试沙盒</h2><p className="mt-2 max-w-2xl text-xs leading-6 text-[var(--msa-text-muted)]">在这里一次确定双方用户名与卡组后直接进入战场。沙盒公开双方完整信息，结果不计入对战记录。</p><div className="mt-5 grid gap-3 md:grid-cols-[minmax(160px,.7fr)_minmax(220px,1fr)]"><label className="text-xs text-[var(--msa-text-muted)]">玩家 1 用户名<input value={playerName} maxLength={24} onChange={(event) => setPlayerName(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-3 py-2 text-sm font-bold text-[var(--msa-text-primary)]" /></label><label className="text-xs text-[var(--msa-text-muted)]">玩家 1 卡组<select value={selectedDeck?.id ?? ""} onChange={(event) => setSelectedDeckId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-3 py-2 text-sm font-bold text-[var(--msa-text-primary)]">{deckOptions.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}{deck.source === "mine" ? " · 我的" : " · 官方"}</option>)}</select></label><label className="text-xs text-[var(--msa-text-muted)]">玩家 2 用户名<input value={sandboxOpponentName} maxLength={24} onChange={(event) => setSandboxOpponentName(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-3 py-2 text-sm font-bold text-[var(--msa-text-primary)]" /></label><label className="text-xs text-[var(--msa-text-muted)]">玩家 2 卡组<select value={sandboxOpponentDeck?.id ?? ""} onChange={(event) => setSandboxOpponentDeckId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--msa-border-strong)] bg-[var(--msa-bg)] px-3 py-2 text-sm font-bold text-[var(--msa-text-primary)]">{deckOptions.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}{deck.source === "mine" ? " · 我的" : " · 官方"}</option>)}</select></label></div><div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--msa-text-muted)]"><span>双方均使用锁定的 50 张主卡与 9 张冲击卡快照</span><Link to="/plaza" className="font-bold text-red-600">管理卡组</Link></div><button disabled={!canEnterSandbox} onClick={enterSandbox} className="mt-5 rounded-lg bg-red-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">使用以上卡组进入沙盒</button></section>
        )}

        {(deckError || online.battle.lastError) && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{deckError || online.battle.lastError?.message}</p>}
      </div>
    </div>
  );
}
