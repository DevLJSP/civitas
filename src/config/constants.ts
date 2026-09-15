export const APP_NAME = 'Civitas';
export const APP_VERSION = '1.0.0';

export const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  danger: 0xed4245,
  neutral: 0x2b2d31,
  gold: 0xf0b232,
} as const;

export const LIMITS = {
  maxCandidatesPerElection: 25,
  maxPositionsPerGuild: 100,
  maxTeamsPerGuild: 50,
  maxQuestionsPerPosition: 10,
  listPageSize: 10,
  schedulerPollMs: 30_000,
  schedulerBatchSize: 20,
  schedulerLockMs: 5 * 60_000,
  rateWindowMs: 10_000,
  rateMaxCommands: 8,
  rateMaxVotes: 5,
  rateMaxApplications: 3,
} as const;

export const TASK_TYPES = {
  ELECTION_START: 'ELECTION_START',
  ELECTION_END: 'ELECTION_END',
  PROPOSAL_END: 'PROPOSAL_END',
  MANDATE_EXPIRE: 'MANDATE_EXPIRE',
  PROBATION_END: 'PROBATION_END',
  APPLICATION_CLOSE: 'APPLICATION_CLOSE',
  SUCCESSION_DEADLINE: 'SUCCESSION_DEADLINE',
  VACANCY_REVIEW: 'VACANCY_REVIEW',
  IMPEACHMENT_END: 'IMPEACHMENT_END',
} as const;

export type TaskType = (typeof TASK_TYPES)[keyof typeof TASK_TYPES];

export const PERMISSION_LEVELS = {
  MEMBER: 0,
  MODERATOR: 1,
  TEAM_LEADER: 2,
  ELECTION_MANAGER: 3,
  LEADERSHIP_MANAGER: 4,
  ADMIN: 5,
  OWNER: 6,
} as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[keyof typeof PERMISSION_LEVELS];

export const AUDIT_ACTIONS = {
  GUILD_SETUP: 'guild.setup',
  CONFIG_UPDATE: 'config.update',
  POSITION_CREATE: 'position.create',
  POSITION_UPDATE: 'position.update',
  POSITION_DELETE: 'position.delete',
  APPLICATION_SUBMIT: 'application.submit',
  APPLICATION_REVIEW: 'application.review',
  CANDIDATE_APPROVE: 'candidate.approve',
  ELECTION_CREATE: 'election.create',
  ELECTION_UPDATE: 'election.update',
  ELECTION_START: 'election.start',
  ELECTION_CLOSE: 'election.close',
  ELECTION_RESULT: 'election.result',
  APPOINTMENT_CREATE: 'appointment.create',
  MANDATE_CREATE: 'mandate.create',
  MANDATE_END: 'mandate.end',
  PROBATION_DECIDE: 'probation.decide',
  PROMOTION_DECIDE: 'promotion.decide',
  DEMOTION_DECIDE: 'demotion.decide',
  TEAM_UPDATE: 'team.update',
  PROPOSAL_CREATE: 'proposal.create',
  PROPOSAL_CLOSE: 'proposal.close',
  IMPEACHMENT_OPEN: 'impeachment.open',
  IMPEACHMENT_CLOSE: 'impeachment.close',
  SUCCESSION_TRIGGER: 'succession.trigger',
  VACANCY_OPEN: 'vacancy.open',
  VACANCY_RESOLVE: 'vacancy.resolve',
  RESIGNATION: 'mandate.resign',
  ROLE_SYNC_FAIL: 'role.sync_fail',
  TUTORIAL_START: 'tutorial.start',
  TUTORIAL_COMPLETE: 'tutorial.complete',
  TUTORIAL_CLEANUP: 'tutorial.cleanup',
} as const;
