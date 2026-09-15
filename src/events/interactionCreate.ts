import { deferEphemeral, isUnknownInteraction, respond } from '../utils/respond.js';
import type { ButtonInteraction, Client, Interaction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { commandMap } from '../commands/index.js';
import { toUserMessage } from '../utils/errors.js';
import { parseCustomId } from '../utils/ids.js';
import { logger } from '../utils/logger.js';
import { handleVoteSelect } from '../commands/vote.js';
import { handleTutorialButton } from '../commands/tutorial.js';
import { handleHelpSelect } from '../commands/help.js';
import { submitApplyModal, handleApplicationReviewButton } from '../commands/apply.js';
import { handleProposalButton } from '../commands/proposal.js';
import { handleImpeachmentVote } from '../commands/impeachment.js';
import { confirmResignation } from '../commands/resign.js';
import { getPublicResults } from '../services/votingService.js';
import { listActiveMandates } from '../services/mandateService.js';
import { listElections } from '../services/electionService.js';
import { listApplications } from '../services/applicationService.js';
import { listTeams } from '../services/teamService.js';
import { listProposals } from '../services/proposalService.js';
import { listVacancies } from '../services/successionService.js';
import { getGuildStats } from '../services/statsService.js';
import { baseEmbed } from '../utils/embeds.js';
import { getGuildConfig } from '../services/guildService.js';
import { prisma } from '../database/prisma.js';

async function handleDashboard(action: string, interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const isManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
  if (action === 'settings' && !isManager) {
    await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
    return;
  }
  await deferEphemeral(interaction);
  let embed = baseEmbed({ title: '🏛️ Civitas', description: 'Loading…' });
  if (action === 'leadership') {
    const mandates = await listActiveMandates(guildId);
    embed = baseEmbed({ title: '🏛️ Leadership', description: mandates.length === 0 ? 'No current leaders.' : mandates.slice(0, 15).map((m) => `<@${m.userId}> · **${m.position.name}** · ${m.status}`).join('\n') });
  } else if (action === 'elections') {
    const elections = await listElections(guildId);
    embed = baseEmbed({ title: '🗳️ Elections', description: elections.length === 0 ? 'No elections yet.' : elections.slice(0, 10).map((e) => `**${e.title}** · ${e.status} · \`${e.id.slice(0, 8)}\``).join('\n') });
  } else if (action === 'applications') {
    const apps = await listApplications(guildId);
    embed = baseEmbed({ title: '📋 Applications', description: apps.length === 0 ? 'No applications.' : apps.slice(0, 10).map((a) => `\`${a.id.slice(0, 8)}\` · ${a.status}`).join('\n') });
  } else if (action === 'teams') {
    const teams = await listTeams(guildId);
    embed = baseEmbed({ title: '👥 Teams', description: teams.length === 0 ? 'No teams.' : teams.slice(0, 10).map((t) => `**${t.name}** · ${t.members.length}`).join('\n') });
  } else if (action === 'proposals') {
    const proposals = await listProposals(guildId);
    embed = baseEmbed({ title: '📜 Proposals', description: proposals.length === 0 ? 'No proposals.' : proposals.slice(0, 10).map((p) => `**${p.title}** · ${p.status}`).join('\n') });
  } else if (action === 'vacancies') {
    const vacancies = await listVacancies(guildId, true);
    embed = baseEmbed({ title: '🔄 Vacancies', description: vacancies.length === 0 ? 'No open vacancies.' : vacancies.slice(0, 10).map((v) => `⚠️ **${v.position.name}** · \`${v.id.slice(0, 8)}\``).join('\n') });
  } else if (action === 'stats') {
    const s = await getGuildStats(guildId);
    embed = baseEmbed({ title: '📊 Statistics', description: `Leaders: ${s.activeLeaders} · Positions: ${s.activePositions} · Elections: ${s.electionsCompleted} · Vacancies: ${s.openVacancies}` });
  } else if (action === 'history') {
    const mandates = await prisma.mandate.findMany({ where: { guildId }, orderBy: { startsAt: 'desc' }, take: 10, include: { position: true } });
    embed = baseEmbed({ title: '📚 History', description: mandates.length === 0 ? 'No history.' : mandates.map((m) => `<@${m.userId}> · **${m.position.name}** · ${m.status}`).join('\n') });
  } else if (action === 'settings') {
    const config = await getGuildConfig(guildId);
    embed = baseEmbed({ title: '⚙️ Settings', description: `Mandate: ${config.defaultMandateDays}d · Probation: ${config.defaultProbationDays}d · Quorum: ${config.defaultQuorumPercent}%\nUse \`/setup\` to change.` });
  }
  await respond(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

export function registerInteractionCreate(client: Client): void {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = commandMap.get(interaction.commandName);
        if (!cmd) {
          await respond(interaction, { content: 'Unknown command.', flags: MessageFlags.Ephemeral });
          return;
        }
        await cmd.execute(interaction);
        return;
      }

      if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'apply') {
          const focused = interaction.options.getFocused();
          const { listPositions } = await import('../services/positionService.js');
          const guildId = interaction.guildId;
          if (!guildId) {
            await interaction.respond([]);
            return;
          }
          const all = await listPositions(guildId);
          const matches = all
            .filter((p) => p.name.toLowerCase().includes(String(focused).toLowerCase()))
            .slice(0, 25)
            .map((p) => ({ name: p.name.slice(0, 100), value: p.id }));
          await interaction.respond(matches);
        }
        return;
      }

      if (interaction.isModalSubmit()) {
        const { namespace, action, parts } = parseCustomId(interaction.customId);
        if (namespace === 'apply' && action === 'submit') {
          const positionId = parts[0] as string;
          const guildId = interaction.guildId;
          if (!guildId) return;
          await deferEphemeral(interaction);
          const motivation = interaction.fields.getTextInputValue('motivation');
          let experience = '';
          let availability = '';
          try { experience = interaction.fields.getTextInputValue('experience'); } catch { /* optional */ }
          try { availability = interaction.fields.getTextInputValue('availability'); } catch { /* optional */ }
          try {
            const id = await submitApplyModal({ guildId, positionId, applicantId: interaction.user.id, motivation, experience, availability });
            await respond(interaction, { content: `✅ Application submitted (\`${id.slice(0, 8)}\`).`, flags: MessageFlags.Ephemeral });
          } catch (err) {
            await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
          }
        }
        return;
      }

      if (interaction.isStringSelectMenu()) {
        const { namespace, action, parts } = parseCustomId(interaction.customId);
        const guildId = interaction.guildId;
        if (!guildId) return;
        if (namespace === 'election' && action.startsWith('cast-')) {
          await deferEphemeral(interaction);
          try {
            const msg = await handleVoteSelect(guildId, parts[0] as string, interaction.user.id, action, [...interaction.values]);
            await respond(interaction, { content: msg, flags: MessageFlags.Ephemeral });
          } catch (err) {
            await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
          }
        }
        if (namespace === 'help' && action === 'topic') {
          const isManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
          await deferEphemeral(interaction);
          try {
            const msg = await handleHelpSelect(isManager, interaction.values[0] ?? 'start');
            await respond(interaction, { ...msg, flags: MessageFlags.Ephemeral });
          } catch (err) {
            await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
          }
        }
        return;
      }

      if (interaction.isButton()) {
        const { namespace, action, parts } = parseCustomId(interaction.customId);
        const guildId = interaction.guildId;
        if (!guildId) return;
        // NEVER trust guild id embedded in customId; always use interaction.guildId.

        if (namespace === 'dash') {
          await handleDashboard(action, interaction);
          return;
        }
        if (namespace === 'tutorial') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
            return;
          }
          await deferEphemeral(interaction);
          try {
            const msg = await handleTutorialButton({
              guildId,
              userId: interaction.user.id,
              username: interaction.user.username,
              action,
              parts,
            });
            await respond(interaction, { ...msg, flags: MessageFlags.Ephemeral });
          } catch (err) {
            await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
          }
          return;
        }
        if (namespace === 'apply' && (action === 'approve' || action === 'reject')) {
          const member = interaction.member;
          const perms = interaction.memberPermissions;
          if (!perms?.has(PermissionFlagsBits.ManageGuild)) {
            await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
            return;
          }
          void member;
          await deferEphemeral(interaction);
          try {
            const msg = await handleApplicationReviewButton(guildId, parts[0] as string, interaction.user.id, action === 'approve');
            await respond(interaction, { content: msg, flags: MessageFlags.Ephemeral });
          } catch (err) {
            await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
          }
          return;
        }
        if (namespace === 'election' && action === 'vote') {
          await respond(interaction, { content: 'Use `/vote` with the election id to cast your vote privately.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (namespace === 'election' && action === 'results') {
          try {
            const res = await getPublicResults(guildId, parts[0] as string);
            await respond(interaction, { content: `📊 **${res.election.title}** — turnout ${res.turnout}, status ${res.election.status}.`, flags: res.election.isAnonymous ? MessageFlags.Ephemeral : undefined });
          } catch (err) {
            await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
          }
          return;
        }
        if (namespace === 'proposal' && (action === 'yes' || action === 'no')) {
          try {
            const msg = await handleProposalButton(guildId, parts[0] as string, interaction.user.id, action.toUpperCase());
            await respond(interaction, { content: msg, flags: MessageFlags.Ephemeral });
          } catch (err) {
            await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
          }
          return;
        }
        if (namespace === 'impeach' && (action === 'yes' || action === 'no')) {
          try {
            const msg = await handleImpeachmentVote(guildId, parts[0] as string, interaction.user.id, action === 'yes');
            await respond(interaction, { content: msg, flags: MessageFlags.Ephemeral });
          } catch (err) {
            await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
          }
          return;
        }
        if (namespace === 'resign' && action === 'confirm') {
          await deferEphemeral(interaction);
          try {
            const msg = await confirmResignation(guildId, interaction.user.id, parts[0] as string);
            await respond(interaction, { content: msg, flags: MessageFlags.Ephemeral });
          } catch (err) {
            await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
          }
        }
      }
    } catch (err) {
      if (isUnknownInteraction(err)) {
        logger.warn('interactionCreate: token expired before a response could be delivered (10062)');
        return;
      }
      logger.error('interactionCreate failed', err);
      try {
        if (
          (interaction.isChatInputCommand() ||
            interaction.isButton() ||
            interaction.isModalSubmit() ||
            interaction.isStringSelectMenu()) &&
          !interaction.replied &&
          !interaction.deferred
        ) {
          await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
        }
      } catch { /* one failed interaction must not crash the bot */ }
    }
  });
}
