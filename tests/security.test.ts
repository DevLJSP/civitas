import { describe, expect, it } from 'vitest';
import { hasLevel } from '../src/middleware/permissions.js';
import { PERMISSION_LEVELS } from '../src/config/constants.js';
import { assertSameGuild } from '../src/middleware/guild.js';
import { checkRateLimit, _clearRateBucketsForTests } from '../src/middleware/rateLimit.js';
import { resolveSuccessionAction } from '../src/services/successionService.js';
import { parseCustomId, buildCustomId, mustGuildId } from '../src/utils/ids.js';
import { paginate } from '../src/utils/pagination.js';

describe('permissions', () => {
  it('enforces hierarchy', () => {
    expect(hasLevel(PERMISSION_LEVELS.MEMBER, PERMISSION_LEVELS.ADMIN)).toBe(false);
    expect(hasLevel(PERMISSION_LEVELS.ADMIN, PERMISSION_LEVELS.ADMIN)).toBe(true);
    expect(hasLevel(PERMISSION_LEVELS.OWNER, PERMISSION_LEVELS.ADMIN)).toBe(true);
    expect(hasLevel(PERMISSION_LEVELS.TEAM_LEADER, PERMISSION_LEVELS.MODERATOR)).toBe(true);
  });
});

describe('cross-guild isolation', () => {
  it('rejects mismatched guilds', () => {
    expect(() => assertSameGuild('A', 'B')).toThrow();
    expect(() => assertSameGuild('A', 'A')).not.toThrow();
  });
});

describe('rate limiting', () => {
  it('blocks after max within window', () => {
    _clearRateBucketsForTests();
    const key = `test:${Date.now()}:${Math.random()}`;
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(false);
  });
});

describe('succession resolution', () => {
  it('picks first step by order', () => {
    const r = resolveSuccessionAction([
      { order: 2, action: 'START_ELECTION' },
      { order: 1, action: 'APPOINT_SUCCESSOR', successorUserId: 'u1' },
    ]);
    expect(r.action).toBe('APPOINT_SUCCESSOR');
    expect(r.successorUserId).toBe('u1');
  });

  it('falls back to vacancy when empty', () => {
    expect(resolveSuccessionAction([]).action).toBe('CREATE_VACANCY');
  });
});

describe('interaction ids', () => {
  it('round-trips and rejects forged namespaces', () => {
    const id = buildCustomId('election', 'vote', 'abc123');
    const parsed = parseCustomId(id);
    expect(parsed.namespace).toBe('election');
    expect(parsed.action).toBe('vote');
    expect(parsed.parts).toEqual(['abc123']);
    expect(() => parseCustomId('forged:vote:abc')).toThrow();
  });

  it('requires guild context', () => {
    expect(() => mustGuildId(null)).toThrow();
    expect(mustGuildId('g1')).toBe('g1');
  });

  it('strips colon injection', () => {
    const id = buildCustomId('election', 'vote', 'a:b');
    expect(id).not.toContain('a:b');
  });
});

describe('pagination', () => {
  it('pages correctly', () => {
    const p = paginate([1, 2, 3, 4, 5], 2, 2);
    expect(p.items).toEqual([3, 4]);
    expect(p.totalPages).toBe(3);
  });
});
