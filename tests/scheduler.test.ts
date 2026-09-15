import { describe, expect, it } from 'vitest';
import { isDeterministicFailure, isTransientDbError } from '../src/services/schedulerService.js';
import { userError } from '../src/types/index.js';
import { describePoolConfig } from '../src/database/prisma.js';

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('scheduler failure classification (P2024 fix)', () => {
  it('treats pool/connectivity errors as transient (retry with backoff)', () => {
    expect(
      isTransientDbError(codedError('P2024', 'Timed out fetching a new connection from the connection pool')),
    ).toBe(true);
    expect(isTransientDbError(codedError('P1001', "Can't reach database server"))).toBe(true);
    expect(isTransientDbError(codedError('P1017', 'Server has closed the connection'))).toBe(true);
    expect(isTransientDbError(codedError('P2028', 'Transaction already closed'))).toBe(true);
  });

  it('does not treat constraint/user errors as transient', () => {
    expect(isTransientDbError(codedError('P2002', 'Unique constraint failed'))).toBe(false);
    expect(isTransientDbError(new Error('Add at least one candidate before starting.'))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
  });

  it('fails fast on deterministic business-logic errors (no 60s churn)', () => {
    expect(isDeterministicFailure(userError('Add at least one candidate before starting.'))).toBe(true);
    expect(isDeterministicFailure(userError('Election not found.'))).toBe(true);
    expect(isDeterministicFailure(userError('boom', 'INVALID_STATE'))).toBe(true);
    expect(isDeterministicFailure(new Error('Task missing guildId'))).toBe(false);
  });

  it('retries genuine transient DB errors instead of failing fast', () => {
    expect(
      isDeterministicFailure(codedError('P2024', 'Timed out fetching a new connection from the connection pool')),
    ).toBe(false);
    expect(isDeterministicFailure(codedError('P1001', "Can't reach database server"))).toBe(false);
  });
});

describe('describePoolConfig', () => {
  it('summarizes pool shape without leaking credentials', () => {
    const summary = describePoolConfig(
      'postgresql://postgres.secret:pw123@aws-0-us-east-2.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=5&pool_timeout=20&connect_timeout=10',
    );
    expect(summary).toContain('port=5432');
    expect(summary).toContain('connection_limit=5');
    expect(summary).toContain('pgbouncer=true');
    expect(summary).not.toContain('pw123');
    expect(summary).not.toContain('postgres.secret');
  });

  it('handles missing params and garbage input', () => {
    expect(describePoolConfig('postgresql://a:b@localhost:5432/db')).toContain('connection_limit=(default)');
    expect(describePoolConfig('not a url')).toBe('(unparseable DATABASE_URL)');
  });
});
