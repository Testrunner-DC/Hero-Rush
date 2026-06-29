/**
 * ImportDeckModal — modal for pasting and importing a shared deck code
 *
 * Supports raw base64 codes and URLs containing "#deck=..."
 * Shows inline error on invalid input.
 * MSA Light Theme.
 */

import { useState } from "react";
import { extractDeckCode, decodeDeck } from "../utils/deckCode";

interface Props {
  onImport: (code: string) => void;
  onClose: () => void;
}

export default function ImportDeckModal({ onImport, onClose }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    setError(null);
    const code = extractDeckCode(text);
    if (!code) {
      setError("无法提取卡组码，请检查输入");
      return;
    }
    const deck = decodeDeck(code);
    if (!deck) {
      setError("卡组码无效或格式错误，请重新粘贴");
      return;
    }
    onImport(code);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleImport();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg p-5 w-[400px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <h2 className="text-sm font-bold text-stone-800 mb-3">导入卡组</h2>

        {/* Description */}
        <p className="text-xs text-stone-500 mb-3">
          粘贴分享码或包含 <code className="bg-stone-100 px-1 rounded">#deck=</code> 的链接
        </p>

        {/* Textarea */}
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder="粘贴卡组码..."
          className="w-full bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-700 placeholder-stone-400 px-3 py-2 font-mono resize-none focus:outline-none focus:border-msa-500 focus:ring-2 focus:ring-red-100 transition"
          autoFocus
        />

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 mt-2">{error}</p>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-stone-500 bg-stone-100 hover:bg-stone-200 rounded transition font-medium"
          >
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={!text.trim()}
            className="px-4 py-1.5 text-xs bg-msa-600 text-white hover:bg-msa-500 rounded transition font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            导入
          </button>
        </div>
      </div>
    </div>
  );
}
