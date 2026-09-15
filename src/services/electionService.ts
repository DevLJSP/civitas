import { ElectionStatus, ElectionType } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';
import { writeAudit } from './auditService.js';
import { AUDIT_ACTIONS, LIMITS } from '../config/constants.js';
import { countApproval, countMajority, countRankedChoice } from './election/engine.js';
import { addHours } from '../utils/time.js';

export interface CreateElectionInput {
  guildId: string;
  title: string;
  description?: string;
  type: ElectionType;
  positionId?: string;
  seats?: number;
  isAnonymous?: boolean;
  quorumPercent?: number;
  eligibleRoleIds?: string[];
  startsAt?: Date;
  endsAt?: Date;
  createdBy: string;
}

export async function createElection(input: CreateElectionInput) {
  const title = input.title.trim();
  if (title.length < 3 || title.length > 120) throw userError('Election title must be 3–120 characters.');
  if (input.seats !== undefined && (input.seats < 1 || input.seats > 10)) throw userError('Seats must be 1–10.');
  if (input.quorumPercent !== undefined && (input.quorumPercent < 0 || input.quorumPercent > 100)) {
    throw userError('Quorum must be 0–100.');
  }
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    throw userError('Election end must be after start.');
  }
  if (input.positionId) {
    const pos = await prisma.leadershipPosition.findFirst({
      where: { id: input.positionId, guildId: input.guildId },
    });
    if (!pos) throw userError('This position no longer exists.');
  }
  const open = await prisma.election.count({
    where: { guildId: input.guildId, status: { in: ['DRAFT', 'SCHEDULED', 'NOMINATIONS', 'CAMPAIGNING', 'ACTIVE', 'COUNTING'] } },
  });
  if (open >= 25) throw userError('Too many open elections. Close some before creating more.');

  const status: ElectionStatus = input.startsAt && input.startsAt > new Date() ? 'SCHEDULED' : 'DRAFT';
  const election = await prisma.election.create({
    data: {
      guildId: input.guildId,
      title,
      description: input.description?.slice(0, 2000),
      type: input.type,
      positionId: input.positionId,
      seats: input.seats ?? 1,
      isAnonymous: input.isAnonymous ?? false,
      quorumPercent: input.quorumPercent ?? 20,
      eligibleRoleIds: input.eligibleRoleIds ?? [],
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdBy: input.createdBy,
      status,
    },
  });

  // Persistent scheduler tasks (survive restarts).
  if (input.startsAt) {
    await prisma.scheduledTask.create({
      data: { guildId: input.guildId, type: 'ELECTION_START', payload: { electionId: election.id, guildId: input.guildId }, runAt: input.startsAt },
    });
  }
  if (input.endsAt) {
    await prisma.scheduledTask.create({
      data: { guildId: input.guildId, type: 'ELECTION_END', payload: { electionId: election.id, guildId: input.guildId }, runAt: input.endsAt },
    });
  }

  await writeAudit({
    guildId: input.guildId,
    actorId: input.createdBy,
    action: AUDIT_ACTIONS.ELECTION_CREATE,
    entityType: 'Election',
    entityId: election.id,
    details: { title },
  });
  return election;
}

export async function addCandidate(guildId: string, electionId: string, userId: string, displayName: string, manifesto?: string) {
  const election = await prisma.election.findFirst({ where: { id: electionId, guildId } });
  if (!election) throw userError('Election not found.');
  if (!['DRAFT', 'SCHEDULED', 'NOMINATIONS'].includes(election.status)) {
    throw userError('Nominations are closed for this election.', 'INVALID_STATE');
  }
  const count = await prisma.electionCandidate.count({ where: { electionId } });
  if (count >= LIMITS.maxCandidatesPerElection) throw userError('Candidate limit reached for this election.');
  try {
    return await prisma.electionCandidate.create({
      data: { electionId, userId, displayName: displayName.slice(0, 80), manifesto: manifesto?.slice(0, 1000) },
    });
  } catch {
    throw userError('That candidate is already nominated.');
  }
}

export async function startElection(guildId: string, electionId: string, actorId: string) {
  const election = await prisma.election.findFirst({ where: { id: electionId, guildId } });
  if (!election) throw userError('Election not found.');
  if (election.status === 'ACTIVE') return election; // idempotent
  if (!['DRAFT', 'SCHEDULED', 'NOMINATIONS', 'CAMPAIGNING'].includes(election.status)) {
    throw userError('This election cannot be started from its current state.', 'INVALID_STATE');
  }
  const candidates = await prisma.electionCandidate.count({ where: { electionId } });
  if (candidates < 1) throw userError('Add at least one candidate before starting.');
  const updated = await prisma.election.update({
    where: { id: electionId },
    data: { status: 'ACTIVE', startsAt: election.startsAt ?? new Date() },
  });
  await writeAudit({ guildId, actorId, action: AUDIT_ACTIONS.ELECTION_START, entityType: 'Election', entityId: electionId });
  return updated;
}

