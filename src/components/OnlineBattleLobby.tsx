/** 联机大厅：快速匹配、创建私人房间、加入私人房间。 */
import { useCallback, useState } from "react";
import type { Card, CardDatabase, Deck } from "../types/card";
import type { OnlineBattleController } from "../hooks/useOnlineBattle";
import { deckEntriesToCardIds, getRushCardIds } from "../engine";

interface OnlineBattleLobbyProps {
  db: CardDatabase;
  savedDecks: Deck[];
  cardMap: Map<string, Card>;
  onBack: () => void;
  battle: OnlineBattleController;
}

type MatchKind = "quick" | "create" | "join";

export default function OnlineBattleLobby({ db, savedDecks, cardMap, onBack, battle }: OnlineBattleLobbyProps) {
  const {
    status, lastError, joinQueue, leaveQueue,
    createPrivateRoom, joinPrivateRoom, disconnect,
  } = battle;
  const [selectedDeck, setSelectedDeck] = useState("precon_sd01");
  const [playerName, setPlayerName] = useState("斗士");
  const [matchKind, setMatchKind] = useState<MatchKind>("quick");
  const [roomCode, setRoomCode] = useState("");

  const buildPrecon = useCallback((prefix: "SD01" | "SD02") => {
    const bestByCardNo = new Map<string, Card>();
    for (const card of db.cards) {
      if (card.card_type !== 1 || !card.card_no.startsWith(prefix)) continue;
      const current = bestByCardNo.get(card.card_no);
      if (!current || card.rarity > current.rarity) bestByCardNo.set(card.card_no, card);
    }
    const definitions = [...bestByCardNo.values()]
      .sort((a, b) => a.card_no.localeCompare(b.card_no))
      .slice(0, 17);
    const mainCards = definitions.flatMap((card, index) =>
      Array(index === definitions.length - 1 ? 2 : 3).fill(card.id),
    );
    return { mainCards, rushCards: getRushCardIds(db, prefix) };
  }, [db]);

  const getDeckCards = useCallback((): { mainCards: string[]; rushCards: string[] } | null => {
    if (selectedDeck === "precon_sd01") return buildPrecon("SD01");
    if (selectedDeck === "precon_sd02") return buildPrecon("SD02");
    if (selectedDeck.startsWith("saved_")) {
      const deck = savedDecks[Number.parseInt(selectedDeck.slice(6), 10)];
      if (!deck) return null;
      return {
        mainCards: deckEntriesToCardIds(deck.main_deck, cardMap),
        rushCards: deckEntriesToCardIds(deck.rush_deck, cardMap),
      };
    }
    return null;
  }, [buildPrecon, cardMap, savedDecks, selectedDeck]);

  const start = useCallback(() => {
    const deck = getDeckCards();
    if (!deck) return;
    if (matchKind === "quick") joinQueue(deck.mainCards, deck.rushCards, playerName);
    else if (matchKind === "create") createPrivateRoom(deck.mainCards, deck.rushCards, playerName);
    else joinPrivateRoom(roomCode, deck.mainCards, deck.rushCards, playerName);
  }, [createPrivateRoom, getDeckCards, joinPrivateRoom, joinQueue, matchKind, playerName, roomCode]);

  const back = useCallback(() => {
    disconnect();
    onBack();
  }, [disconnect, onBack]);

  const waiting = status.type === "queuing" || status.type === "privateWaiting";
  const canStart = status.type === "connected" && (matchKind !== "join" || roomCode.trim().length >= 4);

  return (
    <div className="h-full overflow-y-auto bg-[#fcfaf7]">
      <div className="mx-auto max-w-2xl space-y-5 p-6">
        <div className="flex items-center gap-3">
          <button onClick={back} className="rounded-lg bg-stone-100 px-3 py-1 text-xs text-stone-500 hover:bg-stone-200">← 返回</button>
          <div>
            <h1 className="text-xl font-bold text-stone-800">🌐 联机对战</h1>
            <p className="text-xs text-stone-400">服务器权威规则 · 隐藏信息 · 断线恢复</p>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${status.type === "connected" ? "bg-green-500" : waiting ? "animate-pulse bg-blue-500" : "animate-pulse bg-yellow-400"}`} />
            {status.type === "connected" && <span className="text-green-700">已连接{status.authenticated ? " · 已登录" : " · 游客模式"}</span>}
            {status.type === "connecting" && <span className="text-stone-500">正在连接服务器…</span>}
            {status.type === "reconnecting" && <span className="text-amber-600">正在重连，第 {status.attempt} 次</span>}
            {status.type === "queuing" && <span className="text-blue-700">快速匹配中，队列位置 {status.position}</span>}
            {status.type === "privateWaiting" && <span className="text-blue-700">等待好友加入，房间码：<strong className="tracking-widest">{status.roomCode}</strong></span>}
            {status.type === "error" && <span className="text-red-600">{status.message}</span>}
          </div>
          {lastError && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-600">{lastError}</p>}
        </div>

        <section>
          <h2 className="mb-2 text-sm font-bold text-stone-700">对战方式</h2>
          <div className="grid grid-cols-3 gap-2">
            {([[
              "quick", "快速匹配",
            ], ["create", "创建房间"], ["join", "加入房间"]] as const).map(([value, label]) => (
              <button key={value} onClick={() => setMatchKind(value)} disabled={waiting}
                className={`rounded-lg border px-3 py-2 text-sm ${matchKind === value ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-stone-200 bg-white text-stone-600"}`}>
                {label}
              </button>
            ))}
          </div>
          {matchKind === "join" && (
            <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm uppercase tracking-widest"
              maxLength={12} placeholder="输入私人房间码" />
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold text-stone-700">玩家名称</h2>
          <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} disabled={waiting}
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm" maxLength={24} />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold text-stone-700">选择卡组</h2>
          <div className="grid grid-cols-2 gap-3">
            {([['precon_sd01', 'SD01 英雄'], ['precon_sd02', 'SD02 复仇']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setSelectedDeck(key)} disabled={waiting}
                className={`rounded-xl border p-4 text-left ${selectedDeck === key ? "border-red-500 bg-red-50" : "border-stone-200 bg-white"}`}>
                <span className="text-[10px] font-medium text-red-600">预组</span>
                <p className="mt-1 text-sm font-bold text-stone-800">{label}</p>
              </button>
            ))}
            {savedDecks.map((deck, index) => (
              <button key={deck.id ?? index} onClick={() => setSelectedDeck(`saved_${index}`)} disabled={waiting}
                className={`rounded-xl border p-4 text-left ${selectedDeck === `saved_${index}` ? "border-indigo-500 bg-indigo-50" : "border-stone-200 bg-white"}`}>
                <span className="text-[10px] font-medium text-indigo-600">我的卡组</span>
                <p className="mt-1 truncate text-sm font-bold text-stone-800">{deck.name}</p>
              </button>
            ))}
          </div>
        </section>

        {waiting ? (
          <button onClick={leaveQueue} className="w-full rounded-lg bg-red-500 py-3 font-bold text-white hover:bg-red-400">取消等待</button>
        ) : (
          <button onClick={start} disabled={!canStart}
            className="w-full rounded-lg bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-500 disabled:opacity-40">
            {matchKind === "quick" ? "⚔ 开始匹配" : matchKind === "create" ? "创建私人房间" : "加入私人房间"}
          </button>
        )}
      </div>
    </div>
  );
}
