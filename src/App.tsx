import { useState, useEffect, useMemo, useCallback } from "react";
import type { CardDatabase, Card, Deck, DeckEntry } from "./types/card";
import { encodeDeck, decodeDeck, saveDeckToLocal, getLocalDecks, deleteLocalDeck } from "./utils/deckCode";
import CardSearchPage from "./pages/CardSearchPage";
import DeckPlazaPage from "./pages/DeckPlazaPage";
import DeckBuilderPage from "./pages/DeckBuilderPage";
import BattlePage from "./pages/BattlePage";
import HelpPage from "./pages/HelpPage";
import WelcomePage from "./pages/WelcomePage";
import ChatPage from "./pages/ChatPage";
import SettingsPage from "./pages/SettingsPage";
import AboutPage from "./pages/AboutPage";

type Tab = "welcome" | "chat" | "search" | "plaza" | "deck" | "battle" | "help" | "settings" | "about";

const TAB_LABELS: Record<Tab, string> = {
  welcome: "欢迎",
  chat: "聊天",
  search: "卡牌查询",
  plaza: "卡组广场",
  deck: "组卡器",
  battle: "对战",
  help: "帮助",
  settings: "设置",
  about: "关于",
};

const TAB_ORDER: Tab[] = ["chat", "search", "plaza", "deck", "battle", "help", "settings", "about"];

interface DeckStats {
  mainCount: number;
  colors: string[];
  overThreeNames: string[];
  mainValid: boolean;
  colorValid: boolean;
  nameValid: boolean;
  allValid: boolean;
}

