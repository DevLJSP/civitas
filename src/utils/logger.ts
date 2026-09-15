type Level = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function currentLevel(): Level {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/DISCORD_TOKEN=([^\s]+)/g, 'DISCORD_TOKEN=[redacted]')
      .replace(/DATABASE_URL=([^\s]+)/g, 'DATABASE_URL=[redacted]');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|password|database_url/i.test(k)) out[k] = '[redacted]';
      else out[k] = redact(v);
    }
    return out;
  }
  return value;
}

function emit(level: Level, message: string, meta?: unknown): void {
  if (levelOrder[level] < levelOrder[currentLevel()]) return;
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${message}`;
  if (meta === undefined) {
    if (level === 'error') console.error(base);
    else console.log(base);
    return;
  }
  const safe = redact(meta);
  if (level === 'error') console.error(base, safe);
  else console.log(base, safe);
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit('debug', msg, meta),
  info: (msg: string, meta?: unknown) => emit('info', msg, meta),
  warn: (msg: string, meta?: unknown) => emit('warn', msg, meta),
  error: (msg: string, meta?: unknown) => emit('error', msg, meta),
};
