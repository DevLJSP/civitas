import type { ChatInputCommandInteraction } from 'discord.js';

export interface BotCommand {
  data: { toJSON: () => unknown; name?: string };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
