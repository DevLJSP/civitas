import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';

/**
 * Cast a vote with full security:
 * - election must be ACTIVE and within window
 * - one ballot per voter enforced by unique receipt (transaction)
 * - anonymous elections store NO voter link on the ballot row
 * - cross-guild voting impossible (guildId match enforced)
 */
export async function castVote(opts: {
  guildId: string;
  electionId: string;
  voterId: string;
  candidateId?: string;
  approvals?: string[];
  rankings?: string[];
}): Promise<{ ok: true; anonymous: boolean }> {
  const election = await prisma.election.findFirst({
    where: { id: opts.electionId, guildId: opts.guildId },
    include: { candidates: true },
  });
  if (!election) throw userError('Election not found.');
  if (election.guildId !== opts.guildId) throw userError('You cannot access data from another server.', 'CROSS_GUILD');
  if (election.status !== 'ACTIVE') {
    if (['FINISHED', 'CANCELLED', 'QUORUM_NOT_REACHED', 'COUNTING'].includes(election.status)) {
      throw userError('This election has already ended.', 'ELECTION_CLOSED');
    }
    throw userError('This election is not open for voting yet.', 'NOT_OPEN');
  }
  const now = new Date();
  if (election.startsAt && now < election.startsAt) throw userError('Voting has not started yet.', 'NOT_OPEN');
  if (election.endsAt && now > election.endsAt) throw userError('This election has already ended.', 'ELECTION_CLOSED');

  const validIds = new Set(election.candidates.map((c) => c.id));

  if (election.type === 'MAJORITY') {
    if (!opts.candidateId || !validIds.has(opts.candidateId)) throw userError('Invalid candidate selection.');
  } else if (election.type === 'APPROVAL') {
    const approvals = opts.approvals ?? [];
    if (approvals.length === 0) throw userError('Select at least one candidate.');
    for (const a of approvals) if (!validIds.has(a)) throw userError('Invalid candidate selection.');
  } else {
    const rankings = opts.rankings ?? [];
    if (rankings.length === 0) throw userError('Rank at least one candidate.');
    const seen = new Set<string>();
    for (const r of rankings) {
      if (!validIds.has(r)) throw userError('Invalid candidate selection.');
      if (seen.has(r)) throw userError('Duplicate candidate in ranking.');
      seen.add(r);
    }
  }

  // Voter eligibility: when eligibleRoleIds is set, the command layer checks Discord
  // roles before calling here; eligibleCount snapshot is used for quorum.

  try {
    // Bounded so one slow tx can't pin a pool connection (P2024). DB-only body.
    await prisma.$transaction(async (tx) => {
      // Receipt first: unique constraint guarantees single ballot even under concurrency.
      await tx.electionVoterReceipt.create({
        data: { electionId: election.id, voterId: opts.voterId },
      });
      if (election.isAnonymous) {
        await tx.electionVote.create({
          data: {
            guildId: opts.guildId,
            electionId: election.id,
            voterId: null,
            candidateId: election.type === 'MAJORITY' ? opts.candidateId : null,
            approvals: election.type === 'APPROVAL' ? (opts.approvals ?? []) : [],
            rankings: election.type === 'RANKED' ? (opts.rankings ?? []) : undefined,
          },
        });
      } else {
        await tx.electionVote.create({
          data: {
            guildId: opts.guildId,
            electionId: election.id,
            voterId: opts.voterId,
            candidateId: election.type === 'MAJORITY' ? opts.candidateId : null,
            approvals: election.type === 'APPROVAL' ? (opts.approvals ?? []) : [],
            rankings: election.type === 'RANKED' ? (opts.rankings ?? []) : undefined,
          },
        });
      }
    }, { maxWait: 3000, timeout: 10000 });
  } catch (e) {
    if (e instanceof Error && (/Unique constraint|P2002/i.test(e.message))) {
      throw userError('You have already voted.', 'DUPLICATE_VOTE');
    }
    throw e;
  }
  return { ok: true, anonymous: election.isAnonymous };
}

export async function hasVoted(electionId: string, voterId: string): Promise<boolean> {
  const r = await prisma.electionVoterReceipt.findUnique({
    where: { electionId_voterId: { electionId, voterId } },
  });
  return r !== null;
}

/** Public results. For anonymous elections, never returns voter-linked rows. */
export async function getPublicResults(guildId: string, electionId: string) {
  const election = await prisma.election.findFirst({
    where: { id: electionId, guildId },
    include: { candidates: true },
  });
  if (!election) throw userError('Election not found.');
  const receipts = await prisma.electionVoterReceipt.count({ where: { electionId } });
  return {
    election: {
      id: election.id,
      title: election.title,
      type: election.type,
      status: election.status,
      seats: election.seats,
      winners: election.winners,
      turnout: Math.max(election.turnout, receipts),
      isAnonymous: election.isAnonymous,
    },
    candidates: election.candidates.map((c) => ({ id: c.id, displayName: c.displayName, userId: c.userId })),
    turnout: Math.max(election.turnout, receipts),
  };
}
