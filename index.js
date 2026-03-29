// ═══════════════════════════════════════════════════════════════
//  NIRA BOT — index.js
// ═══════════════════════════════════════════════════════════════
const {
  Client, GatewayIntentBits, Partials, Collection,
  SlashCommandBuilder, REST, Routes, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  AttachmentBuilder, ChannelType, Events,
} = require('discord.js');
const express = require('express');
const cors    = require('cors');
const {
  dbHelpers, Colors, getRequiredXP,
  generateCaptchaCode, generateCaptchaImage,
  checkSpam, containsBadWord, parseDuration, formatDuration,
  buildWelcomeMessage,
} = require('./utils');

// ═══════════════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const TOKEN           = process.env.BOT_TOKEN;
const NIRA_GUILD_ID   = process.env.NIRA_GUILD_ID   || '';
const SUPPORTER_ROLE_ID = process.env.SUPPORTER_ROLE_ID || '';
const PREMIUM_ROLE_ID   = process.env.PREMIUM_ROLE_ID   || '';
if (!TOKEN) { console.error('❌ BOT_TOKEN manquant.'); process.exit(1); }

// ═══════════════════════════════════════════════════════════════
//  CLIENT
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
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
});
client.cooldowns = new Collection();

// ═══════════════════════════════════════════════════════════════
//  SLASH COMMANDS
// ═══════════════════════════════════════════════════════════════
const commands = [
  // ── Setup ──────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('setup-reaction')
    .setDescription('Créer un message avec réaction pour attribuer un rôle')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(o => o.setName('role').setDescription('Le rôle à attribuer').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('L\'emoji à utiliser').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Le message à afficher'))
    .addChannelOption(o => o.setName('salon').setDescription('Le salon où envoyer le message'))
    .addAttachmentOption(o => o.setName('image').setDescription('Image à joindre')),

  new SlashCommandBuilder()
    .setName('setup-captcha')
    .setDescription('Configurer le système de captcha')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('salon').setDescription('Salon de vérification').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Rôle donné après validation').setRequired(true))
    .addIntegerOption(o => o.setName('essais').setDescription('Essais max (défaut: 3)').setMinValue(1).setMaxValue(10)),

  new SlashCommandBuilder()
    .setName('setup-welcome')
    .setDescription('Configurer le message de bienvenue')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('salon').setDescription('Salon de bienvenue').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message ({user} {server} {count} {tag})').setRequired(true))
    .addBooleanOption(o => o.setName('embed').setDescription('Envoyer en embed ? (défaut: oui)'))
    .addStringOption(o => o.setName('titre').setDescription('Titre de l\'embed'))
    .addStringOption(o => o.setName('couleur').setDescription('Couleur hex (ex: #5865F2)'))
    .addBooleanOption(o => o.setName('avatar').setDescription('Afficher l\'avatar ? (défaut: oui)')),

  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Tester le message de bienvenue')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('setup-statistics')
    .setDescription('Créer les salons de statistiques du serveur (mis à jour toutes les 10min)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('categorie').setDescription('Nom de la catégorie (défaut: ── · STATISTICS · ──)')),

  new SlashCommandBuilder()
    .setName('setup-ticket')
    .setDescription('Configurer le système de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('salon').setDescription('Salon où envoyer le panneau ticket').setRequired(true))
    .addRoleOption(o => o.setName('staff').setDescription('Rôle staff pour les tickets').setRequired(true))
    .addChannelOption(o => o.setName('categorie').setDescription('Catégorie pour les salons de tickets')),

  // ── Modération ─────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannir un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison')),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulser un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison')),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('duree').setDescription('Durée (10m, 1h, 1d)').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison')),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avertir un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Voir les avertissements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('utilisateur').setDescription('L\'utilisateur').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprimer des messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('nombre').setDescription('Nombre').setRequired(true).setMinValue(1).setMaxValue(100)),

  // ── Tickets ────────────────────────────────────────────────
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

  // ── Fun & Utils ────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('level')
    .setDescription('Voir ton niveau et XP')
    .addUserOption(o => o.setName('utilisateur').setDescription('Voir le niveau d\'un autre')),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Voir le classement du serveur'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Récupérer ta récompense quotidienne'),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Voir ton solde')
    .addUserOption(o => o.setName('utilisateur').setDescription('Voir le solde d\'un autre')),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Lancer un giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('prix').setDescription('Le prix').setRequired(true))
    .addStringOption(o => o.setName('duree').setDescription('Durée (1h, 1d, 7j)').setRequired(true))
    .addIntegerOption(o => o.setName('gagnants').setDescription('Nombre de gagnants').setMinValue(1).setMaxValue(20))
    .addChannelOption(o => o.setName('salon').setDescription('Salon')),

  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Créer un sondage')
    .addStringOption(o => o.setName('question').setDescription('La question').setRequired(true))
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

  // ── Configuration ──────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurer Nira')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('logs').setDescription('Salon de logs').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)))
    .addSubcommand(s => s.setName('automod').setDescription('Auto-modération').addBooleanOption(o => o.setName('activer').setDescription('Activer/désactiver').setRequired(true)))
    .addSubcommand(s => s.setName('antiraid').setDescription('Anti-raid').addBooleanOption(o => o.setName('activer').setDescription('Activer/désactiver').setRequired(true)))
    .addSubcommand(s => s.setName('leveling').setDescription('Leveling').addBooleanOption(o => o.setName('activer').setDescription('Activer/désactiver').setRequired(true)))
    .addSubcommand(s => s.setName('prefix').setDescription('Changer le préfixe').addStringOption(o => o.setName('prefixe').setDescription('Préfixe').setRequired(true)))
    .addSubcommand(s => s.setName('langue').setDescription('Changer la langue').addStringOption(o => o.setName('langue').setDescription('Langue').setRequired(true).addChoices({ name: 'Français', value: 'fr' }, { name: 'English', value: 'en' }))),

  new SlashCommandBuilder()
    .setName('module')
    .setDescription('Activer/désactiver un module')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('nom').setDescription('Module').setRequired(true)
      .addChoices({ name: 'Leveling', value: 'leveling' }, { name: 'Économie', value: 'economy' }, { name: 'Auto-modération', value: 'automod' }, { name: 'Anti-raid', value: 'antiraid' }, { name: 'Logs', value: 'logs' }))
    .addBooleanOption(o => o.setName('activer').setDescription('Activer/désactiver').setRequired(true)),

  // ── Gestion systèmes ───────────────────────────────────────
  new SlashCommandBuilder().setName('captcha').setDescription('Voir et gérer le captcha').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('reaction-roles').setDescription('Voir les reaction roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('automod').setDescription('Voir et gérer l\'auto-modération').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('antiraid').setDescription('Voir et gérer l\'anti-raid').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('leveling').setDescription('Voir et gérer le leveling').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('economie').setDescription('Voir et gérer l\'économie').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('help').setDescription('Voir toutes les commandes'),
].map(cmd => cmd.toJSON());

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('📡 Enregistrement des commandes...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Commandes enregistrées !');
  } catch (e) { console.error('❌ Erreur commandes:', e); }
}

async function sendLog(guild, embed) {
  const config = dbHelpers.getGuild(guild.id);
  if (!config.log_channel) return;
  if (!dbHelpers.isModuleEnabled(guild.id, 'logs')) return;
  try {
    const ch = await guild.channels.fetch(config.log_channel);
    if (ch) await ch.send({ embeds: [embed] });
  } catch (_) {}
}

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

