import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';
import { writeAudit } from './auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';

export async function createTeam(guildId: string, name: string, createdBy: string, description?: string) {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 60) throw userError('Team name must be 2–60 characters.');
  try {
    const team = await prisma.leadershipTeam.create({
      data: { guildId, name: clean, description: description?.slice(0, 500), createdBy },
    });
    await writeAudit({ guildId, actorId: createdBy, action: AUDIT_ACTIONS.TEAM_UPDATE, entityType: 'Team', entityId: team.id, details: { op: 'create', name: clean } });
    return team;
  } catch {
    throw userError('A team with that name already exists.');
  }
}

export async function getTeam(guildId: string, teamId: string) {
  const team = await prisma.leadershipTeam.findFirst({ where: { id: teamId, guildId }, include: { members: true } });
  if (!team) throw userError('Team not found.');
  return team;
}

export async function listTeams(guildId: string) {
  return prisma.leadershipTeam.findMany({ where: { guildId }, orderBy: { name: 'asc' }, take: 50, include: { members: true } });
}

/**
 * Controlled delegation: a team leader may only modify their own team.
 * Admins/managers may modify any team. Enforced here (server-side), not in UI.
 */
export async function addTeamMember(opts: {
  guildId: string;
  teamId: string;
  userId: string;
  addedBy: string;
  addedByIsPrivileged: boolean;
  addedByUserId: string;
}) {
  const team = await prisma.leadershipTeam.findFirst({ where: { id: opts.teamId, guildId: opts.guildId } });
  if (!team) throw userError('Team not found.');
  if (!opts.addedByIsPrivileged && team.leaderUserId !== opts.addedByUserId) {
    throw userError('You do not have permission to do that.', 'FORBIDDEN');
  }
  try {
    return await prisma.teamMember.create({
      data: { teamId: team.id, userId: opts.userId, addedBy: opts.addedBy },
    });
  } catch {
    throw userError('That user is already in this team.');
  }
}

export async function removeTeamMember(guildId: string, teamId: string, userId: string, removerUserId: string, removerIsPrivileged: boolean) {
  const team = await prisma.leadershipTeam.findFirst({ where: { id: teamId, guildId } });
  if (!team) throw userError('Team not found.');
  if (!removerIsPrivileged && team.leaderUserId !== removerUserId) {
    throw userError('You do not have permission to do that.', 'FORBIDDEN');
  }
  await prisma.teamMember.deleteMany({ where: { teamId: team.id, userId } });
  await writeAudit({ guildId, actorId: removerUserId, action: AUDIT_ACTIONS.TEAM_UPDATE, entityType: 'Team', entityId: team.id, details: { op: 'remove', userId } });
}
