const USERNAME_EMAIL_DOMAIN = 'users.hero-rush.local';
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/;

export interface ResolvedAuthIdentifier {
  email: string;
  username: string;
  usesLegacyEmail: boolean;
}

/**
 * Supabase password authentication uses an email identity internally. The UI,
 * however, is username-first. Legacy email accounts remain valid while new
 * usernames are mapped deterministically to a private, non-display address.
 */
export function resolveAuthIdentifier(rawIdentifier: string): ResolvedAuthIdentifier {
  const identifier = rawIdentifier.trim();
  if (!identifier) throw new Error('请输入用户名');

  if (identifier.includes('@')) {
    return {
      email: identifier.toLowerCase(),
      username: identifier.split('@')[0] || identifier,
      usesLegacyEmail: true,
    };
  }

  if (!USERNAME_PATTERN.test(identifier)) {
    throw new Error('用户名需为 3–24 位字母、数字、下划线或连字符，并以字母或数字开头');
  }

  return {
    email: `${identifier.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`,
    username: identifier,
    usesLegacyEmail: false,
  };
}

export function isInternalUsernameEmail(email?: string | null): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`));
}

export function getPublicAccountLabel(
  email?: string | null,
  metadataUsername?: unknown,
): string {
  if (typeof metadataUsername === 'string' && metadataUsername.trim()) {
    return metadataUsername.trim();
  }
  if (isInternalUsernameEmail(email)) return email!.split('@')[0];
  return email ?? '';
}
