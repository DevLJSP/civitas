import { deferEphemeral, respond } from '../utils/respond.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { decideImpeachment, openImpeachment, voteImpeachment } from '../services/impeachmentService.js';
import { prisma } from '../database/prisma.js';
import { baseEmbed } from '../utils/embeds.js';
import { toUserMessage } from '../utils/errors.js';
import { buildCustomId } from '../utils/ids.js';

export const impeachmentCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('impeachment')
    .setDescription('Open or manage leader removal')
    .addSubcommand((s) =>
      s.setName('open').setDescription('Open a removal case')
        .addUserOption((o) => o.setName('target').setDescription('Leader').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true))
        .addStringOption((o) => o.setName('method').setDescription('Method').addChoices(
          { name: 'Admin decision', value: 'ADMIN' },
          { name: 'Community vote', value: 'COMMUNITY' },
          { name: 'Council vote', value: 'COUNCIL' },
        )),
    )
    .addSubcommand((s) => s.setName('list').setDescription('List open cases'))
    .addSubcommand((s) =>
      s.setName('decide').setDescription('Decide a case (admin)')
        .addStringOption((o) => o.setName('case').setDescription('Case id').setRequired(true))
        .addBooleanOption((o) => o.setName('remove').setDescription('Remove leader?').setRequired(true)),
    ),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'list') {
        await deferEphemeral(interaction);
        const cases = await prisma.impeachment.findMany({ where: { guildId, status: { in: ['OPEN', 'VOTING'] } }, orderBy: { createdAt: 'desc' }, take: 15 });
        const desc = cases.length === 0 ? 'No open removal cases.' : cases.map((c) => `<@${c.targetUserId}> · ${c.method} · 👍${c.votesYes} 👎${c.votesNo} · \`${c.id.slice(0, 8)}\``).join('\n');
        await respond(interaction, { embeds: [baseEmbed({ title: '⚖️ Removal cases', description: desc })], flags: MessageFlags.Ephemeral });
        return;
      }
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (sub === 'open') {
        const target = interaction.options.getUser('target', true);
        const reason = interaction.options.getString('reason', true);
        const method = (interaction.options.getString('method') ?? 'ADMIN') as 'ADMIN' | 'COUNCIL' | 'COMMUNITY';
        // Only ADMIN answers ephemerally; community/council votes post publicly.
        if (method === 'ADMIN') await deferEphemeral(interaction);
        const mandate = await prisma.mandate.findFirst({ where: { guildId, userId: target.id, status: { in: ['ACTIVE', 'PROBATION'] } } });
        const imp = await openImpeachment({
          guildId,
          targetUserId: target.id,
          positionId: mandate?.positionId,
          mandateId: mandate?.id,
          reason,
          method,
          openedBy: interaction.user.id,
          endsAt: method === 'ADMIN' ? undefined : new Date(Date.now() + 72 * 3_600_000),
        });
        const row = method === 'ADMIN'
          ? undefined
          : new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(buildCustomId('impeach', 'yes', imp.id)).setLabel('Remove').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(buildCustomId('impeach', 'no', imp.id)).setLabel('Keep').setStyle(ButtonStyle.Secondary),
          );
        await respond(interaction, {
          embeds: [baseEmbed({ title: '⚖️ Removal case opened', description: `<@${target.id}>\nReason: ${reason}\nMethod: ${method}\nID: \`${imp.id.slice(0, 8)}\`` })],
          components: row ? [row] : [],
          flags: method === 'ADMIN' ? MessageFlags.Ephemeral : undefined,
        });
        return;
      }
      const q = interaction.options.getString('case', true);
      const remove = interaction.options.getBoolean('remove', true);
      await deferEphemeral(interaction);
      const cases = await prisma.impeachment.findMany({ where: { guildId, status: { in: ['OPEN', 'VOTING'] } }, take: 50 });
      const match = cases.find((c) => c.id === q || c.id.startsWith(q));
      if (!match) {
        await respond(interaction, { content: 'Case not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      await decideImpeachment(guildId, match.id, interaction.user.id, remove);
      await respond(interaction, { content: remove ? '✅ Leader removed.' : '✅ Case closed — leader kept.', flags: MessageFlags.Ephemeral });
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};

export async function handleImpeachmentVote(guildId: string, impeachmentId: string, voterId: string, remove: boolean): Promise<string> {
  await voteImpeachment(guildId, impeachmentId, voterId, remove);
  return '✅ Vote recorded.';
}
