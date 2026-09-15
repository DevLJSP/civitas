import { describe, expect, it } from 'vitest';
import { breakTie } from '../src/services/election/engine.js';
import {
  canEndMandate,
  canStartElection,
  isDuplicateKeyError,
  isFinalElectionStatus,
  nextRetryDelayMs,
  shouldRetryTask,
} from '../src/services/guards.js';

describe('election lifecycle guards', () => {
  it('prevents starting without candidates', () => {
    expect(canStartElection('DRAFT', 0).ok).toBe(false);
    expect(canStartElection('DRAFT', 2).ok).toBe(true);
  });

  it('prevents starting from final states (idempotent finalize)', () => {
    for (const s of ['FINISHED', 'CANCELLED', 'QUORUM_NOT_REACHED']) {
      expect(canStartElection(s, 2).ok).toBe(false);
      expect(isFinalElectionStatus(s)).toBe(true);
    }
    expect(isFinalElectionStatus('ACTIVE')).toBe(false);
  });

  it('prevents double mandate end', () => {
    expect(canEndMandate('ACTIVE')).toBe(true);
    expect(canEndMandate('PROBATION')).toBe(true);
    expect(canEndMandate('EXPIRED')).toBe(false);
    expect(canEndMandate('RESIGNED')).toBe(false);
    expect(canEndMandate('REMOVED')).toBe(false);
  });
});

describe('concurrency helpers', () => {
  it('detects duplicate-key errors (simultaneous votes)', () => {
    expect(isDuplicateKeyError(new Error('Unique constraint failed on the fields: (`electionId`,`voterId`)'))).toBe(true);
    expect(isDuplicateKeyError(new Error('P2002 something'))).toBe(true);
    expect(isDuplicateKeyError(new Error('boom'))).toBe(false);
  });

  it('caps scheduler retries with backoff', () => {
    expect(shouldRetryTask(1)).toBe(true);
    expect(shouldRetryTask(5)).toBe(false);
    expect(nextRetryDelayMs(1)).toBe(60_000);
    expect(nextRetryDelayMs(10)).toBe(600_000);
  });

  it('breaks ties deterministically under concurrency', () => {
    expect(breakTie(['z', 'a', 'm'])).toBe('a');
  });
});
