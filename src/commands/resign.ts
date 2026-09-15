import { deferEphemeral, respond } from '../utils/respond.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { prisma } from '../database/prisma.js';
import { resignMandate } from '../services/impeachmentService.js';
import { toUserMessage } from '../utils/errors.js';
import { buildCustomId } from '../utils/ids.js';
import { baseEmbed } from '../utils/embeds.js';

export const resignCommand: BotCommand = {
  data: new SlashCommandBuilder().setName('resign').setDescription('Resign from a leadership mandate'),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    try {
      const mandates = await prisma.mandate.findMany({
        where: { guildId, userId: interaction.user.id, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } },
        include: { position: true },
        take: 10,
      });
      if (mandates.length === 0) {
        await respond(interaction, { content: 'You hold no active mandates.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (mandates.length === 1) {
        const m = mandates[0];
        if (!m) throw new Error('Missing mandate');
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(buildCustomId('resign', 'confirm', m.id)).setLabel(`Confirm resign: ${m.position.name.slice(0, 40)}`).setStyle(ButtonStyle.Danger),
        );
        await respond(interaction, {
          embeds: [baseEmbed({ title: '👋 Confirm resignation', description: `You are about to resign as **${m.position.name}**. This cannot be undone.` })],
          components: [row],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const desc = mandates.map((m) => `**${m.position.name}** · \`${m.id.slice(0, 8)}\``).join('\n');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...mandates.slice(0, 5).map((m) => new ButtonBuilder().setCustomId(buildCustomId('resign', 'confirm', m.id)).setLabel(m.position.name.slice(0, 80)).setStyle(ButtonStyle.Danger)),
      );
      await respond(interaction, { embeds: [baseEmbed({ title: '👋 Choose mandate to resign', description: desc })], components: [row], flags: MessageFlags.Ephemeral });
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};

export async function confirmResignation(guildId: string, userId: string, mandateId: string): Promise<string> {
  const mandates = await prisma.mandate.findMany({ where: { guildId, userId, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } } });
  const match = mandates.find((m) => m.id === mandateId);
  if (!match) throw new Error('Mandate not found or already ended.');
  await resignMandate(guildId, userId, match.id);
  return '✅ Resignation recorded. Thank you for your service.';
}
