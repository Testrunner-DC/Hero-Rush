import { describe, expect, it } from 'vitest';
import {
  getPublicAccountLabel,
  isInternalUsernameEmail,
  resolveAuthIdentifier,
} from '../utils/authIdentifier';

describe('username authentication identifier', () => {
  it('maps a username to a stable internal email identity', () => {
    expect(resolveAuthIdentifier('  Hero_Player-1 ')).toEqual({
      email: 'hero_player-1@users.hero-rush.local',
      username: 'Hero_Player-1',
      usesLegacyEmail: false,
    });
  });

  it('keeps legacy email accounts compatible', () => {
    expect(resolveAuthIdentifier('Old.Player@Example.com')).toEqual({
      email: 'old.player@example.com',
      username: 'Old.Player',
      usesLegacyEmail: true,
    });
  });

  it('rejects invalid usernames before calling the auth provider', () => {
    expect(() => resolveAuthIdentifier('ab')).toThrow('3–24');
    expect(() => resolveAuthIdentifier('玩家一号')).toThrow('3–24');
  });

  it('never exposes the internal identity address as the public label', () => {
    expect(isInternalUsernameEmail('hero@users.hero-rush.local')).toBe(true);
    expect(getPublicAccountLabel('hero@users.hero-rush.local', 'Hero')).toBe('Hero');
    expect(getPublicAccountLabel('hero@users.hero-rush.local')).toBe('hero');
  });
});