function normalizeEmoji(str) {
  return str.replace(/\uFE0F/g, '').replace(/^<a?:/, '').replace(/>$/, '').trim();
}
function findReactionRole(messageId, reactionEmoji) {
  const emojiId = reactionEmoji.id ? `${reactionEmoji.name}:${reactionEmoji.id}` : reactionEmoji.name;
  let rr = dbHelpers.getReactionRole(messageId, emojiId);
  if (rr) return rr;
  const allRR = dbHelpers.getReactionRolesByMessage(messageId);
  if (!allRR?.length) return null;
  const normalizedInput = normalizeEmoji(emojiId);
  for (const entry of allRR) {
    if (normalizeEmoji(entry.emoji) === normalizedInput) return entry;
  }
  if (reactionEmoji.id) {
    for (const entry of allRR) {
      if (entry.emoji.includes(reactionEmoji.id)) return entry;
    }
  }
  return null;
}

// ── Update statistics channels ─────────────────────────────────
async function updateStatisticsChannels() {
  const all = dbHelpers.getAllStatChannels();
  const byGuild = {};
  for (const row of all) {
    if (!byGuild[row.guild_id]) byGuild[row.guild_id] = [];
    byGuild[row.guild_id].push(row);
  }
  for (const [guildId, channels] of Object.entries(byGuild)) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      await guild.members.fetch(); // refresh cache
      const total   = guild.memberCount;
      const online  = guild.members.cache.filter(m => m.presence?.status !== 'offline' && m.presence?.status).size;
      const bots    = guild.members.cache.filter(m => m.user.bot).size;
      const boosts  = guild.premiumSubscriptionCount || 0;
      const names   = {
        members: `👥 Membres : ${total.toLocaleString('fr-FR')}`,
        online:  `🟢 En ligne : ${online.toLocaleString('fr-FR')}`,
        bots:    `🤖 Bots : ${bots.toLocaleString('fr-FR')}`,
        boosts:  `💎 Boosts : ${boosts.toLocaleString('fr-FR')}`,
      };
      for (const ch of channels) {
        const name = names[ch.type];
        if (!name) continue;
        try {
          const channel = guild.channels.cache.get(ch.channel_id);
          if (channel && channel.name !== name) {
            await channel.setName(name);
          }
        } catch (_) {}
      }
    } catch (_) {}
  }
}

// ═══════════════════════════════════════════════════════════════
//  READY
// ═══════════════════════════════════════════════════════════════
client.once(Events.ClientReady, async () => {
  console.log(`\n✨ ${client.user.tag} est en ligne !`);
  console.log(`📊 ${client.guilds.cache.size} serveur(s) | ${client.users.cache.size} utilisateur(s)\n`);
  client.user.setPresence({ activities: [{ name: '/help | nira.bot', type: 3 }], status: 'online' });
  await registerCommands();

  // ── Statistics update — toutes les 10 minutes ────────────
  await updateStatisticsChannels();
  setInterval(updateStatisticsChannels, 10 * 60 * 1000);

  // ── Giveaways & mutes check ──────────────────────────────
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
        await channel.send({ embeds: [new EmbedBuilder().setTitle('🎉 Giveaway terminé !').setDescription(`**Prix:** ${gw.prize}\n**Gagnant(s):** ${winnerMentions}`).setColor(Colors.SUCCESS).setTimestamp()] });
        if (gw.message_id) {
          try {
            const msg = await channel.messages.fetch(gw.message_id);
            await msg.edit({ embeds: [new EmbedBuilder().setTitle('🎉 Giveaway terminé !').setDescription(`**Prix:** ${gw.prize}\n**Gagnant(s):** ${winnerMentions}`).setColor(Colors.ERROR).setFooter({ text: 'Giveaway terminé' }).setTimestamp()], components: [] });
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
        await member.timeout(null, 'Durée du mute expirée');
        dbHelpers.removeMute(mute.guild_id, mute.user_id);
      } catch (_) { dbHelpers.removeMute(mute.guild_id, mute.user_id); }
    }
  }, 15000);

  // ── API Express ──────────────────────────────────────────
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Profil d'un membre
  app.get('/api/profile/:guildId/:userId', async (req, res) => {
    const { guildId, userId } = req.params;
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: 'Guild introuvable' });
      const discordMember = await guild.members.fetch(userId).catch(() => null);
      if (!discordMember) return res.status(404).json({ error: 'Membre introuvable' });

      const levelData  = dbHelpers.getLevel(guildId, userId);
      const ecoData    = dbHelpers.getBalance(guildId, userId);
      const warns      = dbHelpers.getWarnings(guildId, userId);
      const config     = dbHelpers.getGuild(guildId);
      const leaderboard = dbHelpers.getLeaderboard(guildId, 999);
      const rank       = leaderboard.findIndex(m => m.user_id === userId) + 1;
      const required   = getRequiredXP(levelData.level);
      const progress   = Math.min(Math.round((levelData.xp / required) * 100), 100);
      const openTickets = dbHelpers.getOpenTickets(guildId).filter(t => t.user_id === userId);

      res.json({
        user: {
          id:          discordMember.id,
          username:    discordMember.user.username,
          displayName: discordMember.displayName,
          avatar:      discordMember.user.displayAvatarURL({ size: 256, extension: 'png' }),
          createdAt:   discordMember.user.createdTimestamp,
          joinedAt:    discordMember.joinedTimestamp,
          roles:       discordMember.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
        },
        isPremium:   PREMIUM_ROLE_ID   ? discordMember.roles.cache.has(PREMIUM_ROLE_ID)   : false,
        isSupporter: SUPPORTER_ROLE_ID ? discordMember.roles.cache.has(SUPPORTER_ROLE_ID) : false,
        level:   { current: levelData.level, xp: levelData.xp, required, progress },
        economy: { balance: ecoData.balance ?? 0, bank: 0 },
        warns:   warns.map(w => ({ reason: w.reason, moderator: w.moderator_id, date: w.created_at })),
        rank:    { position: rank || leaderboard.length, total: leaderboard.length },
        tickets: openTickets.length,
        guild:   { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128, extension: 'png' }), memberCount: guild.memberCount },
        modules: { leveling: dbHelpers.isModuleEnabled(guildId, 'leveling'), economy: dbHelpers.isModuleEnabled(guildId, 'economy'), automod: dbHelpers.isModuleEnabled(guildId, 'automod') },
      });
    } catch (err) { console.error('API /profile:', err); res.status(500).json({ error: 'Erreur interne' }); }
  });

  // Leaderboard
  app.get('/api/leaderboard/:guildId', async (req, res) => {
    const { guildId } = req.params;
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: 'Guild introuvable' });
      const top = dbHelpers.getLeaderboard(guildId, 10);
      const enriched = await Promise.all(top.map(async (entry, i) => {
        const m = await guild.members.fetch(entry.user_id).catch(() => null);
        return { rank: i + 1, userId: entry.user_id, username: m?.user.username ?? 'Unknown', displayName: m?.displayName ?? 'Unknown', avatar: m?.user.displayAvatarURL({ size: 64, extension: 'png' }) ?? null, level: entry.level, xp: entry.xp };
      }));
      res.json({ guild: { name: guild.name, icon: guild.iconURL({ size: 64, extension: 'png' }) }, leaderboard: enriched });
    } catch (err) { res.status(500).json({ error: 'Erreur interne' }); }
  });

  // Stats serveur
  app.get('/api/guild/:guildId', async (req, res) => {
    const { guildId } = req.params;
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: 'Guild introuvable' });
      await guild.members.fetch();
      const config = dbHelpers.getGuild(guildId);
      res.json({
        id: guild.id, name: guild.name, icon: guild.iconURL({ size: 256, extension: 'png' }),
        memberCount: guild.memberCount,
        onlineCount: guild.members.cache.filter(m => m.presence?.status !== 'offline' && m.presence?.status).size,
        boosts: guild.premiumSubscriptionCount ?? 0, boostTier: guild.premiumTier,
        ticketCount: config.ticket_count || 0,
        openTickets: dbHelpers.getOpenTickets(guildId).length,
        modules: { leveling: dbHelpers.isModuleEnabled(guildId, 'leveling'), economy: dbHelpers.isModuleEnabled(guildId, 'economy'), automod: dbHelpers.isModuleEnabled(guildId, 'automod'), logs: dbHelpers.isModuleEnabled(guildId, 'logs') },
        config: { welcome_channel: config.welcome_channel, captcha_enabled: !!config.captcha_enabled, automod_enabled: !!config.automod_enabled, antiraid_enabled: !!config.antiraid_enabled },
      });
    } catch (err) { res.status(500).json({ error: 'Erreur interne' }); }
  });

  app.listen(process.env.API_PORT || 3000, () => {
    console.log(`🌐 API Dashboard : http://localhost:${process.env.API_PORT || 3000}`);
  });
});

