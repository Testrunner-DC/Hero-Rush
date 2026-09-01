const tokenKey = "hero-rush:admin-session";

function apiBase(): string {
  const host = window.location.hostname;
  if (window.location.protocol === "https:") return window.location.origin;
  return `${window.location.protocol}//${host || "127.0.0.1"}:8081`;
}

export interface AdminOverview {
  username: string;
  service: {
    battleV2Enabled: boolean;
    rulesetVersion: string;
    engineVersion: string;
    queuedPlayers: number;
    privateRooms: number;
    activeMatches: number;
  };
  effects: {
    atoms: Array<{ kind: string; label: string; category: string; description: string; stateCheckAfter: true }>;
    registeredEffects: Array<{ cardNo: string; effectId: string; label: string; activation: string | null; trigger: string | null; ruleRefs: string[]; requiresTargeting: boolean }>;
    implementedCards: Array<{ cardNo: string; ruleRefs: string[]; effectIds: string[]; tests: string[] }>;
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem(tokenKey);
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || `管理接口返回 ${response.status}`);
  return body;
}

export async function loginAdmin(username: string, password: string): Promise<void> {
  const result = await request<{ token: string }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  sessionStorage.setItem(tokenKey, result.token);
}

export function hasAdminSession(): boolean {
  return Boolean(sessionStorage.getItem(tokenKey));
}

export async function loadAdminOverview(): Promise<AdminOverview> {
  return request<AdminOverview>("/api/admin/overview");
}

export async function logoutAdmin(): Promise<void> {
  try { await request("/api/admin/logout", { method: "POST" }); }
  finally { sessionStorage.removeItem(tokenKey); }
}
