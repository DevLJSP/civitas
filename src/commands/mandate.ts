import { deferEphemeral, respond } from '../utils/respond.js';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { createAppointmentMandate, decideProbation, endMandate, listActiveMandates } from '../services/mandateService.js';
import { prisma } from '../database/prisma.js';
import { ensureGuild, ensureUser } from '../middleware/guild.js';
import { safeAddRole, safeRemoveRole } from '../services/roleService.js';
import { baseEmbed } from '../utils/embeds.js';
import { toUserMessage } from '../utils/errors.js';

export const mandateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('mandate')
    .setDescription('Manage leadership mandates')
    .addSubcommand((s) => s.setName('list').setDescription('List active mandates'))
    .addSubcommand((s) =>
      s.setName('appoint').setDescription('Appoint a leader directly')
        .addStringOption((o) => o.setName('position').setDescription('Position id').setRequired(true))
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason')),
    )
    .addSubcommand((s) =>
      s.setName('end').setDescription('End a mandate')
        .addStringOption((o) => o.setName('mandate').setDescription('Mandate id').setRequired(true))
        .addStringOption((o) => o.setName('status').setDescription('End status').addChoices(
          { name: 'Expired', value: 'EXPIRED' },
          { name: 'Removed', value: 'REMOVED' },
          { name: 'Suspended', value: 'SUSPENDED' },
        )),
    ),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId || !interaction.guild) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    const sub = interaction.options.getSubcommand();
    try {
      await ensureGuild(guildId, interaction.guild.name);
      await ensureUser(interaction.user.id, interaction.user.username);

      if (sub === 'list') {
        const mandates = await listActiveMandates(guildId);
        const desc = mandates.length === 0
          ? 'No active mandates.'
          : mandates.slice(0, 15).map((m) => `<@${m.userId}> · **${m.position.name}** · ${m.status} · \`${m.id.slice(0, 8)}\``).join('\n');
        await respond(interaction, { embeds: [baseEmbed({ title: '🏛️ Active mandates', description: desc })], flags: MessageFlags.Ephemeral });
        return;
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'appoint') {
        const positionId = interaction.options.getString('position', true);
        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') ?? undefined;
        const mandate = await createAppointmentMandate({ guildId, positionId, userId: user.id, appointedBy: interaction.user.id, reason });
        // Best-effort Discord role sync (never corrupts DB on failure).
        const position = await prisma.leadershipPosition.findUnique({ where: { id: positionId } });
        let roleNote = '';
        if (position?.roleId) {
          try {
            const member = await interaction.guild.members.fetch(user.id);
            const res = await safeAddRole({ guild: interaction.guild, member, roleId: position.roleId, guildId, context: `appoint ${position.name}` });
            if (!res.ok) roleNote = ` ⚠️ Role not assigned: ${res.reason}`;
          } catch {
            roleNote = ' ⚠️ Could not fetch member for role assignment.';
          }
        }
        await respond(interaction, { content: `✅ <@${user.id}> appointed (\`${mandate.id.slice(0, 8)}\`).${roleNote}`, flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'end') {
        const mandateId = interaction.options.getString('mandate', true);
        const all = await listActiveMandates(guildId);
        const match = all.find((m) => m.id === mandateId || m.id.startsWith(mandateId));
        if (!match) {
          await respond(interaction, { content: 'Mandate not found.', flags: MessageFlags.Ephemeral });
          return;
        }
        const status = (interaction.options.getString('status') ?? 'EXPIRED') as 'EXPIRED' | 'REMOVED' | 'SUSPENDED';
        await endMandate({ guildId, mandateId: match.id, actorId: interaction.user.id, status });
        const position = await prisma.leadershipPosition.findUnique({ where: { id: match.positionId } });
        if (position?.roleId) {
          try {
            const member = await interaction.guild.members.fetch(match.userId);
            await safeRemoveRole({ guild: interaction.guild, member, roleId: position.roleId, guildId, context: `mandate end ${status}` });
          } catch { /* best-effort */ }
        }
        await respond(interaction, { content: `✅ Mandate ended (${status}).`, flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};

export const probationCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('probation')
    .setDescription('Review probation mandates')
    .addSubcommand((s) =>
      s.setName('decide').setDescription('Approve / fail / extend probation')
        .addStringOption((o) => o.setName('mandate').setDescription('Mandate id').setRequired(true))
        .addStringOption((o) => o.setName('decision').setDescription('Decision').setRequired(true).addChoices(
          { name: 'Approve', value: 'APPROVE' },
          { name: 'Fail', value: 'FAIL' },
          { name: 'Extend 14d', value: 'EXTEND' },
        )),
    ),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    try {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await respond(interaction, { content: 'You do not have permission to do that.', flags: MessageFlags.Ephemeral });
        return;
      }
      const q = interaction.options.getString('mandate', true);
      const decision = interaction.options.getString('decision', true) as 'APPROVE' | 'FAIL' | 'EXTEND';
      const mandates = await prisma.mandate.findMany({ where: { guildId, status: 'PROBATION' }, take: 50 });
      const match = mandates.find((m) => m.id === q || m.id.startsWith(q));
      if (!match) {
        await respond(interaction, { content: 'Probation mandate not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      await decideProbation({ guildId, mandateId: match.id, actorId: interaction.user.id, decision });
      await respond(interaction, { content: `✅ Probation ${decision.toLowerCase()}d.`, flags: MessageFlags.Ephemeral });
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};
