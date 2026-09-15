import type { Client } from 'discord.js';
import { prisma } from '../database/prisma.js';
import { finalizeElection } from '../services/electionService.js';
import { closeProposal } from '../services/proposalService.js';
import { decideImpeachment } from '../services/impeachmentService.js';
import { claimDueTasks, completeTask, failTask, newLockOwner } from '../services/schedulerService.js';
import { LIMITS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

let started = false;
let lockOwner = '';

interface TaskPayload {
  guildId?: string;
  electionId?: string;
  proposalId?: string;
  mandateId?: string;
  impeachmentId?: string;
  vacancyId?: string;
}

async function handleTask(client: Client, type: string, payload: TaskPayload): Promise<void> {
  void client;
  const guildId = payload.guildId;
  if (!guildId) throw new Error('Task missing guildId');
  switch (type) {
    case 'ELECTION_START': {
      if (!payload.electionId) throw new Error('Missing electionId');
      const { startElection } = await import('../services/electionService.js');
      try {
        await startElection(guildId, payload.electionId, 'system');
      } catch (err) {
        // Already started/finalized → treat as done (idempotent).
        if (err instanceof Error && /INVALID_STATE|already/i.test(err.message)) return;
        throw err;
      }
      return;
    }
    case 'ELECTION_END': {
      if (!payload.electionId) throw new Error('Missing electionId');
      await finalizeElection(guildId, payload.electionId, 'system');
      // Best-effort announcement + role sync happens in finalize; channel post is optional.
      return;
    }
    case 'PROPOSAL_END': {
      if (!payload.proposalId) throw new Error('Missing proposalId');
      await closeProposal(guildId, payload.proposalId, 'system');
      return;
    }
    case 'MANDATE_EXPIRE': {
      if (!payload.mandateId) throw new Error('Missing mandateId');
      const mandate = await prisma.mandate.findFirst({ where: { id: payload.mandateId, guildId } });
      if (!mandate) return;
      if (!['ACTIVE', 'PROBATION', 'PENDING', 'SUSPENDED'].includes(mandate.status)) return; // idempotent
      await prisma.mandate.update({ where: { id: mandate.id }, data: { status: 'EXPIRED' } });
      await prisma.auditLog.create({ data: { guildId, actorId: 'system', action: 'mandate.end', entityType: 'Mandate', entityId: mandate.id, details: { status: 'EXPIRED' } as object } });
      const { triggerSuccession } = await import('../services/successionService.js');
      try {
        await triggerSuccession({ guildId, positionId: mandate.positionId, reason: 'Term expired', actorId: 'system' });
      } catch { /* no plan → ignore */ }
      return;
    }
    case 'PROBATION_END': {
      if (!payload.mandateId) throw new Error('Missing mandateId');
      const mandate = await prisma.mandate.findFirst({ where: { id: payload.mandateId, guildId } });
      if (!mandate || mandate.status !== 'PROBATION') return; // idempotent
      // Auto-pass probation on expiry (configurable behavior: pass, notify managers).
      await prisma.mandate.update({ where: { id: mandate.id }, data: { status: 'ACTIVE', probationStatus: 'PASSED', probationEndsAt: null } });
      await prisma.auditLog.create({ data: { guildId, actorId: 'system', action: 'probation.decide', entityType: 'Mandate', entityId: mandate.id, details: { decision: 'AUTO_PASS' } as object } });
      return;
    }
    case 'IMPEACHMENT_END': {
      if (!payload.impeachmentId) throw new Error('Missing impeachmentId');
      const imp = await prisma.impeachment.findFirst({ where: { id: payload.impeachmentId, guildId } });
      if (!imp || !['OPEN', 'VOTING'].includes(imp.status)) return;
      const remove = imp.votesYes > imp.votesNo;
      await decideImpeachment(guildId, imp.id, 'system', remove);
      return;
    }
    case 'VACANCY_REVIEW':
    case 'SUCCESSION_DEADLINE':
    case 'APPLICATION_CLOSE': {
      // Review markers: vacancies stay OPEN until resolved by staff; just audit the deadline pass.
      await prisma.auditLog.create({ data: { guildId, actorId: 'system', action: 'vacancy.review', entityType: 'ScheduledTask', details: { type, payload: payload as object } as object } });
      return;
    }
    default:
      logger.warn(`Unknown scheduled task type: ${type}`);
  }
}

async function tick(client: Client): Promise<void> {
  try {
    const tasks = await claimDueTasks(lockOwner);
    for (const task of tasks) {
      try {
        await handleTask(client, task.type, (task.payload ?? {}) as TaskPayload);
        await completeTask(task.id);
      } catch (err) {
        await failTask(task.id, err);
      }
    }
  } catch (err) {
    logger.error('Scheduler tick failed', err);
  }
}

export function startScheduler(client: Client): void {
  if (started) return;
  started = true;
  lockOwner = newLockOwner();
  logger.info(`Scheduler started (owner=${lockOwner})`);
  // Immediate recovery pass for missed tasks during downtime, then interval.
  void tick(client);
  setInterval(() => void tick(client), LIMITS.schedulerPollMs).unref?.();
}

export function _resetSchedulerForTests(): void {
  started = false;
}
