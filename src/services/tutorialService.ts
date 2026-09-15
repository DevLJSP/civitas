import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';
import { writeAudit } from './auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { cancelElection } from './electionService.js';

// ---------- Pure step machine (unit-testable, no DB) ----------

export const TUTORIAL_STEPS = ['welcome', 'channels', 'position', 'election', 'done'] as const;
export type TutorialStepId = (typeof TUTORIAL_STEPS)[number];

export const TUTORIAL_STATUS = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'] as const;
export type TutorialStatus = (typeof TUTORIAL_STATUS)[number];

export function stepIndex(step: TutorialStepId): number {
  return TUTORIAL_STEPS.indexOf(step);
}

export function nextStep(step: TutorialStepId): TutorialStepId {
  return TUTORIAL_STEPS[Math.min(TUTORIAL_STEPS.length - 1, stepIndex(step) + 1)] as TutorialStepId;
}

export function prevStep(step: TutorialStepId): TutorialStepId {
  return TUTORIAL_STEPS[Math.max(0, stepIndex(step) - 1)] as TutorialStepId;
}

export function parseStep(raw: string | undefined): TutorialStepId {
  if (raw && (TUTORIAL_STEPS as readonly string[]).includes(raw)) return raw as TutorialStepId;
  return 'welcome';
}

export function isFirstStep(step: TutorialStepId): boolean {
  return stepIndex(step) === 0;
}

export function isLastStep(step: TutorialStepId): boolean {
  return stepIndex(step) === TUTORIAL_STEPS.length - 1;
}

/** Step 4 requires a tutorial position from step 3. Pure guard for button logic. */
export function canOpenTestElection(state: { createdPositionId: string | null }): { ok: boolean; reason?: string } {
  if (!state.createdPositionId) {
    return { ok: false, reason: 'Create the tutorial position first (go Back one step).' };
  }
  return { ok: true };
}

/** Idempotent cleanup plan: only act on artifacts that still exist. Pure. */
export function cleanupPlan(state: {
  createdPositionId: string | null;
  createdElectionId: string | null;
}): { cancelElection: boolean; deactivatePosition: boolean } {
  return {
    cancelElection: state.createdElectionId !== null,
    deactivatePosition: state.createdPositionId !== null,
  };
}

// ---------- Persistent state (guild-scoped) ----------

export interface TutorialStateShape {
  guildId: string;
  status: string;
  currentStep: number;
  createdPositionId: string | null;
  createdElectionId: string | null;
}

export async function getTutorialState(guildId: string): Promise<TutorialStateShape> {
  const existing = await prisma.tutorialState.findUnique({ where: { guildId } });
  if (existing) return existing;
  return prisma.tutorialState.create({
    data: { guildId, status: 'NOT_STARTED', currentStep: 1 },
  });
}

export async function startTutorial(guildId: string, userId: string): Promise<TutorialStateShape> {
  const state = await prisma.tutorialState.upsert({
    where: { guildId },
    update: { status: 'IN_PROGRESS', startedBy: userId, completedAt: null },
    create: { guildId, status: 'IN_PROGRESS', currentStep: 1, startedBy: userId },
  });
  await writeAudit({
    guildId,
    actorId: userId,
    action: AUDIT_ACTIONS.TUTORIAL_START,
    entityType: 'TutorialState',
    entityId: state.id,
  });
  return state;
}

export async function setTutorialStep(guildId: string, step: TutorialStepId): Promise<TutorialStateShape> {
  return prisma.tutorialState.upsert({
    where: { guildId },
    update: { currentStep: stepIndex(step) + 1, status: 'IN_PROGRESS' },
    create: { guildId, status: 'IN_PROGRESS', currentStep: stepIndex(step) + 1 },
  });
}

