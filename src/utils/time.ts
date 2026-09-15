export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function formatDiscordTimestamp(date: Date, style: 'F' | 'R' | 'f' | 'D' | 'T' = 'F'): string {
  const s = Math.floor(date.getTime() / 1000);
  return `<t:${s}:${style}>`;
}

export function isPast(date: Date, now = new Date()): boolean {
  return date.getTime() <= now.getTime();
}

export function isFuture(date: Date, now = new Date()): boolean {
  return date.getTime() > now.getTime();
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
