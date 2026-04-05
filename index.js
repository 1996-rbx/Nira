// ═══════════════════════════════════════════════════════════════
// NIRA BOT - Multi-purpose Discord Bot
// Main file: index.js
// ═══════════════════════════════════════════════════════════════
const {
  Client, GatewayIntentBits, Partials, Collection,
  SlashCommandBuilder, REST, Routes, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, AttachmentBuilder, ChannelType, AuditLogEvent,
  Events,
} = require('discord.js');
const {
  dbHelpers, Colors, getRequiredXP,
  generateCaptchaCode, generateCaptchaImage,
  checkSpam, containsBadWord, parseDuration, formatDuration,
} = require('./utils');
const { connectToVoice } = require('./voice-keepalive');

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const TOKEN           = process.env.BOT_TOKEN;
const NIRA_GUILD_ID   = process.env.NIRA_GUILD_ID   || '';
const SUPPORTER_ROLE_ID = process.env.SUPPORTER_ROLE_ID || '';
const PREMIUM_ROLE_ID   = process.env.PREMIUM_ROLE_ID   || '';

if (!TOKEN) {
  console.error('❌ BOT_TOKEN is missing in environment variables.');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
  ],
});

client.cooldowns = new Collection();

// ═══════════════════════════════════════════════════════════════
// SLASH COMMANDS DEFINITION
// ═══════════════════════════════════════════════════════════════
const commands = [
  // ── Setup Reaction Roles ──
  new SlashCommandBuilder()
    .setName('setup-reaction')
    .setDescription('Create a reaction-role message')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji to use').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message to display (optional if image is used)'))
    .addChannelOption(o => o.setName('channel').setDescription('Channel where the message will be sent'))
    .addAttachmentOption(o => o.setName('image').setDescription('Image to attach to the message')),

  // ── Setup Captcha ──
  new SlashCommandBuilder()
    .setName('setup-captcha')
    .setDescription('Configure the captcha system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('channel').setDescription('Captcha verification channel').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role granted after successful verification').setRequired(true))
    .addIntegerOption(o => o.setName('attempts').setDescription('Maximum attempts (default: 3)').setMinValue(1).setMaxValue(10)),

// ── Setup Ticket ──
new SlashCommandBuilder()
  .setName('setup-ticket')
  .setDescription('Configure the ticket system')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(o => 
    o.setName('channel')
     .setDescription('Channel where the ticket panel will be sent')
     .setRequired(true)
  )
  .addRoleOption(o => 
    o.setName('staff')
     .setDescription('Staff role for tickets')
     .setRequired(true)
  )
  .addChannelOption(o => 
    o.setName('category')
     .setDescription('Category where ticket channels will be created')
  )
  .addStringOption(o => 
    o.setName('title')
     .setDescription('Panel embed title')
  )
  .addStringOption(o => 
    o.setName('description')
     .setDescription('Panel embed description')
  )
  .addStringOption(o => 
    o.setName('color')
     .setDescription('Panel color (example: #ff0000)')
  )
  .addStringOption(o => 
    o.setName('image')
     .setDescription('Panel image URL')
  )
  .addStringOption(o => 
    o.setName('footer')
     .setDescription('Panel footer text')
  ), // keep trailing comma because this is an array element in `commands`
  
  // ── Moderation ──
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the ban')),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the kick')),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to timeout').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration (example: 10m, 1h, 1d, 7d)').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the timeout')),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove timeout from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to untimeout').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View a user\'s warnings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete').setRequired(true).setMinValue(1).setMaxValue(100)),

  // ── Ticket commands ──
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Open a support ticket')
    .addStringOption(o => o.setName('reason').setDescription('Ticket reason (optional)'))
    .addStringOption(o => o.setName('category').setDescription('Ticket category')
      .addChoices(
        { name: 'Technical Support', value: 'support' },
        { name: 'User Report', value: 'report' },
        { name: 'Billing', value: 'billing' },
        { name: 'Partnership', value: 'partnership' },
        { name: 'Other', value: 'other' },
      )),

  new SlashCommandBuilder()
    .setName('ticket-close')
    .setDescription('Close the current ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('ticket-claim')
    .setDescription('Claim the current ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('ticket-add')
    .setDescription('Add a member to the ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o => o.setName('member').setDescription('Member to add').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ticket-remove')
    .setDescription('Remove a member from the ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o => o.setName('member').setDescription('Member to remove').setRequired(true)),

  // ── Embed command ──
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create and send a custom embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel where the embed will be sent (default: current channel)'))
    .addStringOption(o => o.setName('color').setDescription('Hex color (example: #5865F2, red, green)'))
    .addStringOption(o => o.setName('footer').setDescription('Footer text'))
    .addStringOption(o => o.setName('author').setDescription('Author name'))
    .addStringOption(o => o.setName('author_icon').setDescription('Author icon URL'))
    .addStringOption(o => o.setName('thumbnail').setDescription('Thumbnail URL (top-right corner)'))
    .addStringOption(o => o.setName('image').setDescription('Large image URL (bottom)'))
    .addAttachmentOption(o => o.setName('image_file').setDescription('Upload image directly'))
    .addBooleanOption(o => o.setName('timestamp').setDescription('Show timestamp? (default: no)')),

  // ── Fun & Utils ──
  new SlashCommandBuilder()
    .setName('level')
    .setDescription('View your level and XP')
    .addUserOption(o => o.setName('user').setDescription('View another user\'s level')),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View the server leaderboard'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily reward'),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('View your balance')
    .addUserOption(o => o.setName('user').setDescription('View another user\'s balance')),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration (example: 1h, 1d, 7d)').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Number of winners (default: 1)').setMinValue(1).setMaxValue(20))
    .addChannelOption(o => o.setName('channel').setDescription('Giveaway channel')),

  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll')
    .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(o => o.setName('option1').setDescription('Option 1').setRequired(true))
    .addStringOption(o => o.setName('option2').setDescription('Option 2').setRequired(true))
    .addStringOption(o => o.setName('option3').setDescription('Option 3'))
    .addStringOption(o => o.setName('option4').setDescription('Option 4'))
    .addStringOption(o => o.setName('option5').setDescription('Option 5')),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('View user information')
    .addUserOption(o => o.setName('user').setDescription('User')),

  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('View server information'),

  // ── Configuration ──
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure Nira')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
      .setName('logs')
      .setDescription('Set the logs channel')
      .addChannelOption(o => o.setName('channel').setDescription('Logs channel').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('automod')
      .setDescription('Enable/disable auto-moderation')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('antiraid')
      .setDescription('Enable/disable anti-raid')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('leveling')
      .setDescription('Enable/disable leveling')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('prefix')
      .setDescription('Change the prefix')
      .addStringOption(o => o.setName('prefix').setDescription('New prefix').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('language')
      .setDescription('Change language')
      .addStringOption(o => o.setName('language').setDescription('Language (fr/en)').setRequired(true)
        .addChoices({ name: 'French', value: 'fr' }, { name: 'English', value: 'en' }))),

  new SlashCommandBuilder()
    .setName('module')
    .setDescription('Enable/disable a module')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('name').setDescription('Module name').setRequired(true)
      .addChoices(
        { name: 'Leveling',        value: 'leveling' },
        { name: 'Economy',         value: 'economy'  },
        { name: 'Auto-moderation', value: 'automod'  },
        { name: 'Anti-raid',       value: 'antiraid' },
        { name: 'Fun',             value: 'fun'      },
        { name: 'Logs',            value: 'logs'     },
      ))
    .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true)),

  // ── System Management Commands ──
  new SlashCommandBuilder()
    .setName('captcha')
    .setDescription('View and manage the captcha system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('reaction-roles')
    .setDescription('View and manage reaction roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('automod')
    .setDescription('View and manage auto-moderation')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('antiraid')
    .setDescription('View and manage anti-raid')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('leveling')
    .setDescription('View and manage leveling')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('economy')
    .setDescription('View and manage economy')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── Help ──
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('View available commands'),

  // ── Statistics ──
  new SlashCommandBuilder()
    .setName('statistics')
    .setDescription('View member statistics (messages and voice time)')
    .addUserOption(o => o.setName('member').setDescription('Member to inspect')),

].map(cmd => cmd.toJSON());

// ═══════════════════════════════════════════════════════════════
// REGISTER COMMANDS
// ═══════════════════════════════════════════════════════════════
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('📡 Registering slash commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Commands registered successfully!');
  } catch (error) {
    console.error('❌ Error while registering commands:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// LOGGING HELPER
// ═══════════════════════════════════════════════════════════════
async function sendLog(guild, embed) {
  const config = dbHelpers.getGuild(guild.id);
  if (!config.log_channel) return;
  if (!dbHelpers.isModuleEnabled(guild.id, 'logs')) return;
  try {
    const channel = await guild.channels.fetch(config.log_channel);
    if (channel) await channel.send({ embeds: [embed] });
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════
// TICKET HELPERS
// ═══════════════════════════════════════════════════════════════
const TICKET_CATEGORIES = [
  { id: 'support', emoji: '🛠️', label: 'Technical Support', description: 'Issues with features, setup, or errors.' },
  { id: 'report', emoji: '🚨', label: 'User Report', description: 'Report a member or problematic behavior.' },
  { id: 'billing', emoji: '💳', label: 'Billing', description: 'Questions about payments or subscriptions.' },
  { id: 'partnership', emoji: '🤝', label: 'Partnership', description: 'Business, creators, or collaboration requests.' },
  { id: 'other', emoji: '📩', label: 'Other', description: 'Anything else that does not fit above.' },
];

function getTicketCategory(categoryId) {
  return TICKET_CATEGORIES.find(c => c.id === categoryId) || TICKET_CATEGORIES[0];
}

function canManageTicket(member, config, ticketAuthorId = null) {
  const isTicketAuthor = ticketAuthorId ? ticketAuthorId === member.id : false;
  const isStaff = !!config.ticket_staff_role && member.roles.cache.has(config.ticket_staff_role);
  return isTicketAuthor || isStaff || member.permissions.has(PermissionFlagsBits.ManageChannels);
}

function buildTicketCreateModal(categoryId = 'support', presetReason = '') {
  const category = getTicketCategory(categoryId);
  const modal = new ModalBuilder()
    .setCustomId(`ticket_create_modal:${category.id}`)
    .setTitle(`${category.emoji} Open a Ticket`);

  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('ticket_reason_input')
      .setLabel('Describe your request')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Tell us what happened and what you need from the team...')
      .setRequired(false)
      .setMaxLength(500)
      .setValue((presetReason || '').slice(0, 500)),
  ));

  return modal;
}

function buildTicketCategoryMenu() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_category_select')
    .setPlaceholder('Choose a ticket category...')
    .addOptions(TICKET_CATEGORIES.map(cat => ({
      label: cat.label,
      description: cat.description,
      value: cat.id,
      emoji: cat.emoji,
    })));

  const rows = [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_category_quick_support')
        .setLabel('Quick Open (Support)')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚡'),
    ),
  ];

  return rows;
}

