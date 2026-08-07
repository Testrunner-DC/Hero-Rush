import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface VerifiedIdentity {
  userId: string;
  authenticated: boolean;
}

export class SupabaseAuthVerifier {
  private readonly client: SupabaseClient | null;
  private readonly allowGuests: boolean;

  constructor() {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    this.client = url && anonKey
      ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
    this.allowGuests = process.env.ALLOW_GUESTS === "true" || process.env.NODE_ENV !== "production";
  }

  async verify(accessToken: string | undefined, connectionId: string): Promise<VerifiedIdentity> {
    if (accessToken) {
      if (!this.client) throw new Error("服务端尚未配置 Supabase 身份校验");
      const { data, error } = await this.client.auth.getClaims(accessToken);
      const subject = data?.claims?.sub;
      if (error || typeof subject !== "string" || !subject) {
        throw new Error("登录凭证无效或已过期");
      }
      return { userId: subject, authenticated: true };
    }

    if (!this.allowGuests) throw new Error("当前环境不允许游客进入联机对战");
    return { userId: `guest:${connectionId}`, authenticated: false };
  }
}
