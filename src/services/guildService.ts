import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';

export interface GuildSetupInput {
  applicationsChannelId?: string;
  electionChannelId?: string;
  announcementChannelId?: string;
  auditChannelId?: string;
  managerRoleIds?: string[];
  voterRoleIds?: string[];
  defaultMandateDays?: number;
  defaultProbationDays?: number;
  defaultQuorumPercent?: number;
  timezone?: string;
}

export async function getGuildConfig(guildId: string) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) {
    return prisma.guildConfig.create({ data: { guildId } });
  }
  return config;
}

export async function updateGuildConfig(guildId: string, input: GuildSetupInput) {
  if (input.defaultQuorumPercent !== undefined && (input.defaultQuorumPercent < 0 || input.defaultQuorumPercent > 100)) {
    throw userError('Quorum must be between 0 and 100.');
  }
  if (input.defaultMandateDays !== undefined && (input.defaultMandateDays < 1 || input.defaultMandateDays > 3650)) {
    throw userError('Mandate duration must be between 1 and 3650 days.');
  }
  return prisma.guildConfig.upsert({
    where: { guildId },
    update: { ...input },
    create: { guildId, ...input },
  });
}
