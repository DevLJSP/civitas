import { deferEphemeral, respond } from '../utils/respond.js';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { listVacancies, resolveVacancy, triggerSuccession, upsertSuccessionPlan } from '../services/successionService.js';
import type { SuccessionStep } from '../types/index.js';
import { baseEmbed } from '../utils/embeds.js';
import { toUserMessage } from '../utils/errors.js';

export const successionCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('succession')
    .setDescription('Manage succession plans')
    .addSubcommand((s) =>
      s.setName('set').setDescription('Set succession fallback for a position')
        .addStringOption((o) => o.setName('position').setDescription('Position id').setRequired(true))
        .addStringOption((o) => o.setName('fallback').setDescription('Fallback action').setRequired(true).addChoices(
          { name: 'Appoint successor', value: 'APPOINT_SUCCESSOR' },
          { name: 'Open applications', value: 'OPEN_APPLICATIONS' },
          { name: 'Start election', value: 'START_ELECTION' },
          { name: 'Create vacancy', value: 'CREATE_VACANCY' },
        ))
        .addUserOption((o) => o.setName('successor').setDescription('Successor user (for appoint)')),
    )
    .addSubcommand((s) =>
      s.setName('trigger').setDescription('Trigger succession manually')
        .addStringOption((o) => o.setName('position').setDescription('Position id').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true)),
    ),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
      return;
    }
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'set') {
        const positionId = interaction.options.getString('position', true);
        const fallback = interaction.options.getString('fallback', true) as SuccessionStep['action'];
        const successor = interaction.options.getUser('successor')?.id;
        const steps: SuccessionStep[] = [{ order: 1, action: fallback, successorUserId: successor }];
        await upsertSuccessionPlan({ guildId, positionId, steps, fallbackAction: fallback, actorId: interaction.user.id });
        await respond(interaction, { content: '✅ Succession plan saved.', flags: MessageFlags.Ephemeral });
        return;
      }
      const positionId = interaction.options.getString('position', true);
      const reason = interaction.options.getString('reason', true);
      const vacancy = await triggerSuccession({ guildId, positionId, reason, actorId: interaction.user.id });
      await respond(interaction, { content: `⚠️ Succession triggered → vacancy \`${vacancy.id.slice(0, 8)}\` (${vacancy.successionAction}).`, flags: MessageFlags.Ephemeral });
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};

export const vacancyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('vacancy')
    .setDescription('View and resolve vacancies')
    .addSubcommand((s) => s.setName('list').setDescription('List open vacancies'))
    .addSubcommand((s) => s.setName('resolve').setDescription('Mark a vacancy as filled').addStringOption((o) => o.setName('vacancy').setDescription('Vacancy id').setRequired(true))),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'list') {
        const vacancies = await listVacancies(guildId, true);
        const desc = vacancies.length === 0
          ? 'No open vacancies. 🎉'
          : vacancies.slice(0, 15).map((v) => `⚠️ **${v.position.name}** · ${v.reason ?? 'Vacant'} · \`${v.id.slice(0, 8)}\``).join('\n');
        await respond(interaction, { embeds: [baseEmbed({ title: 'Vacancies', description: desc })], flags: MessageFlags.Ephemeral });
        return;
      }
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
        return;
      }
      const q = interaction.options.getString('vacancy', true);
      const vacancies = await listVacancies(guildId, false);
      const match = vacancies.find((v) => v.id === q || v.id.startsWith(q));
      if (!match) {
        await respond(interaction, { content: 'Vacancy not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      await resolveVacancy(guildId, match.id, interaction.user.id, 'FILLED');
      await respond(interaction, { content: '✅ Vacancy marked as filled.', flags: MessageFlags.Ephemeral });
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};
