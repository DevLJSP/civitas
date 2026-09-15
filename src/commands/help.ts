import {
  ActionRowBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
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

interface HelpTopic {
  key: string;
  label: string;
  emoji: string;
  managerOnly: boolean;
  body: string;
}

const HELP_TOPICS: HelpTopic[] = [
  {
    key: 'start',
    label: 'Start here',
    emoji: '👋',
    managerOnly: false,
    body: [
      '**Civitas** runs your community leadership: positions → applications → elections → mandates → succession.',
      '',
      '• New admin? Run `/tutorial` — first position + test election in minutes.',
      '• Quick setup: `/setup quickstart` · dashboard: `/civitas`',
      '• Members: `/apply` for roles, `/vote` in elections, `/leadership` to see leaders.',
    ].join('\n'),
  },
  {
    key: 'positions',
    label: 'Positions',
    emoji: '🏛️',
    managerOnly: true,
    body: [
      '`/position create` — name, Discord role, seats, term, selection method.',
      '`/position list` · `/position view` · `/position edit` · `/position delete`',
      'Tip: names are unique per server (case-insensitive).',
    ].join('\n'),
  },
  {
    key: 'applications',
    label: 'Applications',
    emoji: '📋',
    managerOnly: false,
    body: [
      '`/apply` — apply for a position (private modal).',
      'Staff: approve/reject from the buttons posted on each application.',
      'Managers configure questions per position (see `/position`).',
    ].join('\n'),
  },
  {
    key: 'elections',
    label: 'Elections & voting',
    emoji: '🗳️',
    managerOnly: false,
    body: [
      '`/vote` — cast a private ballot in an active election.',
      '`/election results` — winners, turnout, quorum.',
      'Managers: `/election create` (majority / approval / ranked) · `nominate` · `start` · `close` · `cancel`.',
      'Winners automatically receive mandates (+ Discord role).',
    ].join('\n'),
  },
  {
    key: 'mandates',
    label: 'Mandates & probation',
    emoji: '📜',
    managerOnly: true,
    body: [
      '`/mandate list` — who holds what. `/mandate appoint` — direct appointment.',
      '`/probation decide` — approve / fail / extend trial periods.',
      '`/resign` — any leader can step down (triggers succession).',
      '`/promote` · `/demote` — structured progression with audit.',
    ].join('\n'),
  },
  {
    key: 'teams',
    label: 'Teams',
    emoji: '👥',
    managerOnly: true,
    body: [
      '`/team create` · `/team list` · `/team add` · `/team remove`.',
      'Team leaders manage only their own team — enforced server-side.',
    ].join('\n'),
  },
  {
    key: 'proposals',
    label: 'Proposals',
    emoji: '📝',
    managerOnly: false,
    body: [
      '`/proposal create` — YES/NO community decisions with quorum.',
      'Vote with the buttons under each proposal. `/proposal list` · `/proposal close`.',
    ].join('\n'),
  },
  {
    key: 'succession',
    label: 'Succession & vacancies',
    emoji: '🔄',
    managerOnly: true,
    body: [
      '`/succession set` — fallback per position (appoint / applications / election / vacancy).',
      '`/succession trigger` · `/vacancy list` · `/vacancy resolve`.',
      'Resignations, removals and expired terms trigger this automatically.',
    ].join('\n'),
  },
  {
    key: 'removal',
    label: 'Removal',
    emoji: '⚖️',
    managerOnly: true,
    body: [
      '`/impeachment open` — admin decision, council vote, or community vote.',
      '`/impeachment list` · `/impeachment decide`. Removal triggers succession.',
    ].join('\n'),
  },
  {
    key: 'history',
    label: 'History & stats',
    emoji: '📊',
    managerOnly: false,
    body: [
      '`/leadership` — current leaders. `/history` — past mandates + events.',
      '`/leaderboard` · `/stats` — turnout, applications, vacancies.',
    ].join('\n'),
  },
];

/** Pure: visible topic keys for a permission level. Unit-testable. */
export function helpTopicKeys(isManager: boolean): string[] {
  return HELP_TOPICS.filter((t) => isManager || !t.managerOnly).map((t) => t.key);
}

/** Pure: resolve a topic, falling back to 'start'. Unit-testable. */
export function resolveHelpTopic(key: string | undefined): HelpTopic {
  const found = HELP_TOPICS.find((t) => t.key === key);
  return found ?? (HELP_TOPICS[0] as HelpTopic);
}

export function buildHelpMessage(
  isManager: boolean,
  topicKey?: string,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<StringSelectMenuBuilder>[] } {
  const topic = resolveHelpTopic(topicKey);
  const visible = HELP_TOPICS.filter((t) => isManager || !t.managerOnly);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildCustomId('help', 'topic', 'select'))
    .setPlaceholder('Choose a topic')
    .addOptions(
      visible.slice(0, 25).map((t) => ({
        label: `${t.emoji} ${t.label}`.slice(0, 100),
        value: t.key,
        description: t.managerOnly ? 'Server managers' : undefined,
      })),
    );
  const note = topic.managerOnly && !isManager
    ? '\n\n⚠️ This section is for server managers — ask an admin for details.'
    : '';
  const embed = baseEmbed({
    title: `${topic.emoji} ${topic.label}`,
    description: `${topic.body}${note}`,
    footer: 'Civitas help · /tutorial for guided setup',
  });
  return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

export async function handleHelpSelect(isManager: boolean, key: string): Promise<ReturnType<typeof buildHelpMessage>> {
  return buildHelpMessage(isManager, key);
}

export const helpCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Civitas command reference')
    .addStringOption((o) =>
      o
        .setName('topic')
        .setDescription('Help topic')
        .addChoices(...HELP_TOPICS.slice(0, 25).map((t) => ({ name: `${t.emoji} ${t.label}`, value: t.key }))),
    ),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, { content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!commandRateOk(guildId, interaction.user.id, 'help')) {
      await respond(interaction, { content: 'You are doing that too fast. Please wait a moment.', flags: MessageFlags.Ephemeral });
      return;
    }
    try {
      await ensureGuild(guildId, interaction.guild?.name ?? null);
      await ensureUser(interaction.user.id, interaction.user.username);
      await deferEphemeral(interaction);
      const isManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
      const topic = interaction.options.getString('topic') ?? undefined;
      const msg = buildHelpMessage(isManager, topic);
      await respond(interaction, { ...msg, flags: MessageFlags.Ephemeral });
    } catch (err) {
      await respond(interaction, { content: toUserMessage(err), flags: MessageFlags.Ephemeral });
    }
  },
};