export default function App() {
  const [db, setDb] = useState<CardDatabase | null>(null);
  const [tab, setTab] = useState<Tab>("welcome");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deck state
  const [deckName, setDeckName] = useState("未命名卡组");
  const [mainDeck, setMainDeck] = useState<DeckEntry[]>([]);
  const [savedDecks, setSavedDecks] = useState<Deck[]>([]);

  // Load card database
  useEffect(() => {
    fetch("./cards.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load card data");
        return res.json();
      })
      .then((data: CardDatabase) => {
        setDb(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Load saved decks
  useEffect(() => {
    setSavedDecks(getLocalDecks());
  }, []);

  // Check URL for shared deck
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#deck=")) {
      const code = hash.slice(6);
      const deck = decodeDeck(code);
      if (deck) {
        setDeckName(deck.name);
        setMainDeck(deck.main_deck);
        setTab("deck");
      }
    }
  }, []);

  // Map: card_no -> Card (first/highest rarity variant for display)
  const cardMap = useMemo(() => {
    const m = new Map<string, Card>();
    if (db) {
      for (const c of db.cards) {
        if (!m.has(c.card_no)) m.set(c.card_no, c);
      }
    }
    return m;
  }, [db]);

  // Deck operations (use card_no, not id - game logic treats same card_no as same card)
  // Impact cards (card_type === 2) are no longer added to any deck; they are display-only.
  const addToDeck = useCallback((card: Card) => {
    // Impact cards are display-only, not added to any deck
    if (card.card_type === 2) return;
    // Only character cards (card_type === 1) can be added
    if (card.card_type !== 1) {
      alert("角色卡才能加入卡组！");
      return;
    }

    const existing = mainDeck.find((e) => e.card_no === card.card_no);
    const maxCount = 3;

    if (existing) {
      if (existing.count >= maxCount) return;
      setMainDeck(mainDeck.map((e) => (e.card_no === card.card_no ? { ...e, count: e.count + 1 } : e)));
    } else {
      setMainDeck([...mainDeck, { card_no: card.card_no, count: 1 }]);
    }
  }, [mainDeck]);

  const removeFromDeck = useCallback((cardNo: string) => {
    const existing = mainDeck.find((e) => e.card_no === cardNo);
    if (!existing) return;
    if (existing.count <= 1) {
      setMainDeck(mainDeck.filter((e) => e.card_no !== cardNo));
    } else {
      setMainDeck(mainDeck.map((e) => (e.card_no === cardNo ? { ...e, count: e.count - 1 } : e)));
    }
  }, [mainDeck]);

  const clearDeck = useCallback(() => {
    setMainDeck([]);
  }, []);

  const saveDeck = useCallback(() => {
    const deck: Deck = {
      name: deckName,
      main_deck: mainDeck,
      rush_deck: [],
      created_at: new Date().toISOString(),
    };
    saveDeckToLocal(deck);
    setSavedDecks(getLocalDecks());
    alert("卡组已保存!");
  }, [deckName, mainDeck]);

  const loadDeck = useCallback((deck: Deck) => {
    setDeckName(deck.name);
    setMainDeck(deck.main_deck);
  }, []);

  const removeDeck = useCallback((name: string) => {
    deleteLocalDeck(name);
    setSavedDecks(getLocalDecks());
  }, []);

  const shareDeck = useCallback(() => {
    const deck: Deck = {
      name: deckName,
      main_deck: mainDeck,
      rush_deck: [],
      created_at: new Date().toISOString(),
    };
    const code = encodeDeck(deck);
    const url = `${window.location.origin}${window.location.pathname}#deck=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      alert("分享链接已复制到剪贴板!");
    }).catch(() => {
      prompt("复制以下链接分享卡组:", url);
    });
  }, [deckName, mainDeck]);

  // Load deck from plaza: load the deck into the builder and switch to deck tab
  const loadDeckFromPlaza = useCallback((deck: Deck) => {
    setDeckName(deck.name);
    setMainDeck(deck.main_deck);
    setTab("deck");
  }, []);

  // Deck validation
  const deckStats = useMemo<DeckStats>(() => {
    const mainCount = mainDeck.reduce((s, e) => s + e.count, 0);
    const colors = new Set<number>();
    const nameCounts: Record<string, number> = {};

    for (const e of mainDeck) {
      const card = cardMap.get(e.card_no);
      if (card) {
        colors.add(card.attribute);
        nameCounts[card.name] = (nameCounts[card.name] || 0) + e.count;
      }
    }

    const overThree = Object.entries(nameCounts).filter(([, c]) => c > 3);
    const colorArray = Array.from(colors).map((a) => {
      const attr = db?.attributes[String(a)];
      return attr ? attr.name : "未知";
    });

    return {
      mainCount,
      colors: colorArray,
      overThreeNames: overThree.map(([n]) => n),
      mainValid: mainCount === 50,
      colorValid: colors.size <= 2,
      nameValid: overThree.length === 0,
      allValid: mainCount === 50 && colors.size <= 2 && overThree.length === 0,
    };
  }, [mainDeck, cardMap, db]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fcfaf7]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-3 border-msa-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-stone-500">加载卡牌数据中...</p>
        </div>
      </div>
    );
  }

  if (error || !db) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fcfaf7]">
        <div className="text-center text-red-600">
          <p className="font-medium">加载失败</p>
          <p className="text-sm mt-1 text-stone-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#fcfaf7]">
      {/* ── Header (MSA-style glass-morphism nav bar) ──────────── */}
      <header className="sticky top-0 z-50 h-12 bg-white/80 backdrop-blur-md border-b border-stone-200 flex items-center px-4 gap-4 flex-shrink-0 shadow-sm">
        {/* Logo — click to go to Welcome page */}
        <button
          onClick={() => setTab("welcome")}
          className="flex items-center gap-1.5 whitespace-nowrap hover:opacity-80 transition"
        >
          <div className="w-7 h-7 rounded-md bg-[#b71c1c] flex items-center justify-center flex-shrink-0">
            <img src="/logo.png" alt="Logo" className="w-5 h-5 object-contain" />
          </div>
          <span className="text-stone-800 font-bold text-sm tracking-wide">
            斗界竞技场
          </span>
        </button>

        {/* Nav tabs */}
        <nav className="flex items-center gap-0 h-full overflow-x-auto scrollbar-thin">
          {TAB_ORDER.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-full px-3 text-sm font-medium transition relative whitespace-nowrap ${
                tab === t
                  ? "text-msa-700 after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-msa-500 after:rounded-full"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {TAB_LABELS[t]}
              {t === "deck" && deckStats.mainCount > 0 && (
                <span
                  className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                    deckStats.allValid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {deckStats.mainCount}/50
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Right: card count badge */}
        <div className="ml-auto text-xs text-stone-400 whitespace-nowrap">
          {db.total_cards} 张卡牌 · {db.total_variants} 个版本
        </div>
      </header>

      {/* ── Main content (full height, each page manages its own scroll) ── */}
      <main className="flex-1 overflow-hidden">
        {tab === "welcome" ? (
          <WelcomePage db={db} onNavigate={(t) => setTab(t as Tab)} />
        ) : tab === "chat" ? (
          <ChatPage />
        ) : tab === "search" ? (
          <CardSearchPage db={db} />
        ) : tab === "plaza" ? (
          <DeckPlazaPage db={db} cardMap={cardMap} onLoadDeck={loadDeckFromPlaza} />
        ) : tab === "deck" ? (
          <DeckBuilderPage
            db={db}
            cardMap={cardMap}
            deckName={deckName}
            setDeckName={setDeckName}
            mainDeck={mainDeck}
            stats={deckStats}
            savedDecks={savedDecks}
            onAdd={addToDeck}
            onRemove={removeFromDeck}
            onClear={clearDeck}
            onSave={saveDeck}
            onLoad={loadDeck}
            onDelete={removeDeck}
            onShare={shareDeck}
          />
        ) : tab === "battle" ? (
          <BattlePage db={db} savedDecks={savedDecks} cardMap={cardMap} />
        ) : tab === "help" ? (
          <HelpPage />
        ) : tab === "settings" ? (
          <SettingsPage />
        ) : (
          <AboutPage />
        )}
      </main>
    </div>
  );
}
