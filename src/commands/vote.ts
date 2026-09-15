import { deferEphemeral, respond } from '../utils/respond.js';
import { ActionRowBuilder, SlashCommandBuilder, StringSelectMenuBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { listElections } from '../services/electionService.js';
import { castVote } from '../services/votingService.js';
import { ensureGuild, ensureUser } from '../middleware/guild.js';
import { toUserMessage } from '../utils/errors.js';
import { voteRateOk } from '../middleware/rateLimit.js';
import { buildCustomId } from '../utils/ids.js';
import { baseEmbed } from '../utils/embeds.js';

export const voteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Vote in an active election')
    .addStringOption((o) => o.setName('election').setDescription('Election id').setRequired(true)),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    try {
      await ensureGuild(guildId, interaction.guild?.name ?? null);
      await ensureUser(interaction.user.id, interaction.user.username);
      if (!voteRateOk(guildId, interaction.user.id)) {
        await respond(interaction, { content: 'You are doing that too fast. Please wait.', flags: MessageFlags.Ephemeral });
        return;
      }
      const q = interaction.options.getString('election', true);
      const elections = await listElections(guildId, 'ACTIVE');
      const match = elections.find((e) => e.id === q || e.id.startsWith(q));
      if (!match) {
        await respond(interaction, { content: 'Active election not found. Check the id with `/election list`.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (match.candidates.length === 0) {
        await respond(interaction, { content: 'This election has no candidates yet.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (match.type === 'MAJORITY') {
        const menu = new StringSelectMenuBuilder()
          .setCustomId(buildCustomId('election', 'cast-majority', match.id))
          .setPlaceholder('Choose a candidate')
          .addOptions(match.candidates.slice(0, 25).map((c) => ({ label: c.displayName.slice(0, 100), value: c.id })));
        await respond(interaction, {
          embeds: [baseEmbed({ title: `🗳️ ${match.title}`, description: 'Select one candidate. Your vote is private.' })],
          components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (match.type === 'APPROVAL') {
        const menu = new StringSelectMenuBuilder()
          .setCustomId(buildCustomId('election', 'cast-approval', match.id))
          .setPlaceholder('Approve one or more candidates')
          .setMinValues(1)
          .setMaxValues(Math.min(match.candidates.length, 25))
          .addOptions(match.candidates.slice(0, 25).map((c) => ({ label: c.displayName.slice(0, 100), value: c.id })));
        await respond(interaction, {
          embeds: [baseEmbed({ title: `🗳️ ${match.title}`, description: 'Approve as many candidates as you like.' })],
          components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      // RANKED: single select for first choice simplified in-Discord; full ranking via repeated UI is out of scope.
      // We record a ballot with the full candidate order implied by the single pick first.
      const menu = new StringSelectMenuBuilder()
        .setCustomId(buildCustomId('election', 'cast-ranked', match.id))
        .setPlaceholder('Choose your top candidate')
        .addOptions(match.candidates.slice(0, 25).map((c) => ({ label: c.displayName.slice(0, 100), value: c.id })));
      await respond(interaction, {
        embeds: [baseEmbed({ title: `🗳️ ${match.title}`, description: 'Ranked choice: pick your top candidate (counts as first preference).' })],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};

export async function handleVoteSelect(guildId: string, electionId: string, voterId: string, kind: string, values: string[]): Promise<string> {
  if (kind === 'cast-majority') {
    await castVote({ guildId, electionId, voterId, candidateId: values[0] });
    return '✅ Your vote has been recorded.';
  }
  if (kind === 'cast-approval') {
    await castVote({ guildId, electionId, voterId, approvals: values });
    return '✅ Your approvals have been recorded.';
  }
  await castVote({ guildId, electionId, voterId, rankings: values });
  return '✅ Your ranked vote has been recorded.';
}
