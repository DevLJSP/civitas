import { deferEphemeral, respond } from '../utils/respond.js';
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotCommand } from './_types.js';
import { getGuildConfig, updateGuildConfig } from '../services/guildService.js';
import { createPosition } from '../services/positionService.js';
import { writeAudit } from '../services/auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { ensureGuild, ensureUser } from '../middleware/guild.js';
import { baseEmbed } from '../utils/embeds.js';
import { toUserMessage } from '../utils/errors.js';
import { commandRateOk } from '../middleware/rateLimit.js';

export const setupCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure Civitas for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('View current configuration'),
    )
    .addSubcommand((s) =>
      s
        .setName('channels')
        .setDescription('Set leadership channels')
        .addChannelOption((o) => o.setName('applications').setDescription('Applications channel').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) => o.setName('elections').setDescription('Elections channel').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) => o.setName('announcements').setDescription('Announcements channel').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) => o.setName('audit').setDescription('Audit channel').addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((s) =>
      s
        .setName('defaults')
        .setDescription('Set default mandate / probation / quorum')
        .addIntegerOption((o) => o.setName('mandate_days').setDescription('Default mandate days (1-3650)').setMinValue(1).setMaxValue(3650))
        .addIntegerOption((o) => o.setName('probation_days').setDescription('Default probation days (0-365)').setMinValue(0).setMaxValue(365))
        .addNumberOption((o) => o.setName('quorum').setDescription('Default quorum percent (0-100)').setMinValue(0).setMaxValue(100)),
    )
    .addSubcommand((s) =>
      s
        .setName('managers')
        .setDescription('Set manager role (can manage leadership)')
        .addRoleOption((o) => o.setName('role').setDescription('Manager role').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('quickstart')
        .setDescription('Create your first position quickly')
        .addStringOption((o) =>
          o.setName('preset').setDescription('Template').setRequired(true)
            .addChoices(
              { name: 'Staff (Moderator)', value: 'staff' },
              { name: 'Clan (Captain)', value: 'clan' },
              { name: 'Community (Manager)', value: 'community' },
              { name: 'Custom', value: 'custom' },
            ),
        )
        .addRoleOption((o) => o.setName('role').setDescription('Discord role for the position'))
        .addStringOption((o) => o.setName('name').setDescription('Custom position name (for Custom preset)')),
    ),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await deferEphemeral(interaction);
    if (!commandRateOk(guildId, interaction.user.id, 'setup')) {
      await respond(interaction, { content: 'You are doing that too fast. Please wait a moment.', flags: MessageFlags.Ephemeral });
      return;
    }
    const sub = interaction.options.getSubcommand();
    try {
      await ensureGuild(guildId, interaction.guild?.name ?? null);
      await ensureUser(interaction.user.id, interaction.user.username);

      if (sub === 'view') {
        const config = await getGuildConfig(guildId);
        const embed = baseEmbed({
          title: '🏛️ Civitas configuration',
          description: [
            `Applications: ${config.applicationsChannelId ? `<#${config.applicationsChannelId}>` : '—'}`,
            `Elections: ${config.electionChannelId ? `<#${config.electionChannelId}>` : '—'}`,
            `Announcements: ${config.announcementChannelId ? `<#${config.announcementChannelId}>` : '—'}`,
            `Audit: ${config.auditChannelId ? `<#${config.auditChannelId}>` : '—'}`,
            `Managers: ${config.managerRoleIds.length > 0 ? config.managerRoleIds.map((r) => `<@&${r}>`).join(' ') : '—'}`,
            `Default mandate: ${config.defaultMandateDays}d · probation: ${config.defaultProbationDays}d · quorum: ${config.defaultQuorumPercent}%`,
          ].join('\n'),
        });
        await respond(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'channels') {
        const applications = interaction.options.getChannel('applications')?.id;
        const elections = interaction.options.getChannel('elections')?.id;
        const announcements = interaction.options.getChannel('announcements')?.id;
        const audit = interaction.options.getChannel('audit')?.id;
        await updateGuildConfig(guildId, {
          ...(applications ? { applicationsChannelId: applications } : {}),
          ...(elections ? { electionChannelId: elections } : {}),
          ...(announcements ? { announcementChannelId: announcements } : {}),
          ...(audit ? { auditChannelId: audit } : {}),
        });
        await writeAudit({ guildId, actorId: interaction.user.id, action: AUDIT_ACTIONS.CONFIG_UPDATE, entityType: 'GuildConfig', entityId: guildId, details: { channels: true } });
        await respond(interaction, { content: '✅ Channels updated.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'defaults') {
        const mandate = interaction.options.getInteger('mandate_days') ?? undefined;
        const probation = interaction.options.getInteger('probation_days') ?? undefined;
        const quorum = interaction.options.getNumber('quorum') ?? undefined;
        await updateGuildConfig(guildId, {
          ...(mandate !== undefined ? { defaultMandateDays: mandate } : {}),
          ...(probation !== undefined ? { defaultProbationDays: probation } : {}),
          ...(quorum !== undefined ? { defaultQuorumPercent: quorum } : {}),
        });
        await writeAudit({ guildId, actorId: interaction.user.id, action: AUDIT_ACTIONS.CONFIG_UPDATE, entityType: 'GuildConfig', entityId: guildId, details: { defaults: true } });
        await respond(interaction, { content: '✅ Defaults updated.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'managers') {
        const role = interaction.options.getRole('role', true);
        const current = await getGuildConfig(guildId);
        const ids = [...new Set([...current.managerRoleIds, role.id])].slice(0, 10);
        await updateGuildConfig(guildId, { managerRoleIds: ids });
        await writeAudit({ guildId, actorId: interaction.user.id, action: AUDIT_ACTIONS.CONFIG_UPDATE, entityType: 'GuildConfig', entityId: guildId, details: { managerRole: role.id } });
        await respond(interaction, { content: `✅ <@&${role.id}> can now manage leadership.`, flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'quickstart') {
        const preset = interaction.options.getString('preset', true);
        const role = interaction.options.getRole('role')?.id;
        const customName = interaction.options.getString('name')?.trim();
        const defaults: Record<string, { name: string; description: string }> = {
          staff: { name: 'Moderator', description: 'Keeps the community safe and welcoming.' },
          clan: { name: 'Captain', description: 'Leads the team in matches and practice.' },
          community: { name: 'Community Manager', description: 'Runs events and community programs.' },
          custom: { name: customName || 'Team Leader', description: 'Leads a team.' },
        };
        const tpl = defaults[preset] ?? defaults['custom'] ?? { name: customName || 'Team Leader', description: 'Leads a team.' };
        const config = await getGuildConfig(guildId);
        const position = await createPosition({
          guildId,
          name: tpl.name,
          description: tpl.description,
          roleId: role,
          seats: 3,
          selectionMethod: 'EITHER',
          termLengthDays: config.defaultMandateDays,
          probationDays: config.defaultProbationDays,
          createdBy: interaction.user.id,
        });
        const embed = baseEmbed({
          title: '🎉 Your first position is ready',
          description: `**${position.name}** created.\n\nNext: \`/apply\` to test applications, or \`/election create\` to run your first vote.\nUse \`/civitas\` for the dashboard.`,
        });
        await respond(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};