// ═══════════════════════════════════════════════════════════════
//  INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════
client.on(Events.InteractionCreate, async (interaction) => {

  // ── Boutons ─────────────────────────────────────────────────
  if (interaction.isButton()) {
    // Giveaway
    if (interaction.customId.startsWith('giveaway_')) {
      const giveawayId = parseInt(interaction.customId.split('_')[1]);
      dbHelpers.enterGiveaway(giveawayId, interaction.user.id);
      return interaction.reply({ content: '🎉 Tu participes au giveaway !', ephemeral: true });
    }
    // Ticket - ouvrir
    if (interaction.customId === 'ticket_open') {
      const modal = new ModalBuilder().setCustomId('ticket_create').setTitle('📩 Ouvrir un ticket');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('ticket_reason').setLabel('Raison du ticket').setStyle(TextInputStyle.Paragraph).setPlaceholder('Décris ton problème...').setRequired(false).setMaxLength(500)
      ));
      return interaction.showModal(modal);
    }
    // Ticket - fermer
    if (interaction.customId === 'ticket_close_btn') {
      const ticket = dbHelpers.getTicketByChannel(interaction.channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
      await interaction.reply({ embeds: [new EmbedBuilder().setDescription('🔒 Ticket fermé. Suppression dans 5 secondes...').setColor(Colors.ERROR)] });
      dbHelpers.closeTicket(interaction.channel.id);
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }
    // Système toggles
    if (interaction.customId.startsWith('sys_toggle_')) {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
      const system  = interaction.customId.replace('sys_toggle_', '');
      const guildId = interaction.guild.id;
      const config  = dbHelpers.getGuild(guildId);
      let label;
      if (system === 'captcha') {
        const ns = config.captcha_enabled ? 0 : 1;
        dbHelpers.updateGuild(guildId, { captcha_enabled: ns });
        label = ns ? 'activé' : 'désactivé';
      } else if (system === 'automod') {
        const was = !!config.automod_enabled && dbHelpers.isModuleEnabled(guildId, 'automod');
        dbHelpers.updateGuild(guildId, { automod_enabled: was ? 0 : 1 });
        dbHelpers.setModule(guildId, 'automod', !was);
        label = was ? 'désactivé' : 'activé';
      } else if (system === 'antiraid') {
        const ns = config.antiraid_enabled ? 0 : 1;
        dbHelpers.updateGuild(guildId, { antiraid_enabled: ns });
        label = ns ? 'activé' : 'désactivé';
      } else if (system === 'leveling') {
        const is = dbHelpers.isModuleEnabled(guildId, 'leveling');
        dbHelpers.setModule(guildId, 'leveling', !is);
        label = is ? 'désactivé' : 'activé';
      } else if (system === 'economy') {
        const is = dbHelpers.isModuleEnabled(guildId, 'economy');
        dbHelpers.setModule(guildId, 'economy', !is);
        label = is ? 'désactivé' : 'activé';
      }
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ **${system}** ${label}.`).setColor(Colors.SUCCESS)], ephemeral: true });
    }
    // Tests
    if (interaction.customId.startsWith('sys_test_')) {
      const system = interaction.customId.replace('sys_test_', '');
      if (system === 'captcha') {
        const code = generateCaptchaCode();
        const buf  = generateCaptchaImage(code);
        const att  = new AttachmentBuilder(buf, { name: 'captcha_test.png' });
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🧪 Preview Captcha').setDescription(`Code de test : \`${code}\``).setImage('attachment://captcha_test.png').setColor(Colors.INFO).setFooter({ text: 'Ceci est un test' })], files: [att], ephemeral: true });
      }
      return interaction.reply({ content: '🧪 Test effectué.', ephemeral: true });
    }
    return;
  }

  // ── Modals ───────────────────────────────────────────────────
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
          if (role) { const member = await interaction.guild.members.fetch(interaction.user.id); await member.roles.add(role); }
        } catch (_) {}
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Vérification réussie !').setDescription(`Bienvenue sur **${interaction.guild.name}** !`).setColor(Colors.SUCCESS)], ephemeral: true });
      } else {
        dbHelpers.incrementCaptchaAttempt(interaction.guild.id, interaction.user.id);
        const updated = dbHelpers.getCaptcha(interaction.guild.id, interaction.user.id);
        if (updated.attempts >= config.captcha_retry_limit) {
          dbHelpers.removeCaptcha(interaction.guild.id, interaction.user.id);
          try { const m = await interaction.guild.members.fetch(interaction.user.id); await m.kick('Échec captcha'); } catch (_) {}
          return interaction.reply({ embeds: [new EmbedBuilder().setDescription('❌ Trop de tentatives. Tu as été kick.').setColor(Colors.ERROR)], ephemeral: true });
        }
        const newCode = generateCaptchaCode();
        const newBuf  = generateCaptchaImage(newCode);
        dbHelpers.setCaptcha(interaction.guild.id, interaction.user.id, newCode);
        const att = new AttachmentBuilder(newBuf, { name: 'captcha.png' });
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Code incorrect !').setDescription(`Essais restants : **${config.captcha_retry_limit - updated.attempts}**`).setImage('attachment://captcha.png').setColor(Colors.ERROR)], files: [att], ephemeral: true });
      }
    }
    // Ticket create
    if (interaction.customId === 'ticket_create') {
      const reason  = interaction.fields.getTextInputValue('ticket_reason') || 'Aucune raison précisée';
      const config  = dbHelpers.getGuild(interaction.guild.id);
      if (!config.ticket_staff_role) return interaction.reply({ content: '❌ Le système de tickets n\'est pas configuré. Utilise `/setup-ticket`.', ephemeral: true });
      const count   = dbHelpers.getTicketCount(interaction.guild.id) + 1;
      const padded  = String(count).padStart(4, '0');
      // Création du salon
      const channelOptions = {
        name:   `🎫・ticket-${padded}`,
        type:   ChannelType.GuildText,
        topic:  `Ticket #${padded} — ${interaction.user.tag} — ${reason}`,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: config.ticket_staff_role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
        ],
      };
      if (config.ticket_category) channelOptions.parent = config.ticket_category;
      try {
        const ticketChannel = await interaction.guild.channels.create(channelOptions);
        dbHelpers.createTicket(interaction.guild.id, ticketChannel.id, interaction.user.id, count, reason);
        const embed = new EmbedBuilder()
          .setTitle(`🎫 Ticket #${padded}`)
          .setDescription(`Bonjour ${interaction.user} ! Un membre du staff va te répondre rapidement.\n\n**Raison :** ${reason}`)
          .addFields({ name: '📋 Instructions', value: '> Décris ton problème en détail.\n> Un staff prendra en charge ton ticket.\n> Utilise le bouton ci-dessous pour fermer le ticket.' })
          .setColor(Colors.PRIMARY)
          .setFooter({ text: `Ticket ouvert par ${interaction.user.tag}` })
          .setTimestamp();
        const closeBtn = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );
        await ticketChannel.send({ content: `<@${interaction.user.id}> <@&${config.ticket_staff_role}>`, embeds: [embed], components: [closeBtn] });
        return interaction.reply({ content: `✅ Ton ticket a été créé : ${ticketChannel}`, ephemeral: true });
      } catch (err) {
        console.error('❌ Ticket create error:', err);
        return interaction.reply({ content: '❌ Impossible de créer le ticket. Vérifie mes permissions.', ephemeral: true });
      }
    }
    return;
  }

  // ── Bouton captcha ───────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('captcha_verify_')) {
    const targetUserId = interaction.customId.split('_')[2];
    if (interaction.user.id !== targetUserId) return interaction.reply({ content: '❌ Ce captcha n\'est pas pour toi !', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`captcha_modal_${interaction.user.id}`).setTitle('🔐 Vérification Captcha');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('captcha_code').setLabel('Entre le code de l\'image').setStyle(TextInputStyle.Short).setPlaceholder('Ex: A7kP2').setRequired(true).setMinLength(5).setMaxLength(5)
    ));
    return interaction.showModal(modal);
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member, user, options, channel } = interaction;

  try {
    // ── /setup-reaction ──────────────────────────────────────
    if (commandName === 'setup-reaction') {
      const role          = options.getRole('role');
      const emoji         = options.getString('emoji');
      const messageText   = options.getString('message');
      const targetChannel = options.getChannel('salon') || channel;
      const image         = options.getAttachment('image');
      if (!messageText && !image) return interaction.reply({ content: '❌ Fournis un message ou une image.', ephemeral: true });
      const sendOpts = {};
      if (messageText) sendOpts.content = messageText;
      if (image) sendOpts.files = [{ attachment: image.url, name: image.name }];
      const sent   = await targetChannel.send(sendOpts);
      const result = await sent.react(emoji);
      const resolvedEmoji = result.emoji.id ? `${result.emoji.name}:${result.emoji.id}` : result.emoji.name;
      dbHelpers.addReactionRole(guild.id, targetChannel.id, sent.id, resolvedEmoji, role.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Reaction Role configuré').setDescription(`**Salon:** ${targetChannel}\n**Emoji:** ${emoji}\n**Rôle:** ${role}`).setColor(Colors.SUCCESS).setTimestamp()], ephemeral: true });
    }

    // ── /setup-captcha ───────────────────────────────────────
    if (commandName === 'setup-captcha') {
      const captchaChannel = options.getChannel('salon');
      const captchaRole    = options.getRole('role');
      const retryLimit     = options.getInteger('essais') || 3;
      dbHelpers.getGuild(guild.id);
      dbHelpers.updateGuild(guild.id, { captcha_enabled: 1, captcha_channel: captchaChannel.id, captcha_role: captchaRole.id, captcha_retry_limit: retryLimit });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔐 Captcha configuré').setDescription(`**Salon:** ${captchaChannel}\n**Rôle:** ${captchaRole}\n**Essais:** ${retryLimit}\n**Kick auto:** 10 minutes`).setColor(Colors.SUCCESS).setTimestamp()], ephemeral: true });
    }

    // ── /setup-welcome ───────────────────────────────────────
    if (commandName === 'setup-welcome') {
      const welcomeChannel = options.getChannel('salon');
      const message        = options.getString('message');
      const isEmbed        = options.getBoolean('embed') ?? true;
      const titre          = options.getString('titre')   || 'Bienvenue !';
      const couleur        = options.getString('couleur') || '#5865F2';
      const avatar         = options.getBoolean('avatar') ?? true;
      dbHelpers.getGuild(guild.id);
      dbHelpers.updateGuild(guild.id, { welcome_channel: welcomeChannel.id, welcome_message: message, welcome_embed: isEmbed ? 1 : 0, welcome_title: titre, welcome_color: couleur, welcome_avatar: avatar ? 1 : 0 });
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Bienvenue configuré')
          .addFields(
            { name: 'Salon',   value: `${welcomeChannel}`, inline: true },
            { name: 'Embed',   value: isEmbed ? 'Oui' : 'Non', inline: true },
            { name: 'Avatar',  value: avatar  ? 'Oui' : 'Non', inline: true },
            { name: 'Titre',   value: titre,  inline: true },
            { name: 'Couleur', value: couleur, inline: true },
            { name: 'Message', value: `\`\`\`${message}\`\`\`` },
          )
          .setDescription('> Variables : `{user}` `{tag}` `{username}` `{server}` `{count}`')
          .setColor(Colors.SUCCESS).setTimestamp()],
        ephemeral: true,
      });
    }

    // ── /welcome (test) ──────────────────────────────────────
    if (commandName === 'welcome') {
      const config = dbHelpers.getGuild(guild.id);
      if (!config.welcome_channel) return interaction.reply({ content: '❌ Aucun salon de bienvenue configuré. Utilise `/setup-welcome`.', ephemeral: true });
      const welcomeChannel = guild.channels.cache.get(config.welcome_channel);
      if (!welcomeChannel) return interaction.reply({ content: '❌ Salon de bienvenue introuvable.', ephemeral: true });
      await sendWelcome(member, config, welcomeChannel);
      return interaction.reply({ content: `✅ Message de bienvenue testé dans ${welcomeChannel} !`, ephemeral: true });
    }

    // ── /setup-statistics ────────────────────────────────────
    if (commandName === 'setup-statistics') {
      const catName = options.getString('categorie') || '── · STATISTICS · ──';
      await interaction.deferReply({ ephemeral: true });
      // Crée la catégorie
      const category = await guild.channels.create({
        name: catName,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.Connect] }],
      });
      await guild.members.fetch();
      const total  = guild.memberCount;
      const online = guild.members.cache.filter(m => m.presence?.status !== 'offline' && m.presence?.status).size;
      const bots   = guild.members.cache.filter(m => m.user.bot).size;
      const boosts = guild.premiumSubscriptionCount || 0;
      const stats  = [
        { type: 'members', name: `👥 Membres : ${total.toLocaleString('fr-FR')}` },
        { type: 'online',  name: `🟢 En ligne : ${online.toLocaleString('fr-FR')}` },
        { type: 'bots',    name: `🤖 Bots : ${bots.toLocaleString('fr-FR')}` },
        { type: 'boosts',  name: `💎 Boosts : ${boosts.toLocaleString('fr-FR')}` },
      ];
      for (const stat of stats) {
        const ch = await guild.channels.create({
          name:   stat.name,
          type:   ChannelType.GuildVoice,
          parent: category.id,
          permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.Connect] }],
        });
        dbHelpers.setStatChannel(guild.id, stat.type, ch.id);
      }
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('📊 Statistiques configurées').setDescription(`Catégorie **${catName}** créée avec 4 salons.\nMise à jour automatique toutes les **10 minutes**.`).setColor(Colors.SUCCESS).setTimestamp()] });
    }

    // ── /setup-ticket ────────────────────────────────────────
    if (commandName === 'setup-ticket') {
      const panelChannel = options.getChannel('salon');
      const staffRole    = options.getRole('staff');
      const category     = options.getChannel('categorie');
      dbHelpers.getGuild(guild.id);
      dbHelpers.updateGuild(guild.id, { ticket_channel: panelChannel.id, ticket_staff_role: staffRole.id, ticket_category: category?.id || null });
      const embed = new EmbedBuilder()
        .setTitle('🎫 Support — Nira')
        .setDescription('Clique sur le bouton ci-dessous pour ouvrir un ticket.\nUn membre du staff te répondra dans les plus brefs délais.\n\n> 📋 Lis le règlement avant d\'ouvrir un ticket.\n> ❌ Les abus entraînent des sanctions.')
        .setColor(parseInt(Colors.PRIMARY))
        .setFooter({ text: `${guild.name} • Support` })
        .setTimestamp();
      const openBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_open').setLabel('Ouvrir un ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
      );
      await panelChannel.send({ embeds: [embed], components: [openBtn] });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Tickets configurés').setDescription(`**Salon panneau:** ${panelChannel}\n**Staff:** ${staffRole}\n**Catégorie:** ${category || 'Aucune (racine)'}`).setColor(Colors.SUCCESS).setTimestamp()], ephemeral: true });
    }

    // ── /ticket ──────────────────────────────────────────────
    if (commandName === 'ticket') {
      const config = dbHelpers.getGuild(guild.id);
      if (!config.ticket_staff_role) return interaction.reply({ content: '❌ Les tickets ne sont pas configurés. Utilise `/setup-ticket`.', ephemeral: true });
      // Vérifie si le membre a déjà un ticket ouvert
      const existing = dbHelpers.getOpenTickets(guild.id).find(t => t.user_id === user.id);
      if (existing) return interaction.reply({ content: `❌ Tu as déjà un ticket ouvert : <#${existing.channel_id}>`, ephemeral: true });
      const reason = options.getString('raison');
      const modal  = new ModalBuilder().setCustomId('ticket_create').setTitle('📩 Ouvrir un ticket');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('ticket_reason').setLabel('Raison du ticket').setStyle(TextInputStyle.Paragraph).setPlaceholder(reason || 'Décris ton problème...').setRequired(false).setMaxLength(500).setValue(reason || '')
      ));
      return interaction.showModal(modal);
    }

    // ── /ticket-close ────────────────────────────────────────
    if (commandName === 'ticket-close') {
      const ticket = dbHelpers.getTicketByChannel(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
      await interaction.reply({ embeds: [new EmbedBuilder().setDescription('🔒 Ticket fermé. Suppression dans 5 secondes...').setColor(Colors.ERROR)] });
      dbHelpers.closeTicket(channel.id);
      await sendLog(guild, new EmbedBuilder().setTitle('🎫 Ticket fermé').addFields({ name: 'Ticket', value: channel.name, inline: true }, { name: 'Fermé par', value: user.tag, inline: true }).setColor(Colors.WARNING).setTimestamp());
      setTimeout(() => channel.delete().catch(() => {}), 5000);
      return;
    }

    // ── /ticket-claim ────────────────────────────────────────
    if (commandName === 'ticket-claim') {
      const ticket = dbHelpers.getTicketByChannel(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
      if (ticket.claimed_by) return interaction.reply({ content: `❌ Ce ticket est déjà pris en charge par <@${ticket.claimed_by}>.`, ephemeral: true });
      dbHelpers.claimTicket(channel.id, user.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${user} a pris en charge ce ticket.`).setColor(Colors.SUCCESS)] });
    }

    // ── /ban ─────────────────────────────────────────────────
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

    // ── /kick ────────────────────────────────────────────────
    if (commandName === 'kick') {
      const target = options.getMember('utilisateur');
      const reason = options.getString('raison') || 'Aucune raison fournie';
      if (!target || !target.kickable) return interaction.reply({ content: '❌ Impossible d\'expulser cet utilisateur.', ephemeral: true });
      if (member.roles.highest.position <= target.roles.highest.position) return interaction.reply({ content: '❌ Rôle insuffisant.', ephemeral: true });
      await target.kick(`${user.tag}: ${reason}`);
      dbHelpers.addModLog(guild.id, 'KICK', target.id, user.id, reason);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('👢 Membre expulsé').setDescription(`**Utilisateur:** ${target.user.tag}\n**Modérateur:** ${user.tag}\n**Raison:** ${reason}`).setColor(Colors.WARNING).setTimestamp()] });
    }

    // ── /mute ────────────────────────────────────────────────
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

    // ── /unmute ──────────────────────────────────────────────
    if (commandName === 'unmute') {
      const target = options.getMember('utilisateur');
      if (!target) return interaction.reply({ content: '❌ Utilisateur introuvable.', ephemeral: true });
      await target.timeout(null);
      dbHelpers.removeMute(guild.id, target.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔊 Membre unmuté').setDescription(`**Utilisateur:** ${target.user.tag}`).setColor(Colors.SUCCESS).setTimestamp()] });
    }

    // ── /warn ────────────────────────────────────────────────
    if (commandName === 'warn') {
      const target = options.getMember('utilisateur');
      const reason = options.getString('raison');
      if (!target || target.user.bot) return interaction.reply({ content: '❌ Utilisateur invalide.', ephemeral: true });
      const warnCount = dbHelpers.addWarning(guild.id, target.id, user.id, reason);
      dbHelpers.addModLog(guild.id, 'WARN', target.id, user.id, reason);
      let desc = `**Utilisateur:** ${target.user.tag}\n**Modérateur:** ${user.tag}\n**Raison:** ${reason}\n**Total:** ${warnCount}`;
      if (warnCount >= 5 && target.bannable) { await target.ban({ reason: '5 avertissements' }); desc += '\n\n🔨 **Ban automatique** (5 avertissements)'; }
      else if (warnCount >= 3 && target.moderatable) { await target.timeout(3600000, '3 avertissements'); desc += '\n\n🔇 **Mute 1h** (3 avertissements)'; }
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚠️ Avertissement').setDescription(desc).setColor(Colors.WARNING).setTimestamp()] });
    }

    // ── /warnings ────────────────────────────────────────────
    if (commandName === 'warnings') {
      const target = options.getUser('utilisateur');
      const warns  = dbHelpers.getWarnings(guild.id, target.id);
      if (!warns.length) return interaction.reply({ content: `✅ ${target.tag} n'a aucun avertissement.`, ephemeral: true });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`⚠️ Avertissements de ${target.tag}`).setDescription(warns.map((w, i) => `**#${i + 1}** - ${w.reason}\n> Par <@${w.moderator_id}> — <t:${Math.floor(new Date(w.created_at).getTime() / 1000)}:R>`).join('\n\n')).setColor(Colors.WARNING).setFooter({ text: `Total: ${warns.length}` }).setTimestamp()] });
    }

    // ── /clear ───────────────────────────────────────────────
    if (commandName === 'clear') {
      const amount  = options.getInteger('nombre');
      const deleted = await channel.bulkDelete(amount, true);
      const reply   = await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🗑️ ${deleted.size} message(s) supprimé(s)`).setColor(Colors.SUCCESS)], fetchReply: true });
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    }

    // ── /level ───────────────────────────────────────────────
    if (commandName === 'level') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'leveling')) return interaction.reply({ content: '❌ Leveling désactivé.', ephemeral: true });
      const target   = options.getUser('utilisateur') || user;
      const data     = dbHelpers.getLevel(guild.id, target.id);
      const required = getRequiredXP(data.level);
      const progress = Math.round((data.xp / required) * 100);
      const bar      = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📊 Niveau de ${target.username}`).setThumbnail(target.displayAvatarURL({ size: 128 })).addFields({ name: '🏆 Niveau', value: `${data.level}`, inline: true }, { name: '✨ XP', value: `${data.xp}/${required}`, inline: true }, { name: '📈 Progression', value: `${bar} ${progress}%` }).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /rank ────────────────────────────────────────────────
    if (commandName === 'rank') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'leveling')) return interaction.reply({ content: '❌ Leveling désactivé.', ephemeral: true });
      const lb = dbHelpers.getLeaderboard(guild.id, 10);
      if (!lb.length) return interaction.reply({ content: '📊 Aucune donnée.', ephemeral: true });
      const medals = ['🥇', '🥈', '🥉'];
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏆 Classement — ${guild.name}`).setDescription(lb.map((e, i) => `${i < 3 ? medals[i] : `**${i + 1}.**`} <@${e.user_id}> — Niveau **${e.level}** (${e.xp} XP)`).join('\n')).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /daily ───────────────────────────────────────────────
    if (commandName === 'daily') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'economy')) return interaction.reply({ content: '❌ Économie désactivée.', ephemeral: true });
      const result = dbHelpers.claimDaily(guild.id, user.id);
      if (!result.success) return interaction.reply({ content: `⏰ Reviens dans **${result.remaining}**.`, ephemeral: true });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💰 Récompense quotidienne').setDescription(`Tu as reçu **${result.reward}** pièces !\n💎 Nouveau solde: **${result.newBalance}**`).setColor(Colors.SUCCESS).setTimestamp()] });
    }

    // ── /balance ─────────────────────────────────────────────
    if (commandName === 'balance') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'economy')) return interaction.reply({ content: '❌ Économie désactivée.', ephemeral: true });
      const target = options.getUser('utilisateur') || user;
      const eco    = dbHelpers.getBalance(guild.id, target.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`💰 Solde de ${target.username}`).setDescription(`**${eco.balance}** pièces 💎`).setThumbnail(target.displayAvatarURL({ size: 128 })).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /giveaway ────────────────────────────────────────────
    if (commandName === 'giveaway') {
      const prize       = options.getString('prix');
      const durationStr = options.getString('duree');
      const winnerCount = options.getInteger('gagnants') || 1;
      const targetCh    = options.getChannel('salon') || channel;
      const duration    = parseDuration(durationStr);
      if (!duration) return interaction.reply({ content: '❌ Durée invalide.', ephemeral: true });
      const endTime = new Date(Date.now() + duration);
      const embed   = new EmbedBuilder().setTitle('🎉 GIVEAWAY').setDescription(`**Prix:** ${prize}\n**Gagnant(s):** ${winnerCount}\n**Fin:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\n**Organisé par:** ${user}`).setColor(Colors.PRIMARY).setTimestamp(endTime);
      const giveawayId = dbHelpers.createGiveaway(guild.id, targetCh.id, null, prize, winnerCount, endTime.toISOString(), user.id);
      const button     = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`giveaway_${giveawayId}`).setLabel('Participer 🎉').setStyle(ButtonStyle.Primary));
      const sent       = await targetCh.send({ embeds: [embed], components: [button] });
      const { db }     = require('./utils');
      db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(sent.id, giveawayId);
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🎉 Giveaway lancé dans ${targetCh} !`).setColor(Colors.SUCCESS)], ephemeral: true });
    }

    // ── /poll ────────────────────────────────────────────────
    if (commandName === 'poll') {
      const question   = options.getString('question');
      const pollOptions = [];
      for (let i = 1; i <= 5; i++) { const o = options.getString(`option${i}`); if (o) pollOptions.push(o); }
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      const sent   = await channel.send({ embeds: [new EmbedBuilder().setTitle(`📊 ${question}`).setDescription(pollOptions.map((o, i) => `${emojis[i]} ${o}`).join('\n\n')).setColor(Colors.PRIMARY).setFooter({ text: `Sondage par ${user.username}` }).setTimestamp()] });
      for (let i = 0; i < pollOptions.length; i++) await sent.react(emojis[i]);
      return interaction.reply({ content: '✅ Sondage créé !', ephemeral: true });
    }

    // ── /userinfo ────────────────────────────────────────────
    if (commandName === 'userinfo') {
      const target     = options.getMember('utilisateur') || member;
      const targetUser = target.user;
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${targetUser.tag}`).setThumbnail(targetUser.displayAvatarURL({ size: 256 })).addFields({ name: '🆔 ID', value: targetUser.id, inline: true }, { name: '📛 Surnom', value: target.nickname || 'Aucun', inline: true }, { name: '🤖 Bot', value: targetUser.bot ? 'Oui' : 'Non', inline: true }, { name: '📅 Créé le', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }, { name: '📥 A rejoint', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true }, { name: '🎭 Rôles', value: target.roles.cache.filter(r => r.id !== guild.id).map(r => `${r}`).join(', ') || 'Aucun' }).setColor(target.displayHexColor || Colors.PRIMARY).setTimestamp()] });
    }

    // ── /serverinfo ──────────────────────────────────────────
    if (commandName === 'serverinfo') {
      const owner = await guild.fetchOwner();
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏠 ${guild.name}`).setThumbnail(guild.iconURL({ size: 256 })).addFields({ name: '🆔 ID', value: guild.id, inline: true }, { name: '👑 Propriétaire', value: owner.user.tag, inline: true }, { name: '📅 Créé le', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }, { name: '👥 Membres', value: `${guild.memberCount}`, inline: true }, { name: '💬 Salons', value: `${guild.channels.cache.size}`, inline: true }, { name: '💎 Boosts', value: `${guild.premiumSubscriptionCount || 0} (Niveau ${guild.premiumTier})`, inline: true }).setColor(Colors.PRIMARY).setTimestamp()] });
    }

    // ── /config ──────────────────────────────────────────────
    if (commandName === 'config') {
      const sub = interaction.options.getSubcommand();
      dbHelpers.getGuild(guild.id);
      if (sub === 'logs') {
        const logChannel = options.getChannel('salon');
        dbHelpers.updateGuild(guild.id, { log_channel: logChannel.id });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Salon de logs : ${logChannel}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'automod') {
        const e = options.getBoolean('activer');
        dbHelpers.updateGuild(guild.id, { automod_enabled: e ? 1 : 0 });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Auto-modération ${e ? 'activée' : 'désactivée'}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'antiraid') {
        const e = options.getBoolean('activer');
        dbHelpers.updateGuild(guild.id, { antiraid_enabled: e ? 1 : 0 });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Anti-raid ${e ? 'activé' : 'désactivé'}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'leveling') {
        const e = options.getBoolean('activer');
        dbHelpers.setModule(guild.id, 'leveling', e);
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Leveling ${e ? 'activé' : 'désactivé'}`).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'prefix') {
        const p = options.getString('prefixe');
        dbHelpers.updateGuild(guild.id, { prefix: p });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Préfixe : \`${p}\``).setColor(Colors.SUCCESS)], ephemeral: true });
      }
      if (sub === 'langue') {
        const l = options.getString('langue');
        dbHelpers.updateGuild(guild.id, { language: l });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Langue : \`${l === 'fr' ? 'Français' : 'English'}\``).setColor(Colors.SUCCESS)], ephemeral: true });
      }
    }

    // ── /module ──────────────────────────────────────────────
    if (commandName === 'module') {
      const moduleName = options.getString('nom');
      const enabled    = options.getBoolean('activer');
      dbHelpers.setModule(guild.id, moduleName, enabled);
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Module **${moduleName}** ${enabled ? 'activé' : 'désactivé'}`).setColor(Colors.SUCCESS)], ephemeral: true });
    }

    // ── /captcha ─────────────────────────────────────────────
    if (commandName === 'captcha') {
      const config  = dbHelpers.getGuild(guild.id);
      const isOn    = !!config.captcha_enabled;
      const embed   = new EmbedBuilder().setTitle('🔐 Système Captcha').setDescription(`**Statut:** ${isOn ? '🟢 Activé' : '🔴 Désactivé'}\n**Salon:** ${config.captcha_channel ? `<#${config.captcha_channel}>` : 'Non défini'}\n**Rôle:** ${config.captcha_role ? `<@&${config.captcha_role}>` : 'Non défini'}\n**Essais:** ${config.captcha_retry_limit || 3}\n**Kick auto:** 10 minutes`).setColor(isOn ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_captcha').setLabel(isOn ? 'Désactiver' : 'Activer').setStyle(isOn ? ButtonStyle.Danger : ButtonStyle.Success), new ButtonBuilder().setCustomId('sys_test_captcha').setLabel('Tester').setStyle(ButtonStyle.Secondary));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /reaction-roles ──────────────────────────────────────
    if (commandName === 'reaction-roles') {
      const { db } = require('./utils');
      const rrList = db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ?').all(guild.id);
      const desc   = rrList.length > 0 ? rrList.slice(0, 10).map((rr, i) => `**${i + 1}.** ${rr.emoji} → <@&${rr.role_id}> (dans <#${rr.channel_id}>)`).join('\n') : '*Aucun reaction role configuré.*';
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔁 Reaction Roles').setDescription(`**Total:** ${rrList.length}\n\n${desc}`).setColor(rrList.length > 0 ? Colors.SUCCESS : Colors.ERROR).setFooter({ text: 'Utilise /setup-reaction pour en ajouter' }).setTimestamp()], ephemeral: true });
    }

    // ── /automod ─────────────────────────────────────────────
    if (commandName === 'automod') {
      const config = dbHelpers.getGuild(guild.id);
      const isOn   = !!config.automod_enabled && dbHelpers.isModuleEnabled(guild.id, 'automod');
      const embed  = new EmbedBuilder().setTitle('🛡️ Auto-Modération').setDescription(`**Statut:** ${isOn ? '🟢 Activé' : '🔴 Désactivé'}\n\n> 🚫 Anti-spam (5+ msg en 10s → mute 5min)\n> 🤬 Filtre de mots\n> 🔗 Anti-liens d'invitation`).setColor(isOn ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_automod').setLabel(isOn ? 'Désactiver' : 'Activer').setStyle(isOn ? ButtonStyle.Danger : ButtonStyle.Success), new ButtonBuilder().setCustomId('sys_test_automod').setLabel('Tester').setStyle(ButtonStyle.Secondary));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /antiraid ────────────────────────────────────────────
    if (commandName === 'antiraid') {
      const config = dbHelpers.getGuild(guild.id);
      const isOn   = !!config.antiraid_enabled;
      const embed  = new EmbedBuilder().setTitle('🛡️ Anti-Raid').setDescription(`**Statut:** ${isOn ? '🟢 Activé' : '🔴 Désactivé'}\n\n> Détecte 5+ joins en 10 secondes\n> Kick automatique pendant le raid`).setColor(isOn ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_antiraid').setLabel(isOn ? 'Désactiver' : 'Activer').setStyle(isOn ? ButtonStyle.Danger : ButtonStyle.Success));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /leveling ────────────────────────────────────────────
    if (commandName === 'leveling') {
      const isOn = dbHelpers.isModuleEnabled(guild.id, 'leveling');
      const top  = dbHelpers.getLeaderboard(guild.id, 3);
      const topDesc = top.length > 0 ? ['🥇', '🥈', '🥉'].slice(0, top.length).map((m, i) => `${m} <@${top[i].user_id}> — Niv. **${top[i].level}**`).join('\n') : '*Aucune donnée.*';
      const embed   = new EmbedBuilder().setTitle('📊 Leveling').setDescription(`**Statut:** ${isOn ? '🟢 Activé' : '🔴 Désactivé'}\n\n> 15–24 XP par message (cooldown 60s)\n\n**Top 3:**\n${topDesc}`).setColor(isOn ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_leveling').setLabel(isOn ? 'Désactiver' : 'Activer').setStyle(isOn ? ButtonStyle.Danger : ButtonStyle.Success));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /economie ────────────────────────────────────────────
    if (commandName === 'economie') {
      const isOn = dbHelpers.isModuleEnabled(guild.id, 'economy');
      const embed = new EmbedBuilder().setTitle('💰 Économie').setDescription(`**Statut:** ${isOn ? '🟢 Activé' : '🔴 Désactivé'}\n\n> 💎 /daily — 100–150 pièces\n> 💰 /balance — Voir son solde`).setColor(isOn ? Colors.SUCCESS : Colors.ERROR).setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sys_toggle_economy').setLabel(isOn ? 'Désactiver' : 'Activer').setStyle(isOn ? ButtonStyle.Danger : ButtonStyle.Success));
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    // ── /help ────────────────────────────────────────────────
    if (commandName === 'help') {
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📖 Nira — Commandes').addFields(
        { name: '⚙️ Setup', value: '`/setup-reaction` `/setup-captcha` `/setup-welcome` `/setup-ticket` `/setup-statistics`' },
        { name: '🛡️ Modération', value: '`/ban` `/kick` `/mute` `/unmute` `/warn` `/warnings` `/clear`' },
        { name: '🎫 Tickets', value: '`/ticket` `/ticket-close` `/ticket-claim`' },
        { name: '📊 Systèmes', value: '`/captcha` `/reaction-roles` `/automod` `/antiraid` `/leveling` `/economie`' },
        { name: '🎮 Fun', value: '`/level` `/rank` `/daily` `/balance` `/giveaway` `/poll` `/userinfo` `/serverinfo`' },
        { name: '🔧 Config', value: '`/config` `/module`' },
      ).setColor(Colors.PRIMARY).setFooter({ text: 'Nira Bot v2.0' }).setTimestamp()] });
    }

  } catch (error) {
    console.error(`❌ Erreur /${commandName}:`, error);
    const content = '❌ Une erreur est survenue.';
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content, ephemeral: true }).catch(() => {});
    else await interaction.reply({ content, ephemeral: true }).catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════════
//  WELCOME HELPER
// ═══════════════════════════════════════════════════════════════
async function sendWelcome(member, config, welcomeChannel) {
  const msg = buildWelcomeMessage(config, member);
  if (config.welcome_embed) {
    const color = parseInt((config.welcome_color || '#5865F2').replace('#', ''), 16);
    const embed = new EmbedBuilder().setTitle(config.welcome_title || 'Bienvenue !').setDescription(msg).setColor(color).setTimestamp();
    if (config.welcome_avatar) embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
    await welcomeChannel.send({ embeds: [embed] });
  } else {
    await welcomeChannel.send({ content: msg });
  }
}

// ═══════════════════════════════════════════════════════════════
//  REACTION ROLES
// ═══════════════════════════════════════════════════════════════
function normalizeEmoji(str) { return str.replace(/\uFE0F/g, '').replace(/^<a?:/, '').replace(/>$/, '').trim(); }
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
  try { const member = await reaction.message.guild.members.fetch(user.id); const role = await reaction.message.guild.roles.fetch(rr.role_id); if (role && member) await member.roles.add(role); } catch (e) { console.error('ReactionRole add:', e); }
});
client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  try { if (reaction.partial) await reaction.fetch(); if (reaction.message.partial) await reaction.message.fetch(); } catch { return; }
  const rr = findReactionRole(reaction.message.id, reaction.emoji);
  if (!rr) return;
  try { const member = await reaction.message.guild.members.fetch(user.id); const role = await reaction.message.guild.roles.fetch(rr.role_id); if (role && member) await member.roles.remove(role); } catch (e) { console.error('ReactionRole remove:', e); }
});

