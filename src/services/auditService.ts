import { prisma } from '../database/prisma.js';

export async function writeAudit(opts: {
  guildId: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  // Never log anonymous vote choices: callers must not pass them in details.
  await prisma.auditLog.create({
    data: {
      guildId: opts.guildId,
      actorId: opts.actorId,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      details: (opts.details ?? {}) as object,
    },
  });
}

export async function getRecentAudit(guildId: string, limit = 20): Promise<
  { id: string; action: string; entityType: string; createdAt: Date; actorId: string | null }[]
> {
  return prisma.auditLog.findMany({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(50, Math.max(1, limit)),
    select: { id: true, action: true, entityType: true, createdAt: true, actorId: true },
  });
}
