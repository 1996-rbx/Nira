// ═══════════════════════════════════════════════════════════════
// NIRA BOT - Bot Discord Multifonction
// Fichier principal : index.js
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
  console.error('❌ BOT_TOKEN manquant dans les variables d\'environnement.');
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
    .setDescription('Creer un message avec reaction pour attribuer un role')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(o => o.setName('role').setDescription('Le role a attribuer').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('L\'emoji a utiliser').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Le message a afficher (optionnel si image)'))
    .addChannelOption(o => o.setName('salon').setDescription('Le salon ou envoyer le message'))
    .addAttachmentOption(o => o.setName('image').setDescription('Image a joindre au message')),

  // ── Setup Captcha ──
  new SlashCommandBuilder()
    .setName('setup-captcha')
    .setDescription('Configurer le systeme de captcha')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('salon').setDescription('Salon de verification captcha').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role donne apres validation').setRequired(true))
    .addIntegerOption(o => o.setName('essais').setDescription('Nombre d\'essais max (defaut: 3)').setMinValue(1).setMaxValue(10)),

// ── Setup Ticket ──
new SlashCommandBuilder()
  .setName('setup-ticket')
  .setDescription('Configurer le système de tickets')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(o => 
    o.setName('salon')
     .setDescription('Salon où envoyer le panneau ticket')
     .setRequired(true)
  )
  .addRoleOption(o => 
    o.setName('staff')
     .setDescription('Rôle staff pour les tickets')
     .setRequired(true)
  )
  .addChannelOption(o => 
    o.setName('categorie')
     .setDescription('Catégorie pour les salons de tickets')
  )
  .addStringOption(o => 
    o.setName('titre')
     .setDescription('Titre de l\'embed')
  )
  .addStringOption(o => 
    o.setName('description')
     .setDescription('Description de l\'embed')
  )
  .addStringOption(o => 
    o.setName('couleur')
     .setDescription('Couleur de l\'embed (ex: #ff0000)')
  )
  .addStringOption(o => 
    o.setName('image')
     .setDescription('URL de l\'image de l\'embed')
  )
  .addStringOption(o => 
    o.setName('footer')
     .setDescription('Footer de l\'embed')
  ), // <-- virgule ici, car c'est un élément du tableau `commands`
  
  // ── Moderation ──
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannir un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur a bannir').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison du ban')),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulser un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur a expulser').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison du kick')),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur a mute').setRequired(true))
    .addStringOption(o => o.setName('duree').setDescription('Duree (ex: 10m, 1h, 1d, 7j)').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison du mute')),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur a unmute').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avertir un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur a avertir').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison de l\'avertissement').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Voir les avertissements d\'un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprimer des messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('nombre').setDescription('Nombre de messages a supprimer').setRequired(true).setMinValue(1).setMaxValue(100)),

  // ── Ticket commands ──
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ouvrir un ticket de support')
    .addStringOption(o => o.setName('raison').setDescription('Raison du ticket (optionnel)')),

  new SlashCommandBuilder()
    .setName('ticket-close')
    .setDescription('Fermer le ticket actuel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('ticket-claim')
    .setDescription('Prendre en charge ce ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('ticket-add')
    .setDescription('Ajouter un membre au ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o => o.setName('membre').setDescription('Le membre a ajouter').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ticket-remove')
    .setDescription('Retirer un membre du ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o => o.setName('membre').setDescription('Le membre a retirer').setRequired(true)),

  // ── Embed command ──
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Creer et envoyer un embed personnalise')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('titre').setDescription('Titre de l\'embed').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Description de l\'embed').setRequired(true))
    .addChannelOption(o => o.setName('salon').setDescription('Salon ou envoyer l\'embed (defaut: salon actuel)'))
    .addStringOption(o => o.setName('couleur').setDescription('Couleur hex (ex: #5865F2, red, green)'))
    .addStringOption(o => o.setName('footer').setDescription('Texte du footer'))
    .addStringOption(o => o.setName('auteur').setDescription('Nom de l\'auteur'))
    .addStringOption(o => o.setName('auteur_icon').setDescription('URL de l\'icone auteur'))
    .addStringOption(o => o.setName('thumbnail').setDescription('URL de la miniature (coin haut droit)'))
    .addStringOption(o => o.setName('image').setDescription('URL de la grande image en bas'))
    .addAttachmentOption(o => o.setName('fichier_image').setDescription('Image a uploader directement'))
    .addBooleanOption(o => o.setName('timestamp').setDescription('Afficher l\'horodatage ? (defaut: non)')),

  // ── Fun & Utils ──
  new SlashCommandBuilder()
    .setName('level')
    .setDescription('Voir ton niveau et ton XP')
    .addUserOption(o => o.setName('utilisateur').setDescription('Voir le niveau d\'un autre utilisateur')),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Voir le classement du serveur'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Recuperer ta recompense quotidienne'),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Voir ton solde')
    .addUserOption(o => o.setName('utilisateur').setDescription('Voir le solde d\'un autre utilisateur')),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Lancer un giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('prix').setDescription('Le prix a gagner').setRequired(true))
    .addStringOption(o => o.setName('duree').setDescription('Duree (ex: 1h, 1d, 7j)').setRequired(true))
    .addIntegerOption(o => o.setName('gagnants').setDescription('Nombre de gagnants (defaut: 1)').setMinValue(1).setMaxValue(20))
    .addChannelOption(o => o.setName('salon').setDescription('Salon du giveaway')),

  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Creer un sondage')
    .addStringOption(o => o.setName('question').setDescription('La question du sondage').setRequired(true))
    .addStringOption(o => o.setName('option1').setDescription('Option 1').setRequired(true))
    .addStringOption(o => o.setName('option2').setDescription('Option 2').setRequired(true))
    .addStringOption(o => o.setName('option3').setDescription('Option 3'))
    .addStringOption(o => o.setName('option4').setDescription('Option 4'))
    .addStringOption(o => o.setName('option5').setDescription('Option 5')),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Voir les informations d\'un utilisateur')
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur')),

  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Voir les informations du serveur'),

  // ── Configuration ──
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurer Nira')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
      .setName('logs')
      .setDescription('Definir le salon de logs')
      .addChannelOption(o => o.setName('salon').setDescription('Le salon de logs').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('automod')
      .setDescription('Activer/desactiver l\'auto-moderation')
      .addBooleanOption(o => o.setName('activer').setDescription('Activer ou desactiver').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('antiraid')
      .setDescription('Activer/desactiver l\'anti-raid')
      .addBooleanOption(o => o.setName('activer').setDescription('Activer ou desactiver').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('leveling')
      .setDescription('Activer/desactiver le systeme de niveaux')
      .addBooleanOption(o => o.setName('activer').setDescription('Activer ou desactiver').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('prefix')
      .setDescription('Changer le prefixe')
      .addStringOption(o => o.setName('prefixe').setDescription('Le nouveau prefixe').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('langue')
      .setDescription('Changer la langue')
      .addStringOption(o => o.setName('langue').setDescription('La langue (fr/en)').setRequired(true)
        .addChoices({ name: 'Francais', value: 'fr' }, { name: 'English', value: 'en' }))),

  new SlashCommandBuilder()
    .setName('module')
    .setDescription('Activer/desactiver un module')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('nom').setDescription('Nom du module').setRequired(true)
      .addChoices(
        { name: 'Leveling',        value: 'leveling' },
        { name: 'Economie',        value: 'economy'  },
        { name: 'Auto-moderation', value: 'automod'  },
        { name: 'Anti-raid',       value: 'antiraid' },
        { name: 'Fun',             value: 'fun'      },
        { name: 'Logs',            value: 'logs'     },
      ))
    .addBooleanOption(o => o.setName('activer').setDescription('Activer ou desactiver').setRequired(true)),

  // ── System Management Commands ──
  new SlashCommandBuilder()
    .setName('captcha')
    .setDescription('Voir et gerer le systeme de captcha')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('reaction-roles')
    .setDescription('Voir et gerer le systeme de reaction roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Voir et gerer le systeme d\'auto-moderation')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('antiraid')
    .setDescription('Voir et gerer le systeme anti-raid')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('leveling')
    .setDescription('Voir et gerer le systeme de niveaux')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('economie')
    .setDescription('Voir et gerer le systeme d\'economie')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── Help ──
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Voir les commandes disponibles'),

  // ── Statistics ──
  new SlashCommandBuilder()
    .setName('statistics')
    .setDescription('Voir les statistiques d\'un membre (messages et temps vocal)')
    .addUserOption(o => o.setName('membre').setDescription('Le membre a consulter')),

].map(cmd => cmd.toJSON());

// ═══════════════════════════════════════════════════════════════
// REGISTER COMMANDS
// ═══════════════════════════════════════════════════════════════
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('📡 Enregistrement des commandes slash...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Commandes enregistrees avec succes!');
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement des commandes:', error);
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
// TICKET HELPER — crée un salon ticket
// ═══════════════════════════════════════════════════════════════
async function createTicketChannel(guild, member, config, reason) {
  const count  = dbHelpers.getTicketCount(guild.id) + 1;
  const padded = String(count).padStart(4, '0');

  const permOverwrites = [
    { id: guild.id,                    deny:  [PermissionFlagsBits.ViewChannel] },
    { id: member.id,                   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: config.ticket_staff_role,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles] },
    { id: guild.members.me.id,         allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
  ];

  const channelOptions = {
    name:                `🎫・ticket-${padded}`,
    type:                ChannelType.GuildText,
    topic:               `Ticket #${padded} — ${member.user.tag} — ${reason || 'Aucune raison'}`,
    permissionOverwrites: permOverwrites,
  };
  if (config.ticket_category) channelOptions.parent = config.ticket_category;

  const ticketChannel = await guild.channels.create(channelOptions);
  dbHelpers.createTicket(guild.id, ticketChannel.id, member.id, count, reason || null);

  // Message d'ouverture
  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${padded}`)
    .setDescription(
      `Bienvenue ${member} !\n\n` +
      `> Un membre du staff va te répondre rapidement.\n` +
      `> Décris ton problème en détail.\n` +
      (reason ? `\n**Raison :** ${reason}` : '')
    )
    .setColor(Colors.PRIMARY)
    .setFooter({ text: `Ticket ouvert par ${member.user.tag}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close_btn')
      .setLabel('Fermer le ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
    new ButtonBuilder()
      .setCustomId('ticket_claim_btn')
      .setLabel('Prendre en charge')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✋'),
  );

  await ticketChannel.send({
    content: `${member} <@&${config.ticket_staff_role}>`,
    embeds:  [embed],
    components: [row],
  });

  return { channel: ticketChannel, number: padded };
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
  console.log(`\n✨ ${client.user.tag} est en ligne!`);
  console.log(`📊 ${client.guilds.cache.size} serveur(s)`);
  console.log(`👤 ${client.users.cache.size} utilisateur(s)\n`);

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
        const winnerMentions = winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'Aucun participant';
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
        await member.timeout(null, 'Duree du mute expiree');
        dbHelpers.removeMute(mute.guild_id, mute.user_id);
      } catch (_) { dbHelpers.removeMute(mute.guild_id, mute.user_id); }
    }
  }, 15000);
});

