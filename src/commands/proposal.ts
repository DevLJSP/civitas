import { deferEphemeral, respond } from '../utils/respond.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { closeProposal, createProposal, listProposals, voteOnProposal } from '../services/proposalService.js';
import { ensureGuild, ensureUser } from '../middleware/guild.js';
import { baseEmbed } from '../utils/embeds.js';
import { toUserMessage } from '../utils/errors.js';
import { buildCustomId } from '../utils/ids.js';

export const proposalCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('proposal')
    .setDescription('Community proposals')
    .addSubcommand((s) =>
      s.setName('create').setDescription('Create a proposal')
        .addStringOption((o) => o.setName('title').setDescription('Title').setRequired(true))
        .addStringOption((o) => o.setName('description').setDescription('Details'))
        .addBooleanOption((o) => o.setName('anonymous').setDescription('Anonymous voting'))
        .addIntegerOption((o) => o.setName('duration_hours').setDescription('Duration').setMinValue(1).setMaxValue(720)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('List proposals'))
    .addSubcommand((s) => s.setName('close').setDescription('Close a proposal').addStringOption((o) => o.setName('proposal').setDescription('Proposal id').setRequired(true))),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    const sub = interaction.options.getSubcommand();
    // 'create' answers with a public message → must not defer ephemerally.
    if (sub !== 'create') await deferEphemeral(interaction);
    try {
      await ensureGuild(guildId, interaction.guild?.name ?? null);
      await ensureUser(interaction.user.id, interaction.user.username);
      if (sub === 'list') {
        const proposals = await listProposals(guildId, 'ACTIVE');
        const desc = proposals.length === 0 ? 'No active proposals.' : proposals.slice(0, 10).map((p) => `**${p.title}** · \`${p.id.slice(0, 8)}\``).join('\n');
        await respond(interaction, { embeds: [baseEmbed({ title: '📜 Proposals', description: desc })], flags: MessageFlags.Ephemeral });
        return;
      }
      if (sub === 'create') {
        const title = interaction.options.getString('title', true);
        const description = interaction.options.getString('description') ?? undefined;
        const anonymous = interaction.options.getBoolean('anonymous') ?? false;
        const hours = interaction.options.getInteger('duration_hours') ?? 48;
        const proposal = await createProposal({
          guildId,
          title,
          description,
          isAnonymous: anonymous,
          endsAt: new Date(Date.now() + hours * 3_600_000),
          createdBy: interaction.user.id,
        });
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(buildCustomId('proposal', 'yes', proposal.id)).setLabel('YES').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(buildCustomId('proposal', 'no', proposal.id)).setLabel('NO').setStyle(ButtonStyle.Danger),
        );
        await respond(interaction, {
          embeds: [baseEmbed({ title: `📜 ${proposal.title}`, description: `${description ?? ''}\n\nVote YES / NO below.`.slice(0, 4000) })],
          components: [row],
        });
        return;
      }
      const q = interaction.options.getString('proposal', true);
      const proposals = await listProposals(guildId);
      const match = proposals.find((p) => p.id === q || p.id.startsWith(q));
      if (!match) {
        await respond(interaction, { content: 'Proposal not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      await closeProposal(guildId, match.id, interaction.user.id);
      await respond(interaction, { content: '✅ Proposal closed.', flags: MessageFlags.Ephemeral });
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};

export async function handleProposalButton(guildId: string, proposalId: string, voterId: string, option: string): Promise<string> {
  await voteOnProposal(guildId, proposalId, voterId, option);
  return `✅ Voted ${option}.`;
}