// ═══════════════════════════════════════════════════════════════
//  MEMBER JOIN
// ═══════════════════════════════════════════════════════════════
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return;
  const config = dbHelpers.getGuild(member.guild.id);
  // Anti-raid
  if (config.antiraid_enabled && checkRaid(member.guild.id)) {
    try { await member.kick('Anti-raid'); await sendLog(member.guild, new EmbedBuilder().setTitle('🛡️ Anti-Raid').setDescription(`${member.user.tag} kick (raid détecté)`).setColor(Colors.ERROR).setTimestamp()); return; } catch (_) {}
  }
  // Captcha
  if (config.captcha_enabled && config.captcha_channel) {
    try {
      const captchaChannel = await member.guild.channels.fetch(config.captcha_channel);
      if (!captchaChannel) return;
      const code = generateCaptchaCode();
      dbHelpers.setCaptcha(member.guild.id, member.id, code);
      const att  = new AttachmentBuilder(generateCaptchaImage(code), { name: 'captcha.png' });
      const embed = new EmbedBuilder().setTitle('🔐 Vérification requise').setDescription(`Bienvenue ${member} !\n\nEntre le code de l'image.\n⚠️ **${config.captcha_retry_limit}** essais. ⏰ Kick après **10 minutes**.`).setImage('attachment://captcha.png').setColor(Colors.INFO).setTimestamp();
      const btn   = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`captcha_verify_${member.id}`).setLabel('Entrer le code').setStyle(ButtonStyle.Primary).setEmoji('🔐'));
      await captchaChannel.send({ content: `${member}`, embeds: [embed], files: [att], components: [btn] });
      setTimeout(async () => {
        const pending = dbHelpers.getCaptcha(member.guild.id, member.id);
        if (pending) { dbHelpers.removeCaptcha(member.guild.id, member.id); try { await member.kick('Captcha expiré'); await captchaChannel.send({ embeds: [new EmbedBuilder().setDescription(`⏰ ${member.user.tag} kick (captcha expiré).`).setColor(Colors.ERROR)] }); } catch (_) {} }
      }, 600000);
    } catch (e) { console.error('Captcha join:', e); }
  }
  // Welcome
  if (config.welcome_channel) {
    const welcomeChannel = member.guild.channels.cache.get(config.welcome_channel);
    if (welcomeChannel) await sendWelcome(member, config, welcomeChannel).catch(() => {});
  }
  // Log
  await sendLog(member.guild, new EmbedBuilder().setTitle('📥 Nouveau membre').setDescription(`${member.user.tag} a rejoint`).addFields({ name: 'ID', value: member.id, inline: true }, { name: 'Compte créé', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }).setThumbnail(member.user.displayAvatarURL()).setColor(Colors.SUCCESS).setTimestamp());
});

