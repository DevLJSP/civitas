import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { PERMISSION_LEVELS, type PermissionLevel } from '../config/constants.js';
import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';

export function levelName(level: PermissionLevel): string {
  for (const [k, v] of Object.entries(PERMISSION_LEVELS)) if (v === level) return k;
  return 'MEMBER';
}

/** Resolve a member's Civitas permission level. Never trusts client input. */
export async function resolvePermissionLevel(opts: {
  guildId: string;
  userId: string;
  isOwner: boolean;
  discordMember: GuildMember | null;
}): Promise<PermissionLevel> {
  if (opts.isOwner) return PERMISSION_LEVELS.OWNER;
  const m = opts.discordMember;
  if (m && m.permissions.has(PermissionFlagsBits.Administrator)) return PERMISSION_LEVELS.ADMIN;

  const config = await prisma.guildConfig.findUnique({ where: { guildId: opts.guildId } });
  const roleIds: string[] = m ? [...m.roles.cache.keys()] : [];

  if (config && roleIds.some((r) => config.managerRoleIds.includes(r))) {
    return PERMISSION_LEVELS.LEADERSHIP_MANAGER;
  }

  // Team leaders / moderators are detected via Discord roles holding position leadership.
  // Conservative default: MEMBER unless Discord ManageGuild.
  if (m && m.permissions.has(PermissionFlagsBits.ManageGuild)) return PERMISSION_LEVELS.ADMIN;
  if (m && (m.permissions.has(PermissionFlagsBits.ManageMessages) || m.permissions.has(PermissionFlagsBits.KickMembers))) {
    return PERMISSION_LEVELS.MODERATOR;
  }
  return PERMISSION_LEVELS.MEMBER;
}

export function requireLevel(actual: PermissionLevel, minimum: PermissionLevel): void {
  if (actual < minimum) {
    throw userError('You do not have permission to do that.', 'FORBIDDEN');
  }
}

/** Pure helper (unit-testable): does a level satisfy a minimum? */
export function hasLevel(actual: PermissionLevel, minimum: PermissionLevel): boolean {
  return actual >= minimum;
}
