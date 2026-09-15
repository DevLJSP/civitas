import { LIMITS } from '../config/constants.js';

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

function prune(bucket: Bucket, now: number, windowMs: number): void {
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
}

export function checkRateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  let b = buckets.get(key);
  if (!b) {
    b = { timestamps: [] };
    buckets.set(key, b);
  }
  prune(b, now, windowMs);
  if (b.timestamps.length >= max) return false;
  b.timestamps.push(now);
  // Prevent unbounded growth across many keys (Discloud-safe).
  if (buckets.size > 10_000) {
    const oldest = [...buckets.keys()].slice(0, 1000);
    for (const k of oldest) buckets.delete(k);
  }
  return true;
}

export function commandRateOk(guildId: string, userId: string, command: string): boolean {
  return checkRateLimit(`cmd:${guildId}:${userId}:${command}`, LIMITS.rateMaxCommands, LIMITS.rateWindowMs);
}

export function voteRateOk(guildId: string, userId: string): boolean {
  return checkRateLimit(`vote:${guildId}:${userId}`, LIMITS.rateMaxVotes, 60_000);
}

export function applicationRateOk(guildId: string, userId: string): boolean {
  return checkRateLimit(`apply:${guildId}:${userId}`, LIMITS.rateMaxApplications, 60_000);
}

export function _clearRateBucketsForTests(): void {
  buckets.clear();
}
