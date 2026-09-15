import { deferEphemeral, respond } from '../utils/respond.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, SlashCommandBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { listPositions } from '../services/positionService.js';
import { reviewApplication, submitApplication } from '../services/applicationService.js';
import { ensureGuild, ensureUser } from '../middleware/guild.js';
import { toUserMessage } from '../utils/errors.js';
import { applicationRateOk } from '../middleware/rateLimit.js';
import { buildCustomId } from '../utils/ids.js';

export const applyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply for a leadership position')
    .addStringOption((o) => o.setName('position').setDescription('Position name or id').setRequired(true).setAutocomplete(true)),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    try {
      await ensureGuild(guildId, interaction.guild?.name ?? null);
      await ensureUser(interaction.user.id, interaction.user.username);
      if (!applicationRateOk(guildId, interaction.user.id)) {
        await respond(interaction, { content: 'You are doing that too fast. Please wait a moment.', flags: MessageFlags.Ephemeral });
        return;
      }
      const q = interaction.options.getString('position', true);
      const all = await listPositions(guildId);
      const pos = all.find((x) => x.id === q || x.name.toLowerCase() === q.toLowerCase());
      if (!pos) {
        await respond(interaction, { content: 'Position not found. Ask staff for the exact name.', flags: MessageFlags.Ephemeral });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(buildCustomId('apply', 'submit', pos.id))
        .setTitle(`Apply: ${pos.name.slice(0, 40)}`);
      const motivation = new TextInputBuilder().setCustomId('motivation').setLabel('Why do you want this role?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
      const experience = new TextInputBuilder().setCustomId('experience').setLabel('Experience').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000);
      const availability = new TextInputBuilder().setCustomId('availability').setLabel('Availability').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200);
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(motivation),
        new ActionRowBuilder<TextInputBuilder>().addComponents(experience),
        new ActionRowBuilder<TextInputBuilder>().addComponents(availability),
      );
      await interaction.showModal(modal);
    } catch (err) {
      if (!interaction.replied) await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};

export async function submitApplyModal(opts: {
  guildId: string;
  positionId: string;
  applicantId: string;
  motivation: string;
  experience: string;
  availability: string;
}): Promise<string> {
  const { id } = await submitApplication({
    guildId: opts.guildId,
    positionId: opts.positionId,
    applicantId: opts.applicantId,
    motivation: opts.motivation,
    experience: opts.experience,
    answers: { availability: opts.availability },
  });
  return id;
}

export async function handleApplicationReviewButton(guildId: string, applicationId: string, reviewerId: string, approve: boolean): Promise<string> {
  await reviewApplication({ guildId, applicationId, reviewerId, approve });
  return approve ? '✅ Application approved.' : '❌ Application rejected.';
}

export function applicationReviewRow(applicationId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId('apply', 'approve', applicationId)).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(buildCustomId('apply', 'reject', applicationId)).setLabel('Reject').setStyle(ButtonStyle.Danger),
  );
}
