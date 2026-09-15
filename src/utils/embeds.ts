import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../config/constants.js';

export function baseEmbed(opts: {
  title: string;
  description?: string;
  color?: number;
  footer?: string;
  timestamp?: boolean;
}): EmbedBuilder {
  const e = new EmbedBuilder().setTitle(opts.title).setColor(opts.color ?? COLORS.primary);
  if (opts.description) e.setDescription(opts.description.slice(0, 4000));
  if (opts.footer) e.setFooter({ text: opts.footer.slice(0, 200) });
  if (opts.timestamp !== false) e.setTimestamp();
  return e;
}

export function successEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed({ title: `✅ ${title}`, description, color: COLORS.success });
}

export function errorEmbed(description: string): EmbedBuilder {
  return baseEmbed({ title: '❌ Something went wrong', description, color: COLORS.danger });
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed({ title, description, color: COLORS.primary });
}

export function statusEmoji(status: string): string {
  switch (status) {
    case 'ACTIVE': return '🟢';
    case 'PROBATION': return '🟡';
    case 'PENDING': return '⏳';
    case 'FINISHED': return '✅';
    case 'CANCELLED': return '🚫';
    case 'EXPIRED': return '⌛';
    case 'RESIGNED': return '👋';
    case 'REMOVED': return '🔨';
    case 'OPEN': return '📢';
    case 'QUORUM_NOT_REACHED': return '⚠️';
    default: return '•';
  }
}

export function truncate(text: string, max = 1000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