/** Finalize an election atomically. Idempotent: second call returns current state. */
export async function finalizeElection(guildId: string, electionId: string, actorId: string) {
  // Bounded so one slow tx can't pin a pool connection (P2024). DB-only body.
  return prisma.$transaction(async (tx) => {
    const election = await tx.election.findFirst({ where: { id: electionId, guildId } });
    if (!election) throw userError('Election not found.');
    if (election.status === 'FINISHED' || election.status === 'QUORUM_NOT_REACHED' || election.status === 'CANCELLED') {
      return election; // already finalized — idempotent
    }
    await tx.election.update({ where: { id: electionId }, data: { status: 'COUNTING' } });

    const candidates = await tx.electionCandidate.findMany({ where: { electionId } });
    const candidateIds = candidates.map((c) => c.id);
    const votes = await tx.electionVote.findMany({ where: { electionId } });
    const receipts = await tx.electionVoterReceipt.count({ where: { electionId } });
    const turnout = Math.max(votes.length, receipts);

    // Eligible count: stored snapshot if present, else turnout (quorum passes trivially).
    const eligible = election.eligibleCount > 0 ? election.eligibleCount : turnout;

    let result;
    if (election.type === 'MAJORITY') {
      result = countMajority(candidateIds, votes.map((v) => v.candidateId ?? ''), election.seats, eligible, election.quorumPercent);
    } else if (election.type === 'APPROVAL') {
      result = countApproval(candidateIds, votes.map((v) => v.approvals), election.seats, eligible, election.quorumPercent);
    } else {
      result = countRankedChoice(
        candidateIds,
        votes.map((v) => ({ voterId: v.id, ranking: Array.isArray(v.rankings) ? (v.rankings as string[]) : [] })),
        election.seats,
        eligible,
        election.quorumPercent,
      );
    }
    // Override turnout with receipt-based turnout (anon-safe) and recompute quorum.
    result.turnout = turnout;
    result.quorumReached = eligible <= 0 ? true : (turnout / eligible) * 100 >= election.quorumPercent;

    const finalStatus = result.quorumReached ? 'FINISHED' : 'QUORUM_NOT_REACHED';

    const updated = await tx.election.update({
      where: { id: electionId },
      data: { status: finalStatus, winners: result as object, turnout },
    });

    // Create mandates for winners (if election is bound to a position).
    if (finalStatus === 'FINISHED' && election.positionId) {
      const winnerCandidates = candidates.filter((c) => (result.winners as string[]).includes(c.id));
      const position = await tx.leadershipPosition.findFirst({ where: { id: election.positionId } });
      for (const wc of winnerCandidates) {
        const existingActive = await tx.mandate.count({
          where: { positionId: election.positionId, userId: wc.userId, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } },
        });
        if (existingActive > 0) continue; // prevent duplicate mandates
        const termNumber =
          (await tx.mandate.count({ where: { positionId: election.positionId, userId: wc.userId } })) + 1;
        const probationDays = position?.probationDays ?? 0;
        const now = new Date();
        const endsAt = position ? new Date(now.getTime() + position.termLengthDays * 86_400_000) : addHours(now, 24 * 90);
        const probationEndsAt = probationDays > 0 ? new Date(now.getTime() + probationDays * 86_400_000) : null;
        const mandate = await tx.mandate.create({
          data: {
            guildId,
            positionId: election.positionId,
            userId: wc.userId,
            status: probationDays > 0 ? 'PROBATION' : 'ACTIVE',
            origin: 'ELECTION',
            termNumber,
            startsAt: now,
            endsAt,
            probationEndsAt,
            probationStatus: probationDays > 0 ? 'PENDING' : 'NONE',
            electionId: election.id,
          },
        });
        if (probationEndsAt) {
          await tx.scheduledTask.create({
            data: { guildId, type: 'PROBATION_END', payload: { mandateId: mandate.id, guildId }, runAt: probationEndsAt },
          });
        }
        await tx.scheduledTask.create({
          data: { guildId, type: 'MANDATE_EXPIRE', payload: { mandateId: mandate.id, guildId }, runAt: endsAt },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        guildId,
        actorId,
        action: finalStatus === 'FINISHED' ? AUDIT_ACTIONS.ELECTION_RESULT : AUDIT_ACTIONS.ELECTION_CLOSE,
        entityType: 'Election',
        entityId: electionId,
        // Never include per-voter choices.
        details: { winners: result.winners, turnout, quorumReached: result.quorumReached } as object,
      },
    });
    return updated;
  }, { maxWait: 5000, timeout: 15000 });
}

export async function cancelElection(guildId: string, electionId: string, actorId: string) {
  const election = await prisma.election.findFirst({ where: { id: electionId, guildId } });
  if (!election) throw userError('Election not found.');
  if (['FINISHED', 'CANCELLED', 'QUORUM_NOT_REACHED'].includes(election.status)) {
    throw userError('This election has already ended.', 'INVALID_STATE');
  }
  const updated = await prisma.election.update({ where: { id: electionId }, data: { status: 'CANCELLED' } });
  await writeAudit({ guildId, actorId, action: AUDIT_ACTIONS.ELECTION_CLOSE, entityType: 'Election', entityId: electionId, details: { cancelled: true } });
  return updated;
}

export async function listElections(guildId: string, status?: string) {
  return prisma.election.findMany({
    where: { guildId, ...(status ? { status: status as ElectionStatus } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 25,
    include: { candidates: true },
  });
}
