import type { Client } from 'discord.js';
import { Events } from 'discord.js';
import { prisma } from '../database/prisma.js';
import { ensureGuild } from '../middleware/guild.js';
import { logger } from '../utils/logger.js';
import { triggerSuccession } from '../services/successionService.js';

export function registerGuildEvents(client: Client): void {
  client.on(Events.GuildCreate, async (guild) => {
    try {
      await ensureGuild(guild.id, guild.name);
      logger.info(`Joined guild ${guild.id} (${guild.name})`);
    } catch (err) {
      logger.error('GuildCreate failed', err);
    }
  });

  client.on(Events.GuildDelete, async (guild) => {
    try {
      await prisma.guild.update({ where: { id: guild.id }, data: { leftAt: new Date() } });
    } catch {
      // guild may never have been registered; ignore
    }
  });

  // If a leader leaves or is banned, trigger succession for their active mandates.
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      const guildId = member.guild.id;
      const userId = member.id;
      const mandates = await prisma.mandate.findMany({
        where: { guildId, userId, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } },
      });
      for (const m of mandates) {
        await prisma.mandate.update({ where: { id: m.id }, data: { status: 'REMOVED' } });
        await prisma.auditLog.create({
          data: { guildId, action: 'mandate.end', entityType: 'Mandate', entityId: m.id, details: { status: 'REMOVED', reason: 'member left' } as object },
        });
        try {
          await triggerSuccession({ guildId, positionId: m.positionId, reason: 'Leader left the server', actorId: member.client.user?.id ?? 'system' });
        } catch (err) {
          logger.warn('Succession trigger on leave failed', err);
        }
      }
    } catch (err) {
      logger.error('GuildMemberRemove failed', err);
    }
  });
}
