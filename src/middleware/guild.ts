import { prisma } from '../database/prisma.js';

/** Ensure guild + member rows exist. Returns guild id. All guild-owned queries must scope by this id. */
export async function ensureGuild(guildId: string, name?: string | null): Promise<string> {
  await prisma.guild.upsert({
    where: { id: guildId },
    update: { name: name ?? undefined, leftAt: null },
    create: { id: guildId, name: name ?? undefined },
  });
  await prisma.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
  });
  return guildId;
}

export async function ensureUser(userId: string, username?: string | null): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    update: { username: username ?? undefined },
    create: { id: userId, username: username ?? undefined },
  });
}

/** Guard: an entity's guildId must equal the interaction guildId. */
export function assertSameGuild(entityGuildId: string, requestGuildId: string): void {
  if (entityGuildId !== requestGuildId) {
    throw new Error('Cross-guild access denied');
  }
}