// ═══════════════════════════════════════════════════════════════
//  MEMBER LEAVE
// ═══════════════════════════════════════════════════════════════
client.on(Events.GuildMemberRemove, async (member) => {
  if (member.user.bot) return;
  await sendLog(member.guild, new EmbedBuilder().setTitle('📤 Membre parti').setDescription(`${member.user.tag}`).addFields({ name: 'ID', value: member.id, inline: true }, { name: 'Rôles', value: member.roles.cache.filter(r => r.id !== member.guild.id).map(r => `${r}`).join(', ') || 'Aucun' }).setThumbnail(member.user.displayAvatarURL()).setColor(Colors.ERROR).setTimestamp());
});

// ═══════════════════════════════════════════════════════════════
//  MEMBER UPDATE (Premium / Supporter)
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
      const role       = await newMember.guild.roles.fetch(SUPPORTER_ROLE_ID);
      if (!role) return;
      if (hasClanTag && !newMember.roles.cache.has(SUPPORTER_ROLE_ID)) await newMember.roles.add(role);
      else if (!hasClanTag && newMember.roles.cache.has(SUPPORTER_ROLE_ID)) await newMember.roles.remove(role);
    } catch (_) {}
  }
});

// ═══════════════════════════════════════════════════════════════
//  AUTO-MOD & XP
// ═══════════════════════════════════════════════════════════════
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const config = dbHelpers.getGuild(message.guild.id);
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
        try { await message.delete(); await message.channel.send({ embeds: [new EmbedBuilder().setDescription(`⚠️ ${message.author}, les liens d'invitation ne sont pas autorisés.`).setColor(Colors.WARNING)] }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)); } catch (_) {}
        return;
      }
    }
  }
  if (dbHelpers.isModuleEnabled(message.guild.id, 'leveling')) {
    const data  = dbHelpers.getLevel(message.guild.id, message.author.id);
    const now   = Date.now();
    const lastMsg = data.last_message ? new Date(data.last_message).getTime() : 0;
    if (now - lastMsg >= 60000) {
      const xpGain = 15 + Math.floor(Math.random() * 10);
      const result = dbHelpers.addXP(message.guild.id, message.author.id, xpGain);
      if (result.leveledUp) await message.channel.send({ embeds: [new EmbedBuilder().setTitle('🎉 Level Up !').setDescription(`Félicitations ${message.author} ! Tu es maintenant **niveau ${result.newLevel}** !`).setColor(Colors.SUCCESS).setThumbnail(message.author.displayAvatarURL({ size: 128 })).setTimestamp()] }).catch(() => {});
    }
  }
});

// ═══════════════════════════════════════════════════════════════
//  ERRORS
// ═══════════════════════════════════════════════════════════════
client.on(Events.Error, e => console.error('❌ Discord.js:', e));
process.on('unhandledRejection', e => console.error('❌ Unhandled:', e));
process.on('uncaughtException',  e => console.error('❌ Uncaught:', e));

client.login(TOKEN);
