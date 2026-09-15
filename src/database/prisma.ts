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

/**
 * Redacted pool-shape summary for startup logs. Never includes credentials —
 * only host, port and the pool-tuning query params that cause P2024 when wrong
 * (e.g. an untuned `connection_limit` of 81 against the Supabase pooler).
 */
export function describePoolConfig(url = process.env.DATABASE_URL ?? ''): string {
  try {
    const parsed = new URL(url);
    const pick = (k: string): string => parsed.searchParams.get(k) ?? '(default)';
    return (
      `host=${parsed.hostname} port=${parsed.port || '(default)'}` +
      ` pgbouncer=${pick('pgbouncer')} connection_limit=${pick('connection_limit')}` +
      ` pool_timeout=${pick('pool_timeout')} connect_timeout=${pick('connect_timeout')}`
    );
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

/** Cheap health check so a bad URL fails fast with a clear message at boot. */
export async function checkDbConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
