import { MandateStatus } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';
import { writeAudit } from './auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';

export async function createAppointmentMandate(opts: {
  guildId: string;
  positionId: string;
  userId: string;
  appointedBy: string;
  reason?: string;
}) {
  const position = await prisma.leadershipPosition.findFirst({
    where: { id: opts.positionId, guildId: opts.guildId },
  });
  if (!position) throw userError('This position no longer exists.');
  if (!position.allowAppointment && position.requireElection) {
    throw userError('This position requires an election and cannot be filled by appointment.');
  }
  const holders = await prisma.mandate.count({
    where: { positionId: opts.positionId, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } },
  });
  if (holders >= position.maxHolders) throw userError('This position has no free seats.');

  // Bounded so one slow tx can't pin a pool connection (P2024). DB-only body.
  return prisma.$transaction(async (tx) => {
    const existing = await tx.mandate.count({
      where: { positionId: opts.positionId, userId: opts.userId, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } },
    });
    if (existing > 0) throw userError('That user already holds this position.');
    const now = new Date();
    const endsAt = new Date(now.getTime() + position.termLengthDays * 86_400_000);
    const probationEndsAt = position.probationDays > 0 ? new Date(now.getTime() + position.probationDays * 86_400_000) : null;
    const appointment = await tx.appointment.create({
      data: { guildId: opts.guildId, positionId: opts.positionId, userId: opts.userId, appointedBy: opts.appointedBy, reason: opts.reason?.slice(0, 1000) },
    });
    const mandate = await tx.mandate.create({
      data: {
        guildId: opts.guildId,
        positionId: opts.positionId,
        userId: opts.userId,
        status: position.probationDays > 0 ? 'PROBATION' : 'ACTIVE',
        origin: 'APPOINTMENT',
        termNumber: (await tx.mandate.count({ where: { positionId: opts.positionId, userId: opts.userId } })) + 1,
        startsAt: now,
        endsAt,
        probationEndsAt,
        probationStatus: position.probationDays > 0 ? 'PENDING' : 'NONE',
        appointmentId: appointment.id,
      },
    });
    await tx.appointment.update({ where: { id: appointment.id }, data: { mandateId: mandate.id } });
    if (probationEndsAt) {
      await tx.scheduledTask.create({
        data: { guildId: opts.guildId, type: 'PROBATION_END', payload: { mandateId: mandate.id, guildId: opts.guildId }, runAt: probationEndsAt },
      });
    }
    await tx.scheduledTask.create({
      data: { guildId: opts.guildId, type: 'MANDATE_EXPIRE', payload: { mandateId: mandate.id, guildId: opts.guildId }, runAt: endsAt },
    });
    await tx.auditLog.create({
      data: { guildId: opts.guildId, actorId: opts.appointedBy, action: AUDIT_ACTIONS.APPOINTMENT_CREATE, entityType: 'Mandate', entityId: mandate.id, details: { positionId: opts.positionId, userId: opts.userId } as object },
    });
    return mandate;
  }, { maxWait: 3000, timeout: 10000 });
}

export async function endMandate(opts: {
  guildId: string;
  mandateId: string;
  actorId: string;
  status: MandateStatus;
  reason?: string;
}) {
  // Bounded so one slow tx can't pin a pool connection (P2024). DB-only body.
  return prisma.$transaction(async (tx) => {
    const mandate = await tx.mandate.findFirst({ where: { id: opts.mandateId, guildId: opts.guildId } });
    if (!mandate) throw userError('Mandate not found.');
    if (!['ACTIVE', 'PROBATION', 'PENDING', 'SUSPENDED'].includes(mandate.status)) {
      throw userError('This mandate has already ended.', 'INVALID_STATE');
    }
    const updated = await tx.mandate.update({
      where: { id: mandate.id },
      data: { status: opts.status },
    });
    await tx.auditLog.create({
      data: { guildId: opts.guildId, actorId: opts.actorId, action: AUDIT_ACTIONS.MANDATE_END, entityType: 'Mandate', entityId: mandate.id, details: { status: opts.status, reason: opts.reason } as object },
    });
    return updated;
  }, { maxWait: 3000, timeout: 10000 });
}

export async function decideProbation(opts: {
  guildId: string;
  mandateId: string;
  actorId: string;
  decision: 'APPROVE' | 'FAIL' | 'EXTEND';
  extendDays?: number;
}) {
  const mandate = await prisma.mandate.findFirst({ where: { id: opts.mandateId, guildId: opts.guildId } });
  if (!mandate) throw userError('Mandate not found.');
  if (mandate.status !== 'PROBATION') throw userError('This mandate is not in probation.', 'INVALID_STATE');

  if (opts.decision === 'APPROVE') {
    const updated = await prisma.mandate.update({
      where: { id: mandate.id },
      data: { status: 'ACTIVE', probationStatus: 'PASSED', probationEndsAt: null },
    });
    await writeAudit({ guildId: opts.guildId, actorId: opts.actorId, action: AUDIT_ACTIONS.PROBATION_DECIDE, entityType: 'Mandate', entityId: mandate.id, details: { decision: 'APPROVE' } });
    return updated;
  }
  if (opts.decision === 'FAIL') {
    return endMandate({ guildId: opts.guildId, mandateId: mandate.id, actorId: opts.actorId, status: 'REMOVED', reason: 'Probation failed' });
  }
  const days = opts.extendDays ?? 14;
  if (days < 1 || days > 180) throw userError('Extension must be 1–180 days.');
  const probationEndsAt = new Date((mandate.probationEndsAt ?? new Date()).getTime() + days * 86_400_000);
  const updated = await prisma.mandate.update({ where: { id: mandate.id }, data: { probationEndsAt, probationStatus: 'EXTENDED' } });
  await prisma.scheduledTask.create({
    data: { guildId: opts.guildId, type: 'PROBATION_END', payload: { mandateId: mandate.id, guildId: opts.guildId }, runAt: probationEndsAt },
  });
  await writeAudit({ guildId: opts.guildId, actorId: opts.actorId, action: AUDIT_ACTIONS.PROBATION_DECIDE, entityType: 'Mandate', entityId: mandate.id, details: { decision: 'EXTEND', days } });
  return updated;
}

export async function listActiveMandates(guildId: string) {
  return prisma.mandate.findMany({
    where: { guildId, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } },
    orderBy: { startsAt: 'desc' },
    take: 50,
    include: { position: true },
  });
}
