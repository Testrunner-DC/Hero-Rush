-- ═══════════════════════════════════════════════════════════════
-- 权威对战数据模型
-- 注意：这些表包含双方完整隐藏状态，只允许后端 Service Role 访问。
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('casual', 'ranked', 'private')),
  status TEXT NOT NULL CHECK (status IN ('playing', 'finished', 'aborted')),
  current_seq BIGINT NOT NULL DEFAULT 0,
  seed TEXT NOT NULL,
  ruleset_version TEXT NOT NULL,
  card_data_version TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  winner_seat SMALLINT CHECK (winner_seat IN (0, 1)),
  finish_reason TEXT,
  final_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seat SMALLINT NOT NULL CHECK (seat IN (0, 1)),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  guest_id TEXT,
  display_name TEXT NOT NULL,
  deck_snapshot JSONB NOT NULL,
  rating_before INTEGER,
  rating_after INTEGER,
  PRIMARY KEY (match_id, seat),
  CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS match_events (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  command_id TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_guest_id TEXT,
  command JSONB NOT NULL,
  public_events JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, seq),
  UNIQUE (match_id, command_id)
);

CREATE TABLE IF NOT EXISTS match_snapshots (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_matches_status_created ON matches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_players_user ON match_players(user_id, match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_match_seq ON match_events(match_id, seq);

-- 完整快照、随机种子和对手隐藏区不能通过浏览器 Supabase Client 读取。
-- Service Role 会绕过 RLS；普通用户没有任何直接读写策略。
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_snapshots ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE matches IS '权威服务端管理的对局元数据；客户端不得直接写入';
COMMENT ON TABLE match_events IS '按 seq 排序的已验证命令事件流';
COMMENT ON TABLE match_snapshots IS '包含隐藏信息的完整服务端快照，禁止客户端直读';
