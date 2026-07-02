/**
 * AuthPage — 登录/注册独立页面
 *
 * Route: /login
 * Supports tab switch between sign-in and sign-up modes.
 * Uses useAuth() for authentication operations.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

type AuthMode = 'signin' | 'signup';

export default function AuthPage() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
            navigate('/');
          }
        } else {
          const { error: err } = await signUp(email.trim(), password, nickname.trim());
          if (err) {
            setError(err.message);
          } else {
            // After sign-up, the user may need to verify email — still navigate
            navigate('/');
          }
        }
      } finally {
        setSubmitting(false);
      }
    },
    [mode, email, password, nickname, signIn, signUp, navigate]
  );

  const switchMode = useCallback(() => {
    setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
    setError(null);
  }, []);

  return (
    <div className="min-h-full flex items-center justify-center bg-[#fcfaf7] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="斗界竞技场"
            className="mx-auto w-20 h-20 object-contain"
          />
          <h1 className="mt-3 text-xl font-black text-stone-800">斗界竞技场</h1>
          <p className="text-sm text-stone-400 mt-1">
            {mode === 'signin' ? '登录你的账号' : '创建新账号'}
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="auth-input"
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少6位密码"
                className="auth-input"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>

            {/* Nickname (sign-up only) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  昵称
                </label>
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

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="auth-btn"
            >
              {submitting
                ? '处理中...'
                : mode === 'signin'
                  ? '登录'
                  : '注册'}
            </button>
          </form>

          {/* Switch mode */}
          <div className="mt-4 text-center">
            <button
              onClick={switchMode}
              className="text-xs text-stone-400 hover:text-msa-600 transition"
            >
              {mode === 'signin'
                ? '还没有账号？去注册 →'
                : '已有账号？去登录 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
