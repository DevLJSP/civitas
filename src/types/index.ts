export type ElectionType = 'MAJORITY' | 'APPROVAL' | 'RANKED';
export type ElectionStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'NOMINATIONS'
  | 'CAMPAIGNING'
  | 'ACTIVE'
  | 'COUNTING'
  | 'FINISHED'
  | 'CANCELLED'
  | 'QUORUM_NOT_REACHED';

export type MandateStatus =
  | 'PENDING'
  | 'PROBATION'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'RESIGNED'
  | 'REMOVED'
  | 'SUSPENDED';

export type MandateOrigin = 'ELECTION' | 'APPOINTMENT' | 'SUCCESSION' | 'PROMOTION';

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface RankedBallot {
  voterId: string;
  ranking: string[];
}

export interface ElectionCountResult {
  winners: string[];
  rounds?: RankedRound[];
  counts: Record<string, number>;
  exhaustedBallots: number;
  turnout: number;
  quorumReached: boolean;
  tieBroken: boolean;
  tieDetail?: string;
}

export interface RankedRound {
  round: number;
  counts: Record<string, number>;
  eliminated: string | null;
  exhausted: number;
}

export interface SuccessionStep {
  order: number;
  action: 'APPOINT_SUCCESSOR' | 'OPEN_APPLICATIONS' | 'START_ELECTION' | 'CREATE_VACANCY';
  successorUserId?: string;
  successorPositionId?: string;
  note?: string;
}

export interface CommandContext {
  guildId: string;
  userId: string;
  isOwner: boolean;
  isAdmin: boolean;
}

export class AppError extends Error {
  readonly code: string;
  readonly userMessage: string;
  readonly statusHint?: string;

  constructor(code: string, userMessage: string, statusHint?: string) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.statusHint = statusHint;
  }
}

export function userError(message: string, code = 'USER_ERROR'): AppError {
  return new AppError(code, message);
}
