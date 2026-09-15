import { deferEphemeral, respond } from '../utils/respond.js';
import { SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { prisma } from '../database/prisma.js';
import { listActiveMandates } from '../services/mandateService.js';
import { baseEmbed } from '../utils/embeds.js';
import { getRecentAudit } from '../services/auditService.js';

export const historyCommand: BotCommand = {
  data: new SlashCommandBuilder().setName('history').setDescription('Show leadership history'),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    const mandates = await prisma.mandate.findMany({ where: { guildId }, orderBy: { startsAt: 'desc' }, take: 15, include: { position: true } });
    const audit = await getRecentAudit(guildId, 10);
    const desc = mandates.length === 0
      ? 'No history yet.'
      : mandates.map((m) => `<@${m.userId}> · **${m.position.name}** · ${m.status} · ${m.origin}`).join('\n');
    const auditText = audit.map((a) => `• ${a.action} (${a.entityType})`).join('\n');
    const embed = baseEmbed({ title: '📚 Leadership history', description: `${desc}\n\n**Recent events**\n${auditText || '—'}` });
    await respond(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export const leadershipCommand: BotCommand = {
  data: new SlashCommandBuilder().setName('leadership').setDescription('Show current leaders'),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    const mandates = await listActiveMandates(guildId);
    const desc = mandates.length === 0 ? 'No current leaders.' : mandates.slice(0, 20).map((m) => `<@${m.userId}> · **${m.position.name}** · ${m.status}`).join('\n');
    await respond(interaction, { embeds: [baseEmbed({ title: '🏛️ Current leadership', description: desc })], flags: MessageFlags.Ephemeral });
  },
};

export const leaderboardCommand: BotCommand = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Leadership activity leaderboard'),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    const mandates = await prisma.mandate.findMany({ where: { guildId }, select: { userId: true } });
    const counts = new Map<string, number>();
    for (const m of mandates) counts.set(m.userId, (counts.get(m.userId) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const desc = top.length === 0 ? 'No data yet.' : top.map(([u, c], i) => `${i + 1}. <@${u}> — ${c} mandate(s)`).join('\n');
    await respond(interaction, { embeds: [baseEmbed({ title: '🏆 Leadership leaderboard', description: desc })], flags: MessageFlags.Ephemeral });
  },
};
