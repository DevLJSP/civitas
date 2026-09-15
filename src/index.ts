import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { getEnv } from './config/env.js';
import { logger } from './utils/logger.js';
import { registerReady } from './events/ready.js';
import { registerInteractionCreate } from './events/interactionCreate.js';
import { registerGuildEvents } from './events/guild.js';
import { prisma } from './database/prisma.js';

async function main(): Promise<void> {
  const env = getEnv();
  logger.info(`Starting Civitas (env=${env.NODE_ENV})`);

  // Fail fast if the database is unreachable.
  await prisma.$connect();
  logger.info('Database connected');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
    ],
    partials: [Partials.GuildMember],
  });

  registerReady(client);
  registerInteractionCreate(client);
  registerGuildEvents(client);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down…`);
    try {
      client.destroy();
    } catch { /* ignore */ }
    try {
      await prisma.$disconnect();
    } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error('Unhandled rejection', err));
  process.on('uncaughtException', (err) => logger.error('Uncaught exception', err));

  await client.login(env.DISCORD_TOKEN);
}

void main().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
