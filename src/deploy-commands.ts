import { REST, Routes } from 'discord.js';
import { getEnv } from './config/env.js';
import { commands } from './commands/index.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  const env = getEnv();
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  if (env.GUILD_ID) {
    logger.info(`Refreshing ${body.length} guild commands for ${env.GUILD_ID}…`);
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.GUILD_ID), { body });
  } else {
    logger.info(`Refreshing ${body.length} global commands…`);
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
  }
  logger.info('Commands deployed');
}

void main().catch((err) => {
  logger.error('Command deploy failed', err);
  process.exit(1);
});
