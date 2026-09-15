import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';
import { writeAudit } from './auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';

export async function createProposal(opts: {
  guildId: string;
  title: string;
  description?: string;
  options?: string[];
  isAnonymous?: boolean;
  quorumPercent?: number;
  endsAt?: Date;
  createdBy: string;
}) {
  const title = opts.title.trim();
  if (title.length < 3 || title.length > 150) throw userError('Proposal title must be 3–150 characters.');
  const options = (opts.options ?? ['YES', 'NO']).map((o) => o.trim().toUpperCase()).filter(Boolean);
  if (options.length < 2 || options.length > 10) throw userError('Proposals need 2–10 options.');
  const proposal = await prisma.proposal.create({
    data: {
      guildId: opts.guildId,
      title,
      description: opts.description?.slice(0, 2000),
      type: 'MAJORITY',
      status: 'ACTIVE',
      isAnonymous: opts.isAnonymous ?? false,
      quorumPercent: opts.quorumPercent ?? 20,
      options,
      startsAt: new Date(),
      endsAt: opts.endsAt,
      createdBy: opts.createdBy,
    },
  });
  if (opts.endsAt) {
    await prisma.scheduledTask.create({
      data: { guildId: opts.guildId, type: 'PROPOSAL_END', payload: { proposalId: proposal.id, guildId: opts.guildId }, runAt: opts.endsAt },
    });
  }
  await writeAudit({ guildId: opts.guildId, actorId: opts.createdBy, action: AUDIT_ACTIONS.PROPOSAL_CREATE, entityType: 'Proposal', entityId: proposal.id, details: { title } });
  return proposal;
}

export async function voteOnProposal(guildId: string, proposalId: string, voterId: string, option: string) {
  const proposal = await prisma.proposal.findFirst({ where: { id: proposalId, guildId } });
  if (!proposal) throw userError('Proposal not found.');
  if (proposal.status !== 'ACTIVE') throw userError('This proposal is no longer open.', 'INVALID_STATE');
  if (proposal.endsAt && new Date() > proposal.endsAt) throw userError('This proposal has already ended.');
  const opt = option.trim().toUpperCase();
  if (!proposal.options.includes(opt)) throw userError('Invalid option.');
  try {
    await prisma.$transaction(async (tx) => {
      await tx.proposalVoterReceipt.create({ data: { proposalId, voterId } });
      await tx.proposalVote.create({
        data: { guildId, proposalId, voterId: proposal.isAnonymous ? null : voterId, option: opt },
      });
    });
  } catch (e) {
    if (e instanceof Error && /P2002|Unique/i.test(e.message)) throw userError('You have already voted.');
    throw e;
  }
}

export async function closeProposal(guildId: string, proposalId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findFirst({ where: { id: proposalId, guildId } });
    if (!proposal) throw userError('Proposal not found.');
    if (proposal.status !== 'ACTIVE') return proposal; // idempotent
    const votes = await tx.proposalVote.findMany({ where: { proposalId } });
    const receipts = await tx.proposalVoterReceipt.count({ where: { proposalId } });
    const turnout = Math.max(votes.length, receipts);
    const counts: Record<string, number> = {};
    for (const o of proposal.options) counts[o] = 0;
    for (const v of votes) counts[v.option] = (counts[v.option] ?? 0) + 1;
    const sorted = [...proposal.options].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || a.localeCompare(b));
    const updated = await tx.proposal.update({
      where: { id: proposalId },
      data: { status: 'CLOSED', result: { counts, winner: sorted[0], turnout } as object },
    });
    await tx.auditLog.create({
      data: { guildId, actorId, action: AUDIT_ACTIONS.PROPOSAL_CLOSE, entityType: 'Proposal', entityId: proposalId, details: { counts, turnout } as object },
    });
    return updated;
  });
}

export async function listProposals(guildId: string, status?: string) {
  return prisma.proposal.findMany({
    where: { guildId, ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
}
