/** Database type definitions matching the Supabase schema */

export interface UserRow {
  id: string;
  email: string;
  nickname: string;
  avatar_url: string | null;
  bio: string;
  created_at: string;
  updated_at: string;
}

export interface DeckRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  cards_json: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface FavoriteRow {
  id: string;
  user_id: string;
  deck_id: string;
  created_at: string;
}

export interface BattleRecordRow {
  id: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  deck1_id: string | null;
  deck2_id: string | null;
  status: string;
  created_at: string;
  finished_at: string | null;
}

export interface SeasonRankingRow {
  id: string;
  user_id: string;
  season: string;
  score: number;
  wins: number;
  losses: number;
  draws: number;
  updated_at: string;
}

export interface CommentRow {
  id: string;
  deck_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface FollowRow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  content: string;
  is_read: boolean;
  created_at: string;
}
