import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 8 * 60 * 60_000;

interface AdminSession {
  username: string;
  expiresAt: number;
}

export interface AdminLoginResult {
  token: string;
  username: string;
  expiresAt: number;
}

function verifyScryptPassword(password: string, encoded: string): boolean {
  const [salt, expectedHex] = encoded.split(":");
  if (!salt || !expectedHex || !/^[a-f0-9]+$/i.test(expectedHex)) return false;
  const actual = scryptSync(password, salt, expectedHex.length / 2);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class AdminAuthService {
  private readonly username = process.env.ADMIN_USERNAME ?? "";
  private readonly passwordScrypt = process.env.ADMIN_PASSWORD_SCRYPT ?? "";
  private readonly sessions = new Map<string, AdminSession>();

  get configured(): boolean {
    return Boolean(this.username && this.passwordScrypt);
  }

  login(username: string, password: string): AdminLoginResult | null {
    if (!this.configured || username !== this.username || !verifyScryptPassword(password, this.passwordScrypt)) return null;
    this.prune();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + SESSION_TTL_MS;
    this.sessions.set(token, { username: this.username, expiresAt });
    return { token, username: this.username, expiresAt };
  }

  authorize(header: string | undefined): AdminSession | null {
    const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      if (session) this.sessions.delete(token);
      return null;
    }
    return session;
  }

  logout(header: string | undefined): void {
    const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (token) this.sessions.delete(token);
  }

  private prune(): void {
    const now = Date.now();
    for (const [token, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(token);
  }
}
