/**
 * PublishDeckModal — 发布卡组到广场的弹窗
 *
 * Props: { open, deckName, onPublish, onClose }
 * Allows user to enter title and description before publishing.
 */

import { useState, useCallback, useEffect } from 'react';

interface PublishDeckModalProps {
  open: boolean;
  deckName: string;
  onPublish: (title: string, description: string) => void;
  onClose: () => void;
}

export default function PublishDeckModal({ open, deckName, onPublish, onClose }: PublishDeckModalProps) {
  const [title, setTitle] = useState(deckName);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(deckName);
      setDescription('');
    }
  }, [open, deckName]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      onPublish(title.trim(), description.trim());
    } finally {
      setSubmitting(false);
    }
  }, [title, description, onPublish]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-white rounded-xl border border-stone-200 shadow-xl animate-slideUp">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-base font-bold text-stone-800">发布到广场</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600 transition flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">卡组标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="给你的卡组起个名字"
              className="auth-input"
              maxLength={50}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简单描述一下你的卡组思路..."
              className="auth-input resize-none"
              rows={3}
              maxLength={500}
            />
          </div>

          <button type="submit" disabled={submitting || !title.trim()} className="auth-btn">
            {submitting ? '发布中...' : '发布'}
          </button>
        </form>
      </div>
    </div>
  );
}
