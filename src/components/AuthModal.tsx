/**
 * AuthModal — 模态框版登录/注册
 *
 * Props: { open, onClose }
 * Renders the same login/sign-up logic as AuthPage inside a modal overlay.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type AuthMode = 'signin' | 'signup';

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset form when opened
  useEffect(() => {
    if (open) {
      setMode('signin');
      setEmail('');
      setPassword('');
      setNickname('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!email.trim() || !password.trim()) {
        setError('请填写邮箱和密码');
        return;
      }

      if (mode === 'signup' && !nickname.trim()) {
        setError('请填写昵称');
        return;
      }

      setSubmitting(true);
      try {
        if (mode === 'signin') {
          const { error: err } = await signIn(email.trim(), password);
          if (err) {
            setError(err.message);
          } else {
            onClose();
          }
        } else {
          const { error: err } = await signUp(email.trim(), password, nickname.trim());
          if (err) {
            setError(err.message);
          } else {
            onClose();
          }
        }
      } finally {
        setSubmitting(false);
      }
    },
    [mode, email, password, nickname, signIn, signUp, onClose]
  );

  const switchMode = useCallback(() => {
    setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
    setError(null);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-white rounded-xl border border-stone-200 shadow-xl animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-base font-bold text-stone-800">
            {mode === 'signin' ? '登录' : '注册'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600 transition flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="auth-input"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少6位密码"
                className="auth-input"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>

            {mode === 'signup' && (
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
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <button type="submit" disabled={submitting} className="auth-btn">
              {submitting ? '处理中...' : mode === 'signin' ? '登录' : '注册'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={switchMode}
              className="text-xs text-stone-400 hover:text-msa-600 transition"
            >
              {mode === 'signin' ? '还没有账号？去注册 →' : '已有账号？去登录 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
