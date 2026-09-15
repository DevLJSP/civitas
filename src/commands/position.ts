import { deferEphemeral, respond } from '../utils/respond.js';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { createPosition, deletePosition, getPosition, listPositions, updatePosition } from '../services/positionService.js';
import { ensureGuild, ensureUser } from '../middleware/guild.js';
import { baseEmbed } from '../utils/embeds.js';
import { toUserMessage } from '../utils/errors.js';
import { paginate } from '../utils/pagination.js';

export const positionCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('position')
    .setDescription('Manage leadership positions')
    .addSubcommand((s) =>
      s.setName('create').setDescription('Create a position')
        .addStringOption((o) => o.setName('name').setDescription('Position name').setRequired(true))
        .addStringOption((o) => o.setName('description').setDescription('Description'))
        .addRoleOption((o) => o.setName('role').setDescription('Discord role'))
        .addIntegerOption((o) => o.setName('seats').setDescription('Seats (1-50)').setMinValue(1).setMaxValue(50))
        .addIntegerOption((o) => o.setName('term_days').setDescription('Term length in days').setMinValue(1).setMaxValue(3650))
        .addStringOption((o) => o.setName('method').setDescription('Selection method').addChoices(
          { name: 'Election', value: 'ELECTION' },
          { name: 'Appointment', value: 'APPOINTMENT' },
          { name: 'Either', value: 'EITHER' },
        )),
    )
    .addSubcommand((s) => s.setName('list').setDescription('List positions').addIntegerOption((o) => o.setName('page').setDescription('Page').setMinValue(1)))
    .addSubcommand((s) => s.setName('view').setDescription('View a position').addStringOption((o) => o.setName('id').setDescription('Position id or name').setRequired(true)))
    .addSubcommand((s) =>
      s.setName('edit').setDescription('Edit a position')
        .addStringOption((o) => o.setName('id').setDescription('Position id').setRequired(true))
        .addStringOption((o) => o.setName('description').setDescription('New description'))
        .addIntegerOption((o) => o.setName('seats').setDescription('Seats').setMinValue(1).setMaxValue(50)),
    )
    .addSubcommand((s) => s.setName('delete').setDescription('Delete (deactivate) a position').addStringOption((o) => o.setName('id').setDescription('Position id').setRequired(true))),
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

      if (sub === 'create') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
          return;
        }
        const name = interaction.options.getString('name', true);
        const description = interaction.options.getString('description') ?? undefined;
        const roleId = interaction.options.getRole('role')?.id;
        const seats = interaction.options.getInteger('seats') ?? 1;
        const termDays = interaction.options.getInteger('term_days') ?? 90;
        const method = (interaction.options.getString('method') ?? 'EITHER') as 'ELECTION' | 'APPOINTMENT' | 'EITHER';
        const pos = await createPosition({ guildId, name, description, roleId, seats, termLengthDays: termDays, selectionMethod: method, createdBy: interaction.user.id });
        await respond(interaction, { content: `✅ Position **${pos.name}** created (\`${pos.id}\`).`, flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'list') {
        const page = interaction.options.getInteger('page') ?? 1;
        const all = await listPositions(guildId);
        const p = paginate(all, page, 10);
        const desc = p.items.length === 0 ? 'No positions yet. Use `/position create`.' : p.items.map((x) => `**${x.name}** — ${x.seats} seat(s) · \`${x.id}\``).join('\n');
        await respond(interaction, { embeds: [baseEmbed({ title: `🏛️ Positions (page ${p.page}/${p.totalPages})`, description: desc })], flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'view') {
        const q = interaction.options.getString('id', true);
        const all = await listPositions(guildId, true);
        const found = all.find((x) => x.id === q || x.name.toLowerCase() === q.toLowerCase());
        if (!found) {
          await respond(interaction, { content: 'This position no longer exists.', flags: MessageFlags.Ephemeral });
          return;
        }
        const pos = await getPosition(guildId, found.id);
        await respond(interaction, {
          embeds: [baseEmbed({ title: `🏛️ ${pos.name}`, description: `${pos.description ?? 'No description.'}\n\nSeats: ${pos.seats}\nTerm: ${pos.termLengthDays}d\nMethod: ${pos.selectionMethod}\nRole: ${pos.roleId ? `<@&${pos.roleId}>` : '—'}\nID: \`${pos.id}\`` })],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (sub === 'edit') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
          return;
        }
        const id = interaction.options.getString('id', true);
        const description = interaction.options.getString('description') ?? undefined;
        const seats = interaction.options.getInteger('seats') ?? undefined;
        const updated = await updatePosition(guildId, id, interaction.user.id, { ...(description !== undefined ? { description } : {}), ...(seats !== undefined ? { seats } : {}) });
        await respond(interaction, { content: `✅ **${updated.name}** updated.`, flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'delete') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
          return;
        }
        const id = interaction.options.getString('id', true);
        await deletePosition(guildId, id, interaction.user.id);
        await respond(interaction, { content: '✅ Position deactivated.', flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};
