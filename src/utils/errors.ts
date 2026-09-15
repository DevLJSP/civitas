import { AppError } from '../types/index.js';

export const ERROR_MESSAGES = {
  NO_PERMISSION: 'You do not have permission to do that.',
  ELECTION_ENDED: 'This election has already ended.',
  ALREADY_VOTED: 'You have already voted.',
  NOT_ELIGIBLE: 'You are not eligible for this position.',
  POSITION_MISSING: 'This position no longer exists.',
  VACANCY_RESOLVED: 'This vacancy has already been resolved.',
  NOT_FOUND: 'The requested item was not found.',
  CROSS_GUILD: 'You cannot access data from another server.',
  INVALID_STATE: 'This action is not allowed in the current state.',
  RATE_LIMITED: 'You are doing that too fast. Please wait a moment and try again.',
  ROLE_UNMANAGEABLE: 'I cannot manage that Discord role. Check my role position and permissions.',
} as const;

export function toUserMessage(err: unknown): string {
  if (err instanceof AppError) return err.userMessage;
  if (err instanceof Error) {
    if (/unique|Unique|P2002/i.test(err.message)) return 'That already exists. Duplicate entries are not allowed.';
    return 'Something went wrong. Please try again later.';
  }
  return 'Something went wrong. Please try again later.';
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
