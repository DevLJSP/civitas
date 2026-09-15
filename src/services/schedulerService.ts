import { randomUUID } from 'node:crypto';
import { prisma } from '../database/prisma.js';
import { LIMITS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

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

/**
 * Claim due tasks atomically so two worker loops (or two processes) cannot
 * execute the same task twice. Uses a lock owner id + claimedAt.
 */
export async function claimDueTasks(lockOwner: string, now = new Date(), batchSize = LIMITS.schedulerBatchSize) {
  const lockCutoff = new Date(now.getTime() - LIMITS.schedulerLockMs);
  const due = await prisma.scheduledTask.findMany({
    where: {
      status: 'PENDING',
      runAt: { lte: now },
    },
    orderBy: { runAt: 'asc' },
    take: batchSize,
  });
  const claimed: string[] = [];
  for (const t of due) {
    const res = await prisma.scheduledTask.updateMany({
      where: { id: t.id, status: 'PENDING' },
      data: { status: 'CLAIMED', claimedAt: now, lockedBy: lockOwner, attempts: { increment: 1 } },
    });
    if (res.count === 1) claimed.push(t.id);
  }
  // Re-queue stale CLAIMED tasks (crashed worker) back to PENDING.
  await prisma.scheduledTask.updateMany({
    where: { status: 'CLAIMED', claimedAt: { lt: lockCutoff } },
    data: { status: 'PENDING', claimedAt: null, lockedBy: null },
  });
  if (claimed.length === 0) return [];
  return prisma.scheduledTask.findMany({ where: { id: { in: claimed } } });
}

export async function completeTask(id: string): Promise<void> {
  await prisma.scheduledTask.update({ where: { id }, data: { status: 'DONE' } });
}

export async function failTask(id: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  const task = await prisma.scheduledTask.findUnique({ where: { id } });
  const attempts = (task?.attempts ?? 0) + 1;
  logger.error(`Scheduled task ${task?.type} failed (attempt ${attempts})`, { id, message });
  if (attempts >= 5) {
    await prisma.scheduledTask.update({ where: { id }, data: { status: 'FAILED', lastError: message } });
  } else {
    // Retry with backoff: re-queue 60s later.
    await prisma.scheduledTask.update({
      where: { id },
      data: { status: 'PENDING', claimedAt: null, lockedBy: null, lastError: message, runAt: new Date(Date.now() + 60_000) },
    });
  }
}

export function newLockOwner(): string {
  return `${process.pid}-${randomUUID().slice(0, 8)}`;
}
