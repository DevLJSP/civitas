import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';
import { writeAudit } from './auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { endMandate } from './mandateService.js';
import { triggerSuccession } from './successionService.js';

export async function openImpeachment(opts: {
  guildId: string;
  targetUserId: string;
  positionId?: string;
  mandateId?: string;
  reason: string;
  method?: 'ADMIN' | 'COUNCIL' | 'COMMUNITY';
  openedBy: string;
  endsAt?: Date;
}) {
  if (opts.reason.trim().length < 5) throw userError('Please provide a reason (min 5 characters).');
  const existing = await prisma.impeachment.findFirst({
    where: { guildId: opts.guildId, targetUserId: opts.targetUserId, status: { in: ['OPEN', 'VOTING'] } },
  });
  if (existing) throw userError('There is already an open removal case for that user.');
  const created = await prisma.impeachment.create({
    data: {
      guildId: opts.guildId,
      targetUserId: opts.targetUserId,
      positionId: opts.positionId,
      mandateId: opts.mandateId,
      reason: opts.reason.slice(0, 1000),
      method: (opts.method ?? 'ADMIN') as never,
      status: opts.method === 'ADMIN' ? 'OPEN' : 'VOTING',
      openedBy: opts.openedBy,
      endsAt: opts.endsAt,
    },
  });
  if (opts.endsAt) {
    await prisma.scheduledTask.create({
      data: { guildId: opts.guildId, type: 'IMPEACHMENT_END', payload: { impeachmentId: created.id, guildId: opts.guildId }, runAt: opts.endsAt },
    });
  }
  await writeAudit({ guildId: opts.guildId, actorId: opts.openedBy, action: AUDIT_ACTIONS.IMPEACHMENT_OPEN, entityType: 'Impeachment', entityId: created.id, details: { target: opts.targetUserId } });
  return created;
}

export async function voteImpeachment(guildId: string, impeachmentId: string, voterId: string, remove: boolean) {
  const imp = await prisma.impeachment.findFirst({ where: { id: impeachmentId, guildId } });
  if (!imp) throw userError('Removal case not found.');
  if (imp.status !== 'VOTING' && imp.status !== 'OPEN') throw userError('This removal case is closed.', 'INVALID_STATE');
  try {
    await prisma.impeachmentVote.create({ data: { impeachmentId, voterId, choice: remove } });
  } catch {
    throw userError('You have already voted.');
  }
  await prisma.impeachment.update({
    where: { id: impeachmentId },
    data: remove ? { votesYes: { increment: 1 } } : { votesNo: { increment: 1 } },
  });
}

export async function decideImpeachment(guildId: string, impeachmentId: string, actorId: string, remove: boolean) {
  return prisma.$transaction(async (tx) => {
    const imp = await tx.impeachment.findFirst({ where: { id: impeachmentId, guildId } });
    if (!imp) throw userError('Removal case not found.');
    if (!['OPEN', 'VOTING'].includes(imp.status)) throw userError('This removal case is closed.', 'INVALID_STATE');
    const status = remove ? 'PASSED' : 'FAILED';
    const updated = await tx.impeachment.update({ where: { id: impeachmentId }, data: { status } });
    await tx.auditLog.create({
      data: { guildId, actorId, action: AUDIT_ACTIONS.IMPEACHMENT_CLOSE, entityType: 'Impeachment', entityId: impeachmentId, details: { status } as object },
    });
    if (remove) {
      // End active mandates for target.
      const mandates = await tx.mandate.findMany({
        where: { guildId, userId: imp.targetUserId, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } },
      });
      for (const m of mandates) {
        await tx.mandate.update({ where: { id: m.id }, data: { status: 'REMOVED' } });
        await tx.auditLog.create({
          data: { guildId, actorId, action: AUDIT_ACTIONS.MANDATE_END, entityType: 'Mandate', entityId: m.id, details: { status: 'REMOVED', via: 'impeachment' } as object },
        });
      }
      if (imp.positionId) {
        const plan = await tx.successionPlan.findUnique({ where: { positionId: imp.positionId } });
        void plan;
        // Create vacancy + succession outside this tx would be cleaner, but keep atomic record here.
        await tx.vacancy.create({
          data: { guildId, positionId: imp.positionId, reason: `Removal of <@${imp.targetUserId}>`, status: 'OPEN' },
        });
      }
    }
    return updated;
  });
}

/** Admin shortcut that also triggers succession via service (non-transactional wrapper). */
export async function enforceRemovalWithSuccession(guildId: string, impeachmentId: string, actorId: string) {
  const decided = await decideImpeachment(guildId, impeachmentId, actorId, true);
  const imp = await prisma.impeachment.findFirst({ where: { id: impeachmentId } });
  if (imp?.positionId) {
    try {
      await triggerSuccession({ guildId, positionId: imp.positionId, reason: 'Leader removed', actorId });
    } catch {
      // Vacancy already created inside transaction; ignore secondary failure.
    }
  }
  return decided;
}

export async function resignMandate(guildId: string, userId: string, mandateId: string) {
  const mandate = await prisma.mandate.findFirst({ where: { id: mandateId, guildId } });
  if (!mandate) throw userError('Mandate not found.');
  if (mandate.userId !== userId) throw userError('You can only resign your own mandate.', 'FORBIDDEN');
  const ended = await endMandate({ guildId, mandateId, actorId: userId, status: 'RESIGNED', reason: 'Resignation' });
  await writeAudit({ guildId, actorId: userId, action: AUDIT_ACTIONS.RESIGNATION, entityType: 'Mandate', entityId: mandateId });
  try {
    await triggerSuccession({ guildId, positionId: mandate.positionId, reason: 'Resignation', actorId: userId });
  } catch {
    // succession is best-effort if no plan configured
  }
  return ended;
}