async function createTicketChannel(guild, member, config, reason, categoryId = 'support') {
  const count  = dbHelpers.getTicketCount(guild.id) + 1;
  const padded = String(count).padStart(4, '0');
  const category = getTicketCategory(categoryId);

  const permOverwrites = [
    { id: guild.id,                 deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id,                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: config.ticket_staff_role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles] },
    { id: guild.members.me.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
  ];

  const channelOptions = {
    name: `${category.emoji}・ticket-${padded}`,
    type: ChannelType.GuildText,
    topic: `Ticket #${padded} | ${category.label} | ${member.user.tag} | ${reason || 'No reason provided'}`,
    permissionOverwrites: permOverwrites,
  };
  if (config.ticket_category) channelOptions.parent = config.ticket_category;

  const ticketChannel = await guild.channels.create(channelOptions);
  dbHelpers.createTicket(guild.id, ticketChannel.id, member.id, count, reason || null);

  const embed = new EmbedBuilder()
    .setTitle(`${category.emoji} Ticket #${padded}`)
    .setDescription(
      `Welcome ${member}.\n\n` +
      `> A staff member will reply shortly.\n` +
      `> Please include as many details as possible.\n` +
      (reason ? `\n**Reason:** ${reason}` : '')
    )
    .addFields(
      { name: 'Category', value: category.label, inline: true },
      { name: 'Author', value: `${member}`, inline: true },
      { name: 'Ticket', value: `#${padded}`, inline: true },
    )
    .setColor(Colors.PRIMARY)
    .setFooter({ text: `Opened by ${member.user.tag}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim_btn')
      .setLabel('Claim')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✋'),
    new ButtonBuilder()
      .setCustomId('ticket_add_member_btn')
      .setLabel('Add Member')
      .setStyle(ButtonStyle.Success)
      .setEmoji('➕'),
    new ButtonBuilder()
      .setCustomId('ticket_close_btn')
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
  );

  await ticketChannel.send({
    content: `${member} <@&${config.ticket_staff_role}>`,
    embeds: [embed],
    components: [row],
  });

  return { channel: ticketChannel, number: padded, category };
}

// ═══════════════════════════════════════════════════════════════
// EMBED COLOR PARSER
// ═══════════════════════════════════════════════════════════════
function parseColor(colorStr) {
  if (!colorStr) return Colors.PRIMARY;
  const namedColors = {
    red: 0xED4245, green: 0x57F287, blue: 0x5865F2, yellow: 0xFEE75C,
    orange: 0xFFA500, purple: 0x9B59B6, pink: 0xE91E63, white: 0xFFFFFF,
    black: 0x000000, grey: 0x95A5A6, gray: 0x95A5A6, gold: 0xF1C40F,
    teal: 0x1ABC9C, cyan: 0x00D8FF, navy: 0x2C3E50,
  };
  const lower = colorStr.toLowerCase().trim();
  if (namedColors[lower]) return namedColors[lower];
  const hex = colorStr.replace('#', '');
  const parsed = parseInt(hex, 16);
  return isNaN(parsed) ? Colors.PRIMARY : parsed;
}

// ═══════════════════════════════════════════════════════════════
// ANTI-RAID TRACKER
// ═══════════════════════════════════════════════════════════════
const joinTracker = new Map();
function checkRaid(guildId) {
  const now = Date.now();
  if (!joinTracker.has(guildId)) joinTracker.set(guildId, []);
  const joins = joinTracker.get(guildId);
  joins.push(now);
  const recent = joins.filter(t => now - t < 10000);
  joinTracker.set(guildId, recent);
  return recent.length >= 5;
}

// ═══════════════════════════════════════════════════════════════
// READY EVENT
// ═══════════════════════════════════════════════════════════════
client.once(Events.ClientReady, async () => {
  console.log(`\n✨ ${client.user.tag} is online!`);
  console.log(`📊 ${client.guilds.cache.size} server(s)`);
  console.log(`👤 ${client.users.cache.size} user(s)\n`);

  client.user.setPresence({
    activities: [{ name: '/help | nira.bot', type: 3 }],
    status: 'online',
  });

  await registerCommands();
  connectToVoice(client);

  setInterval(async () => {
    const giveaways = dbHelpers.getActiveGiveaways();
    for (const gw of giveaways) {
      try {
        const guild   = await client.guilds.fetch(gw.guild_id);
        const channel = await guild.channels.fetch(gw.channel_id);
        const entries = dbHelpers.getGiveawayEntries(gw.id);
        const pool    = [...entries];
        const winners = [];
        for (let i = 0; i < Math.min(gw.winner_count, pool.length); i++) {
          const idx = Math.floor(Math.random() * pool.length);
          winners.push(pool.splice(idx, 1)[0].user_id);
        }
        const winnerMentions = winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'No participants';
        await channel.send({ embeds: [new EmbedBuilder().setTitle('🎉 Giveaway termine!').setDescription(`**Prix:** ${gw.prize}\n**Gagnant(s):** ${winnerMentions}`).setColor(Colors.SUCCESS).setTimestamp()] });
        if (gw.message_id) {
          try {
            const msg = await channel.messages.fetch(gw.message_id);
            await msg.edit({ embeds: [new EmbedBuilder().setTitle('🎉 Giveaway termine!').setDescription(`**Prix:** ${gw.prize}\n**Gagnant(s):** ${winnerMentions}`).setColor(Colors.ERROR).setFooter({ text: 'Giveaway termine' }).setTimestamp()], components: [] });
          } catch (_) {}
        }
        dbHelpers.endGiveaway(gw.id);
      } catch (_) { dbHelpers.endGiveaway(gw.id); }
    }

    const mutes = dbHelpers.getExpiredMutes();
    for (const mute of mutes) {
      try {
        const guild  = await client.guilds.fetch(mute.guild_id);
        const member = await guild.members.fetch(mute.user_id);
        await member.timeout(null, 'Timeout duration expired');
        dbHelpers.removeMute(mute.guild_id, mute.user_id);
      } catch (_) { dbHelpers.removeMute(mute.guild_id, mute.user_id); }
    }
  }, 15000);
});

// ═══════════════════════════════════════════════════════════════
// INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('giveaway_')) {
      const giveawayId = parseInt(interaction.customId.split('_')[1], 10);
      dbHelpers.enterGiveaway(giveawayId, interaction.user.id);
      return interaction.reply({ content: '🎉 You entered the giveaway.', ephemeral: true });
    }

    if (interaction.customId === 'ticket_open') {
      const config = dbHelpers.getGuild(interaction.guild.id);
      if (!config.ticket_staff_role) {
        return interaction.reply({ content: '❌ The ticket system is not configured yet.', ephemeral: true });
      }

      const existing = dbHelpers.getOpenTickets(interaction.guild.id).find(t => t.user_id === interaction.user.id);
      if (existing) {
        return interaction.reply({ content: `❌ You already have an open ticket: <#${existing.channel_id}>`, ephemeral: true });
      }

      return interaction.reply({
        content: 'Select a category to open your ticket.',
        components: buildTicketCategoryMenu(),
        ephemeral: true,
      });
    }

    if (interaction.customId === 'ticket_category_quick_support') {
      return interaction.showModal(buildTicketCreateModal('support'));
    }

    if (interaction.customId === 'ticket_close_btn') {
      const ticket = dbHelpers.getTicketByChannel(interaction.channel.id);
      if (!ticket) {
        return interaction.reply({ content: '❌ This channel is not an active ticket.', ephemeral: true });
      }

      const config = dbHelpers.getGuild(interaction.guild.id);
      if (!canManageTicket(interaction.member, config, ticket.user_id)) {
        return interaction.reply({ content: '❌ You are not allowed to close this ticket.', ephemeral: true });
      }

      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription('🔒 Ticket closed. Channel will be deleted in 5 seconds...').setColor(Colors.ERROR)],
      });
      dbHelpers.closeTicket(interaction.channel.id);

      await sendLog(interaction.guild, new EmbedBuilder()
        .setTitle('🎫 Ticket Closed')
        .addFields(
          { name: 'Channel', value: interaction.channel.name, inline: true },
          { name: 'Closed by', value: interaction.user.tag, inline: true },
          { name: 'Author', value: `<@${ticket.user_id}>`, inline: true },
        )
        .setColor(Colors.WARNING)
        .setTimestamp());

      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }

    if (interaction.customId === 'ticket_claim_btn') {
      const ticket = dbHelpers.getTicketByChannel(interaction.channel.id);
      if (!ticket) {
        return interaction.reply({ content: '❌ This channel is not an active ticket.', ephemeral: true });
      }

      const config = dbHelpers.getGuild(interaction.guild.id);
      const canClaim = canManageTicket(interaction.member, config);
      if (!canClaim) {
        return interaction.reply({ content: '❌ Only staff can claim tickets.', ephemeral: true });
      }

      if (ticket.claimed_by) {
        return interaction.reply({ content: `❌ This ticket is already claimed by <@${ticket.claimed_by}>.`, ephemeral: true });
      }

      dbHelpers.claimTicket(interaction.channel.id, interaction.user.id);
      return interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`✅ ${interaction.user} claimed this ticket.`).setColor(Colors.SUCCESS)],
      });
    }

    if (interaction.customId === 'ticket_add_member_btn') {
      const ticket = dbHelpers.getTicketByChannel(interaction.channel.id);
      if (!ticket) {
        return interaction.reply({ content: '❌ This channel is not an active ticket.', ephemeral: true });
      }

      const config = dbHelpers.getGuild(interaction.guild.id);
      if (!canManageTicket(interaction.member, config)) {
        return interaction.reply({ content: '❌ Only staff can add members to a ticket.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('ticket_add_member_modal')
        .setTitle('Add a Member to Ticket');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_member_input')
          .setLabel('User ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Example: 123456789012345678')
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(19),
      ));
      return interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('sys_toggle_')) {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ You do not have permission for this action.', ephemeral: true });
      }

      const system = interaction.customId.replace('sys_toggle_', '');
      const guildId = interaction.guild.id;

      if (system === 'captcha') {
        const config = dbHelpers.getGuild(guildId);
        const newState = config.captcha_enabled ? 0 : 1;
        dbHelpers.updateGuild(guildId, { captcha_enabled: newState });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Captcha ${newState ? 'enabled' : 'disabled'}.`).setColor(newState ? Colors.SUCCESS : Colors.ERROR)], ephemeral: true });
      }

      if (system === 'automod') {
        const config = dbHelpers.getGuild(guildId);
        const wasEnabled = !!config.automod_enabled && dbHelpers.isModuleEnabled(guildId, 'automod');
        dbHelpers.updateGuild(guildId, { automod_enabled: wasEnabled ? 0 : 1 });
        dbHelpers.setModule(guildId, 'automod', !wasEnabled);
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Auto-moderation ${wasEnabled ? 'disabled' : 'enabled'}.`).setColor(!wasEnabled ? Colors.SUCCESS : Colors.ERROR)], ephemeral: true });
      }

      if (system === 'antiraid') {
        const config = dbHelpers.getGuild(guildId);
        const newState = config.antiraid_enabled ? 0 : 1;
        dbHelpers.updateGuild(guildId, { antiraid_enabled: newState });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Anti-raid ${newState ? 'enabled' : 'disabled'}.`).setColor(newState ? Colors.SUCCESS : Colors.ERROR)], ephemeral: true });
      }

      if (system === 'leveling') {
        const isEnabled = dbHelpers.isModuleEnabled(guildId, 'leveling');
        dbHelpers.setModule(guildId, 'leveling', !isEnabled);
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Leveling ${isEnabled ? 'disabled' : 'enabled'}.`).setColor(!isEnabled ? Colors.SUCCESS : Colors.ERROR)], ephemeral: true });
      }

      if (system === 'economy') {
        const isEnabled = dbHelpers.isModuleEnabled(guildId, 'economy');
        dbHelpers.setModule(guildId, 'economy', !isEnabled);
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Economy ${isEnabled ? 'disabled' : 'enabled'}.`).setColor(!isEnabled ? Colors.SUCCESS : Colors.ERROR)], ephemeral: true });
      }

      return;
    }

    if (interaction.customId.startsWith('sys_test_')) {
      const system = interaction.customId.replace('sys_test_', '');
      if (system === 'captcha') {
        const code = generateCaptchaCode();
        const imageBuffer = generateCaptchaImage(code);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'captcha_test.png' });
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🧪 Captcha Preview')
              .setDescription(`Test code: \`${code}\``)
              .setImage('attachment://captcha_test.png')
              .setColor(Colors.INFO)
              .setFooter({ text: 'Test only' }),
          ],
          files: [attachment],
          ephemeral: true,
        });
      }
      if (system === 'noop') {
        return interaction.reply({ content: '🧪 Test button clicked.', ephemeral: true });
      }
      return interaction.reply({ content: `🧪 **${system}** test completed (no state change).`, ephemeral: true });
    }

    if (interaction.customId.startsWith('captcha_verify_')) {
      const targetUserId = interaction.customId.split('_')[2];
      if (interaction.user.id !== targetUserId) {
        return interaction.reply({ content: '❌ This captcha is not assigned to you.', ephemeral: true });
      }
      const modal = new ModalBuilder()
        .setCustomId(`captcha_modal_${interaction.user.id}`)
        .setTitle('🔐 Captcha Verification');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('captcha_code')
          .setLabel('Enter the code shown in the image')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Example: A7kP2')
          .setRequired(true)
          .setMinLength(5)
          .setMaxLength(5),
      ));
      return interaction.showModal(modal);
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_category_select') {
      const config = dbHelpers.getGuild(interaction.guild.id);
      if (!config.ticket_staff_role) {
        return interaction.reply({ content: '❌ The ticket system is not configured yet.', ephemeral: true });
      }
      const existing = dbHelpers.getOpenTickets(interaction.guild.id).find(t => t.user_id === interaction.user.id);
      if (existing) {
        return interaction.reply({ content: `❌ You already have an open ticket: <#${existing.channel_id}>`, ephemeral: true });
      }
      const selectedCategory = interaction.values[0] || 'support';
      return interaction.showModal(buildTicketCreateModal(selectedCategory));
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('captcha_modal_')) {
      const inputCode = interaction.fields.getTextInputValue('captcha_code');
      const pending = dbHelpers.getCaptcha(interaction.guild.id, interaction.user.id);
      if (!pending) {
        return interaction.reply({ content: '❌ No pending captcha was found.', ephemeral: true });
      }

      const config = dbHelpers.getGuild(interaction.guild.id);
      if (inputCode === pending.code) {
        dbHelpers.removeCaptcha(interaction.guild.id, interaction.user.id);
        try {
          const role = interaction.guild.roles.cache.get(config.captcha_role);
          if (role) {
            const guildMember = await interaction.guild.members.fetch(interaction.user.id);
            await guildMember.roles.add(role);
          }
        } catch (_) {}
        return interaction.reply({
          embeds: [new EmbedBuilder().setTitle('✅ Verification successful').setDescription(`Welcome to **${interaction.guild.name}**.`).setColor(Colors.SUCCESS)],
          ephemeral: true,
        });
      }

      dbHelpers.incrementCaptchaAttempt(interaction.guild.id, interaction.user.id);
      const updated = dbHelpers.getCaptcha(interaction.guild.id, interaction.user.id);
      if (updated.attempts >= config.captcha_retry_limit) {
        dbHelpers.removeCaptcha(interaction.guild.id, interaction.user.id);
        try {
          const guildMember = await interaction.guild.members.fetch(interaction.user.id);
          await guildMember.kick('Captcha failed');
        } catch (_) {}
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription('❌ Too many failed attempts. You were kicked.').setColor(Colors.ERROR)], ephemeral: true });
      }

      const newCode = generateCaptchaCode();
      const newImage = generateCaptchaImage(newCode);
      dbHelpers.setCaptcha(interaction.guild.id, interaction.user.id, newCode);
      const attachment = new AttachmentBuilder(newImage, { name: 'captcha.png' });
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Invalid code').setDescription(`Remaining attempts: **${config.captcha_retry_limit - updated.attempts}**`).setImage('attachment://captcha.png').setColor(Colors.ERROR)],
        files: [attachment],
        ephemeral: true,
      });
    }

    if (interaction.customId === 'ticket_add_member_modal') {
      const ticket = dbHelpers.getTicketByChannel(interaction.channel.id);
      if (!ticket) {
        return interaction.reply({ content: '❌ This channel is not an active ticket.', ephemeral: true });
      }
      const config = dbHelpers.getGuild(interaction.guild.id);
      if (!canManageTicket(interaction.member, config)) {
        return interaction.reply({ content: '❌ You are not allowed to add members.', ephemeral: true });
      }

      const memberId = interaction.fields.getTextInputValue('ticket_member_input').trim();
      let targetMember;
      try {
        targetMember = await interaction.guild.members.fetch(memberId);
      } catch (_) {
        return interaction.reply({ content: '❌ Member not found in this server.', ephemeral: true });
      }

      await interaction.channel.permissionOverwrites.edit(targetMember.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      return interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`✅ ${targetMember} was added to this ticket.`).setColor(Colors.SUCCESS)],
      });
    }

    if (interaction.customId.startsWith('ticket_create_modal')) {
      const categoryId = interaction.customId.split(':')[1] || 'support';
      const reason = interaction.fields.getTextInputValue('ticket_reason_input') || null;
      const config = dbHelpers.getGuild(interaction.guild.id);
      if (!config.ticket_staff_role) {
        return interaction.reply({ content: '❌ Tickets are not configured. Use `/setup-ticket` first.', ephemeral: true });
      }

      const existing = dbHelpers.getOpenTickets(interaction.guild.id).find(t => t.user_id === interaction.user.id);
      if (existing) {
        return interaction.reply({ content: `❌ You already have an open ticket: <#${existing.channel_id}>`, ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      try {
        const guildMember = await interaction.guild.members.fetch(interaction.user.id);
        const { channel: ticketChannel, number } = await createTicketChannel(interaction.guild, guildMember, config, reason, categoryId);
        return interaction.editReply({ content: `✅ Your ticket was created: ${ticketChannel} (#${number})` });
      } catch (error) {
        console.error('❌ Ticket creation error:', error);
        return interaction.editReply({ content: '❌ Unable to create the ticket. Please check my channel and role permissions.' });
      }
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member, user, options, channel } = interaction;

  try {

    // ── /setup-reaction ──
    if (commandName === 'setup-reaction') {
      const role          = options.getRole('role');
      const emoji         = options.getString('emoji');
      const messageText   = options.getString('message');
      const targetChannel = options.getChannel('channel') || channel;
      const image         = options.getAttachment('image');
      if (!messageText && !image) return interaction.reply({ content: '❌ Provide at least a **message** or an **image**.', ephemeral: true });
      const sendOpts = {};
      if (messageText) sendOpts.content = messageText;
      if (image) sendOpts.files = [{ attachment: image.url, name: image.name }];
      const sent          = await targetChannel.send(sendOpts);
      const reactionResult = await sent.react(emoji);
      const resolvedEmoji  = reactionResult.emoji.id ? `${reactionResult.emoji.name}:${reactionResult.emoji.id}` : reactionResult.emoji.name;
      dbHelpers.addReactionRole(guild.id, targetChannel.id, sent.id, resolvedEmoji, role.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Reaction Role Configured').setDescription(`**Channel:** ${targetChannel}\n**Emoji:** ${emoji}\n**Role:** ${role}`).setColor(Colors.SUCCESS).setTimestamp()], ephemeral: true });
    }

    // ── /setup-captcha ──
    if (commandName === 'setup-captcha') {
      const captchaChannel = options.getChannel('channel');
      const captchaRole    = options.getRole('role');
      const retryLimit     = options.getInteger('attempts') || 3;
      dbHelpers.getGuild(guild.id);
      dbHelpers.updateGuild(guild.id, { captcha_enabled: 1, captcha_channel: captchaChannel.id, captcha_role: captchaRole.id, captcha_retry_limit: retryLimit });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔐 Captcha Configured').setDescription(`**Channel:** ${captchaChannel}\n**Role:** ${captchaRole}\n**Attempts:** ${retryLimit}\n**Auto kick:** 10 min`).setColor(Colors.SUCCESS).setTimestamp()], ephemeral: true });
    }

// ══════════════════════════════════════════════════
// ── /setup-ticket ──
// ══════════════════════════════════════════════════
if (commandName === 'setup-ticket') {

  const panelChannel   = options.getChannel('channel');
  const staffRole      = options.getRole('staff');
  const ticketCategory = options.getChannel('category');

  // 🎨 Custom options
  const titre       = options.getString('title') || `🎫 Support — ${guild.name}`;
  const description = options.getString('description') 
    || 'Click the button below to open a ticket.\nA staff member will reply shortly.';
  const couleur     = options.getString('color') || '#5865F2';
  const image       = options.getString('image');
  const footer      = options.getString('footer') || `${guild.name} · Support Center`;

  // 💾 Save config
  dbHelpers.getGuild(guild.id);
  dbHelpers.updateGuild(guild.id, {
    ticket_channel:    panelChannel.id,
    ticket_staff_role: staffRole.id,
    ticket_category:   ticketCategory?.id || null,
  });

  // 🧱 Build custom panel embed
  const panelEmbed = new EmbedBuilder()
    .setTitle(titre)
    .setDescription(description)
    .setColor(couleur)
    .setFooter({ text: footer })
    .setTimestamp();

  if (image) panelEmbed.setImage(image);

  // 🔘 Open ticket button
  const openBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_open')
      .setLabel('Open a Ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫'),
  );

  // 📤 Send panel
  await panelChannel.send({
    embeds: [panelEmbed],
    components: [openBtn]
  });

  // ✅ Confirmation
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('✅ Ticket System Configured')
        .addFields(
          { name: 'Panel Channel', value: `${panelChannel}`, inline: true },
          { name: 'Staff Role', value: `${staffRole}`, inline: true },
          { name: 'Category', value: ticketCategory ? `${ticketCategory}` : 'Root', inline: true },
          { name: 'Title', value: titre, inline: false },
          { name: 'Color', value: couleur, inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp()
    ],
    ephemeral: true,
  });
}
    // ── /ticket ──
    if (commandName === 'ticket') {
      const config = dbHelpers.getGuild(guild.id);
      if (!config.ticket_staff_role) return interaction.reply({ content: '❌ Tickets are not configured. Use `/setup-ticket`.', ephemeral: true });
      const existing = dbHelpers.getOpenTickets(guild.id).find(t => t.user_id === user.id);
      if (existing) return interaction.reply({ content: `❌ You already have an open ticket: <#${existing.channel_id}>`, ephemeral: true });
      const reason = options.getString('reason');
      const category = options.getString('category') || 'support';
      return interaction.showModal(buildTicketCreateModal(category, reason || ''));
    }

    // ── /ticket-close ──
    if (commandName === 'ticket-close') {
      const ticket = dbHelpers.getTicketByChannel(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ This channel is not an active ticket.', ephemeral: true });
      const config = dbHelpers.getGuild(guild.id);
      if (!canManageTicket(member, config, ticket.user_id)) {
        return interaction.reply({ content: '❌ You are not allowed to close this ticket.', ephemeral: true });
      }
      await interaction.reply({ embeds: [new EmbedBuilder().setDescription('🔒 Ticket closed. Deleting in 5 seconds...').setColor(Colors.ERROR)] });
      dbHelpers.closeTicket(channel.id);
      await sendLog(guild, new EmbedBuilder().setTitle('🎫 Ticket Closed').addFields({ name: 'Channel', value: channel.name, inline: true }, { name: 'Closed by', value: user.tag, inline: true }).setColor(Colors.WARNING).setTimestamp());
      setTimeout(() => channel.delete().catch(() => {}), 5000);
      return;
    }

    // ── /ticket-claim ──
    if (commandName === 'ticket-claim') {
      const ticket = dbHelpers.getTicketByChannel(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ This channel is not an active ticket.', ephemeral: true });
      const config = dbHelpers.getGuild(guild.id);
      if (!canManageTicket(member, config)) {
        return interaction.reply({ content: '❌ Only staff can claim tickets.', ephemeral: true });
      }
      if (ticket.claimed_by) return interaction.reply({ content: `❌ This ticket is already claimed by <@${ticket.claimed_by}>.`, ephemeral: true });
      dbHelpers.claimTicket(channel.id, user.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${user} claimed this ticket.`).setColor(Colors.SUCCESS)] });
    }

    // ── /ticket-add ──
    if (commandName === 'ticket-add') {
      const ticket = dbHelpers.getTicketByChannel(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ This channel is not an active ticket.', ephemeral: true });
      const config = dbHelpers.getGuild(guild.id);
      if (!canManageTicket(member, config)) {
        return interaction.reply({ content: '❌ Only staff can add members.', ephemeral: true });
      }
      const targetMember = options.getMember('member');
      if (!targetMember) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });
      await channel.permissionOverwrites.edit(targetMember.id, {
        ViewChannel:      true,
        SendMessages:     true,
        ReadMessageHistory: true,
      });
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${targetMember} was added to the ticket.`).setColor(Colors.SUCCESS)] });
    }

    // ── /ticket-remove ──
    if (commandName === 'ticket-remove') {
      const ticket = dbHelpers.getTicketByChannel(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ This channel is not an active ticket.', ephemeral: true });
      const config = dbHelpers.getGuild(guild.id);
      if (!canManageTicket(member, config)) {
        return interaction.reply({ content: '❌ Only staff can remove members.', ephemeral: true });
      }
      const targetMember = options.getMember('member');
      if (!targetMember) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });
      if (targetMember.id === ticket.user_id) return interaction.reply({ content: '❌ You cannot remove the ticket author.', ephemeral: true });
      await channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: false });
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${targetMember} was removed from the ticket.`).setColor(Colors.SUCCESS)] });
    }

    // ══════════════════════════════════════════════════
    // ── /embed ──
    // ══════════════════════════════════════════════════
    if (commandName === 'embed') {
      const titre        = options.getString('title');
      const description  = options.getString('description');
      const targetChannel = options.getChannel('channel') || channel;
      const couleur      = options.getString('color');
      const footer       = options.getString('footer');
      const author       = options.getString('author');
      const authorIcon   = options.getString('author_icon');
      const thumbnail    = options.getString('thumbnail');
      const imageUrl     = options.getString('image');
      const fichierImage = options.getAttachment('image_file');
      const showTimestamp = options.getBoolean('timestamp') ?? false;

      // Build the embed
      const embed = new EmbedBuilder()
        .setTitle(titre)
        .setDescription(description.replace(/\\n/g, '\n')) // support literal \n in command input
        .setColor(parseColor(couleur));

      if (footer)    embed.setFooter({ text: footer });
      if (author)    embed.setAuthor({ name: author, iconURL: authorIcon || undefined });
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (showTimestamp) embed.setTimestamp();

      // Image priority: uploaded file first, then URL
      const sendOpts = { embeds: [embed] };
      if (fichierImage) {
        embed.setImage(`attachment://${fichierImage.name}`);
        sendOpts.files = [{ attachment: fichierImage.url, name: fichierImage.name }];
      } else if (imageUrl) {
        embed.setImage(imageUrl);
      }

      try {
        await targetChannel.send(sendOpts);
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`✅ Embed sent to ${targetChannel}.`)
            .setColor(Colors.SUCCESS)],
          ephemeral: true,
        });
      } catch (err) {
        return interaction.reply({ content: `❌ Failed to send embed: ${err.message}`, ephemeral: true });
      }
    }

    // ── /ban ──
    if (commandName === 'ban') {
      const target = options.getMember('user');
      const reason = options.getString('reason') || 'No reason provided';
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: '❌ I cannot ban this user.', ephemeral: true });
      if (member.roles.highest.position <= target.roles.highest.position) return interaction.reply({ content: '❌ Insufficient role hierarchy.', ephemeral: true });
      await target.ban({ reason: `${user.tag}: ${reason}` });
      dbHelpers.addModLog(guild.id, 'BAN', target.id, user.id, reason);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔨 Member Banned').setDescription(`**User:** ${target.user.tag}\n**Moderator:** ${user.tag}\n**Reason:** ${reason}`).setColor(Colors.ERROR).setTimestamp()] });
      await sendLog(guild, new EmbedBuilder().setTitle('📋 Ban').addFields({ name: 'User', value: `${target.user.tag} (${target.id})`, inline: true }, { name: 'Moderator', value: user.tag, inline: true }, { name: 'Reason', value: reason }).setColor(Colors.ERROR).setTimestamp());
    }

    // ── /kick ──
    if (commandName === 'kick') {
      const target = options.getMember('user');
      const reason = options.getString('reason') || 'No reason provided';
      if (!target || !target.kickable) return interaction.reply({ content: '❌ Unable to kick this user.', ephemeral: true });
      if (member.roles.highest.position <= target.roles.highest.position) return interaction.reply({ content: '❌ Insufficient role hierarchy.', ephemeral: true });
      await target.kick(`${user.tag}: ${reason}`);
      dbHelpers.addModLog(guild.id, 'KICK', target.id, user.id, reason);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('👢 Member Kicked').setDescription(`**User:** ${target.user.tag}\n**Moderator:** ${user.tag}\n**Reason:** ${reason}`).setColor(Colors.WARNING).setTimestamp()] });
    }

    // ── /mute ──
    if (commandName === 'mute') {
      const target      = options.getMember('user');
      const durationStr = options.getString('duration');
      const reason      = options.getString('reason') || 'No reason provided';
      if (!target || !target.moderatable) return interaction.reply({ content: '❌ Unable to timeout this user.', ephemeral: true });
      const duration = parseDuration(durationStr);
      if (!duration) return interaction.reply({ content: '❌ Invalid duration. Example: `10m`, `1h`, `1d`', ephemeral: true });
      if (duration > 28 * 86400000) return interaction.reply({ content: '❌ Maximum duration is 28 days.', ephemeral: true });
      await target.timeout(duration, `${user.tag}: ${reason}`);
      dbHelpers.addMute(guild.id, target.id, new Date(Date.now() + duration).toISOString());
      dbHelpers.addModLog(guild.id, 'MUTE', target.id, user.id, `${reason} (${formatDuration(duration)})`);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔇 Member Timed Out').setDescription(`**User:** ${target.user.tag}\n**Duration:** ${formatDuration(duration)}\n**Reason:** ${reason}`).setColor(Colors.MODERATION).setTimestamp()] });
    }

    // ── /unmute ──
    if (commandName === 'unmute') {
      const target = options.getMember('user');
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      await target.timeout(null);
      dbHelpers.removeMute(guild.id, target.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔊 Timeout Removed').setDescription(`**User:** ${target.user.tag}`).setColor(Colors.SUCCESS).setTimestamp()] });
    }

    // ── /warn ──
    if (commandName === 'warn') {
      const target = options.getMember('user');
      const reason = options.getString('reason');
      if (!target || target.user.bot) return interaction.reply({ content: '❌ Invalid user.', ephemeral: true });
      const warnCount = dbHelpers.addWarning(guild.id, target.id, user.id, reason);
      dbHelpers.addModLog(guild.id, 'WARN', target.id, user.id, reason);
      let desc = `**User:** ${target.user.tag}\n**Moderator:** ${user.tag}\n**Reason:** ${reason}\n**Total:** ${warnCount}`;
      if (warnCount >= 5 && target.bannable) {
        await target.ban({ reason: '5 warnings' });
        desc += '\n\n🔨 **Automatic ban** (5 warnings)';
      } else if (warnCount >= 3 && target.moderatable) {
        await target.timeout(3600000, '3 warnings');
        desc += '\n\n🔇 **Automatic 1h timeout** (3 warnings)';
      }
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚠️ Warning').setDescription(desc).setColor(Colors.WARNING).setTimestamp()] });
    }

    // ── /warnings ──
    if (commandName === 'warnings') {
      const target = options.getUser('user');
      const warns  = dbHelpers.getWarnings(guild.id, target.id);
      if (!warns.length) return interaction.reply({ content: `✅ ${target.tag} has no warnings.`, ephemeral: true });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`⚠️ Warnings for ${target.tag}`).setDescription(warns.map((w, i) => `**#${i + 1}** - ${w.reason}\n> By <@${w.moderator_id}> - <t:${Math.floor(new Date(w.created_at).getTime() / 1000)}:R>`).join('\n\n')).setColor(Colors.WARNING).setFooter({ text: `Total: ${warns.length}` }).setTimestamp()] });
    }

    // ── /clear ──
    if (commandName === 'clear') {
      const amount  = options.getInteger('amount');
      const deleted = await channel.bulkDelete(amount, true);
      const reply   = await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🗑️ ${deleted.size} message(s) deleted`).setColor(Colors.SUCCESS)], fetchReply: true });
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    }

    // ── /level ──
    if (commandName === 'level') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'leveling')) return interaction.reply({ content: '❌ Leveling is disabled.', ephemeral: true });
      const target   = options.getUser('user') || user;
      const data     = dbHelpers.getLevel(guild.id, target.id);
      const required = getRequiredXP(data.level);
      const progress = Math.round((data.xp / required) * 100);
      const bar      = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📊 Level for ${target.username}`).setThumbnail(target.displayAvatarURL({ size: 128 })).addFields({ name: '🏆 Level', value: `${data.level}`, inline: true }, { name: '✨ XP', value: `${data.xp}/${required}`, inline: true }, { name: '📈 Progress', value: `${bar} ${progress}%` }).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /rank ──
    if (commandName === 'rank') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'leveling')) return interaction.reply({ content: '❌ Leveling is disabled.', ephemeral: true });
      const lb = dbHelpers.getLeaderboard(guild.id, 10);
      if (!lb.length) return interaction.reply({ content: '📊 No data available.', ephemeral: true });
      const medals = ['🥇', '🥈', '🥉'];
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏆 Leaderboard — ${guild.name}`).setDescription(lb.map((e, i) => `${i < 3 ? medals[i] : `**${i + 1}.**`} <@${e.user_id}> — Level **${e.level}** (${e.xp} XP)`).join('\n')).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /daily ──
    if (commandName === 'daily') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'economy')) return interaction.reply({ content: '❌ Economy is disabled.', ephemeral: true });
      const result = dbHelpers.claimDaily(guild.id, user.id);
      if (!result.success) return interaction.reply({ content: `⏰ Come back in **${result.remaining}**.`, ephemeral: true });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💰 Daily Reward').setDescription(`You received **${result.reward}** coins!\n💎 New balance: **${result.newBalance}**`).setColor(Colors.SUCCESS).setTimestamp()] });
    }

    // ── /balance ──
    if (commandName === 'balance') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'economy')) return interaction.reply({ content: '❌ Economy is disabled.', ephemeral: true });
      const target = options.getUser('user') || user;
      const eco    = dbHelpers.getBalance(guild.id, target.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`💰 Balance of ${target.username}`).setDescription(`**${eco.balance}** coins 💎`).setThumbnail(target.displayAvatarURL({ size: 128 })).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /giveaway ──
    if (commandName === 'giveaway') {
      const prize       = options.getString('prize');
      const durationStr = options.getString('duration');
      const winnerCount = options.getInteger('winners') || 1;
      const targetCh    = options.getChannel('channel') || channel;
      const duration    = parseDuration(durationStr);
      if (!duration) return interaction.reply({ content: '❌ Invalid duration.', ephemeral: true });
      const endTime    = new Date(Date.now() + duration);
      const embed      = new EmbedBuilder().setTitle('🎉 GIVEAWAY').setDescription(`**Prize:** ${prize}\n**Winner(s):** ${winnerCount}\n**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\n**Hosted by:** ${user}`).setColor(Colors.PRIMARY).setTimestamp(endTime);
      const giveawayId = dbHelpers.createGiveaway(guild.id, targetCh.id, null, prize, winnerCount, endTime.toISOString(), user.id);
      const button     = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`giveaway_${giveawayId}`).setLabel('Join 🎉').setStyle(ButtonStyle.Primary));
      const sent       = await targetCh.send({ embeds: [embed], components: [button] });
      const { db }     = require('./utils');
      db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(sent.id, giveawayId);
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🎉 Giveaway launched in ${targetCh}.`).setColor(Colors.SUCCESS)], ephemeral: true });
    }

    // ── /poll ──
    if (commandName === 'poll') {
      const question    = options.getString('question');
      const pollOptions = [];
      for (let i = 1; i <= 5; i++) { const o = options.getString(`option${i}`); if (o) pollOptions.push(o); }
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      const sent   = await channel.send({ embeds: [new EmbedBuilder().setTitle(`📊 ${question}`).setDescription(pollOptions.map((o, i) => `${emojis[i]} ${o}`).join('\n\n')).setColor(Colors.PRIMARY).setFooter({ text: `Poll by ${user.username}` }).setTimestamp()] });
      for (let i = 0; i < pollOptions.length; i++) await sent.react(emojis[i]);
      return interaction.reply({ content: '✅ Poll created.', ephemeral: true });
    }

    // ── /userinfo ──
    if (commandName === 'userinfo') {
      const target     = options.getMember('user') || member;
      const targetUser = target.user;
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${targetUser.tag}`).setThumbnail(targetUser.displayAvatarURL({ size: 256 })).addFields({ name: '🆔 ID', value: targetUser.id, inline: true }, { name: '📛 Nickname', value: target.nickname || 'None', inline: true }, { name: '🤖 Bot', value: targetUser.bot ? 'Yes' : 'No', inline: true }, { name: '📅 Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }, { name: '📥 Joined', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true }, { name: '🎭 Roles', value: target.roles.cache.filter(r => r.id !== guild.id).map(r => `${r}`).join(', ') || 'None' }).setColor(target.displayHexColor || Colors.PRIMARY).setTimestamp()] });
    }

    // ── /serverinfo ──
    if (commandName === 'serverinfo') {
      const owner = await guild.fetchOwner();
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏠 ${guild.name}`).setThumbnail(guild.iconURL({ size: 256 })).addFields({ name: '🆔 ID', value: guild.id, inline: true }, { name: '👑 Owner', value: owner.user.tag, inline: true }, { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }, { name: '👥 Members', value: `${guild.memberCount}`, inline: true }, { name: '💬 Channels', value: `${guild.channels.cache.size}`, inline: true }, { name: '💎 Boosts', value: `${guild.premiumSubscriptionCount || 0} (Level ${guild.premiumTier})`, inline: true }).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /config ──
    if (commandName === 'config') {
      const sub = interaction.options.getSubcommand();
      dbHelpers.getGuild(guild.id);
      if (sub === 'logs') {
        const logChannel = options.getChannel('channel');
        dbHelpers.updateGuild(guild.id, { log_channel: logChannel.id });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Logs channel: ${logChannel}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'automod') {
        dbHelpers.updateGuild(guild.id, { automod_enabled: options.getBoolean('enabled') ? 1 : 0 });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Auto-moderation ${options.getBoolean('enabled') ? 'enabled' : 'disabled'}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'antiraid') {
        dbHelpers.updateGuild(guild.id, { antiraid_enabled: options.getBoolean('enabled') ? 1 : 0 });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Anti-raid ${options.getBoolean('enabled') ? 'enabled' : 'disabled'}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'leveling') {
        dbHelpers.setModule(guild.id, 'leveling', options.getBoolean('enabled'));
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Leveling ${options.getBoolean('enabled') ? 'enabled' : 'disabled'}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'prefix') {
        dbHelpers.updateGuild(guild.id, { prefix: options.getString('prefix') });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Prefix: \`${options.getString('prefix')}\``).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'language') {
        dbHelpers.updateGuild(guild.id, { language: options.getString('language') });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription('✅ Language updated').setColor(Colors.SUCCESS)], ephemeral: true });
      }
    }

    // ── /module ──
    if (commandName === 'module') {
      dbHelpers.setModule(guild.id, options.getString('name'), options.getBoolean('enabled'));
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Module **${options.getString('name')}** ${options.getBoolean('enabled') ? 'enabled' : 'disabled'}`).setColor(Colors.SUCCESS)], ephemeral: true });
    }

    // ── /captcha ──
    if (commandName === 'captcha') {
      const config    = dbHelpers.getGuild(guild.id);
      const isEnabled = !!config.captcha_enabled;
      const embed     = new EmbedBuilder().setTitle('🔐 Captcha System').setDescription(`**Status:** ${isEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n**Channel:** ${config.captcha_channel ? `<#${config.captcha_channel}>` : 'Not set'}\n**Role:** ${config.captcha_role ? `<@&${config.captcha_role}>` : 'Not set'}\n**Attempts:** ${config.captcha_retry_limit || 3}`).setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons   = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_captcha').setLabel(isEnabled ? 'Disable' : 'Enable').setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success), new ButtonBuilder().setCustomId('sys_test_captcha').setLabel('Test').setStyle(ButtonStyle.Secondary));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /reaction-roles ──
    if (commandName === 'reaction-roles') {
      const { db } = require('./utils');
      const rrList = db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ?').all(guild.id);
      const desc   = rrList.length > 0 ? rrList.slice(0, 10).map((rr, i) => `**${i + 1}.** ${rr.emoji} → <@&${rr.role_id}> (in <#${rr.channel_id}>)`).join('\n') : '*No configured reaction roles.*';
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔁 Reaction Roles').setDescription(`**Total:** ${rrList.length}\n\n${desc}`).setColor(rrList.length > 0 ? Colors.SUCCESS : Colors.ERROR).setTimestamp()], ephemeral: true });
    }

    // ── /automod ──
    if (commandName === 'automod') {
      const config    = dbHelpers.getGuild(guild.id);
      const fullyActive = !!config.automod_enabled && dbHelpers.isModuleEnabled(guild.id, 'automod');
      const embed     = new EmbedBuilder().setTitle('🛡️ Auto-Moderation').setDescription(`**Status:** ${fullyActive ? '🟢 Enabled' : '🔴 Disabled'}\n\n> Anti-spam · Profanity filter · Invite-link filter`).setColor(fullyActive ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons   = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_automod').setLabel(fullyActive ? 'Disable' : 'Enable').setStyle(fullyActive ? ButtonStyle.Danger : ButtonStyle.Success), new ButtonBuilder().setCustomId('sys_test_automod').setLabel('Test').setStyle(ButtonStyle.Secondary));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /antiraid ──
    if (commandName === 'antiraid') {
      const config  = dbHelpers.getGuild(guild.id);
      const isEnabled = !!config.antiraid_enabled;
      const embed   = new EmbedBuilder().setTitle('🛡️ Anti-Raid').setDescription(`**Status:** ${isEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n\n> 5+ joins in 10s → automatic kick`).setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_antiraid').setLabel(isEnabled ? 'Disable' : 'Enable').setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /leveling ──
    if (commandName === 'leveling') {
      const isEnabled = dbHelpers.isModuleEnabled(guild.id, 'leveling');
      const topUsers  = dbHelpers.getLeaderboard(guild.id, 3);
      const topDesc   = topUsers.length > 0 ? ['🥇','🥈','🥉'].map((m, i) => `${m} <@${topUsers[i].user_id}> — Lvl. **${topUsers[i].level}**`).join('\n') : '*No data available.*';
      const embed     = new EmbedBuilder().setTitle('📊 Leveling').setDescription(`**Status:** ${isEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n\n> 15–24 XP/message (60s cooldown)\n\n**Top 3:**\n${topDesc}`).setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons   = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_leveling').setLabel(isEnabled ? 'Disable' : 'Enable').setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /economy ──
    if (commandName === 'economy') {
      const isEnabled = dbHelpers.isModuleEnabled(guild.id, 'economy');
      const embed     = new EmbedBuilder().setTitle('💰 Economy').setDescription(`**Status:** ${isEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n\n> /daily — 100–150 coins\n> /balance — View your balance`).setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons   = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_economy').setLabel(isEnabled ? 'Disable' : 'Enable').setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /statistics ──
    if (commandName === 'statistics') {
      const target         = options.getUser('member') || user;
      const stats          = dbHelpers.getStats(guild.id, target.id);
      const activeSession  = dbHelpers.getVoiceSession(guild.id, target.id);
      let totalVoiceTime   = stats.voice_time;
      if (activeSession) {
        totalVoiceTime += Math.floor((Date.now() - new Date(activeSession.joined_at).getTime()) / 1000);
      }
      const hours    = Math.floor(totalVoiceTime / 3600);
      const minutes  = Math.floor((totalVoiceTime % 3600) / 60);
      const voiceFmt = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      const embed    = new EmbedBuilder()
        .setTitle(`📊 Statistics for ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '💬 Messages Sent', value: `**${stats.message_count.toLocaleString()}**`, inline: true },
          { name: '🎙️ Voice Time', value: `**${voiceFmt}**`, inline: true },
        )
        .setColor(Colors.PRIMARY)
        .setFooter({ text: `Statistics in ${guild.name}` })
        .setTimestamp();
      if (activeSession) embed.addFields({ name: '🟢 Status', value: 'Currently in voice chat', inline: false });
      return interaction.reply({ embeds: [embed] });
    }

    // ── /help ──
    if (commandName === 'help') {
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle('📖 Nira — Commands')
        .addFields(
          { name: '📋 Systems', value: '`/captcha` `/reaction-roles` `/automod` `/antiraid` `/leveling` `/economy` `/statistics`' },
          { name: '⚙️ Config',   value: '`/setup-reaction` `/setup-captcha` `/setup-ticket` `/config` `/module`' },
          { name: '🎫 Tickets',  value: '`/ticket` `/ticket-close` `/ticket-claim` `/ticket-add` `/ticket-remove`' },
          { name: '✉️ Embed',    value: '`/embed` — Create a custom embed with image, color, author, footer...' },
          { name: '🛡️ Moderation', value: '`/ban` `/kick` `/mute` `/unmute` `/warn` `/warnings` `/clear`' },
          { name: '🎮 Fun',      value: '`/level` `/rank` `/daily` `/balance` `/giveaway` `/poll` `/userinfo` `/serverinfo`' },
        )
        .setColor(Colors.PRIMARY)
        .setFooter({ text: 'Nira Bot — Professional, useful, modern.' })
        .setTimestamp()] });
    }

  } catch (error) {
    console.error(`❌ Command error /${commandName}:`, error);
    const content = '❌ An error occurred.';
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content, ephemeral: true }).catch(() => {});
    else await interaction.reply({ content, ephemeral: true }).catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════════
// REACTION ROLE EVENTS
// ═══════════════════════════════════════════════════════════════
function normalizeEmoji(str) {
  return str.replace(/\uFE0F/g, '').replace(/^<|>$/g, '').trim();
}
function findReactionRole(messageId, reactionEmoji) {
  const emojiId = reactionEmoji.id ? `${reactionEmoji.name}:${reactionEmoji.id}` : reactionEmoji.name;
  let rr = dbHelpers.getReactionRole(messageId, emojiId);
  if (rr) return rr;
  const allRR = dbHelpers.getReactionRolesByMessage(messageId);
  if (!allRR?.length) return null;
  const normalizedInput = normalizeEmoji(emojiId);
  for (const entry of allRR) { if (normalizeEmoji(entry.emoji) === normalizedInput) return entry; }
  if (reactionEmoji.id) { for (const entry of allRR) { if (entry.emoji.includes(reactionEmoji.id)) return entry; } }
  return null;
}
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  try { if (reaction.partial) await reaction.fetch(); if (reaction.message.partial) await reaction.message.fetch(); } catch { return; }
  const rr = findReactionRole(reaction.message.id, reaction.emoji);
  if (!rr) return;
  try { const m = await reaction.message.guild.members.fetch(user.id); const role = await reaction.message.guild.roles.fetch(rr.role_id); if (role && m) await m.roles.add(role); } catch (e) { console.error('ReactionRole add:', e); }
});
client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  try { if (reaction.partial) await reaction.fetch(); if (reaction.message.partial) await reaction.message.fetch(); } catch { return; }
  const rr = findReactionRole(reaction.message.id, reaction.emoji);
  if (!rr) return;
  try { const m = await reaction.message.guild.members.fetch(user.id); const role = await reaction.message.guild.roles.fetch(rr.role_id); if (role && m) await m.roles.remove(role); } catch (e) { console.error('ReactionRole remove:', e); }
});

// ═══════════════════════════════════════════════════════════════
// CAPTCHA — Member Join
// ═══════════════════════════════════════════════════════════════
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return;
  const config = dbHelpers.getGuild(member.guild.id);
  if (config.antiraid_enabled && checkRaid(member.guild.id)) {
    try { await member.kick('Anti-raid'); await sendLog(member.guild, new EmbedBuilder().setTitle('🛡️ Anti-Raid').setDescription(`${member.user.tag} kicked (raid detected)`).setColor(Colors.ERROR).setTimestamp()); return; } catch (_) {}
  }
  if (config.captcha_enabled && config.captcha_channel) {
    try {
      const captchaChannel = await member.guild.channels.fetch(config.captcha_channel);
      if (!captchaChannel) return;
      const code = generateCaptchaCode();
      dbHelpers.setCaptcha(member.guild.id, member.id, code);
      const att = new AttachmentBuilder(generateCaptchaImage(code), { name: 'captcha.png' });
      const embed = new EmbedBuilder().setTitle('🔐 Verification Required').setDescription(`Welcome ${member}!\n\nEnter the code from the image.\n⚠️ **${config.captcha_retry_limit}** attempts. ⏰ Kick after **10 min**.`).setImage('attachment://captcha.png').setColor(Colors.INFO).setTimestamp();
      const btn   = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`captcha_verify_${member.id}`).setLabel('Enter Code').setStyle(ButtonStyle.Primary).setEmoji('🔐'));
      await captchaChannel.send({ content: `${member}`, embeds: [embed], files: [att], components: [btn] });
      setTimeout(async () => {
        const pending = dbHelpers.getCaptcha(member.guild.id, member.id);
        if (pending) { dbHelpers.removeCaptcha(member.guild.id, member.id); try { await member.kick('Captcha expired'); await captchaChannel.send({ embeds: [new EmbedBuilder().setDescription(`⏰ ${member.user.tag} kicked (captcha expired).`).setColor(Colors.ERROR)] }); } catch (_) {} }
      }, 600000);
    } catch (e) { console.error('Captcha join:', e); }
  }
  await sendLog(member.guild, new EmbedBuilder().setTitle('📥 New Member').setDescription(`${member.user.tag} joined`).addFields({ name: 'ID', value: member.id, inline: true }, { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }).setThumbnail(member.user.displayAvatarURL()).setColor(Colors.SUCCESS).setTimestamp());
});

// ═══════════════════════════════════════════════════════════════
// MEMBER LEAVE LOG
// ═══════════════════════════════════════════════════════════════
client.on(Events.GuildMemberRemove, async (member) => {
  if (member.user.bot) return;
  await sendLog(member.guild, new EmbedBuilder().setTitle('📤 Member Left').setDescription(`${member.user.tag}`).addFields({ name: 'ID', value: member.id, inline: true }, { name: 'Roles', value: member.roles.cache.filter(r => r.id !== member.guild.id).map(r => `${r}`).join(', ') || 'None' }).setThumbnail(member.user.displayAvatarURL()).setColor(Colors.ERROR).setTimestamp());
});

// ═══════════════════════════════════════════════════════════════
// ROLE UPDATE LOG
// ═══════════════════════════════════════════════════════════════
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const addedRoles   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
  if (addedRoles.size > 0) await sendLog(newMember.guild, new EmbedBuilder().setTitle('🎭 Role(s) Added').setDescription(`**${newMember.user.tag}** — ${addedRoles.map(r => `${r}`).join(', ')}`).setColor(Colors.SUCCESS).setTimestamp());
  if (removedRoles.size > 0) await sendLog(newMember.guild, new EmbedBuilder().setTitle('🎭 Role(s) Removed').setDescription(`**${newMember.user.tag}** — ${removedRoles.map(r => `${r}`).join(', ')}`).setColor(Colors.ERROR).setTimestamp());
  if (NIRA_GUILD_ID && newMember.guild.id === NIRA_GUILD_ID && PREMIUM_ROLE_ID) {
    if (newMember.premiumSince && !oldMember.premiumSince) { const r = newMember.guild.roles.cache.get(PREMIUM_ROLE_ID); if (r) await newMember.roles.add(r).catch(() => {}); }
    else if (!newMember.premiumSince && oldMember.premiumSince) { const r = newMember.guild.roles.cache.get(PREMIUM_ROLE_ID); if (r) await newMember.roles.remove(r).catch(() => {}); }
  }
  if (SUPPORTER_ROLE_ID && !newMember.user.bot) {
    try {
      const userData   = await client.rest.get(`/users/${newMember.user.id}`);
      const hasClanTag = userData.clan && userData.clan.identity_guild_id === newMember.guild.id;
      const supporterRole = await newMember.guild.roles.fetch(SUPPORTER_ROLE_ID);
      if (!supporterRole) return;
      if (hasClanTag && !newMember.roles.cache.has(SUPPORTER_ROLE_ID)) await newMember.roles.add(supporterRole);
      else if (!hasClanTag && newMember.roles.cache.has(SUPPORTER_ROLE_ID)) await newMember.roles.remove(supporterRole);
    } catch (_) {}
  }
});

// ═══════════════════════════════════════════════════════════════
// AUTO-MOD & XP
// ═══════════════════════════════════════════════════════════════
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const config = dbHelpers.getGuild(message.guild.id);
  dbHelpers.incrementMessageCount(message.guild.id, message.author.id);

  if (config.automod_enabled && dbHelpers.isModuleEnabled(message.guild.id, 'automod')) {
    if (checkSpam(message.author.id, message.guild.id)) {
      try { await message.delete(); const m = await message.guild.members.fetch(message.author.id); if (m.moderatable) { await m.timeout(300000, 'Anti-spam'); await message.channel.send({ embeds: [new EmbedBuilder().setDescription(`🔇 ${message.author} timed out for 5 minutes (spam).`).setColor(Colors.MODERATION)] }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)); } } catch (_) {}
      return;
    }
    if (containsBadWord(message.content)) {
      try { await message.delete(); await message.channel.send({ embeds: [new EmbedBuilder().setDescription(`⚠️ ${message.author}, message deleted (inappropriate language).`).setColor(Colors.WARNING)] }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)); } catch (_) {}
      return;
    }
    if (/(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\//i.test(message.content)) {
      const m = await message.guild.members.fetch(message.author.id);
      if (!m.permissions.has(PermissionFlagsBits.ManageMessages)) {
        try { await message.delete(); await message.channel.send({ embeds: [new EmbedBuilder().setDescription(`⚠️ ${message.author}, invite links are not allowed.`).setColor(Colors.WARNING)] }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)); } catch (_) {}
        return;
      }
    }
  }

  if (dbHelpers.isModuleEnabled(message.guild.id, 'leveling')) {
    const data    = dbHelpers.getLevel(message.guild.id, message.author.id);
    const now     = Date.now();
    const lastMsg = data.last_message ? new Date(data.last_message).getTime() : 0;
    if (now - lastMsg >= 60000) {
      const xpGain = 15 + Math.floor(Math.random() * 10);
      const result = dbHelpers.addXP(message.guild.id, message.author.id, xpGain);
      if (result.leveledUp) await message.channel.send({ embeds: [new EmbedBuilder().setTitle('🎉 Level Up!').setDescription(`Congratulations ${message.author}! You are now **level ${result.newLevel}**!`).setColor(Colors.SUCCESS).setThumbnail(message.author.displayAvatarURL({ size: 128 })).setTimestamp()] }).catch(() => {});
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// VOICE TRACKING
// ═══════════════════════════════════════════════════════════════
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const userId  = newState.member?.id || oldState.member?.id;
  const guildId = newState.guild?.id  || oldState.guild?.id;
  if (!userId || !guildId) return;
  if (newState.member?.user?.bot) return;
  if (!oldState.channelId && newState.channelId)  dbHelpers.startVoiceSession(guildId, userId);
  else if (oldState.channelId && !newState.channelId) dbHelpers.endVoiceSession(guildId, userId);
});

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════
client.on(Events.Error, (error) => console.error('❌ Discord.js:', error));
process.on('unhandledRejection', (error) => console.error('❌ Unhandled rejection:', error));
process.on('uncaughtException',  (error) => console.error('❌ Uncaught exception:', error));

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════
client.login(TOKEN);
