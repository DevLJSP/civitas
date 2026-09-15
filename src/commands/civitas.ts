import { deferEphemeral, respond } from '../utils/respond.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { baseEmbed } from '../utils/embeds.js';
import { buildCustomId } from '../utils/ids.js';

export const civitasCommand: BotCommand = {
  data: new SlashCommandBuilder().setName('civitas').setDescription('Open the Civitas dashboard'),
  async execute(interaction) {
    await deferEphemeral(interaction);
    const isManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
    const embed = baseEmbed({
      title: '🏛️ Civitas — Leadership & Community Management',
      description: 'Manage the complete lifecycle of community leadership: positions, applications, elections, mandates, teams, proposals and succession.',
    });
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(buildCustomId('dash', 'leadership')).setLabel('Leadership').setEmoji('🏛️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(buildCustomId('dash', 'elections')).setLabel('Elections').setEmoji('🗳️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(buildCustomId('dash', 'applications')).setLabel('Applications').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(buildCustomId('dash', 'teams')).setLabel('Teams').setEmoji('👥').setStyle(ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(buildCustomId('dash', 'proposals')).setLabel('Proposals').setEmoji('📜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(buildCustomId('dash', 'vacancies')).setLabel('Vacancies').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(buildCustomId('dash', 'stats')).setLabel('Statistics').setEmoji('📊').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(buildCustomId('dash', 'history')).setLabel('History').setEmoji('📚').setStyle(ButtonStyle.Secondary),
    );
    const components = [row1, row2];
    if (isManager) {
      components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(buildCustomId('dash', 'settings')).setLabel('Settings').setEmoji('⚙️').setStyle(ButtonStyle.Danger),
        ),
      );
    }
    await respond(interaction, { embeds: [embed], components, flags: MessageFlags.Ephemeral });
  },
};
