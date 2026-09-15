import type { BotCommand } from './_types.js';
import { setupCommand } from './setup.js';
import { positionCommand } from './position.js';
import { applyCommand } from './apply.js';
import { electionCommand } from './election.js';
import { voteCommand } from './vote.js';
import { mandateCommand, probationCommand } from './mandate.js';
import { promoteCommand, demoteCommand } from './promote.js';
import { teamCommand } from './team.js';
import { successionCommand, vacancyCommand } from './succession.js';
import { resignCommand } from './resign.js';
import { impeachmentCommand } from './impeachment.js';
import { proposalCommand } from './proposal.js';
import { historyCommand, leadershipCommand, leaderboardCommand } from './history.js';
import { statsCommand } from './stats.js';
import { civitasCommand } from './civitas.js';
import { tutorialCommand } from './tutorial.js';
import { helpCommand } from './help.js';

export const commands: BotCommand[] = [
  setupCommand,
  positionCommand,
  applyCommand,
  electionCommand,
  voteCommand,
  mandateCommand,
  probationCommand,
  promoteCommand,
  demoteCommand,
  teamCommand,
  successionCommand,
  vacancyCommand,
  resignCommand,
  impeachmentCommand,
  proposalCommand,
  historyCommand,
  leadershipCommand,
  leaderboardCommand,
  statsCommand,
  civitasCommand,
  tutorialCommand,
  helpCommand,
];

export const commandMap = new Map(commands.map((c) => {
  const json = c.data.toJSON() as { name: string };
  return [json.name, c] as const;
}));
