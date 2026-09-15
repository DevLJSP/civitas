import { deferEphemeral, respond } from '../utils/respond.js';
import { SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { getGuildStats } from '../services/statsService.js';
import { baseEmbed } from '../utils/embeds.js';

export const statsCommand: BotCommand = {
  data: new SlashCommandBuilder().setName('stats').setDescription('Community leadership statistics'),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    const s = await getGuildStats(guildId);
    await respond(interaction, {
      embeds: [
        baseEmbed({
          title: '📊 Civitas statistics',
          description: [
            `👥 Active leaders: **${s.activeLeaders}**`,
            `🏛️ Active positions: **${s.activePositions}**`,
            `🗳️ Elections completed: **${s.electionsCompleted}**`,
            `📈 Avg turnout: **${s.averageTurnout}** (${s.turnoutRate}%)`,
            `📋 Applications: **${s.applications}**`,
            `⬆️ Promotions: **${s.promotions}**`,
            `⚠️ Open vacancies: **${s.openVacancies}**`,
          ].join('\n'),
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
