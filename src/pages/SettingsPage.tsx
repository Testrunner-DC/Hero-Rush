/**
 * SettingsPage — 设置页面 (MSA Light Theme)
 *
 * 应用设置：卡牌显示、组卡默认值、数据管理、关于
 * 设置存储在 localStorage，页面刷新后保留
 */

import { useState, useCallback, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Settings types
// ─────────────────────────────────────────────────────────────────────────

interface AppSettings {
  showCardImages: boolean;
  defaultSort: "card_no" | "cost" | "power" | "name";
  cardsPerRow: 4 | 5 | 6 | 7;
  autoSaveDeck: boolean;
  confirmClearDeck: boolean;
  compactDeckBuilder: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  showCardImages: true,
  defaultSort: "card_no",
  cardsPerRow: 6,
  autoSaveDeck: false,
  confirmClearDeck: true,
  compactDeckBuilder: false,
};

const STORAGE_KEY = "marvel_tcg_settings";

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setLoaded(true);
  }, []);

  // Auto-save on change
  useEffect(() => {
    if (!loaded) return;
    saveSettings(settings);
    setSavedFlash(true);
    const timer = setTimeout(() => setSavedFlash(false), 1500);
    return () => clearTimeout(timer);
  }, [settings, loaded]);

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleReset = useCallback(() => {
    if (!confirm("确定要恢复所有设置为默认值吗？")) return;
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const handleClearData = useCallback(() => {
    if (!confirm("确定要清除所有本地数据吗？\n\n这包括：\n• 保存的卡组\n• 聊天记录\n• 应用设置\n\n此操作不可撤销！")) return;
    localStorage.removeItem("marvel_tcg_decks");
    localStorage.removeItem("marvel_tcg_chat_messages");
    localStorage.removeItem(STORAGE_KEY);
    setSettings({ ...DEFAULT_SETTINGS });
    alert("所有本地数据已清除。");
  }, []);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-[#fcfaf7]">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* ── Page header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-800">设置</h1>
            <p className="text-sm text-stone-400 mt-0.5">自定义你的应用体验</p>
          </div>
          {savedFlash && (
            <span className="text-xs text-green-600 animate-fadeIn flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              已保存
            </span>
          )}
        </div>

        {/* ── Card Display ────────────────────────────────────── */}
        <SettingsSection title="卡牌显示" icon="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z">
          <ToggleRow
            label="显示卡牌图片"
            desc="关闭后仅显示文字信息，节省流量"
            checked={settings.showCardImages}
            onChange={(v) => update("showCardImages", v)}
          />
          <SelectRow
            label="默认排序方式"
            desc="卡牌图鉴页面的默认排序"
            value={settings.defaultSort}
            options={[
              { value: "card_no", label: "按编号" },
              { value: "cost", label: "按费用" },
              { value: "power", label: "按战力" },
              { value: "name", label: "按名称" },
            ]}
            onChange={(v) => update("defaultSort", v as AppSettings["defaultSort"])}
          />
          <SelectRow
            label="每行卡牌数"
            desc="卡牌网格的列数"
            value={String(settings.cardsPerRow)}
            options={[
              { value: "4", label: "4 列" },
              { value: "5", label: "5 列" },
              { value: "6", label: "6 列" },
              { value: "7", label: "7 列" },
            ]}
            onChange={(v) => update("cardsPerRow", Number(v) as AppSettings["cardsPerRow"])}
          />
        </SettingsSection>

        {/* ── Deck Builder ────────────────────────────────────── */}
        <SettingsSection title="组卡器" icon="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z">
          <ToggleRow
            label="自动保存卡组"
            desc="修改卡组时自动保存到本地"
            checked={settings.autoSaveDeck}
            onChange={(v) => update("autoSaveDeck", v)}
          />
          <ToggleRow
            label="清空前确认"
            desc="清空卡组时弹出确认对话框"
            checked={settings.confirmClearDeck}
            onChange={(v) => update("confirmClearDeck", v)}
          />
          <ToggleRow
            label="紧凑模式"
            desc="组卡器使用更紧凑的布局"
            checked={settings.compactDeckBuilder}
            onChange={(v) => update("compactDeckBuilder", v)}
          />
        </SettingsSection>

        {/* ── Data Management ─────────────────────────────────── */}
        <SettingsSection title="数据管理" icon="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3">
          <div className="space-y-3">
            <DataRow
              label="保存的卡组"
              value={`${getLocalDeckCount()} 个`}
            />
            <DataRow
              label="聊天记录"
              value={`${getChatMessageCount()} 条`}
            />
            <DataRow
              label="存储用量"
              value={getStorageSize()}
            />
          </div>
          <div className="pt-3 border-t border-stone-100 space-y-2">
            <button
              onClick={handleReset}
              className="w-full py-2 text-sm rounded-lg bg-stone-50 text-stone-500 hover:text-stone-700 border border-stone-200 transition"
            >
              恢复默认设置
            </button>
            <button
              onClick={handleClearData}
              className="w-full py-2 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition"
            >
              清除所有本地数据
            </button>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helper functions for data display
// ─────────────────────────────────────────────────────────────────────────

function getLocalDeckCount(): number {
  try {
    const raw = localStorage.getItem("marvel_tcg_decks");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.length;
    }
  } catch {
    // ignore
  }
  return 0;
}

function getChatMessageCount(): number {
  try {
    const raw = localStorage.getItem("marvel_tcg_chat_messages");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.length;
    }
  } catch {
    // ignore
  }
  return 0;
}

function getStorageSize(): string {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) total += value.length + key.length;
      }
    }
    if (total < 1024) return `${total} B`;
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
    return `${(total / (1024 * 1024)).toFixed(2)} MB`;
  } catch {
    return "未知";
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function SettingsSection({
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
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-stone-700">{label}</p>
        <p className="text-xs text-stone-400 mt-0.5">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`flex-shrink-0 relative w-11 h-6 rounded-full transition ${
          checked ? "bg-red-500" : "bg-stone-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function SelectRow({
  label,
  desc,
  value,
  options,
  onChange,
}: {
  label: string;
  desc: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-stone-700">{label}</p>
        <p className="text-xs text-stone-400 mt-0.5">{desc}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-shrink-0 px-3 py-1.5 text-sm rounded-lg bg-white border border-stone-200 text-stone-700 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-stone-500">{label}</span>
      <span className="text-sm text-stone-700 font-medium">{value}</span>
    </div>
  );
}
