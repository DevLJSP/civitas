// Pure state-transition guards (unit-testable without a database).
// The DB-backed services mirror these rules inside transactions.

export const FINAL_ELECTION_STATUSES = ['FINISHED', 'CANCELLED', 'QUORUM_NOT_REACHED'] as const;
export const ACTIVE_MANDATE_STATUSES = ['ACTIVE', 'PROBATION', 'PENDING', 'SUSPENDED'] as const;

export function canStartElection(status: string, candidateCount: number): { ok: boolean; reason?: string } {
  if (['FINISHED', 'CANCELLED', 'QUORUM_NOT_REACHED', 'ACTIVE', 'COUNTING'].includes(status)) {
    return { ok: false, reason: `Cannot start from ${status}` };
  }
  if (candidateCount < 1) return { ok: false, reason: 'Need at least one candidate' };
  return { ok: true };
}

export function isFinalElectionStatus(status: string): boolean {
  return (FINAL_ELECTION_STATUSES as readonly string[]).includes(status);
}

export function canEndMandate(status: string): boolean {
  return (ACTIVE_MANDATE_STATUSES as readonly string[]).includes(status);
}

export function isDuplicateKeyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /P2002|Unique constraint|UNIQUE constraint|duplicate key/i.test(err.message);
}

export function shouldRetryTask(attempts: number, maxAttempts = 5): boolean {
  return attempts < maxAttempts;
}

export function nextRetryDelayMs(attempts: number): number {
  // Exponential backoff capped at 10 minutes: 60s, 120s, 240s...
  return Math.min(10 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}
