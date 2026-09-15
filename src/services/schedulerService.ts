import { randomUUID } from 'node:crypto';
import { prisma } from '../database/prisma.js';
import { LIMITS } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { nextRetryDelayMs, shouldRetryTask } from './guards.js';

export async function scheduleTask(opts: {
  guildId?: string;
  type: string;
  payload: Record<string, unknown>;
  runAt: Date;
}): Promise<string> {
  const task = await prisma.scheduledTask.create({
    data: { guildId: opts.guildId, type: opts.type, payload: opts.payload as object, runAt: opts.runAt },
  });
  return task.id;
}

/** Prisma error codes that mean "the DB itself is struggling" — safe to retry. */
const TRANSIENT_DB_CODES = new Set(['P2024', 'P1001', 'P1002', 'P1017', 'P2028']);

/**
 * True for pool/connectivity/transaction-timeout failures (P2024, P1001, …).
 * Callers use this to back off instead of hammering an overloaded pool.
 */
export function isTransientDbError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && TRANSIENT_DB_CODES.has(code)) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /timed out fetching a new connection|can't reach database|server has closed the connection|connection pool|timed out/i.test(
    message,
  );
}

/**
 * True for deterministic business-logic failures (bad user input, invalid state)
 * that can never succeed on retry — e.g. starting an election with no
 * candidates. These go straight to FAILED instead of churning every 60s.
 */
export function isDeterministicFailure(error: unknown): boolean {
  if (error instanceof AppError) return error.code !== 'TRANSIENT';
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /INVALID_STATE|USER_ERROR|CROSS_GUILD|FORBIDDEN|NOT_OPEN|ELECTION_CLOSED|DUPLICATE_VOTE|not found|already|no longer exists|at least one candidate|nominations are closed|cannot be started|has already ended|not open for voting/i.test(
    message,
  );
}

/**
 * Claim due tasks atomically so two worker loops (or two processes) cannot
 * execute the same task twice. Uses a lock owner id + claimedAt.
 *
 * Single statement (UPDATE … FROM … SKIP LOCKED): one pool checkout per tick
 * instead of the old N+1 find + update-per-task loop, and `attempts` is
 * incremented exactly once per claim.
 */
export async function claimDueTasks(lockOwner: string, now = new Date(), batchSize = LIMITS.schedulerBatchSize) {
  const lockCutoff = new Date(now.getTime() - LIMITS.schedulerLockMs);
  // Re-queue stale CLAIMED tasks (crashed worker) back to PENDING *before*
  // claiming, so this tick can pick them up immediately.
  await prisma.scheduledTask.updateMany({
    where: { status: 'CLAIMED', claimedAt: { lt: lockCutoff } },
    data: { status: 'PENDING', claimedAt: null, lockedBy: null },
  });
  const take = Math.max(1, Math.floor(batchSize));
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH due AS (
      SELECT id
      FROM "ScheduledTask"
      WHERE status = 'PENDING'::"TaskStatus" AND "runAt" <= ${now}
      ORDER BY "runAt" ASC
      LIMIT ${take}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "ScheduledTask" t
    SET status = 'CLAIMED'::"TaskStatus",
        "claimedAt" = ${now},
        "lockedBy" = ${lockOwner},
        attempts = t.attempts + 1,
        "updatedAt" = ${now}
    FROM due
    WHERE t.id = due.id
    RETURNING t.id AS id
  `;
  if (claimed.length === 0) return [];
  return prisma.scheduledTask.findMany({
    where: { id: { in: claimed.map((r) => r.id) } },
    orderBy: { runAt: 'asc' },
  });
}

export async function completeTask(id: string): Promise<void> {
  await prisma.scheduledTask.update({ where: { id }, data: { status: 'DONE' } });
}

export async function failTask(id: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  const task = await prisma.scheduledTask.findUnique({ where: { id } });
  // NB: claimDueTasks already incremented `attempts` exactly once for this
  // attempt — do NOT increment again here (the old code double-counted).
  const attempts = task?.attempts ?? 1;
  const type = task?.type ?? 'unknown';
  if (!task) {
    logger.error(`Scheduled task ${type} failed (attempt ${attempts})`, { id, message });
    return;
  }
  if (isDeterministicFailure(error)) {
    logger.error(`Scheduled task ${type} failed permanently (attempt ${attempts})`, { id, message });
    await prisma.scheduledTask.update({ where: { id }, data: { status: 'FAILED', lastError: message } });
    return;
  }
  logger.error(`Scheduled task ${type} failed (attempt ${attempts})`, { id, message });
  if (!shouldRetryTask(attempts)) {
    await prisma.scheduledTask.update({ where: { id }, data: { status: 'FAILED', lastError: message } });
  } else {
    // Retry with exponential backoff: 60s, 120s, 240s … capped at 10 min.
    await prisma.scheduledTask.update({
      where: { id },
      data: {
        status: 'PENDING',
        claimedAt: null,
        lockedBy: null,
        lastError: message,
        runAt: new Date(Date.now() + nextRetryDelayMs(attempts)),
      },
    });
  }
}

export function newLockOwner(): string {
  return `${process.pid}-${randomUUID().slice(0, 8)}`;
}
