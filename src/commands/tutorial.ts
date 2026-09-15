import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type EmbedBuilder,
} from 'discord.js';
import type { BotCommand } from './_types.js';
import { deferEphemeral, respond } from '../utils/respond.js';
import { MessageFlags } from 'discord.js';
import { buildCustomId } from '../utils/ids.js';
import { baseEmbed } from '../utils/embeds.js';
import { toUserMessage } from '../utils/errors.js';
import { commandRateOk } from '../middleware/rateLimit.js';
import { ensureGuild, ensureUser } from '../middleware/guild.js';
import { createPosition } from '../services/positionService.js';
import { addCandidate, createElection, startElection } from '../services/electionService.js';
import {
  canOpenTestElection,
  channelChecklist,
  cleanupTutorial,
  finishTutorial,
  getTutorialState,
  isFirstStep,
  isLastStep,
  nextStep,
  parseStep,
  prevStep,
  recordTutorialElection,
  recordTutorialPosition,
  setTutorialStep,
  skipTutorial,
  startTutorial,
  TUTORIAL_STEPS,
  type TutorialStateShape,
  type TutorialStepId,
} from '../services/tutorialService.js';

const TUTORIAL_POSITION_NAME = 'Tutorial Captain';

function navRow(step: TutorialStepId): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId('tutorial', 'nav', prevStep(step)))
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isFirstStep(step)),
    new ButtonBuilder()
      .setCustomId(buildCustomId('tutorial', 'nav', nextStep(step)))
      .setLabel(isLastStep(step) ? 'Finish' : 'Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId(buildCustomId('tutorial', 'skip'))
      .setLabel('Skip tutorial')
      .setStyle(ButtonStyle.Secondary),
  );
  return row;
}

function stepCounter(step: TutorialStepId): string {
  const idx = TUTORIAL_STEPS.indexOf(step) + 1;
  return `Step ${idx} of ${TUTORIAL_STEPS.length}`;
}

export async function buildTutorialMessage(
  guildId: string,
  step: TutorialStepId,
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const state = await getTutorialState(guildId);

  if (step === 'welcome') {
    const resumed = state.status === 'IN_PROGRESS' && state.currentStep > 1;
    const embed = baseEmbed({
      title: '🏛️ Welcome to Civitas',
      description: [
        'Civitas manages the complete lifecycle of community leadership: positions → applications → elections → mandates → succession.',
        '',
        resumed ? '_Resuming where you left off._' : 'In the next 4 steps you will set up channels, create your first position, and open a test election.',
        '',
        'Everything the tutorial creates is clearly labeled and can be removed in one click at the end.',
      ].join('\n'),
      footer: stepCounter(step),
    });
    return { embeds: [embed], components: [navRow(step)] };
  }

  if (step === 'channels') {
    const items = await channelChecklist(guildId);
    const lines = items.map((i) => `${i.set ? '✅' : '⬜'} ${i.label}`).join('\n');
    const missing = items.filter((i) => !i.set).length;
    const embed = baseEmbed({
      title: '📺 Leadership channels',
      description: [
        'Civitas posts applications, elections and announcements in dedicated channels.',
        '',
        lines,
        '',
        missing === 0
          ? 'All channels configured. 🎉'
          : 'Missing channels are OK for now — run `/setup channels` to set them. Nothing here blocks you.',
      ].join('\n'),
      footer: stepCounter(step),
    });
    return { embeds: [embed], components: [navRow(step)] };
  }

  if (step === 'position') {
    const created = state.createdPositionId
      ? `✅ Tutorial position created (\`${state.createdPositionId.slice(0, 8)}\`). Press **Next** to continue.\n\nTo inspect it: \`/position view\`.`
      : 'Create your first leadership position with one click. You can rename, edit or delete it later with `/position`.';
    const embed = baseEmbed({
      title: '🏛️ Your first position',
      description: created,
      footer: stepCounter(step),
    });
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId('tutorial', 'create-position'))
        .setLabel(`Create "${TUTORIAL_POSITION_NAME}"`)
        .setEmoji('🧪')
        .setStyle(ButtonStyle.Success)
        .setDisabled(state.createdPositionId !== null),
    );
    return { embeds: [embed], components: [actionRow, navRow(step)] };
  }

  if (step === 'election') {
    const gate = canOpenTestElection(state);
    const created = state.createdElectionId
      ? [
        `✅ Test election is open (\`${state.createdElectionId.slice(0, 8)}\`).`,
        'Try it: run `/vote`, pick a candidate, then `/election results` to see counting, quorum and mandates in action.',
        '',
        'Press **Next** to finish.',
      ].join('\n')
      : 'Open a 24-hour test election for the tutorial position. You are auto-nominated so you can vote immediately.';
    const embed = baseEmbed({
      title: '🗳️ Your first election',
      description: gate.ok ? created : `${created}\n\n⚠️ ${gate.reason}`,
      footer: stepCounter(step),
    });
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId('tutorial', 'create-election'))
        .setLabel('Open test election')
        .setEmoji('🗳️')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!gate.ok || state.createdElectionId !== null),
    );
    return { embeds: [embed], components: [actionRow, navRow(step)] };
  }

  // done
  const embed = baseEmbed({
    title: '🎉 Tutorial complete-ish',
    description: [
      'You now have a working leadership loop: position → election → vote → mandate.',
      '',
      '**Keep exploring:** `/civitas` (dashboard) · `/apply` · `/mandate` · `/stats` · `/help`',
      '',
      state.createdPositionId || state.createdElectionId
        ? '🧹 **Cleanup** removes the tutorial position and cancels the test election.'
        : 'Tutorial artifacts already cleaned up. 🎉',
    ].join('\n'),
    footer: stepCounter(step),
  });
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId('tutorial', 'cleanup'))
      .setLabel('Cleanup tutorial data')
      .setEmoji('🧹')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!state.createdPositionId && !state.createdElectionId),
    new ButtonBuilder()
      .setCustomId(buildCustomId('tutorial', 'finish'))
      .setLabel('Finish')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [actionRow] };
}

