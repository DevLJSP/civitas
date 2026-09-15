import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __civitasPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = globalThis.__civitasPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__civitasPrisma = prisma;
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
