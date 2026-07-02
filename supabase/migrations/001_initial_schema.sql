-- ═══════════════════════════════════════════════════════
-- 斗界竞技场 — 初始数据库 Schema
-- Supabase Migration: 001_initial_schema
-- 日期: 2026-06-16
-- ═══════════════════════════════════════════════════════

-- =====================================================
-- P0 核心表
-- =====================================================

-- 1. 用户资料表（由 Auth Trigger 自动创建）
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 卡组表
CREATE TABLE IF NOT EXISTS decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cards_json TEXT NOT NULL DEFAULT '[]',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 收藏表
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, deck_id)  -- 每人每个卡组只能收藏一次
);

-- =====================================================
-- P1 扩展表（先建表，MVP 阶段不填充数据）
-- =====================================================

-- 4. 对战记录表
CREATE TABLE IF NOT EXISTS battle_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loser_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rounds INTEGER NOT NULL DEFAULT 1,
  battle_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. 赛季定义表（灵活配置赛季周期）
CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. 赛季排名表
CREATE TABLE IF NOT EXISTS season_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, season_id)
);

-- 7. 评论表
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- P2 扩展表
-- =====================================================

-- 8. 关注表
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, followee_id)
);

-- 9. 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system',
  content TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 索引
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_decks_user_id ON decks(user_id);
CREATE INDEX IF NOT EXISTS idx_decks_is_published ON decks(is_published);
CREATE INDEX IF NOT EXISTS idx_decks_created_at ON decks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_deck_id ON favorites(deck_id);
CREATE INDEX IF NOT EXISTS idx_battle_records_winner ON battle_records(winner_id);
CREATE INDEX IF NOT EXISTS idx_battle_records_loser ON battle_records(loser_id);
CREATE INDEX IF NOT EXISTS idx_season_rankings_season ON season_rankings(season_id);
CREATE INDEX IF NOT EXISTS idx_comments_deck_id ON comments(deck_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- =====================================================
-- Auth Trigger: 新用户注册后自动创建 users 记录
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, nickname)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 如果触发器已存在则先删除
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

-- users 表
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "任何人都可以查看用户资料" ON users
  FOR SELECT USING (true);
CREATE POLICY "用户只能更新自己的资料" ON users
  FOR UPDATE USING (auth.uid() = id);

-- decks 表
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "任何人都可以查看已发布的卡组" ON decks
  FOR SELECT USING (is_published = true);
CREATE POLICY "用户可以查看自己的卡组（含未发布）" ON decks
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "用户可以创建自己的卡组" ON decks
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "用户可以更新自己的卡组" ON decks
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "用户可以删除自己的卡组" ON decks
  FOR DELETE USING (auth.uid() = user_id);

-- favorites 表
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户只能查看自己的收藏" ON favorites
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "用户可以添加收藏" ON favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "用户可以取消收藏" ON favorites
  FOR DELETE USING (auth.uid() = user_id);

-- battle_records 表 (P1)
ALTER TABLE battle_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "任何人都可以查看对战记录" ON battle_records
  FOR SELECT USING (true);
CREATE POLICY "用户只能创建自己的对战记录" ON battle_records
  FOR INSERT WITH CHECK (auth.uid() = winner_id OR auth.uid() = loser_id);

-- season_rankings 表 (P1)
ALTER TABLE season_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "任何人都可以查看赛季排名" ON season_rankings
  FOR SELECT USING (true);

-- comments 表 (P1)
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "任何人都可以查看评论" ON comments
  FOR SELECT USING (true);
CREATE POLICY "用户可以发表评论" ON comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "用户可以删除自己的评论" ON comments
  FOR DELETE USING (auth.uid() = user_id);

-- follows 表 (P2)
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "任何人都可以查看关注关系" ON follows
  FOR SELECT USING (true);
CREATE POLICY "用户可以关注他人" ON follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "用户可以取消关注" ON follows
  FOR DELETE USING (auth.uid() = follower_id);

-- notifications 表 (P2)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户只能查看自己的通知" ON notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "系统可以创建通知" ON notifications
  FOR INSERT WITH CHECK (true);
CREATE POLICY "用户可以标记通知已读" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- seasons 表 (P1) — 仅管理员可写，所有人可读
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "任何人都可以查看赛季信息" ON seasons
  FOR SELECT USING (true);

-- =====================================================
-- Storage: 头像 bucket
-- =====================================================

-- 注意：Storage bucket 需要通过 Supabase Dashboard 或 API 创建
-- SQL 方式（如果支持）：
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Storage RLS 策略（在 bucket 创建后执行）：
-- CREATE POLICY "头像公开可读" ON storage.objects
--   FOR SELECT USING (bucket_id = 'avatars');
-- CREATE POLICY "用户可以上传自己的头像" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "用户可以更新自己的头像" ON storage.objects
--   FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "用户可以删除自己的头像" ON storage.objects
--   FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =====================================================
-- updated_at 自动更新触发器
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON decks;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON decks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