export function finishedMessage(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = baseEmbed({
    title: '✅ Tutorial finished',
    description: 'Your server is ready. Open `/civitas` anytime for the dashboard, or `/help` for the full command reference.',
  });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId('tutorial', 'restart')).setLabel('Restart tutorial').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

export function skippedMessage(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = baseEmbed({
    title: '⏭️ Tutorial skipped',
    description: 'No problem. Run `/tutorial` anytime to resume, or `/help` for the command reference.',
  });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId('tutorial', 'restart')).setLabel('Restart tutorial').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

/** Button handler (called by interactionCreate after defer). Never trusts customId guild data. */
export async function handleTutorialButton(opts: {
  guildId: string;
  userId: string;
  username: string;
  action: string;
  parts: string[];
}): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const { guildId, userId, username, action, parts } = opts;

  if (action === 'nav') {
    const step = parseStep(parts[0]);
    await setTutorialStep(guildId, step);
    if (step === 'done' && isLastStep(step)) {
      // Reaching Done via Next counts as completing.
      await finishTutorial(guildId, userId);
      return finishedMessage();
    }
    return buildTutorialMessage(guildId, step);
  }

  if (action === 'create-position') {
    try {
      const position = await createPosition({
        guildId,
        name: TUTORIAL_POSITION_NAME,
        description: '🧪 Created by the Civitas tutorial. Safe to delete via tutorial cleanup.',
        seats: 1,
        selectionMethod: 'EITHER',
        createdBy: userId,
      });
      await recordTutorialPosition(guildId, position.id);
      await setTutorialStep(guildId, 'position');
    } catch (err) {
      // Friendly duplicate (or other) error: stay on the step with navigation intact.
      const { content } = { content: `${toUserMessage(err)} Use /position list to review existing positions.` };
      const msg = await buildTutorialMessage(guildId, 'position');
      msg.embeds[0]?.setDescription(content);
      return msg;
    }
    return buildTutorialMessage(guildId, 'position');
  }

  if (action === 'create-election') {
    const state = await getTutorialState(guildId);
    const gate = canOpenTestElection(state);
    if (!gate.ok || !state.createdPositionId) {
      const msg = await buildTutorialMessage(guildId, 'election');
      return msg;
    }
    const now = new Date();
    const election = await createElection({
      guildId,
      title: 'Tutorial Election',
      description: '🧪 Test election created by the Civitas tutorial.',
      type: 'MAJORITY',
      positionId: state.createdPositionId,
      seats: 1,
      isAnonymous: false,
      quorumPercent: 0,
      startsAt: now,
      endsAt: new Date(now.getTime() + 24 * 3_600_000),
      createdBy: userId,
    });
    // Auto-nominate the admin so the election can start and be voted in immediately.
    await addCandidate(guildId, election.id, userId, username.slice(0, 80), 'Tutorial candidate');
    await startElection(guildId, election.id, userId);
    await recordTutorialElection(guildId, election.id);
    await setTutorialStep(guildId, 'election');
    return buildTutorialMessage(guildId, 'election');
  }

  if (action === 'cleanup') {
    await cleanupTutorial(guildId, userId);
    return buildTutorialMessage(guildId, 'done');
  }

  if (action === 'finish') {
    await finishTutorial(guildId, userId);
    return finishedMessage();
  }

  if (action === 'skip') {
    await skipTutorial(guildId, userId);
    return skippedMessage();
  }

  if (action === 'restart') {
    await startTutorial(guildId, userId);
    await setTutorialStep(guildId, 'welcome');
    return buildTutorialMessage(guildId, 'welcome');
  }

  const state = await getTutorialState(guildId);
  const idx = Math.min(Math.max(state.currentStep, 1), TUTORIAL_STEPS.length) - 1;
  return buildTutorialMessage(guildId, TUTORIAL_STEPS[idx] ?? 'welcome');
}

export const tutorialCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('tutorial')
    .setDescription('Guided setup: first position and test election in minutes')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!commandRateOk(guildId, interaction.user.id, 'tutorial')) {
      await respond(interaction, { content: 'You are doing that too fast. Please wait a moment.', flags: MessageFlags.Ephemeral });
      return;
    }
    try {
      await ensureGuild(guildId, interaction.guild?.name ?? null);
      await ensureUser(interaction.user.id, interaction.user.username);
      await deferEphemeral(interaction);
      const state = await getTutorialState(guildId);
      if (state.status === 'IN_PROGRESS') {
        const idx = Math.min(Math.max(state.currentStep, 1), TUTORIAL_STEPS.length) - 1;
        const msg = await buildTutorialMessage(guildId, TUTORIAL_STEPS[idx] ?? 'welcome');
        await respond(interaction, { ...msg, flags: MessageFlags.Ephemeral });
        return;
      }
      await startTutorial(guildId, interaction.user.id);
      const msg = await buildTutorialMessage(guildId, 'welcome');
      await respond(interaction, { ...msg, flags: MessageFlags.Ephemeral });
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};
