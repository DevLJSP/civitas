import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildCustomId } from '../utils/ids.js';

export function dashboardRows(isManager: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId('dash', 'leadership')).setLabel('Leadership').setEmoji('🏛️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId('dash', 'elections')).setLabel('Elections').setEmoji('🗳️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId('dash', 'applications')).setLabel('Applications').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId('dash', 'teams')).setLabel('Teams').setEmoji('👥').setStyle(ButtonStyle.Secondary),
  );
  const rows = [row1];
  if (isManager) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(buildCustomId('dash', 'settings')).setLabel('Settings').setEmoji('⚙️').setStyle(ButtonStyle.Danger),
      ),
    );
  }
  return rows;
}
