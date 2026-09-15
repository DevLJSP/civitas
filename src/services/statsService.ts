import { prisma } from '../database/prisma.js';

export async function getGuildStats(guildId: string) {
  const [
    activeMandates,
    activePositions,
    electionsFinished,
    elections,
    applications,
    promotions,
    openVacancies,
  ] = await Promise.all([
    prisma.mandate.count({ where: { guildId, status: { in: ['ACTIVE', 'PROBATION'] } } }),
    prisma.leadershipPosition.count({ where: { guildId, isActive: true } }),
    prisma.election.count({ where: { guildId, status: 'FINISHED' } }),
    prisma.election.findMany({ where: { guildId, status: { in: ['FINISHED', 'QUORUM_NOT_REACHED'] } }, select: { turnout: true, eligibleCount: true } }),
    prisma.leadershipApplication.count({ where: { guildId } }),
    prisma.promotion.count({ where: { guildId, status: 'COMPLETED' } }),
    prisma.vacancy.count({ where: { guildId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
  ]);

  const totalTurnout = elections.reduce((s, e) => s + (e.turnout ?? 0), 0);
  const totalEligible = elections.reduce((s, e) => s + (e.eligibleCount ?? 0), 0);
  const avgTurnout = elections.length > 0 ? totalTurnout / elections.length : 0;
  const turnoutRate = totalEligible > 0 ? (totalTurnout / totalEligible) * 100 : 0;

  return {
    activeLeaders: activeMandates,
    activePositions,
    electionsCompleted: electionsFinished,
    turnoutTotal: totalTurnout,
    averageTurnout: Math.round(avgTurnout * 10) / 10,
    turnoutRate: Math.round(turnoutRate * 10) / 10,
    applications,
    promotions,
    openVacancies,
  };
}
