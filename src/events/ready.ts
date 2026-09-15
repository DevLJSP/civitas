import type { Client } from 'discord.js';
import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { startScheduler } from '../jobs/scheduler.js';

export function registerReady(client: Client): void {
  client.once(Events.ClientReady, (c) => {
    logger.info(`Civitas ready as ${c.user.tag} (${c.guilds.cache.size} guilds)`);
    c.user.setPresence({ activities: [{ name: '/civitas · leadership' }], status: 'online' });
    startScheduler(c);
  });
}
