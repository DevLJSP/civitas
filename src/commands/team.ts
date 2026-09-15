import { deferEphemeral, respond } from '../utils/respond.js';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { addTeamMember, createTeam, listTeams, removeTeamMember } from '../services/teamService.js';
import { ensureGuild } from '../middleware/guild.js';
import { baseEmbed } from '../utils/embeds.js';
import { toUserMessage } from '../utils/errors.js';

export const teamCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Manage leadership teams')
    .addSubcommand((s) => s.setName('create').setDescription('Create a team').addStringOption((o) => o.setName('name').setDescription('Name').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List teams'))
    .addSubcommand((s) =>
      s.setName('add').setDescription('Add a member (team leader can add to own team)')
        .addStringOption((o) => o.setName('team').setDescription('Team id').setRequired(true))
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('remove').setDescription('Remove a member')
        .addStringOption((o) => o.setName('team').setDescription('Team id').setRequired(true))
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
    ),
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
      if (sub === 'list') {
        const teams = await listTeams(guildId);
        const desc = teams.length === 0 ? 'No teams yet.' : teams.slice(0, 15).map((t) => `**${t.name}** · ${t.members.length} member(s) · \`${t.id.slice(0, 8)}\``).join('\n');
        await respond(interaction, { embeds: [baseEmbed({ title: '👥 Teams', description: desc })], flags: MessageFlags.Ephemeral });
        return;
      }
      if (sub === 'create') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
          return;
        }
        const name = interaction.options.getString('name', true);
        const team = await createTeam(guildId, name, interaction.user.id);
        await respond(interaction, { content: `✅ Team **${team.name}** created (\`${team.id.slice(0, 8)}\`).`, flags: MessageFlags.Ephemeral });
        return;
      }
      const teamId = interaction.options.getString('team', true);
      const user = interaction.options.getUser('user', true);
      const teams = await listTeams(guildId);
      const match = teams.find((t) => t.id === teamId || t.id.startsWith(teamId));
      if (!match) {
        await respond(interaction, { content: 'Team not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      const isPrivileged = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
      if (sub === 'add') {
        await addTeamMember({ guildId, teamId: match.id, userId: user.id, addedBy: interaction.user.id, addedByIsPrivileged: isPrivileged, addedByUserId: interaction.user.id });
        await respond(interaction, { content: `✅ <@${user.id}> added to **${match.name}**.`, flags: MessageFlags.Ephemeral });
      } else {
        await removeTeamMember(guildId, match.id, user.id, interaction.user.id, isPrivileged);
        await respond(interaction, { content: `✅ <@${user.id}> removed from **${match.name}**.`, flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};
