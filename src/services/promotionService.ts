import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';
import { writeAudit } from './auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { endMandate } from './mandateService.js';

export async function requestPromotion(opts: {
  guildId: string;
  userId: string;
  toPositionId: string;
  requestedBy: string;
  reason?: string;
}) {
  const to = await prisma.leadershipPosition.findFirst({ where: { id: opts.toPositionId, guildId: opts.guildId } });
  if (!to) throw userError('This position no longer exists.');
  const current = await prisma.mandate.findFirst({
    where: { guildId: opts.guildId, userId: opts.userId, status: { in: ['ACTIVE', 'PROBATION'] } },
    orderBy: { startsAt: 'desc' },
  });
  const created = await prisma.promotion.create({
    data: {
      guildId: opts.guildId,
      fromPositionId: current?.positionId,
      toPositionId: opts.toPositionId,
      userId: opts.userId,
      status: 'PENDING',
      requestedBy: opts.requestedBy,
      reason: opts.reason?.slice(0, 1000),
    },
  });
  return created;
}

export async function decidePromotion(guildId: string, promotionId: string, actorId: string, approve: boolean) {
  const promo = await prisma.promotion.findFirst({ where: { id: promotionId, guildId } });
  if (!promo) throw userError('Promotion not found.');
  if (promo.status !== 'PENDING') throw userError('This promotion has already been decided.', 'INVALID_STATE');
  if (!approve) {
    const updated = await prisma.promotion.update({ where: { id: promo.id }, data: { status: 'REJECTED', decidedBy: actorId } });
    await writeAudit({ guildId, actorId, action: AUDIT_ACTIONS.PROMOTION_DECIDE, entityType: 'Promotion', entityId: promo.id, details: { decision: 'REJECTED' } });
    return updated;
  }
  // Approve: end current mandates, create new mandate for target position.
  const position = await prisma.leadershipPosition.findFirst({ where: { id: promo.toPositionId, guildId } });
  if (!position) throw userError('This position no longer exists.');
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const actives = await tx.mandate.findMany({
      where: { guildId, userId: promo.userId, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } },
    });
    for (const m of actives) {
      await tx.mandate.update({ where: { id: m.id }, data: { status: 'EXPIRED' } });
    }
    const endsAt = new Date(now.getTime() + position.termLengthDays * 86_400_000);
    const mandate = await tx.mandate.create({
      data: {
        guildId,
        positionId: position.id,
        userId: promo.userId,
        status: position.probationDays > 0 ? 'PROBATION' : 'ACTIVE',
        origin: 'PROMOTION',
        termNumber: 1,
        startsAt: now,
        endsAt,
        probationEndsAt: position.probationDays > 0 ? new Date(now.getTime() + position.probationDays * 86_400_000) : null,
        probationStatus: position.probationDays > 0 ? 'PENDING' : 'NONE',
      },
    });
    const updated = await tx.promotion.update({ where: { id: promo.id }, data: { status: 'COMPLETED', decidedBy: actorId } });
    await tx.auditLog.create({
      data: { guildId, actorId, action: AUDIT_ACTIONS.PROMOTION_DECIDE, entityType: 'Promotion', entityId: promo.id, details: { decision: 'APPROVED', mandateId: mandate.id } as object },
    });
    return { updated, mandate };
  });
  return result.updated;
}

export async function requestDemotion(opts: { guildId: string; userId: string; fromPositionId: string; toPositionId?: string; requestedBy: string; reason?: string }) {
  return prisma.demotion.create({
    data: { guildId: opts.guildId, fromPositionId: opts.fromPositionId, toPositionId: opts.toPositionId, userId: opts.userId, status: 'PENDING', requestedBy: opts.requestedBy, reason: opts.reason?.slice(0, 1000) },
  });
}

export async function decideDemotion(guildId: string, demotionId: string, actorId: string, approve: boolean) {
  const d = await prisma.demotion.findFirst({ where: { id: demotionId, guildId } });
  if (!d) throw userError('Demotion not found.');
  if (d.status !== 'PENDING') throw userError('This demotion has already been decided.', 'INVALID_STATE');
  if (!approve) {
    return prisma.demotion.update({ where: { id: d.id }, data: { status: 'REJECTED', decidedBy: actorId } });
  }
  const actives = await prisma.mandate.findMany({
    where: { guildId, userId: d.userId, positionId: d.fromPositionId, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } },
  });
  for (const m of actives) {
    await endMandate({ guildId, mandateId: m.id, actorId, status: 'REMOVED', reason: d.reason ?? 'Demotion' });
  }
  const updated = await prisma.demotion.update({ where: { id: d.id }, data: { status: 'COMPLETED', decidedBy: actorId } });
  await writeAudit({ guildId, actorId, action: AUDIT_ACTIONS.DEMOTION_DECIDE, entityType: 'Demotion', entityId: d.id, details: { decision: 'APPROVED' } });
  return updated;
}
