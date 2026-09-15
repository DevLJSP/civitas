import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';
import { writeAudit } from './auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { getPosition } from './positionService.js';

export async function submitApplication(opts: {
  guildId: string;
  positionId: string;
  applicantId: string;
  motivation?: string;
  experience?: string;
  answers?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const position = await getPosition(opts.guildId, opts.positionId);
  if (!position.isActive) throw userError('This position is not accepting applications.');

  const existing = await prisma.leadershipApplication.findFirst({
    where: {
      positionId: opts.positionId,
      applicantId: opts.applicantId,
      status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
    },
  });
  if (existing) throw userError('You already have a pending application for this position.');

  const created = await prisma.leadershipApplication.create({
    data: {
      guildId: opts.guildId,
      positionId: opts.positionId,
      applicantId: opts.applicantId,
      status: 'SUBMITTED',
      motivation: opts.motivation?.slice(0, 2000),
      experience: opts.experience?.slice(0, 2000),
      answers: (opts.answers ?? {}) as object,
    },
  });
  await writeAudit({
    guildId: opts.guildId,
    actorId: opts.applicantId,
    action: AUDIT_ACTIONS.APPLICATION_SUBMIT,
    entityType: 'LeadershipApplication',
    entityId: created.id,
    details: { positionId: opts.positionId },
  });
  return { id: created.id };
}

export async function reviewApplication(opts: {
  guildId: string;
  applicationId: string;
  reviewerId: string;
  approve: boolean;
  note?: string;
}) {
  const app = await prisma.leadershipApplication.findFirst({
    where: { id: opts.applicationId, guildId: opts.guildId },
  });
  if (!app) throw userError('Application not found.');
  if (app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') {
    throw userError('This application has already been decided.', 'INVALID_STATE');
  }
  const status = opts.approve ? 'APPROVED' : 'REJECTED';
  const updated = await prisma.leadershipApplication.update({
    where: { id: app.id },
    data: { status, reviewerId: opts.reviewerId, reviewNote: opts.note?.slice(0, 1000) },
  });
  await writeAudit({
    guildId: opts.guildId,
    actorId: opts.reviewerId,
    action: AUDIT_ACTIONS.APPLICATION_REVIEW,
    entityType: 'LeadershipApplication',
    entityId: app.id,
    details: { status },
  });
  return updated;
}

export async function listApplications(guildId: string, status?: string) {
  return prisma.leadershipApplication.findMany({
    where: { guildId, ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
