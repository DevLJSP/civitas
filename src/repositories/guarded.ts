import { prisma } from '../database/prisma.js';
import { assertSameGuild } from '../middleware/guild.js';

// Guild-scoped data access. Every read validates ownership so cross-guild
// access is impossible through normal application logic.

export async function getElectionInGuild(guildId: string, electionId: string) {
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) return null;
  assertSameGuild(election.guildId, guildId);
  return election;
}

export async function getPositionInGuild(guildId: string, positionId: string) {
  const position = await prisma.leadershipPosition.findUnique({ where: { id: positionId } });
  if (!position) return null;
  assertSameGuild(position.guildId, guildId);
  return position;
}

export async function getMandateInGuild(guildId: string, mandateId: string) {
  const mandate = await prisma.mandate.findUnique({ where: { id: mandateId } });
  if (!mandate) return null;
  assertSameGuild(mandate.guildId, guildId);
  return mandate;
}

export async function getProposalInGuild(guildId: string, proposalId: string) {
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) return null;
  assertSameGuild(proposal.guildId, guildId);
  return proposal;
}

export async function getVacancyInGuild(guildId: string, vacancyId: string) {
  const vacancy = await prisma.vacancy.findUnique({ where: { id: vacancyId } });
  if (!vacancy) return null;
  assertSameGuild(vacancy.guildId, guildId);
  return vacancy;
}