// ═══════════════════════════════════════════════════════════════
// INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════
client.on(Events.InteractionCreate, async (interaction) => {

  // ── Button interactions ──
  if (interaction.isButton() && interaction.customId.startsWith('ticket_')) return tickets.handleButton(interaction); 
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_category') return tickets.handleSelectMenu(interaction); 
  if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_')) return tickets.handleModal(interaction);

    // Giveaway
    if (interaction.customId.startsWith('giveaway_')) {
      const giveawayId = parseInt(interaction.customId.split('_')[1]);
      dbHelpers.enterGiveaway(giveawayId, interaction.user.id);
      return interaction.reply({ content: '🎉 Tu participes au giveaway!', ephemeral: true });
    }

    // ── Ticket — Ouvrir (depuis le panneau /setup-ticket) ──
    if (interaction.customId === 'ticket_open') {
      const config = dbHelpers.getGuild(interaction.guild.id);
      if (!config.ticket_staff_role) {
        return interaction.reply({ content: '❌ Le système de tickets n\'est pas configuré.', ephemeral: true });
      }
      // Vérifie si le membre a déjà un ticket ouvert
      const existing = dbHelpers.getOpenTickets(interaction.guild.id).find(t => t.user_id === interaction.user.id);
      if (existing) {
        return interaction.reply({ content: `❌ Tu as déjà un ticket ouvert : <#${existing.channel_id}>`, ephemeral: true });
      }
      const modal = new ModalBuilder()
        .setCustomId('ticket_create_modal')
        .setTitle('📩 Ouvrir un ticket');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_reason_input')
          .setLabel('Raison du ticket')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Décris ton problème ou ta demande...')
          .setRequired(false)
          .setMaxLength(500),
      ));
      return interaction.showModal(modal);
    }

    // ── Ticket — Fermer (bouton dans le salon ticket) ──
    if (interaction.customId === 'ticket_close_btn') {
      const ticket = dbHelpers.getTicketByChannel(interaction.channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });

      // Seul l'auteur ou le staff peut fermer
      const config    = dbHelpers.getGuild(interaction.guild.id);
      const isStaff   = interaction.member.roles.cache.has(config.ticket_staff_role);
      const isAuthor  = ticket.user_id === interaction.user.id;
      if (!isStaff && !isAuthor && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: '❌ Tu n\'as pas la permission de fermer ce ticket.', ephemeral: true });
      }

      await interaction.reply({ embeds: [new EmbedBuilder().setDescription('🔒 Ticket fermé. Suppression dans 5 secondes...').setColor(Colors.ERROR)] });
      dbHelpers.closeTicket(interaction.channel.id);
      await sendLog(interaction.guild, new EmbedBuilder()
        .setTitle('🎫 Ticket fermé')
        .addFields(
          { name: 'Salon',    value: interaction.channel.name, inline: true },
          { name: 'Fermé par', value: interaction.user.tag,    inline: true },
          { name: 'Auteur',   value: `<@${ticket.user_id}>`,  inline: true },
        )
        .setColor(Colors.WARNING)
        .setTimestamp());
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }

    // ── Ticket — Claim (bouton dans le salon ticket) ──
    if (interaction.customId === 'ticket_claim_btn') {
      const ticket = dbHelpers.getTicketByChannel(interaction.channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
      if (ticket.claimed_by) {
        return interaction.reply({ content: `❌ Ce ticket est déjà pris en charge par <@${ticket.claimed_by}>.`, ephemeral: true });
      }
      dbHelpers.claimTicket(interaction.channel.id, interaction.user.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${interaction.user} a pris en charge ce ticket.`).setColor(Colors.SUCCESS)] });
    }

    // ── System toggles ──
    if (interaction.customId.startsWith('sys_toggle_')) {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
      }
      const system  = interaction.customId.replace('sys_toggle_', '');
      const guildId = interaction.guild.id;
      if (system === 'captcha') {
        const config   = dbHelpers.getGuild(guildId);
        const newState = config.captcha_enabled ? 0 : 1;
        dbHelpers.updateGuild(guildId, { captcha_enabled: newState });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Captcha ${newState ? 'activé' : 'désactivé'}.`).setColor(newState ? Colors.SUCCESS : Colors.ERROR)], ephemeral: true });
      }
      if (system === 'automod') {
        const config      = dbHelpers.getGuild(guildId);
        const wasEnabled  = !!config.automod_enabled && dbHelpers.isModuleEnabled(guildId, 'automod');
        dbHelpers.updateGuild(guildId, { automod_enabled: wasEnabled ? 0 : 1 });
        dbHelpers.setModule(guildId, 'automod', !wasEnabled);
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Auto-modération ${wasEnabled ? 'désactivée' : 'activée'}.`).setColor(!wasEnabled ? Colors.SUCCESS : Colors.ERROR)], ephemeral: true });
      }
      if (system === 'antiraid') {
        const config   = dbHelpers.getGuild(guildId);
        const newState = config.antiraid_enabled ? 0 : 1;
        dbHelpers.updateGuild(guildId, { antiraid_enabled: newState });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Anti-raid ${newState ? 'activé' : 'désactivé'}.`).setColor(newState ? Colors.SUCCESS : Colors.ERROR)], ephemeral: true });
      }
      if (system === 'leveling') {
        const isEnabled = dbHelpers.isModuleEnabled(guildId, 'leveling');
        dbHelpers.setModule(guildId, 'leveling', !isEnabled);
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Niveaux ${isEnabled ? 'désactivés' : 'activés'}.`).setColor(!isEnabled ? Colors.SUCCESS : Colors.ERROR)], ephemeral: true });
      }
      if (system === 'economy') {
        const isEnabled = dbHelpers.isModuleEnabled(guildId, 'economy');
        dbHelpers.setModule(guildId, 'economy', !isEnabled);
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Économie ${isEnabled ? 'désactivée' : 'activée'}.`).setColor(!isEnabled ? Colors.SUCCESS : Colors.ERROR)], ephemeral: true });
      }
    }

    // ── System tests ──
    if (interaction.customId.startsWith('sys_test_')) {
      const system = interaction.customId.replace('sys_test_', '');
      if (system === 'captcha') {
        const code        = generateCaptchaCode();
        const imageBuffer = generateCaptchaImage(code);
        const attachment  = new AttachmentBuilder(imageBuffer, { name: 'captcha_test.png' });
        return interaction.reply({
          embeds: [new EmbedBuilder().setTitle('🧪 Preview Captcha').setDescription(`Code de test : \`${code}\``).setImage('attachment://captcha_test.png').setColor(Colors.INFO).setFooter({ text: 'Ceci est un test' })],
          files: [attachment], ephemeral: true,
        });
      }
      if (system === 'noop') return interaction.reply({ content: '🧪 Bouton de test.', ephemeral: true });
      return interaction.reply({ content: `🧪 Test **${system}** — aucune action réelle.`, ephemeral: true });
    }

    return;
  }

  // ── Modal submits ──
  if (interaction.isModalSubmit()) {

    // Captcha
    if (interaction.customId.startsWith('captcha_modal_')) {
      const inputCode = interaction.fields.getTextInputValue('captcha_code');
      const pending   = dbHelpers.getCaptcha(interaction.guild.id, interaction.user.id);
      if (!pending) return interaction.reply({ content: '❌ Aucun captcha en attente.', ephemeral: true });
      const config = dbHelpers.getGuild(interaction.guild.id);
      if (inputCode === pending.code) {
        dbHelpers.removeCaptcha(interaction.guild.id, interaction.user.id);
        try {
          const role = interaction.guild.roles.cache.get(config.captcha_role);
          if (role) { const m = await interaction.guild.members.fetch(interaction.user.id); await m.roles.add(role); }
        } catch (_) {}
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Vérification réussie!').setDescription(`Bienvenue sur **${interaction.guild.name}**!`).setColor(Colors.SUCCESS)], ephemeral: true });
      } else {
        dbHelpers.incrementCaptchaAttempt(interaction.guild.id, interaction.user.id);
        const updated = dbHelpers.getCaptcha(interaction.guild.id, interaction.user.id);
        if (updated.attempts >= config.captcha_retry_limit) {
          dbHelpers.removeCaptcha(interaction.guild.id, interaction.user.id);
          try { const m = await interaction.guild.members.fetch(interaction.user.id); await m.kick('Echec captcha'); } catch (_) {}
          return interaction.reply({ embeds: [new EmbedBuilder().setDescription('❌ Trop de tentatives. Tu as été kick.').setColor(Colors.ERROR)], ephemeral: true });
        }
        const newCode = generateCaptchaCode();
        const newImg  = generateCaptchaImage(newCode);
        dbHelpers.setCaptcha(interaction.guild.id, interaction.user.id, newCode);
        const att = new AttachmentBuilder(newImg, { name: 'captcha.png' });
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Code incorrect!').setDescription(`Essais restants: **${config.captcha_retry_limit - updated.attempts}**`).setImage('attachment://captcha.png').setColor(Colors.ERROR)], files: [att], ephemeral: true });
      }
    }

    // ── Ticket create modal ──
    if (interaction.customId === 'ticket_create_modal') {
      const reason = interaction.fields.getTextInputValue('ticket_reason_input') || null;
      const config = dbHelpers.getGuild(interaction.guild.id);
      if (!config.ticket_staff_role) return interaction.reply({ content: '❌ Tickets non configurés. Utilise `/setup-ticket`.', ephemeral: true });

      // Double check existing ticket
      const existing = dbHelpers.getOpenTickets(interaction.guild.id).find(t => t.user_id === interaction.user.id);
      if (existing) return interaction.reply({ content: `❌ Tu as déjà un ticket ouvert : <#${existing.channel_id}>`, ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const { channel, number } = await createTicketChannel(interaction.guild, member, config, reason);
        return interaction.editReply({ content: `✅ Ton ticket a été créé : ${channel} (#${number})` });
      } catch (err) {
        console.error('❌ Ticket create error:', err);
        return interaction.editReply({ content: '❌ Impossible de créer le ticket. Vérifie mes permissions.' });
      }
    }

    return;
  }

  // ── Captcha button → show modal ──
  if (interaction.isButton() && interaction.customId.startsWith('captcha_verify_')) {
    const targetUserId = interaction.customId.split('_')[2];
    if (interaction.user.id !== targetUserId) return interaction.reply({ content: '❌ Ce captcha n\'est pas pour toi!', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`captcha_modal_${interaction.user.id}`).setTitle('🔐 Vérification Captcha');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('captcha_code').setLabel('Entre le code de l\'image').setStyle(TextInputStyle.Short).setPlaceholder('Ex: A7kP2').setRequired(true).setMinLength(5).setMaxLength(5),
    ));
    return interaction.showModal(modal);
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member, user, options, channel } = interaction;

  try {

    // ── /setup-reaction ──
    if (commandName === 'setup-reaction') {
      const role          = options.getRole('role');
      const emoji         = options.getString('emoji');
      const messageText   = options.getString('message');
      const targetChannel = options.getChannel('salon') || channel;
      const image         = options.getAttachment('image');
      if (!messageText && !image) return interaction.reply({ content: '❌ Fournis au moins un **message** ou une **image**.', ephemeral: true });
      const sendOpts = {};
      if (messageText) sendOpts.content = messageText;
      if (image) sendOpts.files = [{ attachment: image.url, name: image.name }];
      const sent          = await targetChannel.send(sendOpts);
      const reactionResult = await sent.react(emoji);
      const resolvedEmoji  = reactionResult.emoji.id ? `${reactionResult.emoji.name}:${reactionResult.emoji.id}` : reactionResult.emoji.name;
      dbHelpers.addReactionRole(guild.id, targetChannel.id, sent.id, resolvedEmoji, role.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Reaction Role configuré').setDescription(`**Salon:** ${targetChannel}\n**Emoji:** ${emoji}\n**Rôle:** ${role}`).setColor(Colors.SUCCESS).setTimestamp()], ephemeral: true });
    }

    // ── /setup-captcha ──
    if (commandName === 'setup-captcha') {
      const captchaChannel = options.getChannel('salon');
      const captchaRole    = options.getRole('role');
      const retryLimit     = options.getInteger('essais') || 3;
      dbHelpers.getGuild(guild.id);
      dbHelpers.updateGuild(guild.id, { captcha_enabled: 1, captcha_channel: captchaChannel.id, captcha_role: captchaRole.id, captcha_retry_limit: retryLimit });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔐 Captcha configuré').setDescription(`**Salon:** ${captchaChannel}\n**Rôle:** ${captchaRole}\n**Essais:** ${retryLimit}\n**Kick auto:** 10 min`).setColor(Colors.SUCCESS).setTimestamp()], ephemeral: true });
    }

// ══════════════════════════════════════════════════
// ── /setup-ticket ──
// ══════════════════════════════════════════════════
if (commandName === 'setup-ticket') {

  const panelChannel   = options.getChannel('salon');
  const staffRole      = options.getRole('staff');
  const ticketCategory = options.getChannel('categorie');

  // ⚠️ Validation des options
  if (!panelChannel || panelChannel.type !== 0) 
    return interaction.reply({ content: '❌ Salon invalide.', ephemeral: true });
  if (!staffRole) 
    return interaction.reply({ content: '❌ Rôle staff invalide.', ephemeral: true });

  // 🎨 Options personnalisables
  const titre       = options.getString('titre') || `🎫 Support — ${guild.name}`;
  const description = options.getString('description') || 'Clique sur le bouton ci-dessous pour ouvrir un ticket.\nUn membre du staff te répondra rapidement.';
  let couleur       = options.getString('couleur') || '#5865F2';
  const image       = options.getString('image');
  const footer      = options.getString('footer') || `${guild.name} · Support`;

  description = description.replace(/\\n/g, '\n');

  // ✅ Validation couleur hex
  if (couleur.startsWith('#')) {
    try { couleur = parseInt(couleur.replace('#', ''), 16); } 
    catch { couleur = 0x5865F2; }
  }

  // 💾 Sauvegarde config
  await dbHelpers.getGuild(guild.id);
  await dbHelpers.updateGuild(guild.id, {
    ticket_channel:    panelChannel.id,
    ticket_staff_role: staffRole.id,
    ticket_category:   ticketCategory?.id || null,
  });

  // 🧱 Création embed CUSTOM
  const panelEmbed = new EmbedBuilder()
    .setTitle(titre)
    .setDescription(description)
    .setColor(couleur)
    .setFooter({ text: footer })
    .setTimestamp();

  if (image) panelEmbed.setImage(image);

  // 🔘 Bouton ouverture ticket
  const openBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_open')
      .setLabel('Ouvrir un ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫'),
  );

  // 📤 Envoi panneau
  await panelChannel.send({
    embeds: [panelEmbed],
    components: [openBtn]
  });

  // ✅ Confirmation
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('✅ Système de tickets configuré')
        .addFields(
          { name: 'Salon panneau', value: `${panelChannel}`, inline: true },
          { name: 'Rôle staff', value: `${staffRole}`, inline: true },
          { name: 'Catégorie', value: ticketCategory ? `${ticketCategory}` : 'Racine', inline: true },
          { name: 'Titre', value: titre, inline: false },
          { name: 'Description', value: description, inline: false },
          { name: 'Couleur', value: `#${couleur.toString(16).padStart(6,'0')}`, inline: true },
          { name: 'Footer', value: footer, inline: true },
          { name: 'Image', value: image ? image : 'Aucune', inline: true },
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
      if (!config.ticket_staff_role) return interaction.reply({ content: '❌ Tickets non configurés. Utilise `/setup-ticket`.', ephemeral: true });
      const existing = dbHelpers.getOpenTickets(guild.id).find(t => t.user_id === user.id);
      if (existing) return interaction.reply({ content: `❌ Tu as déjà un ticket ouvert : <#${existing.channel_id}>`, ephemeral: true });
      const reason = options.getString('raison');
      const modal  = new ModalBuilder().setCustomId('ticket_create_modal').setTitle('📩 Ouvrir un ticket');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_reason_input')
          .setLabel('Raison du ticket')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Décris ton problème...')
          .setRequired(false)
          .setMaxLength(500)
          .setValue(reason || ''),
      ));
      return interaction.showModal(modal);
    }

    // ── /ticket-close ──
    if (commandName === 'ticket-close') {
      const ticket = dbHelpers.getTicketByChannel(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
      await interaction.reply({ embeds: [new EmbedBuilder().setDescription('🔒 Ticket fermé. Suppression dans 5 secondes...').setColor(Colors.ERROR)] });
      dbHelpers.closeTicket(channel.id);
      await sendLog(guild, new EmbedBuilder().setTitle('🎫 Ticket fermé').addFields({ name: 'Salon', value: channel.name, inline: true }, { name: 'Fermé par', value: user.tag, inline: true }).setColor(Colors.WARNING).setTimestamp());
      setTimeout(() => channel.delete().catch(() => {}), 5000);
      return;
    }

    // ── /ticket-claim ──
    if (commandName === 'ticket-claim') {
      const ticket = dbHelpers.getTicketByChannel(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
      if (ticket.claimed_by) return interaction.reply({ content: `❌ Ticket déjà pris en charge par <@${ticket.claimed_by}>.`, ephemeral: true });
      dbHelpers.claimTicket(channel.id, user.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${user} a pris en charge ce ticket.`).setColor(Colors.SUCCESS)] });
    }

    // ── /ticket-add ──
    if (commandName === 'ticket-add') {
      const ticket = dbHelpers.getTicketByChannel(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
      const targetMember = options.getMember('membre');
      if (!targetMember) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
      await channel.permissionOverwrites.edit(targetMember.id, {
        ViewChannel:      true,
        SendMessages:     true,
        ReadMessageHistory: true,
      });
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${targetMember} a été ajouté au ticket.`).setColor(Colors.SUCCESS)] });
    }

    // ── /ticket-remove ──
    if (commandName === 'ticket-remove') {
      const ticket = dbHelpers.getTicketByChannel(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
      const targetMember = options.getMember('membre');
      if (!targetMember) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
      if (targetMember.id === ticket.user_id) return interaction.reply({ content: '❌ Tu ne peux pas retirer l\'auteur du ticket.', ephemeral: true });
      await channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: false });
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${targetMember} a été retiré du ticket.`).setColor(Colors.SUCCESS)] });
    }

    // ══════════════════════════════════════════════════
    // ── /embed ──
    // ══════════════════════════════════════════════════
    if (commandName === 'embed') {
      const titre        = options.getString('titre');
      const description  = options.getString('description');
      const targetChannel = options.getChannel('salon') || channel;
      const couleur      = options.getString('couleur');
      const footer       = options.getString('footer');
      const auteur       = options.getString('auteur');
      const auteurIcon   = options.getString('auteur_icon');
      const thumbnail    = options.getString('thumbnail');
      const imageUrl     = options.getString('image');
      const fichierImage = options.getAttachment('fichier_image');
      const showTimestamp = options.getBoolean('timestamp') ?? false;

      // Construit l'embed
      const embed = new EmbedBuilder()
        .setTitle(titre)
        .setDescription(description.replace(/\\n/g, '\n')) // support \n dans la description
        .setColor(parseColor(couleur));

      if (footer)    embed.setFooter({ text: footer });
      if (auteur)    embed.setAuthor({ name: auteur, iconURL: auteurIcon || undefined });
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (showTimestamp) embed.setTimestamp();

      // Image : priorité au fichier uploadé, sinon URL
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
            .setDescription(`✅ Embed envoyé dans ${targetChannel} !`)
            .setColor(Colors.SUCCESS)],
          ephemeral: true,
        });
      } catch (err) {
        return interaction.reply({ content: `❌ Impossible d'envoyer l'embed : ${err.message}`, ephemeral: true });
      }
    }

    // ── /ban ──
    if (commandName === 'ban') {
      const target = options.getMember('utilisateur');
      const reason = options.getString('raison') || 'Aucune raison fournie';
      if (!target) return interaction.reply({ content: '❌ Utilisateur introuvable.', ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: '❌ Je ne peux pas bannir cet utilisateur.', ephemeral: true });
      if (member.roles.highest.position <= target.roles.highest.position) return interaction.reply({ content: '❌ Rôle insuffisant.', ephemeral: true });
      await target.ban({ reason: `${user.tag}: ${reason}` });
      dbHelpers.addModLog(guild.id, 'BAN', target.id, user.id, reason);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔨 Membre banni').setDescription(`**Utilisateur:** ${target.user.tag}\n**Modérateur:** ${user.tag}\n**Raison:** ${reason}`).setColor(Colors.ERROR).setTimestamp()] });
      await sendLog(guild, new EmbedBuilder().setTitle('📋 Ban').addFields({ name: 'Utilisateur', value: `${target.user.tag} (${target.id})`, inline: true }, { name: 'Modérateur', value: user.tag, inline: true }, { name: 'Raison', value: reason }).setColor(Colors.ERROR).setTimestamp());
    }

    // ── /kick ──
    if (commandName === 'kick') {
      const target = options.getMember('utilisateur');
      const reason = options.getString('raison') || 'Aucune raison fournie';
      if (!target || !target.kickable) return interaction.reply({ content: '❌ Impossible d\'expulser cet utilisateur.', ephemeral: true });
      if (member.roles.highest.position <= target.roles.highest.position) return interaction.reply({ content: '❌ Rôle insuffisant.', ephemeral: true });
      await target.kick(`${user.tag}: ${reason}`);
      dbHelpers.addModLog(guild.id, 'KICK', target.id, user.id, reason);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('👢 Membre expulsé').setDescription(`**Utilisateur:** ${target.user.tag}\n**Modérateur:** ${user.tag}\n**Raison:** ${reason}`).setColor(Colors.WARNING).setTimestamp()] });
    }

    // ── /mute ──
    if (commandName === 'mute') {
      const target      = options.getMember('utilisateur');
      const durationStr = options.getString('duree');
      const reason      = options.getString('raison') || 'Aucune raison fournie';
      if (!target || !target.moderatable) return interaction.reply({ content: '❌ Impossible de mute cet utilisateur.', ephemeral: true });
      const duration = parseDuration(durationStr);
      if (!duration) return interaction.reply({ content: '❌ Durée invalide. Ex: `10m`, `1h`, `1d`', ephemeral: true });
      if (duration > 28 * 86400000) return interaction.reply({ content: '❌ Maximum 28 jours.', ephemeral: true });
      await target.timeout(duration, `${user.tag}: ${reason}`);
      dbHelpers.addMute(guild.id, target.id, new Date(Date.now() + duration).toISOString());
      dbHelpers.addModLog(guild.id, 'MUTE', target.id, user.id, `${reason} (${formatDuration(duration)})`);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔇 Membre muté').setDescription(`**Utilisateur:** ${target.user.tag}\n**Durée:** ${formatDuration(duration)}\n**Raison:** ${reason}`).setColor(Colors.MODERATION).setTimestamp()] });
    }

    // ── /unmute ──
    if (commandName === 'unmute') {
      const target = options.getMember('utilisateur');
      if (!target) return interaction.reply({ content: '❌ Utilisateur introuvable.', ephemeral: true });
      await target.timeout(null);
      dbHelpers.removeMute(guild.id, target.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔊 Membre unmuté').setDescription(`**Utilisateur:** ${target.user.tag}`).setColor(Colors.SUCCESS).setTimestamp()] });
    }

    // ── /warn ──
    if (commandName === 'warn') {
      const target = options.getMember('utilisateur');
      const reason = options.getString('raison');
      if (!target || target.user.bot) return interaction.reply({ content: '❌ Utilisateur invalide.', ephemeral: true });
      const warnCount = dbHelpers.addWarning(guild.id, target.id, user.id, reason);
      dbHelpers.addModLog(guild.id, 'WARN', target.id, user.id, reason);
      let desc = `**Utilisateur:** ${target.user.tag}\n**Modérateur:** ${user.tag}\n**Raison:** ${reason}\n**Total:** ${warnCount}`;
      if (warnCount >= 5 && target.bannable) {
        await target.ban({ reason: '5 avertissements' });
        desc += '\n\n🔨 **Ban automatique** (5 avertissements)';
      } else if (warnCount >= 3 && target.moderatable) {
        await target.timeout(3600000, '3 avertissements');
        desc += '\n\n🔇 **Mute 1h automatique** (3 avertissements)';
      }
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚠️ Avertissement').setDescription(desc).setColor(Colors.WARNING).setTimestamp()] });
    }

    // ── /warnings ──
    if (commandName === 'warnings') {
      const target = options.getUser('utilisateur');
      const warns  = dbHelpers.getWarnings(guild.id, target.id);
      if (!warns.length) return interaction.reply({ content: `✅ ${target.tag} n'a aucun avertissement.`, ephemeral: true });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`⚠️ Avertissements de ${target.tag}`).setDescription(warns.map((w, i) => `**#${i + 1}** - ${w.reason}\n> Par <@${w.moderator_id}> - <t:${Math.floor(new Date(w.created_at).getTime() / 1000)}:R>`).join('\n\n')).setColor(Colors.WARNING).setFooter({ text: `Total: ${warns.length}` }).setTimestamp()] });
    }

    // ── /clear ──
    if (commandName === 'clear') {
      const amount  = options.getInteger('nombre');
      const deleted = await channel.bulkDelete(amount, true);
      const reply   = await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🗑️ ${deleted.size} message(s) supprimé(s)`).setColor(Colors.SUCCESS)], fetchReply: true });
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    }

    // ── /level ──
    if (commandName === 'level') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'leveling')) return interaction.reply({ content: '❌ Leveling désactivé.', ephemeral: true });
      const target   = options.getUser('utilisateur') || user;
      const data     = dbHelpers.getLevel(guild.id, target.id);
      const required = getRequiredXP(data.level);
      const progress = Math.round((data.xp / required) * 100);
      const bar      = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📊 Niveau de ${target.username}`).setThumbnail(target.displayAvatarURL({ size: 128 })).addFields({ name: '🏆 Niveau', value: `${data.level}`, inline: true }, { name: '✨ XP', value: `${data.xp}/${required}`, inline: true }, { name: '📈 Progression', value: `${bar} ${progress}%` }).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /rank ──
    if (commandName === 'rank') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'leveling')) return interaction.reply({ content: '❌ Leveling désactivé.', ephemeral: true });
      const lb = dbHelpers.getLeaderboard(guild.id, 10);
      if (!lb.length) return interaction.reply({ content: '📊 Aucune donnée.', ephemeral: true });
      const medals = ['🥇', '🥈', '🥉'];
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏆 Classement — ${guild.name}`).setDescription(lb.map((e, i) => `${i < 3 ? medals[i] : `**${i + 1}.**`} <@${e.user_id}> — Niveau **${e.level}** (${e.xp} XP)`).join('\n')).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /daily ──
    if (commandName === 'daily') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'economy')) return interaction.reply({ content: '❌ Économie désactivée.', ephemeral: true });
      const result = dbHelpers.claimDaily(guild.id, user.id);
      if (!result.success) return interaction.reply({ content: `⏰ Reviens dans **${result.remaining}**.`, ephemeral: true });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💰 Récompense quotidienne').setDescription(`Tu as reçu **${result.reward}** pièces!\n💎 Nouveau solde: **${result.newBalance}**`).setColor(Colors.SUCCESS).setTimestamp()] });
    }

    // ── /balance ──
    if (commandName === 'balance') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'economy')) return interaction.reply({ content: '❌ Économie désactivée.', ephemeral: true });
      const target = options.getUser('utilisateur') || user;
      const eco    = dbHelpers.getBalance(guild.id, target.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`💰 Solde de ${target.username}`).setDescription(`**${eco.balance}** pièces 💎`).setThumbnail(target.displayAvatarURL({ size: 128 })).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /giveaway ──
    if (commandName === 'giveaway') {
      const prize       = options.getString('prix');
      const durationStr = options.getString('duree');
      const winnerCount = options.getInteger('gagnants') || 1;
      const targetCh    = options.getChannel('salon') || channel;
      const duration    = parseDuration(durationStr);
      if (!duration) return interaction.reply({ content: '❌ Durée invalide.', ephemeral: true });
      const endTime    = new Date(Date.now() + duration);
      const embed      = new EmbedBuilder().setTitle('🎉 GIVEAWAY').setDescription(`**Prix:** ${prize}\n**Gagnant(s):** ${winnerCount}\n**Fin:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\n**Organisé par:** ${user}`).setColor(Colors.PRIMARY).setTimestamp(endTime);
      const giveawayId = dbHelpers.createGiveaway(guild.id, targetCh.id, null, prize, winnerCount, endTime.toISOString(), user.id);
      const button     = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`giveaway_${giveawayId}`).setLabel('Participer 🎉').setStyle(ButtonStyle.Primary));
      const sent       = await targetCh.send({ embeds: [embed], components: [button] });
      const { db }     = require('./utils');
      db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(sent.id, giveawayId);
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🎉 Giveaway lancé dans ${targetCh}!`).setColor(Colors.SUCCESS)], ephemeral: true });
    }

    // ── /poll ──
    if (commandName === 'poll') {
      const question    = options.getString('question');
      const pollOptions = [];
      for (let i = 1; i <= 5; i++) { const o = options.getString(`option${i}`); if (o) pollOptions.push(o); }
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      const sent   = await channel.send({ embeds: [new EmbedBuilder().setTitle(`📊 ${question}`).setDescription(pollOptions.map((o, i) => `${emojis[i]} ${o}`).join('\n\n')).setColor(Colors.PRIMARY).setFooter({ text: `Sondage par ${user.username}` }).setTimestamp()] });
      for (let i = 0; i < pollOptions.length; i++) await sent.react(emojis[i]);
      return interaction.reply({ content: '✅ Sondage créé!', ephemeral: true });
    }

    // ── /userinfo ──
    if (commandName === 'userinfo') {
      const target     = options.getMember('utilisateur') || member;
      const targetUser = target.user;
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${targetUser.tag}`).setThumbnail(targetUser.displayAvatarURL({ size: 256 })).addFields({ name: '🆔 ID', value: targetUser.id, inline: true }, { name: '📛 Surnom', value: target.nickname || 'Aucun', inline: true }, { name: '🤖 Bot', value: targetUser.bot ? 'Oui' : 'Non', inline: true }, { name: '📅 Compte créé', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }, { name: '📥 A rejoint', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true }, { name: '🎭 Rôles', value: target.roles.cache.filter(r => r.id !== guild.id).map(r => `${r}`).join(', ') || 'Aucun' }).setColor(target.displayHexColor || Colors.PRIMARY).setTimestamp()] });
    }

    // ── /serverinfo ──
    if (commandName === 'serverinfo') {
      const owner = await guild.fetchOwner();
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏠 ${guild.name}`).setThumbnail(guild.iconURL({ size: 256 })).addFields({ name: '🆔 ID', value: guild.id, inline: true }, { name: '👑 Propriétaire', value: owner.user.tag, inline: true }, { name: '📅 Créé le', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }, { name: '👥 Membres', value: `${guild.memberCount}`, inline: true }, { name: '💬 Salons', value: `${guild.channels.cache.size}`, inline: true }, { name: '💎 Boosts', value: `${guild.premiumSubscriptionCount || 0} (Niveau ${guild.premiumTier})`, inline: true }).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /config ──
    if (commandName === 'config') {
      const sub = interaction.options.getSubcommand();
      dbHelpers.getGuild(guild.id);
      if (sub === 'logs') {
        const logChannel = options.getChannel('salon');
        dbHelpers.updateGuild(guild.id, { log_channel: logChannel.id });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Salon de logs : ${logChannel}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'automod') {
        dbHelpers.updateGuild(guild.id, { automod_enabled: options.getBoolean('activer') ? 1 : 0 });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Auto-modération ${options.getBoolean('activer') ? 'activée' : 'désactivée'}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'antiraid') {
        dbHelpers.updateGuild(guild.id, { antiraid_enabled: options.getBoolean('activer') ? 1 : 0 });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Anti-raid ${options.getBoolean('activer') ? 'activé' : 'désactivé'}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'leveling') {
        dbHelpers.setModule(guild.id, 'leveling', options.getBoolean('activer'));
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Leveling ${options.getBoolean('activer') ? 'activé' : 'désactivé'}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'prefix') {
        dbHelpers.updateGuild(guild.id, { prefix: options.getString('prefixe') });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Préfixe : \`${options.getString('prefixe')}\``).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'langue') {
        dbHelpers.updateGuild(guild.id, { language: options.getString('langue') });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Langue changée`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
    }

    // ── /module ──
    if (commandName === 'module') {
      dbHelpers.setModule(guild.id, options.getString('nom'), options.getBoolean('activer'));
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Module **${options.getString('nom')}** ${options.getBoolean('activer') ? 'activé' : 'désactivé'}`).setColor(Colors.SUCCESS)], ephemeral: true });
    }

    // ── /captcha ──
    if (commandName === 'captcha') {
      const config    = dbHelpers.getGuild(guild.id);
      const isEnabled = !!config.captcha_enabled;
      const embed     = new EmbedBuilder().setTitle('🔐 Système Captcha').setDescription(`**Statut:** ${isEnabled ? '🟢 Activé' : '🔴 Désactivé'}\n**Salon:** ${config.captcha_channel ? `<#${config.captcha_channel}>` : 'Non défini'}\n**Rôle:** ${config.captcha_role ? `<@&${config.captcha_role}>` : 'Non défini'}\n**Essais:** ${config.captcha_retry_limit || 3}`).setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons   = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_captcha').setLabel(isEnabled ? 'Désactiver' : 'Activer').setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success), new ButtonBuilder().setCustomId('sys_test_captcha').setLabel('Tester').setStyle(ButtonStyle.Secondary));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /reaction-roles ──
    if (commandName === 'reaction-roles') {
      const { db } = require('./utils');
      const rrList = db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ?').all(guild.id);
      const desc   = rrList.length > 0 ? rrList.slice(0, 10).map((rr, i) => `**${i + 1}.** ${rr.emoji} → <@&${rr.role_id}> (dans <#${rr.channel_id}>)`).join('\n') : '*Aucun reaction role configuré.*';
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔁 Reaction Roles').setDescription(`**Total:** ${rrList.length}\n\n${desc}`).setColor(rrList.length > 0 ? Colors.SUCCESS : Colors.ERROR).setTimestamp()], ephemeral: true });
    }

    // ── /automod ──
    if (commandName === 'automod') {
      const config    = dbHelpers.getGuild(guild.id);
      const fullyActive = !!config.automod_enabled && dbHelpers.isModuleEnabled(guild.id, 'automod');
      const embed     = new EmbedBuilder().setTitle('🛡️ Auto-Modération').setDescription(`**Statut:** ${fullyActive ? '🟢 Activée' : '🔴 Désactivée'}\n\n> Anti-spam · Filtre insultes · Anti-liens`).setColor(fullyActive ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons   = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_automod').setLabel(fullyActive ? 'Désactiver' : 'Activer').setStyle(fullyActive ? ButtonStyle.Danger : ButtonStyle.Success), new ButtonBuilder().setCustomId('sys_test_automod').setLabel('Tester').setStyle(ButtonStyle.Secondary));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /antiraid ──
    if (commandName === 'antiraid') {
      const config  = dbHelpers.getGuild(guild.id);
      const isEnabled = !!config.antiraid_enabled;
      const embed   = new EmbedBuilder().setTitle('🛡️ Anti-Raid').setDescription(`**Statut:** ${isEnabled ? '🟢 Activé' : '🔴 Désactivé'}\n\n> 5+ joins en 10s → kick automatique`).setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_antiraid').setLabel(isEnabled ? 'Désactiver' : 'Activer').setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /leveling ──
    if (commandName === 'leveling') {
      const isEnabled = dbHelpers.isModuleEnabled(guild.id, 'leveling');
      const topUsers  = dbHelpers.getLeaderboard(guild.id, 3);
      const topDesc   = topUsers.length > 0 ? ['🥇','🥈','🥉'].map((m, i) => `${m} <@${topUsers[i].user_id}> — Niv. **${topUsers[i].level}**`).join('\n') : '*Aucune donnée.*';
      const embed     = new EmbedBuilder().setTitle('📊 Leveling').setDescription(`**Statut:** ${isEnabled ? '🟢 Activé' : '🔴 Désactivé'}\n\n> 15–24 XP/message (cooldown 60s)\n\n**Top 3:**\n${topDesc}`).setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons   = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_leveling').setLabel(isEnabled ? 'Désactiver' : 'Activer').setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /economie ──
    if (commandName === 'economie') {
      const isEnabled = dbHelpers.isModuleEnabled(guild.id, 'economy');
      const embed     = new EmbedBuilder().setTitle('💰 Économie').setDescription(`**Statut:** ${isEnabled ? '🟢 Activée' : '🔴 Désactivée'}\n\n> /daily — 100–150 pièces\n> /balance — Voir son solde`).setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons   = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_economy').setLabel(isEnabled ? 'Désactiver' : 'Activer').setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /statistics ──
    if (commandName === 'statistics') {
      const target         = options.getUser('membre') || user;
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
        .setTitle(`📊 Statistiques de ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '💬 Messages envoyés', value: `**${stats.message_count.toLocaleString()}**`, inline: true },
          { name: '🎙️ Temps en vocal',   value: `**${voiceFmt}**`,                             inline: true },
        )
        .setColor(Colors.PRIMARY)
        .setFooter({ text: `Statistiques sur ${guild.name}` })
        .setTimestamp();
      if (activeSession) embed.addFields({ name: '🟢 Statut', value: 'Actuellement en vocal', inline: false });
      return interaction.reply({ embeds: [embed] });
    }

    // ── /help ──
    if (commandName === 'help') {
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle('📖 Nira — Commandes')
        .addFields(
          { name: '📋 Systèmes', value: '`/captcha` `/reaction-roles` `/automod` `/antiraid` `/leveling` `/economie` `/statistics`' },
          { name: '⚙️ Config',   value: '`/setup-reaction` `/setup-captcha` `/setup-ticket` `/config` `/module`' },
          { name: '🎫 Tickets',  value: '`/ticket` `/ticket-close` `/ticket-claim` `/ticket-add` `/ticket-remove`' },
          { name: '✉️ Embed',    value: '`/embed` — Crée un embed personnalisé avec image, couleur, auteur, footer...' },
          { name: '🛡️ Modération', value: '`/ban` `/kick` `/mute` `/unmute` `/warn` `/warnings` `/clear`' },
          { name: '🎮 Fun',      value: '`/level` `/rank` `/daily` `/balance` `/giveaway` `/poll` `/userinfo` `/serverinfo`' },
        )
        .setColor(Colors.PRIMARY)
        .setFooter({ text: 'Nira Bot — Professionnel, utile, moderne.' })
        .setTimestamp()] });
    }

  } catch (error) {
    console.error(`❌ Erreur commande /${commandName}:`, error);
    const content = '❌ Une erreur est survenue.';
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
    try { await member.kick('Anti-raid'); await sendLog(member.guild, new EmbedBuilder().setTitle('🛡️ Anti-Raid').setDescription(`${member.user.tag} kick (raid détecté)`).setColor(Colors.ERROR).setTimestamp()); return; } catch (_) {}
  }
  if (config.captcha_enabled && config.captcha_channel) {
    try {
      const captchaChannel = await member.guild.channels.fetch(config.captcha_channel);
      if (!captchaChannel) return;
      const code = generateCaptchaCode();
      dbHelpers.setCaptcha(member.guild.id, member.id, code);
      const att = new AttachmentBuilder(generateCaptchaImage(code), { name: 'captcha.png' });
      const embed = new EmbedBuilder().setTitle('🔐 Vérification requise').setDescription(`Bienvenue ${member}!\n\nEntre le code de l'image.\n⚠️ **${config.captcha_retry_limit}** essais. ⏰ Kick après **10 min**.`).setImage('attachment://captcha.png').setColor(Colors.INFO).setTimestamp();
      const btn   = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`captcha_verify_${member.id}`).setLabel('Entrer le code').setStyle(ButtonStyle.Primary).setEmoji('🔐'));
      await captchaChannel.send({ content: `${member}`, embeds: [embed], files: [att], components: [btn] });
      setTimeout(async () => {
        const pending = dbHelpers.getCaptcha(member.guild.id, member.id);
        if (pending) { dbHelpers.removeCaptcha(member.guild.id, member.id); try { await member.kick('Captcha expiré'); await captchaChannel.send({ embeds: [new EmbedBuilder().setDescription(`⏰ ${member.user.tag} kick (captcha expiré).`).setColor(Colors.ERROR)] }); } catch (_) {} }
      }, 600000);
    } catch (e) { console.error('Captcha join:', e); }
  }
  await sendLog(member.guild, new EmbedBuilder().setTitle('📥 Nouveau membre').setDescription(`${member.user.tag} a rejoint`).addFields({ name: 'ID', value: member.id, inline: true }, { name: 'Compte créé', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }).setThumbnail(member.user.displayAvatarURL()).setColor(Colors.SUCCESS).setTimestamp());
});

// ═══════════════════════════════════════════════════════════════
// MEMBER LEAVE LOG
// ═══════════════════════════════════════════════════════════════
client.on(Events.GuildMemberRemove, async (member) => {
  if (member.user.bot) return;
  await sendLog(member.guild, new EmbedBuilder().setTitle('📤 Membre parti').setDescription(`${member.user.tag}`).addFields({ name: 'ID', value: member.id, inline: true }, { name: 'Rôles', value: member.roles.cache.filter(r => r.id !== member.guild.id).map(r => `${r}`).join(', ') || 'Aucun' }).setThumbnail(member.user.displayAvatarURL()).setColor(Colors.ERROR).setTimestamp());
});

// ═══════════════════════════════════════════════════════════════
// ROLE UPDATE LOG
// ═══════════════════════════════════════════════════════════════
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const addedRoles   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
  if (addedRoles.size > 0) await sendLog(newMember.guild, new EmbedBuilder().setTitle('🎭 Rôle(s) ajouté(s)').setDescription(`**${newMember.user.tag}** — ${addedRoles.map(r => `${r}`).join(', ')}`).setColor(Colors.SUCCESS).setTimestamp());
  if (removedRoles.size > 0) await sendLog(newMember.guild, new EmbedBuilder().setTitle('🎭 Rôle(s) retiré(s)').setDescription(`**${newMember.user.tag}** — ${removedRoles.map(r => `${r}`).join(', ')}`).setColor(Colors.ERROR).setTimestamp());
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
      try { await message.delete(); const m = await message.guild.members.fetch(message.author.id); if (m.moderatable) { await m.timeout(300000, 'Anti-spam'); await message.channel.send({ embeds: [new EmbedBuilder().setDescription(`🔇 ${message.author} muté 5 minutes (spam).`).setColor(Colors.MODERATION)] }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)); } } catch (_) {}
      return;
    }
    if (containsBadWord(message.content)) {
      try { await message.delete(); await message.channel.send({ embeds: [new EmbedBuilder().setDescription(`⚠️ ${message.author}, message supprimé (langage inapproprié).`).setColor(Colors.WARNING)] }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)); } catch (_) {}
      return;
    }
    if (/(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\//i.test(message.content)) {
      const m = await message.guild.members.fetch(message.author.id);
      if (!m.permissions.has(PermissionFlagsBits.ManageMessages)) {
        try { await message.delete(); await message.channel.send({ embeds: [new EmbedBuilder().setDescription(`⚠️ ${message.author}, liens d'invitation interdits.`).setColor(Colors.WARNING)] }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)); } catch (_) {}
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
      if (result.leveledUp) await message.channel.send({ embeds: [new EmbedBuilder().setTitle('🎉 Level Up!').setDescription(`Félicitations ${message.author}! Tu es maintenant **niveau ${result.newLevel}**!`).setColor(Colors.SUCCESS).setThumbnail(message.author.displayAvatarURL({ size: 128 })).setTimestamp()] }).catch(() => {});
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
