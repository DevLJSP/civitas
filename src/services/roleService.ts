import type { Guild, GuildMember, Role } from 'discord.js';
import { PermissionsBitField } from 'discord.js';
import { logger } from '../utils/logger.js';
import { writeAudit } from './auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';

export interface RoleSyncResult {
  ok: boolean;
  reason?: string;
}

/** Verify the bot can manage a role before touching it. Fails safely. */
export function canManageRole(guild: Guild, role: Role): { ok: boolean; reason?: string } {
  const me = guild.members.me;
  if (!me) return { ok: false, reason: 'Bot member not cached' };
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: 'Missing Manage Roles permission' };
  }
  if (role.managed) return { ok: false, reason: 'Role is managed by an integration' };
  if (guild.ownerId !== me.id && role.position >= me.roles.highest.position) {
    return { ok: false, reason: 'Role is above the bot in the hierarchy' };
  }
  if (role.id === guild.roles.everyone.id) return { ok: false, reason: 'Cannot assign @everyone' };
  return { ok: true };
}

export async function safeAddRole(opts: {
  guild: Guild;
  member: GuildMember;
  roleId: string;
  guildId: string;
  context: string;
}): Promise<RoleSyncResult> {
  try {
    const role = await opts.guild.roles.fetch(opts.roleId);
    if (!role) return { ok: false, reason: 'Role not found' };
    const check = canManageRole(opts.guild, role);
    if (!check.ok) {
      await writeAudit({
        guildId: opts.guildId,
        action: AUDIT_ACTIONS.ROLE_SYNC_FAIL,
        entityType: 'Role',
        entityId: opts.roleId,
        details: { op: 'add', userId: opts.member.id, reason: check.reason, context: opts.context },
      });
      logger.warn(`Role add blocked (${opts.context}): ${check.reason}`);
      return { ok: false, reason: check.reason };
    }
    if (opts.member.roles.cache.has(role.id)) return { ok: true };
    await opts.member.roles.add(role, `Civitas: ${opts.context}`);
    return { ok: true };
  } catch (err) {
    logger.error('safeAddRole failed', err);
    return { ok: false, reason: 'Discord API error' };
  }
}

export async function safeRemoveRole(opts: {
  guild: Guild;
  member: GuildMember;
  roleId: string;
  guildId: string;
  context: string;
}): Promise<RoleSyncResult> {
  try {
    const role = await opts.guild.roles.fetch(opts.roleId);
    if (!role) return { ok: true }; // already gone
    const check = canManageRole(opts.guild, role);
    if (!check.ok) {
      await writeAudit({
        guildId: opts.guildId,
        action: AUDIT_ACTIONS.ROLE_SYNC_FAIL,
        entityType: 'Role',
        entityId: opts.roleId,
        details: { op: 'remove', userId: opts.member.id, reason: check.reason, context: opts.context },
      });
      logger.warn(`Role remove blocked (${opts.context}): ${check.reason}`);
      return { ok: false, reason: check.reason };
    }
    if (!opts.member.roles.cache.has(role.id)) return { ok: true };
    await opts.member.roles.remove(role, `Civitas: ${opts.context}`);
    return { ok: true };
  } catch (err) {
    logger.error('safeRemoveRole failed', err);
    return { ok: false, reason: 'Discord API error' };
  }
}
