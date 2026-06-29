/**
 * ChatPage — 聊天页面 (MSA Light Theme)
 *
 * 社区交流 / 策略讨论界面
 * 支持消息发送、预设话题快捷入口
 * 消息存储在 localStorage，页面刷新后保留
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface ChatMessage {
  id: string;
  role: "user" | "system";
  content: string;
  timestamp: number;
}

interface PresetTopic {
  label: string;
  prompt: string;
}

const PRESET_TOPICS: PresetTopic[] = [
  { label: "新手求组卡思路", prompt: "刚入坑，求推荐一套低成本卡组思路！" },
  { label: "红色属性讨论", prompt: "红色属性目前最强卡牌是哪些？" },
  { label: "冲击卡选择", prompt: "9张冲击卡怎么选最优？大家分享下思路。" },
  { label: "对战匹配", prompt: "有人在线吗？来一把对战！" },
];

const STORAGE_KEY = "marvel_tcg_chat_messages";
const MAX_MESSAGES = 200;

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatMessage[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return [
    {
      id: "sys-welcome",
      role: "system",
      content: "欢迎来到斗界竞技场社区聊天室！在这里可以交流组卡思路、讨论对战策略、寻找对战对手。请文明交流。",
      timestamp: Date.now(),
    },
  ];
}

function saveMessages(messages: ChatMessage[]): void {
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage errors
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load messages on mount
  useEffect(() => {
    setMessages(loadMessages());
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Persist messages
  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Focus back to input
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [input]);

  const handlePresetTopic = useCallback((prompt: string) => {
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleClear = useCallback(() => {
    if (!confirm("确定要清空所有聊天记录吗？")) return;
    const fresh = [
      {
        id: "sys-welcome",
        role: "system" as const,
        content: "聊天记录已清空。欢迎继续交流！",
        timestamp: Date.now(),
      },
    ];
    setMessages(fresh);
    saveMessages(fresh);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#fcfaf7]">
      {/* ── Chat header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-stone-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-stone-700">社区聊天室</span>
          <span className="text-xs text-stone-400">· {messages.length} 条消息</span>
        </div>
        <button
          onClick={handleClear}
          className="text-xs text-stone-400 hover:text-red-600 transition"
        >
          清空记录
        </button>
      </div>

      {/* ── Messages area ───────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3"
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* ── Preset topics ───────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-t border-stone-200 bg-white flex-shrink-0 overflow-x-auto scrollbar-thin">
        <span className="text-xs text-stone-400 whitespace-nowrap flex-shrink-0">话题：</span>
        {PRESET_TOPICS.map((topic) => (
          <button
            key={topic.label}
            onClick={() => handlePresetTopic(topic.prompt)}
            className="px-2.5 py-1 text-xs rounded-full bg-stone-50 text-stone-500 hover:bg-red-50 hover:text-red-600 transition whitespace-nowrap flex-shrink-0 border border-stone-200"
          >
            {topic.label}
          </button>
        ))}
      </div>

      {/* ── Input area ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white border-t border-stone-200 flex-shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="输入消息，按 Enter 发送..."
          className="flex-1 px-3 py-2 text-sm rounded-lg bg-white border border-stone-200 text-stone-700 placeholder-stone-400 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap shadow-sm"
        >
          发送
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[80%] px-3 py-2 rounded-lg bg-white border border-stone-200 text-center shadow-sm">
          <p className="text-xs text-stone-500 leading-relaxed">{message.content}</p>
          <p className="text-[10px] text-stone-400 mt-1">{formatTime(message.timestamp)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 border border-red-200 flex items-center justify-center">
        <span className="text-xs font-bold text-red-600">我</span>
      </div>
      {/* Bubble */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-xs font-medium text-stone-700">玩家</span>
          <span className="text-[10px] text-stone-400">{formatTime(message.timestamp)}</span>
        </div>
        <div className="inline-block max-w-full px-3 py-2 rounded-lg rounded-tl-none bg-stone-50 border border-stone-200">
          <p className="text-sm text-stone-800 leading-relaxed break-words whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    </div>
  );
}
