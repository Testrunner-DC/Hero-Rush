/**
 * UserMenu — 右上角用户菜单
 *
 * 未登录：显示"登录"按钮 → 点击 navigate('/login')
 * 已登录：显示头像圆圈 + 昵称 → 点击展开下拉菜单
 *          下拉菜单项：个人资料（→/profile）、登出
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function UserMenu() {
  const navigate = useNavigate();
  const { user, isAuthenticated, signOut } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleSignOut = useCallback(async () => {
    setMenuOpen(false);
    await signOut();
    navigate('/');
  }, [signOut, navigate]);

  const handleLogin = useCallback(() => {
    navigate('/login');
  }, [navigate]);

  const handleProfile = useCallback(() => {
    setMenuOpen(false);
    navigate('/profile');
  }, [navigate]);

  // Avatar initial: first character of nickname or default
  const avatarChar = user?.nickname ? user.nickname.charAt(0).toUpperCase() : '?';

  if (!isAuthenticated || !user) {
    return (
      <button
        onClick={handleLogin}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#b71c1c] text-white hover:bg-[#8b0000] transition whitespace-nowrap"
      >
        登录
      </button>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-stone-100 transition"
      >
        {/* Avatar */}
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.nickname}
            className="w-7 h-7 rounded-full object-cover border border-stone-200"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[#b71c1c] text-white text-xs font-bold flex items-center justify-center">
            {avatarChar}
          </div>
        )}
        <span className="text-xs font-medium text-stone-700 max-w-[80px] truncate">
          {user.nickname}
        </span>
        {/* Chevron */}
        <svg
          className={`w-3 h-3 text-stone-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-stone-200 shadow-lg z-50 animate-fadeIn">
          {/* User info header */}
          <div className="px-3 py-2 border-b border-stone-100">
            <p className="text-xs font-medium text-stone-800 truncate">{user.nickname}</p>
            <p className="text-[10px] text-stone-400 truncate">{user.email}</p>
          </div>

          {/* Menu items */}
          <button
            onClick={handleProfile}
            className="w-full text-left px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 transition flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            个人资料
          </button>

          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition flex items-center gap-2 border-t border-stone-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            登出
          </button>
        </div>
      )}
    </div>
  );
}
