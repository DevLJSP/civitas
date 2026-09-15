import { deferEphemeral, respond } from '../utils/respond.js';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { decideDemotion, decidePromotion, requestDemotion, requestPromotion } from '../services/promotionService.js';
import { toUserMessage } from '../utils/errors.js';

export const promoteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a member to a leadership position')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('to').setDescription('Target position id').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    try {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
        return;
      }
      const user = interaction.options.getUser('user', true);
      const to = interaction.options.getString('to', true);
      const reason = interaction.options.getString('reason') ?? undefined;
      const promo = await requestPromotion({ guildId, userId: user.id, toPositionId: to, requestedBy: interaction.user.id, reason });
      // Auto-approve when invoked by a manager (structured flow preserved in audit).
      await decidePromotion(guildId, promo.id, interaction.user.id, true);
      await respond(interaction, { content: `✅ <@${user.id}> promoted.`, flags: MessageFlags.Ephemeral });
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};

export const demoteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Demote a leader')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('from').setDescription('Position id they hold').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    try {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
        return;
      }
      const user = interaction.options.getUser('user', true);
      const from = interaction.options.getString('from', true);
      const reason = interaction.options.getString('reason') ?? undefined;
      const d = await requestDemotion({ guildId, userId: user.id, fromPositionId: from, requestedBy: interaction.user.id, reason });
      await decideDemotion(guildId, d.id, interaction.user.id, true);
      await respond(interaction, { content: `✅ <@${user.id}> demoted.`, flags: MessageFlags.Ephemeral });
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};
