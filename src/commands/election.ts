import { deferEphemeral, respond } from '../utils/respond.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { addCandidate, cancelElection, createElection, listElections, startElection, finalizeElection } from '../services/electionService.js';
import { getPublicResults } from '../services/votingService.js';
import { ensureGuild, ensureUser } from '../middleware/guild.js';
import { baseEmbed } from '../utils/embeds.js';
import { toUserMessage } from '../utils/errors.js';
import { formatDiscordTimestamp } from '../utils/time.js';
import { buildCustomId } from '../utils/ids.js';
import { getGuildConfig } from '../services/guildService.js';

function electionEmbed(e: { title: string; description: string | null; type: string; status: string; endsAt: Date | null; seats: number }, candidateNames: string[], turnout: number): ReturnType<typeof baseEmbed> {
  const desc = [
    e.description ?? 'Choose the next leader.',
    '',
    '**Candidates:**',
    candidateNames.length > 0 ? candidateNames.map((n) => `• ${n}`).join('\n') : '_No candidates yet_',
    '',
    `Voting closes: ${e.endsAt ? formatDiscordTimestamp(e.endsAt) : '—'}`,
    `Turnout: ${turnout}`,
  ].join('\n');
  return baseEmbed({ title: `🗳️ ${e.title}`, description: desc, footer: `${e.type} · ${e.status} · ${e.seats} seat(s)` });
}

export function voteRow(electionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId('election', 'vote', electionId)).setLabel('Vote').setStyle(ButtonStyle.Primary).setEmoji('🗳️'),
    new ButtonBuilder().setCustomId(buildCustomId('election', 'results', electionId)).setLabel('Results').setStyle(ButtonStyle.Secondary).setEmoji('📊'),
  );
}