export async function finishTutorial(guildId: string, userId: string): Promise<TutorialStateShape> {
  const state = await prisma.tutorialState.upsert({
    where: { guildId },
    update: { status: 'COMPLETED', currentStep: TUTORIAL_STEPS.length, completedAt: new Date() },
    create: { guildId, status: 'COMPLETED', currentStep: TUTORIAL_STEPS.length, completedAt: new Date(), startedBy: userId },
  });
  await writeAudit({
    guildId,
    actorId: userId,
    action: AUDIT_ACTIONS.TUTORIAL_COMPLETE,
    entityType: 'TutorialState',
    entityId: state.id,
  });
  return state;
}

export async function skipTutorial(guildId: string, userId: string): Promise<TutorialStateShape> {
  return prisma.tutorialState.upsert({
    where: { guildId },
    update: { status: 'SKIPPED' },
    create: { guildId, status: 'SKIPPED', startedBy: userId },
  });
}

export async function recordTutorialPosition(guildId: string, positionId: string): Promise<void> {
  await prisma.tutorialState.upsert({
    where: { guildId },
    update: { createdPositionId: positionId },
    create: { guildId, status: 'IN_PROGRESS', currentStep: 3, createdPositionId: positionId },
  });
}

export async function recordTutorialElection(guildId: string, electionId: string): Promise<void> {
  await prisma.tutorialState.upsert({
    where: { guildId },
    update: { createdElectionId: electionId },
    create: { guildId, status: 'IN_PROGRESS', currentStep: 4, createdElectionId: electionId },
  });
}

/**
 * Remove tutorial artifacts. Idempotent: missing/already-final artifacts are
 * skipped silently so double-clicking Cleanup is safe.
 */
export async function cleanupTutorial(guildId: string, userId: string): Promise<{ electionCancelled: boolean; positionDeactivated: boolean }> {
  const state = await getTutorialState(guildId);
  let electionCancelled = false;
  let positionDeactivated = false;

  if (state.createdElectionId) {
    try {
      await cancelElection(guildId, state.createdElectionId, userId);
      electionCancelled = true;
    } catch (err) {
      // Already finished/cancelled/missing → nothing to do.
      if (!(err instanceof Error) || !/already ended|not found|INVALID_STATE|NOT_FOUND/i.test(err.message)) throw err;
    }
  }

  if (state.createdPositionId) {
    const position = await prisma.leadershipPosition.findFirst({
      where: { id: state.createdPositionId, guildId },
    });
    if (position && position.isActive) {
      const activeMandates = await prisma.mandate.count({
        where: { positionId: position.id, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } },
      });
      if (activeMandates === 0) {
        await prisma.leadershipPosition.update({ where: { id: position.id }, data: { isActive: false } });
        positionDeactivated = true;
      }
    } else if (position && !position.isActive) {
      positionDeactivated = true; // already clean counts as clean
    }
  }

  await prisma.tutorialState.update({
    where: { guildId },
    data: { createdPositionId: null, createdElectionId: null },
  });
  await writeAudit({
    guildId,
    actorId: userId,
    action: AUDIT_ACTIONS.TUTORIAL_CLEANUP,
    entityType: 'TutorialState',
    entityId: guildId,
    details: { electionCancelled, positionDeactivated },
  });
  return { electionCancelled, positionDeactivated };
}

/** What the Channels step should show. Never blocks — warns only. */
export async function channelChecklist(guildId: string): Promise<
  { key: string; label: string; set: boolean }[]
> {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  return [
    { key: 'applications', label: 'Applications', set: Boolean(config?.applicationsChannelId) },
    { key: 'elections', label: 'Elections', set: Boolean(config?.electionChannelId) },
    { key: 'announcements', label: 'Announcements', set: Boolean(config?.announcementChannelId) },
    { key: 'audit', label: 'Audit', set: Boolean(config?.auditChannelId) },
  ];
}

export function assertTutorialOwnership(stateGuildId: string, requestGuildId: string): void {
  if (stateGuildId !== requestGuildId) throw userError('You cannot access data from another server.', 'CROSS_GUILD');
}
