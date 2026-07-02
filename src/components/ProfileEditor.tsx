/**
 * ProfileEditor — 编辑昵称和简介的 Modal
 *
 * Props: { open, profile: { nickname, bio }, onSave, onClose }
 */

import { useState, useCallback, useEffect } from 'react';

interface ProfileEditorProps {
  open: boolean;
  profile: { nickname: string; bio: string };
  onSave: (data: { nickname: string; bio: string }) => void;
  onClose: () => void;
}

export default function ProfileEditor({ open, profile, onSave, onClose }: ProfileEditorProps) {
  const [nickname, setNickname] = useState(profile.nickname);
  const [bio, setBio] = useState(profile.bio);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setNickname(profile.nickname);
      setBio(profile.bio);
    }
  }, [open, profile]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    setSubmitting(true);
    try {
      onSave({ nickname: nickname.trim(), bio: bio.trim() });
    } finally {
      setSubmitting(false);
    }
  }, [nickname, bio, onSave]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-white rounded-xl border border-stone-200 shadow-xl animate-slideUp">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-base font-bold text-stone-800">编辑资料</h2>
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
            <label className="block text-xs font-medium text-stone-500 mb-1">昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="你的游戏昵称"
              className="auth-input"
              maxLength={30}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">简介</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="介绍一下自己..."
              className="auth-input resize-none"
              rows={3}
              maxLength={200}
            />
          </div>

          <button type="submit" disabled={submitting || !nickname.trim()} className="auth-btn">
            {submitting ? '保存中...' : '保存'}
          </button>
        </form>
      </div>
    </div>
  );
}
