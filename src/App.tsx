import { lazy, Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { Routes, Route, useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import type { CardDatabase, Card, Deck, DeckEntry } from "./types/card";
import { encodeDeck, decodeDeck, saveDeckToLocal, getLocalDecks, deleteLocalDeck, ensureStarterDecks, STARTER_PRECON_PATHS, type PreconDeckData } from "./utils/deckCode";
import { useAuth } from "./hooks/useAuth";
import UserMenu from "./components/UserMenu";
import DeckPlazaPage from "./pages/DeckPlazaPage";
import DeckBuilderPage from "./pages/DeckBuilderPage";
import HelpPage from "./pages/HelpPage";
import WelcomePage from "./pages/WelcomePage";
import ChatPage from "./pages/ChatPage";
import CardSearchPage from "./pages/CardSearchPage";
import SettingsPage from "./pages/SettingsPage";
import AuthPage from "./pages/AuthPage";
import ProfilePage from "./pages/ProfilePage";
import { loadCardAssetManifest } from "./lib/cardAssets";
import { countDeckCardsWithExactName } from "./utils/deckBuilding";

const BattlePageV2 = lazy(() => import("./pages/BattlePageV2"));
const BattleSandboxPageV2 = lazy(() => import("./pages/BattleSandboxPageV2"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

const NAV_TABS: { path: string; label: string }[] = [
  { path: "/chat", label: "聊天" },
  { path: "/search", label: "卡查" },
  { path: "/plaza", label: "卡组广场" },
  { path: "/builder", label: "组卡器" },
  { path: "/battle", label: "对战" },
  { path: "/help", label: "帮助" },
  { path: "/settings", label: "设置" },
];

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
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const [db, setDb] = useState<CardDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deck state
  const [deckName, setDeckName] = useState("未命名卡组");
  const [mainDeck, setMainDeck] = useState<DeckEntry[]>([]);
  const [savedDecks, setSavedDecks] = useState<Deck[]>([]);

  // Load card database
  useEffect(() => {
    Promise.all([
      fetch("/cards.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load card data");
        return res.json();
      }),
      loadCardAssetManifest(),
    ])
      .then(([data]: [CardDatabase, unknown]) => {
        setDb(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Initialize new players with the four official starter decks.
  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    Promise.all(STARTER_PRECON_PATHS.map((path) => fetch(path).then((response) => {
      if (!response.ok) throw new Error(`Failed to load ${path}`);
      return response.json() as Promise<PreconDeckData>;
    })))
      .then((precons) => {
        if (!cancelled) setSavedDecks(ensureStarterDecks(precons, db));
      })
      .catch(() => {
        if (!cancelled) setSavedDecks(getLocalDecks());
      });
    return () => { cancelled = true; };
  }, [db]);

  // Check URL for shared deck
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#deck=")) {
      const code = hash.slice(6);
      const deck = decodeDeck(code);
      if (deck) {
        setDeckName(deck.name);
        setMainDeck(deck.main_deck);
        navigate(`/builder?code=${code}`, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map: card_no -> Card (lowest-rarity canonical variant for decks and ordinary users)
  const cardMap = useMemo(() => {
    const m = new Map<string, Card>();
    if (db) {
      for (const c of db.cards) {
        const current = m.get(c.card_no);
        if (!current || c.rarity < current.rarity || (c.rarity === current.rarity && c.id.localeCompare(current.id) < 0)) m.set(c.card_no, c);
      }
    }
    return m;
  }, [db]);

  // Deck operations (use card_no, not id - game logic treats same card_no as same card)
  const addToDeck = useCallback((card: Card) => {
    if (card.card_type === 2) return;
    if (card.card_type !== 1) {
      alert("角色卡才能加入卡组！");
      return;
    }

    if (countDeckCardsWithExactName(mainDeck, cardMap, card.name) >= 3) return;
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

  const saveDeckAs = useCallback((name: string) => {
    const nextName = name.trim() || "未命名卡组";
    const deck: Deck = {
      name: nextName,
      main_deck: mainDeck,
      rush_deck: [],
      created_at: new Date().toISOString(),
    };
    saveDeckToLocal(deck);
    setDeckName(nextName);
    setSavedDecks(getLocalDecks());
    alert(`已另存为「${nextName}」`);
  }, [mainDeck, cardMap]);

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

  // Load deck from plaza: load the deck into the builder and navigate to builder
  const loadDeckFromPlaza = useCallback((deck: Deck) => {
    setDeckName(deck.name);
    setMainDeck(deck.main_deck);
    navigate("/builder");
  }, [navigate]);

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

  const isBattleWorkspace = location.pathname === "/battle"
    || location.pathname.startsWith("/battle/")
    || location.pathname === "/battle-v2";

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#fcfaf7]">
      {/* ── Header (MSA-style glass-morphism nav bar) ──────────── */}
      {!isBattleWorkspace && <header className="sticky top-0 z-50 h-12 bg-white/80 backdrop-blur-md border-b border-stone-200 flex items-center px-4 gap-4 flex-shrink-0 shadow-sm">
        {/* Logo — click to go to Welcome page */}
        <Link
          to="/"
          className="flex items-center gap-1.5 whitespace-nowrap hover:opacity-80 transition"
        >
          <div className="w-7 h-7 rounded-md bg-[#b71c1c] flex items-center justify-center flex-shrink-0">
            <img src="/logo.png" alt="Logo" className="w-5 h-5 object-contain" />
          </div>
          <span className="text-stone-800 font-bold text-sm tracking-wide">
            斗界竞技场
          </span>
        </Link>

        {/* Nav tabs */}
        <nav className="flex items-center gap-0 h-full overflow-x-auto scrollbar-thin">
          {NAV_TABS.map((tab) => {
            const isActive = location.pathname === tab.path;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`h-full px-3 text-sm font-medium transition relative whitespace-nowrap flex items-center ${
                  isActive
                    ? "text-msa-700 after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-msa-500 after:rounded-full"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {tab.label}
                {tab.path === "/builder" && deckStats.mainCount > 0 && (
                  <span
                    className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                      deckStats.allValid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {deckStats.mainCount}/50
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right: UserMenu */}
        <div className="ml-auto">
          <UserMenu />
        </div>
      </header>}

      {/* ── Main content (full height, each page manages its own scroll) ── */}
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<WelcomePage db={db} />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/search" element={<CardSearchPage db={db} cardMap={cardMap} />} />
          <Route path="/plaza" element={<DeckPlazaPage db={db} cardMap={cardMap} onLoadDeck={loadDeckFromPlaza} />} />
          <Route path="/builder" element={
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
              onSaveAs={saveDeckAs}
              onLoad={loadDeck}
              onDelete={removeDeck}
              onShare={shareDeck}
            />
          } />
          <Route path="/battle" element={(
            <Suspense fallback={<div className="grid h-full place-items-center bg-slate-950 text-white/60">加载 V2 对战…</div>}>
              <BattlePageV2 db={db} savedDecks={savedDecks} cardMap={cardMap} />
            </Suspense>
          )} />
          <Route path="/battle-v2" element={<Navigate to="/battle" replace />} />
          <Route path="/battle/sandbox" element={<Suspense fallback={<div className="grid h-full place-items-center">加载规则沙盒…</div>}><BattleSandboxPageV2 db={db} /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<div className="grid h-full place-items-center">加载管理后台…</div>}><AdminPage /></Suspense>} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={
            isAuthenticated ? <ProfilePage /> : <Navigate to="/login" replace />
          } />
        </Routes>
      </main>
    </div>
  );
}
