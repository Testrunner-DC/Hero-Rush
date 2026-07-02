/**
 * ProfilePage — 个人资料页
 *
 * Route: /profile (auth-protected)
 * Shows user avatar, nickname, bio, edit button, my decks, and favorites.
 * Uses useProfile(), useDecks(), useFavorites() hooks.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useDecks } from '../hooks/useDecks';
import { useFavorites } from '../hooks/useFavorites';
import ProfileEditor from '../components/ProfileEditor';
import AvatarUpload from '../components/AvatarUpload';

type ProfileTab = 'decks' | 'favorites';

export default function ProfilePage() {
  const { user } = useAuth();
  const { profile, isLoading: profileLoading, updateProfile, uploadAvatar, refresh: refreshProfile } = useProfile();
  const { myDecks, isLoading: decksLoading, deleteDeck } = useDecks();
  const { favoriteDeckIds, isLoading: favsLoading, toggleFavorite } = useFavorites();
  const [activeTab, setActiveTab] = useState<ProfileTab>('decks');
  const [showEditor, setShowEditor] = useState(false);
  const [showAvatarUpload, setShowAvatarUpload] = useState(false);

  const handleSaveProfile = useCallback(async (data: { nickname: string; bio: string }) => {
    const ok = await updateProfile(data);
    if (ok) {
      refreshProfile();
    }
    setShowEditor(false);
  }, [updateProfile, refreshProfile]);

  const handleAvatarUploaded = useCallback((_url: string) => {
    setShowAvatarUpload(false);
    refreshProfile();
  }, [refreshProfile]);

  const isLoading = profileLoading || decksLoading || favsLoading;

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-stone-400">请先登录</p>
      </div>
    );
  }

  const avatarChar = profile?.nickname ? profile.nickname.charAt(0).toUpperCase() : '?';

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-[#fcfaf7]">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* ── Profile Header Card ── */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <button
              onClick={() => setShowAvatarUpload(true)}
              className="flex-shrink-0 relative group"
              title="点击更换头像"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.nickname}
                  className="w-20 h-20 rounded-full object-cover border-2 border-stone-200"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#b71c1c] text-white text-2xl font-bold flex items-center justify-center border-2 border-stone-200">
                  {avatarChar}
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>

            {/* Info */}
            <div className="flex-1 min-w-0">
              {isLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-5 bg-stone-200 rounded w-32" />
                  <div className="h-3 bg-stone-100 rounded w-48" />
                  <div className="h-3 bg-stone-100 rounded w-64" />
                </div>
              ) : (
                <>
                  <h1 className="text-xl font-bold text-stone-800">{profile?.nickname || user.nickname}</h1>
                  <p className="text-xs text-stone-400 mt-0.5">{user.email}</p>
                  <p className="text-sm text-stone-600 mt-2 leading-relaxed">
                    {profile?.bio || '这个人很懒，什么都没写...'}
                  </p>
                </>
              )}
              <button
                onClick={() => setShowEditor(true)}
                className="mt-3 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 text-stone-500 hover:text-stone-700 hover:bg-stone-50 transition"
              >
                编辑资料
              </button>
            </div>
          </div>
        </div>

        {/* ── Tab Switcher ── */}
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('decks')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
              activeTab === 'decks'
                ? 'bg-white text-stone-800 shadow-sm'
                : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            我的卡组 ({myDecks.length})
          </button>
          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
              activeTab === 'favorites'
                ? 'bg-white text-stone-800 shadow-sm'
                : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            我的收藏 ({favoriteDeckIds.size})
          </button>
        </div>

        {/* ── Tab Content ── */}
        {activeTab === 'decks' ? (
          <div className="space-y-3">
            {myDecks.length === 0 ? (
              <div className="text-center py-12 text-stone-400">
                <p className="text-sm">还没有卡组</p>
                <p className="text-xs mt-1">去组卡器创建你的第一套卡组吧！</p>
              </div>
            ) : (
              myDecks.map((deck) => (
                <div key={deck.id} className="bg-white rounded-lg border border-stone-200 p-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-stone-800 truncate">{deck.title}</h3>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {deck.is_published ? '已发布' : '未发布'} · {new Date(deck.created_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('确定要删除这个卡组吗？')) {
                        deleteDeck(deck.id);
                      }
                    }}
                    className="text-xs text-stone-400 hover:text-red-500 transition ml-4 flex-shrink-0"
                  >
                    删除
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            {favoriteDeckIds.size === 0 ? (
              <p className="text-sm text-stone-400">还没有收藏任何卡组</p>
            ) : (
              <p className="text-sm text-stone-400">已收藏 {favoriteDeckIds.size} 个卡组</p>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showEditor && (
        <ProfileEditor
          open={showEditor}
          profile={{ nickname: profile?.nickname || '', bio: profile?.bio || '' }}
          onSave={handleSaveProfile}
          onClose={() => setShowEditor(false)}
        />
      )}

      {showAvatarUpload && (
        <AvatarUpload
          currentUrl={profile?.avatar_url || null}
          userId={user.id}
          onUploaded={handleAvatarUploaded}
          onClose={() => setShowAvatarUpload(false)}
        />
      )}
    </div>
  );
}