export const electionCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('election')
    .setDescription('Run leadership elections')
    .addSubcommand((s) =>
      s.setName('create').setDescription('Create an election')
        .addStringOption((o) => o.setName('title').setDescription('Title').setRequired(true))
        .addStringOption((o) => o.setName('type').setDescription('Voting system').addChoices(
          { name: 'Majority', value: 'MAJORITY' },
          { name: 'Approval', value: 'APPROVAL' },
          { name: 'Ranked choice', value: 'RANKED' },
        ))
        .addStringOption((o) => o.setName('position').setDescription('Position id (optional)'))
        .addIntegerOption((o) => o.setName('seats').setDescription('Seats').setMinValue(1).setMaxValue(10))
        .addBooleanOption((o) => o.setName('anonymous').setDescription('Anonymous voting'))
        .addIntegerOption((o) => o.setName('duration_hours').setDescription('Duration in hours').setMinValue(1).setMaxValue(720)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('List elections'))
    .addSubcommand((s) => s.setName('nominate').setDescription('Add a candidate').addStringOption((o) => o.setName('election').setDescription('Election id').setRequired(true)).addUserOption((o) => o.setName('user').setDescription('Candidate').setRequired(true)).addStringOption((o) => o.setName('manifesto').setDescription('Manifesto')))
    .addSubcommand((s) => s.setName('start').setDescription('Open voting').addStringOption((o) => o.setName('election').setDescription('Election id').setRequired(true)))
    .addSubcommand((s) => s.setName('close').setDescription('Close and count').addStringOption((o) => o.setName('election').setDescription('Election id').setRequired(true)))
    .addSubcommand((s) => s.setName('results').setDescription('Show results').addStringOption((o) => o.setName('election').setDescription('Election id').setRequired(true)))
    .addSubcommand((s) => s.setName('cancel').setDescription('Cancel an election').addStringOption((o) => o.setName('election').setDescription('Election id').setRequired(true))),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    const sub = interaction.options.getSubcommand();
    try {
      await ensureGuild(guildId, interaction.guild?.name ?? null);
      await ensureUser(interaction.user.id, interaction.user.username);
      const isManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;

      if (sub === 'list') {
        const elections = await listElections(guildId);
        const desc = elections.length === 0 ? 'No elections yet.' : elections.slice(0, 10).map((e) => `**${e.title}** · ${e.type} · ${e.status} · \`${e.id.slice(0, 8)}\``).join('\n');
        await respond(interaction, { embeds: [baseEmbed({ title: '🗳️ Elections', description: desc })], flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'results') {
        const id = interaction.options.getString('election', true);
        const elections = await listElections(guildId);
        const match = elections.find((e) => e.id === id || e.id.startsWith(id));
        if (!match) {
          await respond(interaction, { content: 'Election not found.', flags: MessageFlags.Ephemeral });
          return;
        }
        const res = await getPublicResults(guildId, match.id);
        const winners = (res.election.winners as { winners?: string[] } | null);
        const winnerIds = Array.isArray((winners as unknown as { winners: string[] })?.winners)
          ? (winners as unknown as { winners: string[] }).winners
          : Array.isArray(res.election.winners) ? (res.election.winners as string[]) : [];
        const winnerNames = res.candidates.filter((c) => winnerIds.includes(c.id)).map((c) => c.displayName);
        const embed = electionEmbed(
          { title: match.title, description: match.description, type: match.type, status: match.status, endsAt: match.endsAt, seats: match.seats },
          res.candidates.map((c) => c.displayName),
          res.turnout,
        );
        if (winnerNames.length > 0) embed.addFields({ name: '🏆 Winner(s)', value: winnerNames.join(', ') });
        await respond(interaction, { embeds: [embed], flags: res.election.isAnonymous ? MessageFlags.Ephemeral : undefined });
        return;
      }

      if (!isManager) {
        await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'create') {
        const config = await getGuildConfig(guildId);
        const title = interaction.options.getString('title', true);
        const type = (interaction.options.getString('type') ?? 'MAJORITY') as 'MAJORITY' | 'APPROVAL' | 'RANKED';
        const positionId = interaction.options.getString('position') ?? undefined;
        const seats = interaction.options.getInteger('seats') ?? 1;
        const anonymous = interaction.options.getBoolean('anonymous') ?? false;
        const hours = interaction.options.getInteger('duration_hours') ?? 48;
        const now = new Date();
        const election = await createElection({
          guildId,
          title,
          type,
          positionId,
          seats,
          isAnonymous: anonymous,
          quorumPercent: config.defaultQuorumPercent,
          startsAt: now,
          endsAt: new Date(now.getTime() + hours * 3_600_000),
          createdBy: interaction.user.id,
        });
        await startElection(guildId, election.id, interaction.user.id);
        const embed = electionEmbed({ title: election.title, description: election.description, type: election.type, status: 'ACTIVE', endsAt: election.endsAt, seats: election.seats }, [], 0);
        const channelId = config.electionChannelId;
        if (channelId && interaction.guild) {
          try {
            const ch = await interaction.guild.channels.fetch(channelId);
            if (ch?.isTextBased() && 'send' in ch) {
              await (ch as { send: (o: never) => Promise<unknown> }).send({ embeds: [embed], components: [voteRow(election.id)] } as never);
            }
          } catch { /* posting is best-effort */ }
        }
        await respond(interaction, { content: `✅ Election created and opened (\`${election.id.slice(0, 8)}\`).`, flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'nominate') {
        const eid = interaction.options.getString('election', true);
        const user = interaction.options.getUser('user', true);
        const manifesto = interaction.options.getString('manifesto') ?? undefined;
        const elections = await listElections(guildId);
        const match = elections.find((e) => e.id === eid || e.id.startsWith(eid));
        if (!match) {
          await respond(interaction, { content: 'Election not found.', flags: MessageFlags.Ephemeral });
          return;
        }
        await addCandidate(guildId, match.id, user.id, user.username, manifesto);
        await respond(interaction, { content: `✅ ${user.username} nominated.`, flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'start') {
        const eid = interaction.options.getString('election', true);
        const elections = await listElections(guildId);
        const match = elections.find((e) => e.id === eid || e.id.startsWith(eid));
        if (!match) {
          await respond(interaction, { content: 'Election not found.', flags: MessageFlags.Ephemeral });
          return;
        }
        await startElection(guildId, match.id, interaction.user.id);
        await respond(interaction, { content: '✅ Voting is now open.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'close') {
        const eid = interaction.options.getString('election', true);
        const elections = await listElections(guildId);
        const match = elections.find((e) => e.id === eid || e.id.startsWith(eid));
        if (!match) {
          await respond(interaction, { content: 'Election not found.', flags: MessageFlags.Ephemeral });
          return;
        }
        const updated = await finalizeElection(guildId, match.id, interaction.user.id);
        await respond(interaction, { content: `✅ Election closed: **${updated.status}**. Use \`/election results\` to see winners.`, flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'cancel') {
        const eid = interaction.options.getString('election', true);
        const elections = await listElections(guildId);
        const match = elections.find((e) => e.id === eid || e.id.startsWith(eid));
        if (!match) {
          await respond(interaction, { content: 'Election not found.', flags: MessageFlags.Ephemeral });
          return;
        }
        await cancelElection(guildId, match.id, interaction.user.id);
        await respond(interaction, { content: '✅ Election cancelled.', flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};
