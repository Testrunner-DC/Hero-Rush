/** Authentication state managed by AuthContext */
export interface AuthState {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

/** Minimal session representation used internally */
export interface Session {
  access_token: string;
  expires_at?: number;
  user: { id: string; email?: string };
}

/** Public user profile (subset of users table) */
export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  avatar_url: string | null;
  bio: string;
  created_at: string;
}

/** Form data for editing profile */
export interface ProfileFormData {
  nickname: string;
  bio: string;
}
