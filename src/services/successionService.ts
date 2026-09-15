import { SuccessionAction } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { userError, type SuccessionStep } from '../types/index.js';
import { writeAudit } from './auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { addHours } from '../utils/time.js';

export function resolveSuccessionAction(steps: SuccessionStep[]): { action: SuccessionAction; successorUserId?: string } {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const first = sorted[0];
  if (!first) return { action: 'CREATE_VACANCY' };
  return { action: first.action as SuccessionAction, successorUserId: first.successorUserId };
}

export async function upsertSuccessionPlan(opts: {
  guildId: string;
  positionId: string;
  steps: SuccessionStep[];
  fallbackAction?: SuccessionAction;
  claimDeadlineHours?: number;
  actorId: string;
}) {
  const position = await prisma.leadershipPosition.findFirst({ where: { id: opts.positionId, guildId: opts.guildId } });
  if (!position) throw userError('This position no longer exists.');
  if (opts.steps.length > 10) throw userError('Too many succession steps (max 10).');
  const plan = await prisma.successionPlan.upsert({
    where: { positionId: opts.positionId },
    update: { steps: opts.steps as object, fallbackAction: opts.fallbackAction ?? 'CREATE_VACANCY', claimDeadlineHours: opts.claimDeadlineHours ?? 48 },
    create: {
      guildId: opts.guildId,
      positionId: opts.positionId,
      steps: opts.steps as object,
      fallbackAction: opts.fallbackAction ?? 'CREATE_VACANCY',
      claimDeadlineHours: opts.claimDeadlineHours ?? 48,
    },
  });
  return plan;
}

export async function triggerSuccession(opts: {
  guildId: string;
  positionId: string;
  reason: string;
  actorId: string;
}) {
  const position = await prisma.leadershipPosition.findFirst({ where: { id: opts.positionId, guildId: opts.guildId } });
  if (!position) throw userError('This position no longer exists.');

  const plan = await prisma.successionPlan.findUnique({ where: { positionId: opts.positionId } });
  const steps = (plan?.steps as SuccessionStep[] | null) ?? [];
  const resolved = resolveSuccessionAction(steps);
  const action: SuccessionAction = resolved.action ?? plan?.fallbackAction ?? 'CREATE_VACANCY';
  const deadlineAt = addHours(new Date(), plan?.claimDeadlineHours ?? 48);

  const vacancy = await prisma.vacancy.create({
    data: {
      guildId: opts.guildId,
      positionId: opts.positionId,
      reason: opts.reason.slice(0, 1000),
      status: 'OPEN',
      successionAction: action,
      successorUserId: resolved.successorUserId,
      deadlineAt,
    },
  });

  await prisma.scheduledTask.create({
    data: { guildId: opts.guildId, type: 'VACANCY_REVIEW', payload: { vacancyId: vacancy.id, guildId: opts.guildId }, runAt: deadlineAt },
  });

  await writeAudit({
    guildId: opts.guildId,
    actorId: opts.actorId,
    action: AUDIT_ACTIONS.SUCCESSION_TRIGGER,
    entityType: 'Vacancy',
    entityId: vacancy.id,
    details: { positionId: opts.positionId, action, reason: opts.reason },
  });
  return vacancy;
}

export async function listVacancies(guildId: string, openOnly = true) {
  return prisma.vacancy.findMany({
    where: { guildId, ...(openOnly ? { status: { in: ['OPEN', 'IN_PROGRESS'] } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { position: true },
  });
}

export async function resolveVacancy(guildId: string, vacancyId: string, actorId: string, status: 'FILLED' | 'CANCELLED' = 'FILLED') {
  const vacancy = await prisma.vacancy.findFirst({ where: { id: vacancyId, guildId } });
  if (!vacancy) throw userError('Vacancy not found.');
  if (vacancy.status === 'FILLED' || vacancy.status === 'CANCELLED') {
    throw userError('This vacancy has already been resolved.', 'INVALID_STATE');
  }
  const updated = await prisma.vacancy.update({
    where: { id: vacancyId },
    data: { status, resolvedAt: new Date() },
  });
  await writeAudit({ guildId, actorId, action: AUDIT_ACTIONS.VACANCY_RESOLVE, entityType: 'Vacancy', entityId: vacancyId, details: { status } });
  return updated;
}
