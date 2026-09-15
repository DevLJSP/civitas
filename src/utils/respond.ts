import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { logger } from './logger.js';

export type RespondableInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

export const EPHEMERAL_FLAGS = MessageFlags.Ephemeral;

/** Discord code 10062: the 3s interaction token expired before we answered. */
export function isUnknownInteraction(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  return (err as { code?: unknown }).code === 10062;
}

/**
 * Acknowledge early so slow database round-trips cannot expire the
 * interaction token (Discord allows ~3s for the first response).
 * Safe to call when already acknowledged (no-op).
 */
export async function deferEphemeral(interaction: RespondableInteraction): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (err) {
    if (!isUnknownInteraction(err)) throw err;
    logger.debug('deferEphemeral: interaction already expired');
  }
}

/**
 * Reply exactly once, however the interaction was acknowledged:
 * deferred → editReply, already replied → followUp, otherwise reply.
 * Expired tokens (10062) are swallowed: nothing can be delivered anyway.
 */
export async function respond(
  interaction: RespondableInteraction,
  options: InteractionReplyOptions,
): Promise<void> {
  try {
    if (interaction.deferred && !interaction.replied) {
      // editReply accepts no visibility flags; the deferral fixed visibility.
      const { flags: _flags, ephemeral: _ephemeral, ...editOptions } = options;
      await interaction.editReply(editOptions as InteractionEditReplyOptions);
      return;
    }
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(options);
      return;
    }
    await interaction.reply(options);
  } catch (err) {
    if (isUnknownInteraction(err)) {
      logger.debug('respond: interaction token expired before delivery');
      return;
    }
    throw err;
  }
}
