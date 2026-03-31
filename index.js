// ═══════════════════════════════════════════════════════════════
//  NIRA BOT - Bot Discord Multifonction
//  Fichier principal : index.js
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
// ═══════════════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const TOKEN = process.env.BOT_TOKEN;
const NIRA_GUILD_ID = process.env.NIRA_GUILD_ID || '';
const SUPPORTER_ROLE_ID = process.env.SUPPORTER_ROLE_ID || '';
const PREMIUM_ROLE_ID = process.env.PREMIUM_ROLE_ID || '';
if (!TOKEN) {
  console.error('❌ BOT_TOKEN manquant dans les variables d\'environnement.');
  process.exit(1);
}
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
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
  ],
});
client.cooldowns = new Collection();
// ═══════════════════════════════════════════════════════════════
//  SLASH COMMANDS DEFINITION
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
        { name: 'Leveling', value: 'leveling' },
        { name: 'Economie', value: 'economy' },
        { name: 'Auto-moderation', value: 'automod' },
        { name: 'Anti-raid', value: 'antiraid' },
        { name: 'Fun', value: 'fun' },
        { name: 'Logs', value: 'logs' },
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
].map(cmd => cmd.toJSON());
new SlashCommandBuilder()
  .setName('statistics')
  .setDescription('Voir les statistiques d\'un membre (messages et temps vocal)')
  .addUserOption(o => o.setName('membre').setDescription('Le membre à consulter')),
// ═══════════════════════════════════════════════════════════════
//  REGISTER COMMANDS
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
//  LOGGING HELPER
// ═══════════════════════════════════════════════════════════════
async function sendLog(guild, embed) {
  const config = dbHelpers.getGuild(guild.id);
  if (!config.log_channel) return;
  if (!dbHelpers.isModuleEnabled(guild.id, 'logs')) return;
  try {
    const channel = await guild.channels.fetch(config.log_channel);
    if (channel) await channel.send({ embeds: [embed] });
  } catch (err) {
    // Silently ignore if log channel is unavailable
  }
}
// ═══════════════════════════════════════════════════════════════
//  ANTI-RAID TRACKER
// ═══════════════════════════════════════════════════════════════
const joinTracker = new Map();
function checkRaid(guildId) {
  const now = Date.now();
  if (!joinTracker.has(guildId)) joinTracker.set(guildId, []);
  const joins = joinTracker.get(guildId);
  joins.push(now);
  const recent = joins.filter(t => now - t < 10000);
  joinTracker.set(guildId, recent);
  // 5+ joins in 10 seconds = potential raid
  return recent.length >= 5;
}
// ═══════════════════════════════════════════════════════════════
//  READY EVENT
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
  // Giveaway & mute check interval
  setInterval(async () => {
    // Check expired giveaways
    const giveaways = dbHelpers.getActiveGiveaways();
    for (const gw of giveaways) {
      try {
        const guild = await client.guilds.fetch(gw.guild_id);
        const channel = await guild.channels.fetch(gw.channel_id);
        const entries = dbHelpers.getGiveawayEntries(gw.id);
        const winners = [];
        const pool = [...entries];
        for (let i = 0; i < Math.min(gw.winner_count, pool.length); i++) {
          const idx = Math.floor(Math.random() * pool.length);
          winners.push(pool.splice(idx, 1)[0].user_id);
        }
        const winnerMentions = winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'Aucun participant';
        const embed = new EmbedBuilder()
          .setTitle('🎉 Giveaway termine!')
          .setDescription(`**Prix:** ${gw.prize}\n**Gagnant(s):** ${winnerMentions}`)
          .setColor(Colors.SUCCESS)
          .setTimestamp();
        await channel.send({ embeds: [embed] });
        if (gw.message_id) {
          try {
            const msg = await channel.messages.fetch(gw.message_id);
            const endEmbed = new EmbedBuilder()
              .setTitle('🎉 Giveaway termine!')
              .setDescription(`**Prix:** ${gw.prize}\n**Gagnant(s):** ${winnerMentions}`)
              .setColor(Colors.ERROR)
              .setFooter({ text: 'Giveaway termine' })
              .setTimestamp();
            await msg.edit({ embeds: [endEmbed], components: [] });
          } catch (_) { /* message deleted */ }
        }
        dbHelpers.endGiveaway(gw.id);
      } catch (_) {
        dbHelpers.endGiveaway(gw.id);
      }
    }
    // Check expired mutes
    const mutes = dbHelpers.getExpiredMutes();
    for (const mute of mutes) {
      try {
        const guild = await client.guilds.fetch(mute.guild_id);
        const member = await guild.members.fetch(mute.user_id);
        await member.timeout(null, 'Duree du mute expiree');
        dbHelpers.removeMute(mute.guild_id, mute.user_id);
      } catch (_) {
        dbHelpers.removeMute(mute.guild_id, mute.user_id);
      }
    }
  }, 15000);
});
// ═══════════════════════════════════════════════════════════════
//  INTERACTION HANDLER (SLASH COMMANDS)
// ═══════════════════════════════════════════════════════════════
client.on(Events.InteractionCreate, async (interaction) => {
  // ── Button interactions ──
  if (interaction.isButton()) {
    // Giveaway participation
    if (interaction.customId.startsWith('giveaway_')) {
      const giveawayId = parseInt(interaction.customId.split('_')[1]);
      dbHelpers.enterGiveaway(giveawayId, interaction.user.id);
      return interaction.reply({ content: '🎉 Tu participes au giveaway!', ephemeral: true });
    }
    // ── System Toggle Buttons ──
    if (interaction.customId.startsWith('sys_toggle_')) {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
      }
      const system = interaction.customId.replace('sys_toggle_', '');
      const guildId = interaction.guild.id;
      if (system === 'captcha') {
        const config = dbHelpers.getGuild(guildId);
        const newState = config.captcha_enabled ? 0 : 1;
        dbHelpers.updateGuild(guildId, { captcha_enabled: newState });
        const label = newState ? 'active' : 'desactive';
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription(`✅ Le systeme **Captcha** a ete **${label}**.`).setColor(newState ? Colors.SUCCESS : Colors.ERROR)],
          ephemeral: true,
        });
      }
      if (system === 'automod') {
        const config = dbHelpers.getGuild(guildId);
        const wasEnabled = !!config.automod_enabled && dbHelpers.isModuleEnabled(guildId, 'automod');
        if (wasEnabled) {
          dbHelpers.updateGuild(guildId, { automod_enabled: 0 });
          dbHelpers.setModule(guildId, 'automod', false);
        } else {
          dbHelpers.updateGuild(guildId, { automod_enabled: 1 });
          dbHelpers.setModule(guildId, 'automod', true);
        }
        const label = wasEnabled ? 'desactive' : 'active';
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription(`✅ Le systeme **Auto-Moderation** a ete **${label}**.`).setColor(!wasEnabled ? Colors.SUCCESS : Colors.ERROR)],
          ephemeral: true,
        });
      }
      if (system === 'antiraid') {
        const config = dbHelpers.getGuild(guildId);
        const newState = config.antiraid_enabled ? 0 : 1;
        dbHelpers.updateGuild(guildId, { antiraid_enabled: newState });
        const label = newState ? 'active' : 'desactive';
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription(`✅ Le systeme **Anti-Raid** a ete **${label}**.`).setColor(newState ? Colors.SUCCESS : Colors.ERROR)],
          ephemeral: true,
        });
      }
      if (system === 'leveling') {
        const isEnabled = dbHelpers.isModuleEnabled(guildId, 'leveling');
        dbHelpers.setModule(guildId, 'leveling', !isEnabled);
        const label = isEnabled ? 'desactive' : 'active';
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription(`✅ Le systeme **Niveaux** a ete **${label}**.`).setColor(!isEnabled ? Colors.SUCCESS : Colors.ERROR)],
          ephemeral: true,
        });
      }
      if (system === 'economy') {
        const isEnabled = dbHelpers.isModuleEnabled(guildId, 'economy');
        dbHelpers.setModule(guildId, 'economy', !isEnabled);
        const label = isEnabled ? 'desactive' : 'active';
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription(`✅ Le systeme **Economie** a ete **${label}**.`).setColor(!isEnabled ? Colors.SUCCESS : Colors.ERROR)],
          ephemeral: true,
        });
      }
    }
    // ── System Test Buttons ──
    if (interaction.customId.startsWith('sys_test_')) {
      const system = interaction.customId.replace('sys_test_', '');
      if (system === 'captcha') {
        const code = generateCaptchaCode();
        const imageBuffer = generateCaptchaImage(code);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'captcha_test.png' });
        const embed = new EmbedBuilder()
          .setTitle('🧪 PREVIEW - Verification Captcha')
          .setDescription(
            `Voici ce que les nouveaux membres verront:\n\n` +
            `Bienvenue **NouveauMembre**!\n\n` +
            `Pour acceder au serveur, entre le code affiche dans l'image ci-dessous.\n` +
            `Utilise le bouton pour entrer ta reponse.\n\n` +
            `⚠️ Tu as **3** essais.\n` +
            `⏰ Tu seras kick automatiquement apres **10 minutes**.\n\n` +
            `*Code de ce test: \`${code}\`*`
          )
          .setImage('attachment://captcha_test.png')
          .setColor(Colors.INFO)
          .setFooter({ text: '🧪 Ceci est un test - aucune action reelle n\'est effectuee' })
          .setTimestamp();
        const testButton = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('sys_test_noop')
            .setLabel('Entrer le code')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔐')
            .setDisabled(true),
        );
        return interaction.reply({ embeds: [embed], files: [attachment], components: [testButton], ephemeral: true });
      }
      if (system === 'reaction') {
        const embed = new EmbedBuilder()
          .setTitle('🧪 PREVIEW - Reaction Role')
          .setDescription(
            `Voici un exemple de message reaction role:\n\n` +
            `──────────────────\n` +
            `Choisis ton role en reagissant ci-dessous!\n\n` +
            `🎮 → **Joueur**\n` +
            `🎵 → **Musique**\n` +
            `📢 → **Notifications**\n` +
            `──────────────────\n\n` +
            `> Les membres reagissent avec l'emoji correspondant et recoivent le role automatiquement.\n` +
            `> Retirer la reaction = retirer le role.`
          )
          .setColor(Colors.PRIMARY)
          .setFooter({ text: '🧪 Ceci est un test - aucune action reelle n\'est effectuee' })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      if (system === 'automod') {
        const embed = new EmbedBuilder()
          .setTitle('🧪 PREVIEW - Auto-Moderation')
          .setDescription(
            `Voici ce qui se passe quand l'auto-moderation detecte un abus:\n\n` +
            `**1. Spam detecte (5+ messages en 10s):**\n` +
            `> 🔇 L'utilisateur est mute 5 minutes automatiquement\n\n` +
            `**2. Langage inapproprie:**`
          )
          .setColor(Colors.MODERATION)
          .setTimestamp();
        const preview1 = new EmbedBuilder()
          .setDescription('🔇 @SpamUser a ete mute 5 minutes (spam detecte).')
          .setColor(Colors.MODERATION);
        const preview2 = new EmbedBuilder()
          .setDescription('⚠️ @BadUser, ton message a ete supprime (langage inapproprie).')
          .setColor(Colors.WARNING);
        const preview3 = new EmbedBuilder()
          .setDescription('⚠️ @LinkUser, les liens d\'invitation ne sont pas autorises.')
          .setColor(Colors.WARNING);
        const footer = new EmbedBuilder()
          .setDescription('*🧪 Ceci est un test - aucune action reelle n\'est effectuee*')
          .setColor(Colors.INFO);
        return interaction.reply({ embeds: [embed, preview1, preview2, preview3, footer], ephemeral: true });
      }
      if (system === 'antiraid') {
        const embed = new EmbedBuilder()
          .setTitle('🧪 PREVIEW - Anti-Raid')
          .setDescription(
            `Voici ce qui se passe lors d'un raid detecte:\n\n` +
            `**Detection:** 5+ membres rejoignent en moins de 10 secondes\n\n` +
            `**Action automatique:**`
          )
          .setColor(Colors.ERROR)
          .setTimestamp();
        const logPreview = new EmbedBuilder()
          .setTitle('🛡️ Anti-Raid')
          .setDescription('RaidBot#0001 a ete kick automatiquement (raid detecte)')
          .setColor(Colors.ERROR);
        const footer = new EmbedBuilder()
          .setDescription('*🧪 Ceci est un test - les nouveaux membres seront kick automatiquement si un raid est detecte*')
          .setColor(Colors.INFO);
        return interaction.reply({ embeds: [embed, logPreview, footer], ephemeral: true });
      }
      if (system === 'leveling') {
        const xpGain = 15 + Math.floor(Math.random() * 10);
        const embed = new EmbedBuilder()
          .setTitle('🧪 PREVIEW - Systeme de Niveaux')
          .setDescription(
            `Voici ce que les membres voient quand ils montent de niveau:\n`
          )
          .setColor(Colors.PRIMARY)
          .setTimestamp();
        const levelUpPreview = new EmbedBuilder()
          .setTitle('🎉 Level Up!')
          .setDescription(`Felicitations ${interaction.user}! Tu es maintenant **niveau 5**!`)
          .setColor(Colors.SUCCESS)
          .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }));
        const rankPreview = new EmbedBuilder()
          .setTitle(`📊 Niveau de ${interaction.user.username}`)
          .addFields(
            { name: '🏆 Niveau', value: '4', inline: true },
            { name: '✨ XP', value: `${380 + xpGain}/600`, inline: true },
            { name: '📈 Progression', value: '██████░░░░ 65%' },
          )
          .setColor(Colors.PRIMARY)
          .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }));
        const footer = new EmbedBuilder()
          .setDescription(`*🧪 Ceci est un test - Gain d'XP simule: +${xpGain} XP par message (cooldown 60s)*`)
          .setColor(Colors.INFO);
        return interaction.reply({ embeds: [embed, levelUpPreview, rankPreview, footer], ephemeral: true });
      }
      if (system === 'economy') {
        const reward = 100 + Math.floor(Math.random() * 50);
        const embed = new EmbedBuilder()
          .setTitle('🧪 PREVIEW - Systeme d\'Economie')
          .setDescription(`Voici ce que les membres voient:`)
          .setColor(Colors.PRIMARY)
          .setTimestamp();
        const dailyPreview = new EmbedBuilder()
          .setTitle('💰 Recompense quotidienne')
          .setDescription(`Tu as recu **${reward}** pieces!\n💎 Nouveau solde: **${reward}** pieces`)
          .setColor(Colors.SUCCESS);
        const balancePreview = new EmbedBuilder()
          .setTitle(`💰 Solde de ${interaction.user.username}`)
          .setDescription(`**${reward}** pieces 💎`)
          .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
          .setColor(Colors.PRIMARY);
        const footer = new EmbedBuilder()
          .setDescription('*🧪 Ceci est un test - aucune action reelle n\'est effectuee*')
          .setColor(Colors.INFO);
        return interaction.reply({ embeds: [embed, dailyPreview, balancePreview, footer], ephemeral: true });
      }
      // No-op button (disabled test buttons)
      if (system === 'noop') {
        return interaction.reply({ content: '🧪 Ceci est un bouton de test desactive.', ephemeral: true });
      }
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member, user, options, channel } = interaction;
  try {
    // ── /setup-reaction ──
    if (commandName === 'setup-reaction') {
      const role = options.getRole('role');
      const emoji = options.getString('emoji');
      const messageText = options.getString('message');
      const targetChannel = options.getChannel('salon') || channel;
      const image = options.getAttachment('image');
      if (!messageText && !image) {
        return interaction.reply({ content: '❌ Tu dois fournir au moins un **message** ou une **image**.', ephemeral: true });
      }
      const sendOptions = {};
      if (messageText) sendOptions.content = messageText;
      if (image) {
        sendOptions.files = [{ attachment: image.url, name: image.name }];
      }
      const sent = await targetChannel.send(sendOptions);
      const reactionResult = await sent.react(emoji);
      // Store the resolved emoji identifier from the actual reaction
      const resolvedEmoji = reactionResult.emoji.id
        ? `${reactionResult.emoji.name}:${reactionResult.emoji.id}`
        : reactionResult.emoji.name;
      dbHelpers.addReactionRole(guild.id, targetChannel.id, sent.id, resolvedEmoji, role.id);
      const embed = new EmbedBuilder()
        .setTitle('✅ Reaction Role configure')
        .setDescription(`**Message:** envoye dans ${targetChannel}\n**Emoji:** ${emoji}\n**Role:** ${role}`)
        .setColor(Colors.SUCCESS)
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    // ── /setup-captcha ──
    if (commandName === 'setup-captcha') {
      const captchaChannel = options.getChannel('salon');
      const captchaRole = options.getRole('role');
      const retryLimit = options.getInteger('essais') || 3;
      dbHelpers.getGuild(guild.id);
      dbHelpers.updateGuild(guild.id, {
        captcha_enabled: 1,
        captcha_channel: captchaChannel.id,
        captcha_role: captchaRole.id,
        captcha_retry_limit: retryLimit,
      });
      const embed = new EmbedBuilder()
        .setTitle('🔐 Captcha configure')
        .setDescription(
          `**Salon:** ${captchaChannel}\n` +
          `**Role apres validation:** ${captchaRole}\n` +
          `**Essais max:** ${retryLimit}\n` +
          `**Kick auto:** 10 minutes\n\n` +
          `Les nouveaux membres devront resoudre un captcha dans ${captchaChannel} pour acceder au serveur.`
        )
        .setColor(Colors.SUCCESS)
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    // ── /ban ──
    if (commandName === 'ban') {
      const target = options.getMember('utilisateur');
      const reason = options.getString('raison') || 'Aucune raison fournie';
      if (!target) return interaction.reply({ content: '❌ Utilisateur introuvable.', ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: '❌ Je ne peux pas bannir cet utilisateur.', ephemeral: true });
      if (member.roles.highest.position <= target.roles.highest.position) {
        return interaction.reply({ content: '❌ Tu ne peux pas bannir un membre avec un role egal ou superieur.', ephemeral: true });
      }
      await target.ban({ reason: `${user.tag}: ${reason}` });
      dbHelpers.addModLog(guild.id, 'BAN', target.id, user.id, reason);
      const embed = new EmbedBuilder()
        .setTitle('🔨 Membre banni')
        .setDescription(`**Utilisateur:** ${target.user.tag}\n**Moderateur:** ${user.tag}\n**Raison:** ${reason}`)
        .setColor(Colors.ERROR)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await sendLog(guild, new EmbedBuilder()
        .setTitle('📋 Ban')
        .addFields(
          { name: 'Utilisateur', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderateur', value: `${user.tag}`, inline: true },
          { name: 'Raison', value: reason },
        )
        .setColor(Colors.ERROR)
        .setTimestamp());
    }
    // ── /kick ──
    if (commandName === 'kick') {
      const target = options.getMember('utilisateur');
      const reason = options.getString('raison') || 'Aucune raison fournie';
      if (!target) return interaction.reply({ content: '❌ Utilisateur introuvable.', ephemeral: true });
      if (!target.kickable) return interaction.reply({ content: '❌ Je ne peux pas expulser cet utilisateur.', ephemeral: true });
      if (member.roles.highest.position <= target.roles.highest.position) {
        return interaction.reply({ content: '❌ Tu ne peux pas expulser un membre avec un role egal ou superieur.', ephemeral: true });
      }
      await target.kick(`${user.tag}: ${reason}`);
      dbHelpers.addModLog(guild.id, 'KICK', target.id, user.id, reason);
      const embed = new EmbedBuilder()
        .setTitle('👢 Membre expulse')
        .setDescription(`**Utilisateur:** ${target.user.tag}\n**Moderateur:** ${user.tag}\n**Raison:** ${reason}`)
        .setColor(Colors.WARNING)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await sendLog(guild, new EmbedBuilder()
        .setTitle('📋 Kick')
        .addFields(
          { name: 'Utilisateur', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderateur', value: `${user.tag}`, inline: true },
          { name: 'Raison', value: reason },
        )
        .setColor(Colors.WARNING)
        .setTimestamp());
    }
    // ── /mute ──
    if (commandName === 'mute') {
      const target = options.getMember('utilisateur');
      const durationStr = options.getString('duree');
      const reason = options.getString('raison') || 'Aucune raison fournie';
      if (!target) return interaction.reply({ content: '❌ Utilisateur introuvable.', ephemeral: true });
      if (!target.moderatable) return interaction.reply({ content: '❌ Je ne peux pas mute cet utilisateur.', ephemeral: true });
      const duration = parseDuration(durationStr);
      if (!duration) return interaction.reply({ content: '❌ Duree invalide. Exemples: `10m`, `1h`, `1d`, `7j`', ephemeral: true });
      if (duration > 28 * 24 * 60 * 60 * 1000) return interaction.reply({ content: '❌ Duree maximale: 28 jours.', ephemeral: true });
      await target.timeout(duration, `${user.tag}: ${reason}`);
      const unmuteAt = new Date(Date.now() + duration).toISOString();
      dbHelpers.addMute(guild.id, target.id, unmuteAt);
      dbHelpers.addModLog(guild.id, 'MUTE', target.id, user.id, `${reason} (${formatDuration(duration)})`);
      const embed = new EmbedBuilder()
        .setTitle('🔇 Membre mute')
        .setDescription(`**Utilisateur:** ${target.user.tag}\n**Moderateur:** ${user.tag}\n**Duree:** ${formatDuration(duration)}\n**Raison:** ${reason}`)
        .setColor(Colors.MODERATION)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await sendLog(guild, new EmbedBuilder()
        .setTitle('📋 Mute')
        .addFields(
          { name: 'Utilisateur', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderateur', value: `${user.tag}`, inline: true },
          { name: 'Duree', value: formatDuration(duration), inline: true },
          { name: 'Raison', value: reason },
        )
        .setColor(Colors.MODERATION)
        .setTimestamp());
    }
    // ── /unmute ──
    if (commandName === 'unmute') {
      const target = options.getMember('utilisateur');
      if (!target) return interaction.reply({ content: '❌ Utilisateur introuvable.', ephemeral: true });
      await target.timeout(null, `Unmute par ${user.tag}`);
      dbHelpers.removeMute(guild.id, target.id);
      dbHelpers.addModLog(guild.id, 'UNMUTE', target.id, user.id, `Unmute par ${user.tag}`);
      const embed = new EmbedBuilder()
        .setTitle('🔊 Membre unmute')
        .setDescription(`**Utilisateur:** ${target.user.tag}\n**Moderateur:** ${user.tag}`)
        .setColor(Colors.SUCCESS)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }
    // ── /warn ──
    if (commandName === 'warn') {
      const target = options.getMember('utilisateur');
      const reason = options.getString('raison');
      if (!target) return interaction.reply({ content: '❌ Utilisateur introuvable.', ephemeral: true });
      if (target.user.bot) return interaction.reply({ content: '❌ Impossible d\'avertir un bot.', ephemeral: true });
      const warnCount = dbHelpers.addWarning(guild.id, target.id, user.id, reason);
      dbHelpers.addModLog(guild.id, 'WARN', target.id, user.id, reason);
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Avertissement')
        .setDescription(`**Utilisateur:** ${target.user.tag}\n**Moderateur:** ${user.tag}\n**Raison:** ${reason}\n**Total avertissements:** ${warnCount}`)
        .setColor(Colors.WARNING)
        .setTimestamp();
      // Auto-actions based on warn count
      let autoAction = '';
      if (warnCount >= 5 && target.bannable) {
        await target.ban({ reason: '5 avertissements atteints - Ban automatique' });
        autoAction = '\n\n🔨 **Ban automatique** (5 avertissements atteints)';
        dbHelpers.addModLog(guild.id, 'AUTO-BAN', target.id, client.user.id, '5 avertissements');
      } else if (warnCount >= 3 && target.moderatable) {
        await target.timeout(60 * 60 * 1000, '3 avertissements atteints - Mute automatique 1h');
        autoAction = '\n\n🔇 **Mute automatique 1h** (3 avertissements atteints)';
        dbHelpers.addModLog(guild.id, 'AUTO-MUTE', target.id, client.user.id, '3 avertissements');
      }
      if (autoAction) embed.setDescription(embed.data.description + autoAction);
      await interaction.reply({ embeds: [embed] });
      await sendLog(guild, new EmbedBuilder()
        .setTitle('📋 Warn')
        .addFields(
          { name: 'Utilisateur', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderateur', value: `${user.tag}`, inline: true },
          { name: 'Raison', value: reason },
          { name: 'Total', value: `${warnCount}`, inline: true },
        )
        .setColor(Colors.WARNING)
        .setTimestamp());
    }
    // ── /warnings ──
    if (commandName === 'warnings') {
      const target = options.getUser('utilisateur');
      const warns = dbHelpers.getWarnings(guild.id, target.id);
      if (warns.length === 0) {
        return interaction.reply({ content: `✅ ${target.tag} n'a aucun avertissement.`, ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setTitle(`⚠️ Avertissements de ${target.tag}`)
        .setDescription(warns.map((w, i) =>
          `**#${i + 1}** - ${w.reason}\n> Par <@${w.moderator_id}> - <t:${Math.floor(new Date(w.created_at).getTime() / 1000)}:R>`
        ).join('\n\n'))
        .setColor(Colors.WARNING)
        .setFooter({ text: `Total: ${warns.length} avertissement(s)` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    // ── /clear ──
    if (commandName === 'clear') {
      const amount = options.getInteger('nombre');
      const deleted = await channel.bulkDelete(amount, true);
      const embed = new EmbedBuilder()
        .setDescription(`🗑️ ${deleted.size} message(s) supprime(s)`)
        .setColor(Colors.SUCCESS);
      const reply = await interaction.reply({ embeds: [embed], fetchReply: true });
      setTimeout(() => reply.delete().catch(() => {}), 3000);
      await sendLog(guild, new EmbedBuilder()
        .setTitle('📋 Clear')
        .addFields(
          { name: 'Salon', value: `${channel}`, inline: true },
          { name: 'Moderateur', value: `${user.tag}`, inline: true },
          { name: 'Messages', value: `${deleted.size}`, inline: true },
        )
        .setColor(Colors.INFO)
        .setTimestamp());
    }
    // ── /level ──
    if (commandName === 'level') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'leveling')) {
        return interaction.reply({ content: '❌ Le module de leveling est desactive.', ephemeral: true });
      }
      const target = options.getUser('utilisateur') || user;
      const data = dbHelpers.getLevel(guild.id, target.id);
      const required = getRequiredXP(data.level);
      const progress = Math.round((data.xp / required) * 100);
      const bar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
      const embed = new EmbedBuilder()
        .setTitle(`📊 Niveau de ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .addFields(
          { name: '🏆 Niveau', value: `${data.level}`, inline: true },
          { name: '✨ XP', value: `${data.xp}/${required}`, inline: true },
          { name: '📈 Progression', value: `${bar} ${progress}%` },
        )
        .setColor(Colors.PRIMARY)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    // ── /rank ──
    if (commandName === 'rank') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'leveling')) {
        return interaction.reply({ content: '❌ Le module de leveling est desactive.', ephemeral: true });
      }
      const leaderboard = dbHelpers.getLeaderboard(guild.id, 10);
      if (leaderboard.length === 0) {
        return interaction.reply({ content: '📊 Aucune donnee de niveau pour ce serveur.', ephemeral: true });
      }
      const medals = ['🥇', '🥈', '🥉'];
      const description = leaderboard.map((entry, i) => {
        const prefix = i < 3 ? medals[i] : `**${i + 1}.**`;
        return `${prefix} <@${entry.user_id}> - Niveau **${entry.level}** (${entry.xp} XP)`;
      }).join('\n');
      const embed = new EmbedBuilder()
        .setTitle(`🏆 Classement - ${guild.name}`)
        .setDescription(description)
        .setColor(Colors.PRIMARY)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    // ── /daily ──
    if (commandName === 'daily') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'economy')) {
        return interaction.reply({ content: '❌ Le module d\'economie est desactive.', ephemeral: true });
      }
      const result = dbHelpers.claimDaily(guild.id, user.id);
      if (!result.success) {
        return interaction.reply({
          content: `⏰ Tu as deja recupere ta recompense quotidienne! Reviens dans **${result.remaining}**.`,
          ephemeral: true,
        });
      }
      const embed = new EmbedBuilder()
        .setTitle('💰 Recompense quotidienne')
        .setDescription(`Tu as recu **${result.reward}** pieces!\n💎 Nouveau solde: **${result.newBalance}** pieces`)
        .setColor(Colors.SUCCESS)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    // ── /balance ──
    if (commandName === 'balance') {
      if (!dbHelpers.isModuleEnabled(guild.id, 'economy')) {
        return interaction.reply({ content: '❌ Le module d\'economie est desactive.', ephemeral: true });
      }
      const target = options.getUser('utilisateur') || user;
      const eco = dbHelpers.getBalance(guild.id, target.id);
      const embed = new EmbedBuilder()
        .setTitle(`💰 Solde de ${target.username}`)
        .setDescription(`**${eco.balance}** pieces 💎`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setColor(Colors.PRIMARY)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    // ── /giveaway ──
    if (commandName === 'giveaway') {
      const prize = options.getString('prix');
      const durationStr = options.getString('duree');
      const winnerCount = options.getInteger('gagnants') || 1;
      const targetChannel = options.getChannel('salon') || channel;
      const duration = parseDuration(durationStr);
      if (!duration) return interaction.reply({ content: '❌ Duree invalide. Exemples: `1h`, `1d`, `7j`', ephemeral: true });
      const endTime = new Date(Date.now() + duration);
      const embed = new EmbedBuilder()
        .setTitle('🎉 GIVEAWAY')
        .setDescription(
          `**Prix:** ${prize}\n` +
          `**Gagnant(s):** ${winnerCount}\n` +
          `**Fin:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\n` +
          `**Organise par:** ${user}\n\n` +
          `Clique sur le bouton ci-dessous pour participer!`
        )
        .setColor(Colors.PRIMARY)
        .setTimestamp(endTime);
      const giveawayId = dbHelpers.createGiveaway(guild.id, targetChannel.id, null, prize, winnerCount, endTime.toISOString(), user.id);
      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_${giveawayId}`)
          .setLabel('Participer 🎉')
          .setStyle(ButtonStyle.Primary),
      );
      const sent = await targetChannel.send({ embeds: [embed], components: [button] });
      // Update message ID in database
      const { db } = require('./utils');
      db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(sent.id, giveawayId);
      const confirmEmbed = new EmbedBuilder()
        .setDescription(`🎉 Giveaway lance dans ${targetChannel}! Fin <t:${Math.floor(endTime.getTime() / 1000)}:R>`)
        .setColor(Colors.SUCCESS);
      return interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
    }
    // ── /poll ──
    if (commandName === 'poll') {
      const question = options.getString('question');
      const pollOptions = [];
      for (let i = 1; i <= 5; i++) {
        const opt = options.getString(`option${i}`);
        if (opt) pollOptions.push(opt);
      }
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      const description = pollOptions.map((opt, i) => `${emojis[i]} ${opt}`).join('\n\n');
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${question}`)
        .setDescription(description)
        .setColor(Colors.PRIMARY)
        .setFooter({ text: `Sondage par ${user.username}` })
        .setTimestamp();
      const sent = await channel.send({ embeds: [embed] });
      for (let i = 0; i < pollOptions.length; i++) {
        await sent.react(emojis[i]);
      }
      return interaction.reply({ content: '✅ Sondage cree!', ephemeral: true });
    }
    // ── /userinfo ──
    if (commandName === 'userinfo') {
      const target = options.getMember('utilisateur') || member;
      const targetUser = target.user;
      const embed = new EmbedBuilder()
        .setTitle(`👤 ${targetUser.tag}`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '🆔 ID', value: targetUser.id, inline: true },
          { name: '📛 Surnom', value: target.nickname || 'Aucun', inline: true },
          { name: '🤖 Bot', value: targetUser.bot ? 'Oui' : 'Non', inline: true },
          { name: '📅 Compte cree', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
          { name: '📥 A rejoint', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true },
          { name: '🎭 Roles', value: target.roles.cache.filter(r => r.id !== guild.id).map(r => `${r}`).join(', ') || 'Aucun' },
        )
        .setColor(target.displayHexColor || Colors.PRIMARY)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    // ── /serverinfo ──
    if (commandName === 'serverinfo') {
      const owner = await guild.fetchOwner();
      const embed = new EmbedBuilder()
        .setTitle(`🏠 ${guild.name}`)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .addFields(
          { name: '🆔 ID', value: guild.id, inline: true },
          { name: '👑 Proprietaire', value: `${owner.user.tag}`, inline: true },
          { name: '📅 Cree le', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
          { name: '👥 Membres', value: `${guild.memberCount}`, inline: true },
          { name: '💬 Salons', value: `${guild.channels.cache.size}`, inline: true },
          { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
          { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
          { name: '🔒 Niveau verif.', value: guild.verificationLevel.toString(), inline: true },
          { name: '💎 Boosts', value: `${guild.premiumSubscriptionCount || 0} (Niveau ${guild.premiumTier})`, inline: true },
        )
        .setColor(Colors.PRIMARY)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    // ── /config ──
    if (commandName === 'config') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'logs') {
        const logChannel = options.getChannel('salon');
        dbHelpers.getGuild(guild.id);
        dbHelpers.updateGuild(guild.id, { log_channel: logChannel.id });
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`✅ Salon de logs defini sur ${logChannel}`)
            .setColor(Colors.SUCCESS)],
          ephemeral: true,
        });
      }
      if (sub === 'automod') {
        const enabled = options.getBoolean('activer');
        dbHelpers.getGuild(guild.id);
        dbHelpers.updateGuild(guild.id, { automod_enabled: enabled ? 1 : 0 });
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`✅ Auto-moderation ${enabled ? 'activee' : 'desactivee'}`)
            .setColor(Colors.SUCCESS)],
          ephemeral: true,
        });
      }
      if (sub === 'antiraid') {
        const enabled = options.getBoolean('activer');
        dbHelpers.getGuild(guild.id);
        dbHelpers.updateGuild(guild.id, { antiraid_enabled: enabled ? 1 : 0 });
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`✅ Anti-raid ${enabled ? 'active' : 'desactive'}`)
            .setColor(Colors.SUCCESS)],
          ephemeral: true,
        });
      }
      if (sub === 'leveling') {
        const enabled = options.getBoolean('activer');
        dbHelpers.setModule(guild.id, 'leveling', enabled);
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`✅ Systeme de niveaux ${enabled ? 'active' : 'desactive'}`)
            .setColor(Colors.SUCCESS)],
          ephemeral: true,
        });
      }
      if (sub === 'prefix') {
        const prefix = options.getString('prefixe');
        dbHelpers.getGuild(guild.id);
        dbHelpers.updateGuild(guild.id, { prefix });
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`✅ Prefixe change en \`${prefix}\``)
            .setColor(Colors.SUCCESS)],
          ephemeral: true,
        });
      }
      if (sub === 'langue') {
        const lang = options.getString('langue');
        dbHelpers.getGuild(guild.id);
        dbHelpers.updateGuild(guild.id, { language: lang });
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`✅ Langue changee en \`${lang === 'fr' ? 'Francais' : 'English'}\``)
            .setColor(Colors.SUCCESS)],
          ephemeral: true,
        });
      }
    }
    // ── /module ──
    if (commandName === 'module') {
      const moduleName = options.getString('nom');
      const enabled = options.getBoolean('activer');
      dbHelpers.setModule(guild.id, moduleName, enabled);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setDescription(`✅ Module **${moduleName}** ${enabled ? 'active' : 'desactive'}`)
          .setColor(Colors.SUCCESS)],
        ephemeral: true,
      });
    }
    // ── /captcha ── System management
    if (commandName === 'captcha') {
      const config = dbHelpers.getGuild(guild.id);
      const isEnabled = !!config.captcha_enabled;
      const captchaChannel = config.captcha_channel ? `<#${config.captcha_channel}>` : 'Non defini';
      const captchaRole = config.captcha_role ? `<@&${config.captcha_role}>` : 'Non defini';
      const embed = new EmbedBuilder()
        .setTitle('🔐 Systeme Captcha')
        .setDescription(
          `**Statut:** ${isEnabled ? '🟢 Active' : '🔴 Desactive'}\n\n` +
          `**Salon:** ${captchaChannel}\n` +
          `**Role apres validation:** ${captchaRole}\n` +
          `**Essais max:** ${config.captcha_retry_limit || 3}\n` +
          `**Kick auto:** 10 minutes\n\n` +
          `> Quand un membre rejoint, il doit resoudre un captcha visuel pour acceder au serveur.`
        )
        .setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR)
        .setFooter({ text: 'Utilise /setup-captcha pour configurer le salon et le role' })
        .setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sys_toggle_captcha`)
          .setLabel(isEnabled ? 'Desactiver' : 'Activer')
          .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
          .setEmoji(isEnabled ? '🔴' : '🟢'),
        new ButtonBuilder()
          .setCustomId(`sys_test_captcha`)
          .setLabel('Tester')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🧪'),
      );
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }
    // ── /reaction-roles ── System management
    if (commandName === 'reaction-roles') {
      const { db } = require('./utils');
      const rrList = db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ?').all(guild.id);
      const count = rrList.length;
      let listDesc = '';
      if (count > 0) {
        listDesc = rrList.slice(0, 10).map((rr, i) =>
          `**${i + 1}.** ${rr.emoji} → <@&${rr.role_id}> (dans <#${rr.channel_id}>)`
        ).join('\n');
        if (count > 10) listDesc += `\n... et ${count - 10} autre(s)`;
      } else {
        listDesc = '*Aucun reaction role configure.*';
      }
      const embed = new EmbedBuilder()
        .setTitle('🔁 Systeme Reaction Roles')
        .setDescription(
          `**Statut:** ${count > 0 ? '🟢 Active' : '🔴 Aucun role configure'}\n` +
          `**Nombre de reaction roles:** ${count}\n\n` +
          `${listDesc}\n\n` +
          `> Les membres reagissent a un message pour obtenir un role automatiquement.`
        )
        .setColor(count > 0 ? Colors.SUCCESS : Colors.ERROR)
        .setFooter({ text: 'Utilise /setup-reaction pour ajouter un reaction role' })
        .setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sys_test_reaction`)
          .setLabel('Tester (preview)')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🧪'),
      );
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }
    // ── /automod ── System management
    if (commandName === 'automod') {
      const config = dbHelpers.getGuild(guild.id);
      const isEnabled = !!config.automod_enabled;
      const moduleEnabled = dbHelpers.isModuleEnabled(guild.id, 'automod');
      const fullyActive = isEnabled && moduleEnabled;
      const embed = new EmbedBuilder()
        .setTitle('🛡️ Systeme Auto-Moderation')
        .setDescription(
          `**Statut:** ${fullyActive ? '🟢 Active' : '🔴 Desactive'}\n\n` +
          `**Fonctionnalites:**\n` +
          `> 🚫 **Anti-spam** - Detecte les messages rapides (5+ en 10s) → mute 5min\n` +
          `> 🤬 **Filtre insultes** - Supprime les messages avec mots interdits\n` +
          `> 🔗 **Anti-liens** - Bloque les invitations Discord non-autorisees\n\n` +
          `> L'auto-moderation protege automatiquement le serveur contre les abus.`
        )
        .setColor(fullyActive ? Colors.SUCCESS : Colors.ERROR)
        .setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sys_toggle_automod`)
          .setLabel(fullyActive ? 'Desactiver' : 'Activer')
          .setStyle(fullyActive ? ButtonStyle.Danger : ButtonStyle.Success)
          .setEmoji(fullyActive ? '🔴' : '🟢'),
        new ButtonBuilder()
          .setCustomId(`sys_test_automod`)
          .setLabel('Tester')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🧪'),
      );
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }
    // ── /antiraid ── System management
    if (commandName === 'antiraid') {
      const config = dbHelpers.getGuild(guild.id);
      const isEnabled = !!config.antiraid_enabled;
      const embed = new EmbedBuilder()
        .setTitle('🛡️ Systeme Anti-Raid')
        .setDescription(
          `**Statut:** ${isEnabled ? '🟢 Active' : '🔴 Desactive'}\n\n` +
          `**Fonctionnement:**\n` +
          `> Detecte les raids (5+ joins en 10 secondes)\n` +
          `> Les nouveaux membres sont kick automatiquement pendant un raid\n` +
          `> Les logs sont envoyes dans le salon de logs\n\n` +
          `> Protege le serveur contre les vagues d'arrivees massives de bots.`
        )
        .setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR)
        .setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sys_toggle_antiraid`)
          .setLabel(isEnabled ? 'Desactiver' : 'Activer')
          .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
          .setEmoji(isEnabled ? '🔴' : '🟢'),
        new ButtonBuilder()
          .setCustomId(`sys_test_antiraid`)
          .setLabel('Tester')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🧪'),
      );
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }
    // ── /leveling ── System management
    if (commandName === 'leveling') {
      const isEnabled = dbHelpers.isModuleEnabled(guild.id, 'leveling');
      const topUsers = dbHelpers.getLeaderboard(guild.id, 3);
      let topDesc = '';
      if (topUsers.length > 0) {
        const medals = ['🥇', '🥈', '🥉'];
        topDesc = topUsers.map((u, i) => `${medals[i]} <@${u.user_id}> - Niv. **${u.level}** (${u.xp} XP)`).join('\n');
      } else {
        topDesc = '*Aucune donnee de niveau.*';
      }
      const embed = new EmbedBuilder()
        .setTitle('📊 Systeme de Niveaux')
        .setDescription(
          `**Statut:** ${isEnabled ? '🟢 Active' : '🔴 Desactive'}\n\n` +
          `**Fonctionnement:**\n` +
          `> 💬 Gain de **15-24 XP** par message (cooldown 60s)\n` +
          `> 🎉 Annonce de level up dans le salon\n` +
          `> 🏆 Classement avec /rank\n\n` +
          `**Top 3:**\n${topDesc}`
        )
        .setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR)
        .setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sys_toggle_leveling`)
          .setLabel(isEnabled ? 'Desactiver' : 'Activer')
          .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
          .setEmoji(isEnabled ? '🔴' : '🟢'),
        new ButtonBuilder()
          .setCustomId(`sys_test_leveling`)
          .setLabel('Tester')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🧪'),
      );
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }
    // ── /economie ── System management
    if (commandName === 'economie') {
      const isEnabled = dbHelpers.isModuleEnabled(guild.id, 'economy');
      const embed = new EmbedBuilder()
        .setTitle('💰 Systeme d\'Economie')
        .setDescription(
          `**Statut:** ${isEnabled ? '🟢 Active' : '🔴 Desactive'}\n\n` +
          `**Fonctionnalites:**\n` +
          `> 💎 **/daily** - Recompense quotidienne (100-150 pieces)\n` +
          `> 💰 **/balance** - Voir son solde\n\n` +
          `> Systeme d'economie virtuelle pour votre serveur.`
        )
        .setColor(isEnabled ? Colors.SUCCESS : Colors.ERROR)
        .setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sys_toggle_economy`)
          .setLabel(isEnabled ? 'Desactiver' : 'Activer')
          .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
          .setEmoji(isEnabled ? '🔴' : '🟢'),
        new ButtonBuilder()
          .setCustomId(`sys_test_economy`)
          .setLabel('Tester')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🧪'),
      );
      return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }
    // ── /help ──
    if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('📖 Nira - Commandes')
        .setDescription('Voici la liste de toutes les commandes disponibles.')
        .addFields(
          {
            name: '📋 Gestion des systemes',
            value: [
              '`/captcha` - Voir/gerer le captcha',
              '`/reaction-roles` - Voir/gerer les reaction roles',
              '`/automod` - Voir/gerer l\'auto-moderation',
              '`/antiraid` - Voir/gerer l\'anti-raid',
              '`/leveling` - Voir/gerer les niveaux',
              '`/economie` - Voir/gerer l\'economie',
            ].join('\n'),
          },
          {
            name: '⚙️ Configuration',
            value: [
              '`/setup-reaction` - Creer un message reaction-role',
              '`/setup-captcha` - Configurer le captcha',
              '`/config logs` - Definir le salon de logs',
              '`/config prefix` - Changer le prefixe',
              '`/config langue` - Changer la langue',
              '`/module` - Activer/desactiver un module',
            ].join('\n'),
          },
          {
            name: '🛡️ Moderation',
            value: [
              '`/ban` - Bannir un utilisateur',
              '`/kick` - Expulser un utilisateur',
              '`/mute` - Mute un utilisateur',
              '`/unmute` - Unmute un utilisateur',
              '`/warn` - Avertir un utilisateur',
              '`/warnings` - Voir les avertissements',
              '`/clear` - Supprimer des messages',
            ].join('\n'),
          },
          {
            name: '🎮 Fun & Utilitaires',
            value: [
              '`/level` - Voir ton niveau',
              '`/rank` - Classement du serveur',
              '`/daily` - Recompense quotidienne',
              '`/balance` - Voir ton solde',
              '`/giveaway` - Lancer un giveaway',
              '`/poll` - Creer un sondage',
              '`/userinfo` - Infos utilisateur',
              '`/serverinfo` - Infos serveur',
            ].join('\n'),
          },
        )
        .setColor(Colors.PRIMARY)
        .setFooter({ text: 'Nira Bot - Professionnel, utile, moderne et style.' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
       // ── /statistics ──
    if (commandName === 'statistics') {
      const target = options.getUser('membre') || user;
      const stats = dbHelpers.getStats(guild.id, target.id);
      
      // Check for active voice session
      const activeSession = dbHelpers.getVoiceSession(guild.id, target.id);
      let totalVoiceTime = stats.voice_time;
      
      if (activeSession) {
        const joinedAt = new Date(activeSession.joined_at);
        const now = new Date();
        const additionalSeconds = Math.floor((now - joinedAt) / 1000);
        totalVoiceTime += additionalSeconds;
      }
      
      // Format voice time
      const hours = Math.floor(totalVoiceTime / 3600);
      const minutes = Math.floor((totalVoiceTime % 3600) / 60);
      const voiceTimeFormatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      
      const embed = new EmbedBuilder()
        .setTitle(`📊 Statistiques de ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '💬 Messages envoyés', value: `**${stats.message_count.toLocaleString()}**`, inline: true },
          { name: '🎙️ Temps en vocal', value: `**${voiceTimeFormatted}**`, inline: true },
        )
        .setColor(Colors.PRIMARY)
        .setFooter({ text: `Statistiques sur ${guild.name}` })
        .setTimestamp();
      
      if (activeSession) {
        embed.addFields({ name: '🟢 Statut', value: 'Actuellement en vocal', inline: false });
      }
      
      return interaction.reply({ embeds: [embed] });
    }
  } catch (error) {
    console.error(`❌ Erreur commande /${commandName}:`, error);
    const content = '❌ Une erreur est survenue lors de l\'execution de la commande.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content, ephemeral: true }).catch(() => {});
    }
  }
  2. Ajouter ces helpers dans dbHelpers (utils.js):
// ── Member Statistics ───────────────────────────────────────
getStats(guildId, userId) {
  let row = db.prepare('SELECT * FROM member_statistics WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO member_statistics (guild_id, user_id) VALUES (?, ?)').run(guildId, userId);
    row = { guild_id: guildId, user_id: userId, message_count: 0, voice_time: 0 };
  }
  return row;
},
incrementMessageCount(guildId, userId) {
  this.getStats(guildId, userId);
  db.prepare('UPDATE member_statistics SET message_count = message_count + 1 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
},
addVoiceTime(guildId, userId, seconds) {
  this.getStats(guildId, userId);
  db.prepare('UPDATE member_statistics SET voice_time = voice_time + ? WHERE guild_id = ? AND user_id = ?').run(seconds, guildId, userId);
},

// ── Voice Sessions ──────────────────────────────────────────
startVoiceSession(guildId, userId) {
  const now = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO voice_sessions (guild_id, user_id, joined_at) VALUES (?, ?, ?)').run(guildId, viserId, now);
},
endVoiceSession(guildId, userId) {
  const session = db.prepare('SELECT * FROM voice_sessions WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (session) {
    const joinedAt = new Date(session.joined_at);
    const now = new Date();
    const seconds = Math.floor((now - joinedAt) / 1000);
    this.addVoiceTime(guildId, userId, seconds);
    db.prepare('DELETE FROM voice_sessions WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
    return seconds;
  }
  return 0;
},
getVoiceSession(guildId, userId) {
  return db.prepare('SELECT * FROM voice_sessions WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
},
3. Ajouter dans index.js - La commande slash
Dans le tableau commands, ajoute:

new SlashCommandBuilder()
  .setName('statistics')
  .setDescription('Voir les statistiques d\'un membre (messages et temps vocal)')
  .addUserOption(o => o.setName('membre').setDescription('Le membre à consulter')),
4. Ajouter le handler de la commande dans index.js
Dans le handler InteractionCreate, ajoute:

// ── /statistics ──
if (commandName === 'statistics') {
  const target = options.getUser('membre') || user;
  const stats = dbHelpers.getStats(guild.id, target.id);
  
  // Check for active voice session
  const activeSession = dbHelpers.getVoiceSession(guild.id, target.id);
  let totalVoiceTime = stats.voice_time;
  
  if (activeSession) {
    const joinedAt = new Date(activeSession.joined_at);
    const now = new Date();
    const additionalSeconds = Math.floor((now - joinedAt) / 1000);
    totalVoiceTime += additionalSeconds;
  }
  
  // Format voice time
  const hours = Math.floor(totalVoiceTime / 3600);
  const minutes = Math.floor((totalVoiceTime % 3600) / 60);
  const voiceTimeFormatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  
  const embed = new EmbedBuilder()
    .setTitle(`📊 Statistiques de ${target.username}`)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '💬 Messages envoyés', value: `**${stats.message_count.toLocaleString()}**`, inline: true },
      { name: '🎙️ Temps en vocal', value: `**${voiceTimeFormatted}**`, inline: true },
    )
    .setColor(Colors.PRIMARY)
    .setFooter({ text: `Statistiques sur ${guild.name}` })
    .setTimestamp();
  
  if (activeSession) {
    embed.addFields({ name: '🟢 Statut', value: 'Actuellement en vocal', inline: false });
  }
  
  return interaction.reply({ embeds: [embed] });
}
// ═══════════════════════════════════════════════════════════════
//  REACTION ROLE EVENTS
// ═══════════════════════════════════════════════════════════════
function normalizeEmoji(str) {
  // Remove variation selectors, angle brackets, and normalize
  return str.replace(/\uFE0F/g, '').replace(/^<a?:/, '').replace(/>$/, '').trim();
}
function findReactionRole(messageId, reactionEmoji) {
  // Build the identifier the same way we store it
  const emojiId = reactionEmoji.id
    ? `${reactionEmoji.name}:${reactionEmoji.id}`
    : reactionEmoji.name;
  // Try exact match first
  let rr = dbHelpers.getReactionRole(messageId, emojiId);
  if (rr) return rr;
  // Fallback: get ALL reaction roles for this message and compare normalized
  const allRR = dbHelpers.getReactionRolesByMessage(messageId);
  if (!allRR || allRR.length === 0) return null;
  const normalizedInput = normalizeEmoji(emojiId);
  for (const entry of allRR) {
    const normalizedStored = normalizeEmoji(entry.emoji);
    if (normalizedStored === normalizedInput) return entry;
  }
  // Also try matching by ID only (for custom emojis)
  if (reactionEmoji.id) {
    for (const entry of allRR) {
      if (entry.emoji.includes(reactionEmoji.id)) return entry;
    }
  }
  return null;
}
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (err) {
    console.error('❌ Erreur fetch reaction/message:', err);
    return;
  }
  console.log(`[ReactionRole] Reaction ajoutee: emoji="${reaction.emoji.name}" id=${reaction.emoji.id || 'none'} messageId=${reaction.message.id}`);
  const rr = findReactionRole(reaction.message.id, reaction.emoji);
  if (!rr) {
    console.log(`[ReactionRole] Aucun reaction role trouve pour ce message/emoji`);
    return;
  }
  console.log(`[ReactionRole] Match trouve! role_id=${rr.role_id}`);
  try {
    const guild = reaction.message.guild;
    if (!guild) return;
    const member = await guild.members.fetch(user.id);
    const role = await guild.roles.fetch(rr.role_id);
    if (role && member) {
      await member.roles.add(role);
      console.log(`[ReactionRole] ✅ Role "${role.name}" ajoute a ${user.tag}`);
    } else {
      console.log(`[ReactionRole] ⚠️ Role ou membre introuvable: role=${!!role} member=${!!member}`);
    }
  } catch (error) {
    console.error('❌ Erreur reaction role (add):', error);
  }
});
client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (err) {
    console.error('❌ Erreur fetch reaction/message:', err);
    return;
  }
  const rr = findReactionRole(reaction.message.id, reaction.emoji);
  if (!rr) return;
  try {
    const guild = reaction.message.guild;
    if (!guild) return;
    const member = await guild.members.fetch(user.id);
    const role = await guild.roles.fetch(rr.role_id);
    if (role && member) {
      await member.roles.remove(role);
      console.log(`[ReactionRole] ✅ Role "${role.name}" retire de ${user.tag}`);
    }
  } catch (error) {
    console.error('❌ Erreur reaction role (remove):', error);
  }
});
// ═══════════════════════════════════════════════════════════════
//  CAPTCHA SYSTEM - Member Join
// ═══════════════════════════════════════════════════════════════
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return;
  const config = dbHelpers.getGuild(member.guild.id);
  // Anti-raid check
  if (config.antiraid_enabled) {
    if (checkRaid(member.guild.id)) {
      try {
        await member.kick('Anti-raid: Trop de joins en peu de temps');
        await sendLog(member.guild, new EmbedBuilder()
          .setTitle('🛡️ Anti-Raid')
          .setDescription(`${member.user.tag} a ete kick automatiquement (raid detecte)`)
          .setColor(Colors.ERROR)
          .setTimestamp());
        return;
      } catch (_) { /* ignore */ }
    }
  }
  // Captcha system
  if (config.captcha_enabled && config.captcha_channel) {
    try {
      const captchaChannel = await member.guild.channels.fetch(config.captcha_channel);
      if (!captchaChannel) return;
      const code = generateCaptchaCode();
      const imageBuffer = generateCaptchaImage(code);
      dbHelpers.setCaptcha(member.guild.id, member.id, code);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'captcha.png' });
      const embed = new EmbedBuilder()
        .setTitle('🔐 Verification requise')
        .setDescription(
          `Bienvenue ${member}!\n\n` +
          `Pour acceder au serveur, entre le code affiche dans l'image ci-dessous.\n` +
          `Utilise le bouton pour entrer ta reponse.\n\n` +
          `⚠️ Tu as **${config.captcha_retry_limit}** essais.\n` +
          `⏰ Tu seras kick automatiquement apres **10 minutes**.`
        )
        .setImage('attachment://captcha.png')
        .setColor(Colors.INFO)
        .setTimestamp();
      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`captcha_verify_${member.id}`)
          .setLabel('Entrer le code')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔐'),
      );
      await captchaChannel.send({
        content: `${member}`,
        embeds: [embed],
        files: [attachment],
        components: [button],
      });
      // Auto-kick after 10 minutes
      setTimeout(async () => {
        const pending = dbHelpers.getCaptcha(member.guild.id, member.id);
        if (pending) {
          dbHelpers.removeCaptcha(member.guild.id, member.id);
          try {
            await member.kick('Captcha non complete dans le delai imparti');
            await captchaChannel.send({
              embeds: [new EmbedBuilder()
                .setDescription(`⏰ ${member.user.tag} a ete kick (captcha expire).`)
                .setColor(Colors.ERROR)],
            });
          } catch (_) { /* already left */ }
        }
      }, 10 * 60 * 1000);
    } catch (error) {
      console.error('❌ Erreur captcha:', error);
    }
  }
  // Log member join
  await sendLog(member.guild, new EmbedBuilder()
    .setTitle('📥 Nouveau membre')
    .setDescription(`${member.user.tag} a rejoint le serveur`)
    .addFields(
      { name: 'ID', value: member.id, inline: true },
      { name: 'Compte cree', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setColor(Colors.SUCCESS)
    .setTimestamp());
});
// ═══════════════════════════════════════════════════════════════
//  CAPTCHA BUTTON INTERACTION
// ═══════════════════════════════════════════════════════════════
client.on(Events.InteractionCreate, async (interaction) => {
  // Captcha button
  if (interaction.isButton() && interaction.customId.startsWith('captcha_verify_')) {
    const targetUserId = interaction.customId.split('_')[2];
    if (interaction.user.id !== targetUserId) {
      return interaction.reply({ content: '❌ Ce captcha n\'est pas pour toi!', ephemeral: true });
    }
    const modal = new ModalBuilder()
      .setCustomId(`captcha_modal_${interaction.user.id}`)
      .setTitle('🔐 Verification Captcha');
    const codeInput = new TextInputBuilder()
      .setCustomId('captcha_code')
      .setLabel('Entre le code affiche dans l\'image')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: A7kP2')
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(5);
    modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
    return interaction.showModal(modal);
  }
  // Captcha modal submit
  if (interaction.isModalSubmit() && interaction.customId.startsWith('captcha_modal_')) {
    const inputCode = interaction.fields.getTextInputValue('captcha_code');
    const pending = dbHelpers.getCaptcha(interaction.guild.id, interaction.user.id);
    if (!pending) {
      return interaction.reply({ content: '❌ Aucun captcha en attente pour toi.', ephemeral: true });
    }
    const config = dbHelpers.getGuild(interaction.guild.id);
    if (inputCode === pending.code) {
      // Success
      dbHelpers.removeCaptcha(interaction.guild.id, interaction.user.id);
      try {
        const role = interaction.guild.roles.cache.get(config.captcha_role);
        if (role) {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          await member.roles.add(role);
        }
      } catch (_) { /* role error */ }
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Verification reussie!')
          .setDescription(`Bienvenue sur **${interaction.guild.name}**!`)
          .setColor(Colors.SUCCESS)],
        ephemeral: true,
      });
    } else {
      // Failed
      dbHelpers.incrementCaptchaAttempt(interaction.guild.id, interaction.user.id);
      const updated = dbHelpers.getCaptcha(interaction.guild.id, interaction.user.id);
      if (updated.attempts >= config.captcha_retry_limit) {
        dbHelpers.removeCaptcha(interaction.guild.id, interaction.user.id);
        try {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          await member.kick('Echec captcha - Trop de tentatives');
        } catch (_) { /* already gone */ }
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription('❌ Trop de tentatives echouees. Tu as ete kick.')
            .setColor(Colors.ERROR)],
          ephemeral: true,
        });
      }
      // Generate new captcha
      const newCode = generateCaptchaCode();
      const newImage = generateCaptchaImage(newCode);
      dbHelpers.setCaptcha(interaction.guild.id, interaction.user.id, newCode);
      const attachment = new AttachmentBuilder(newImage, { name: 'captcha.png' });
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('❌ Code incorrect!')
          .setDescription(`Essais restants: **${config.captcha_retry_limit - updated.attempts}**\nVoici un nouveau code:`)
          .setImage('attachment://captcha.png')
          .setColor(Colors.ERROR)],
        files: [attachment],
        ephemeral: true,
      });
    }
  }
});
// ═══════════════════════════════════════════════════════════════
//  AUTO-MODERATION & XP SYSTEM (Message Create)
// ═══════════════════════════════════════════════════════════════
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const config = dbHelpers.getGuild(message.guild.id);
  // ── Auto-moderation ──
  if (config.automod_enabled && dbHelpers.isModuleEnabled(message.guild.id, 'automod')) {
    // Spam detection
    if (checkSpam(message.author.id, message.guild.id)) {
      try {
        await message.delete();
        const member = await message.guild.members.fetch(message.author.id);
        if (member.moderatable) {
          await member.timeout(5 * 60 * 1000, 'Anti-spam: Trop de messages');
          await message.channel.send({
            embeds: [new EmbedBuilder()
              .setDescription(`🔇 ${message.author} a ete mute 5 minutes (spam detecte).`)
              .setColor(Colors.MODERATION)],
          }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
          dbHelpers.addModLog(message.guild.id, 'AUTO-MUTE', message.author.id, message.client.user.id, 'Spam detecte');
          await sendLog(message.guild, new EmbedBuilder()
            .setTitle('🛡️ Auto-moderation')
            .setDescription(`**Spam detecte** - ${message.author.tag} mute 5 minutes`)
            .setColor(Colors.MODERATION)
            .setTimestamp());
        }
      } catch (_) { /* permissions */ }
      return;
    }
    // Bad words detection
    if (containsBadWord(message.content)) {
      try {
        await message.delete();
        await message.channel.send({
          embeds: [new EmbedBuilder()
            .setDescription(`⚠️ ${message.author}, ton message a ete supprime (langage inapproprie).`)
            .setColor(Colors.WARNING)],
        }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
        dbHelpers.addModLog(message.guild.id, 'AUTO-DELETE', message.author.id, message.client.user.id, 'Langage inapproprie');
      } catch (_) { /* permissions */ }
      return;
    }
    // Link detection (basic - blocks Discord invite links from non-admins)
    const inviteRegex = /(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\//i;
    if (inviteRegex.test(message.content)) {
      const member = await message.guild.members.fetch(message.author.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        try {
          await message.delete();
          await message.channel.send({
            embeds: [new EmbedBuilder()
              .setDescription(`⚠️ ${message.author}, les liens d'invitation ne sont pas autorises.`)
              .setColor(Colors.WARNING)],
          }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
        } catch (_) { /* permissions */ }
        return;
      }
    }
  }
  // ── XP System ──
  if (dbHelpers.isModuleEnabled(message.guild.id, 'leveling')) {
    const data = dbHelpers.getLevel(message.guild.id, message.author.id);
    const now = Date.now();
    const lastMsg = data.last_message ? new Date(data.last_message).getTime() : 0;
    // Cooldown: 60 seconds between XP gains
    if (now - lastMsg >= 60000) {
      const xpGain = 15 + Math.floor(Math.random() * 10); // 15-24 XP
      const result = dbHelpers.addXP(message.guild.id, message.author.id, xpGain);
      if (result.leveledUp) {
        const embed = new EmbedBuilder()
          .setTitle('🎉 Level Up!')
          .setDescription(`Felicitations ${message.author}! Tu es maintenant **niveau ${result.newLevel}**!`)
          .setColor(Colors.SUCCESS)
          .setThumbnail(message.author.displayAvatarURL({ size: 128 }))
          .setTimestamp();
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
});
// ═══════════════════════════════════════════════════════════════
//  MEMBER LEAVE LOG
// ═══════════════════════════════════════════════════════════════
client.on(Events.GuildMemberRemove, async (member) => {
  if (member.user.bot) return;
  await sendLog(member.guild, new EmbedBuilder()
    .setTitle('📤 Membre parti')
    .setDescription(`${member.user.tag} a quitte le serveur`)
    .addFields(
      { name: 'ID', value: member.id, inline: true },
      { name: 'Roles', value: member.roles.cache.filter(r => r.id !== member.guild.id).map(r => `${r}`).join(', ') || 'Aucun' },
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setColor(Colors.ERROR)
    .setTimestamp());
});
// ═══════════════════════════════════════════════════════════════
//  ROLE UPDATE LOG
// ═══════════════════════════════════════════════════════════════
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  // Role changes log
  const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
  if (addedRoles.size > 0) {
    await sendLog(newMember.guild, new EmbedBuilder()
      .setTitle('🎭 Role(s) ajoute(s)')
      .setDescription(`**Utilisateur:** ${newMember.user.tag}\n**Role(s):** ${addedRoles.map(r => `${r}`).join(', ')}`)
      .setColor(Colors.SUCCESS)
      .setTimestamp());
  }
  if (removedRoles.size > 0) {
    await sendLog(newMember.guild, new EmbedBuilder()
      .setTitle('🎭 Role(s) retire(s)')
      .setDescription(`**Utilisateur:** ${newMember.user.tag}\n**Role(s):** ${removedRoles.map(r => `${r}`).join(', ')}`)
      .setColor(Colors.ERROR)
      .setTimestamp());
  }
  // ── Premium system (Nira server only) ──
  if (NIRA_GUILD_ID && newMember.guild.id === NIRA_GUILD_ID) {
    // Check for booster (Premium)
    if (PREMIUM_ROLE_ID) {
      if (newMember.premiumSince && !oldMember.premiumSince) {
        const role = newMember.guild.roles.cache.get(PREMIUM_ROLE_ID);
        if (role) await newMember.roles.add(role).catch(() => {});
      } else if (!newMember.premiumSince && oldMember.premiumSince) {
        const role = newMember.guild.roles.cache.get(PREMIUM_ROLE_ID);
        if (role) await newMember.roles.remove(role).catch(() => {});
      }
    }
  }
  // ── Supporter system - Server tag (clan) detection ──
  if (SUPPORTER_ROLE_ID && !newMember.user.bot) {
    try {
      // Fetch user profile via REST API to get clan data
      const userData = await client.rest.get(`/users/${newMember.user.id}`);
      const hasClanTag = userData.clan && userData.clan.identity_guild_id === newMember.guild.id;
      const supporterRole = await newMember.guild.roles.fetch(SUPPORTER_ROLE_ID);
      if (!supporterRole) return;
      if (hasClanTag && !newMember.roles.cache.has(SUPPORTER_ROLE_ID)) {
        await newMember.roles.add(supporterRole);
        console.log(`[Supporter] ✅ Role Supporter ajoute a ${newMember.user.tag} (tag serveur detecte)`);
      } else if (!hasClanTag && newMember.roles.cache.has(SUPPORTER_ROLE_ID)) {
        await newMember.roles.remove(supporterRole);
        console.log(`[Supporter] ❌ Role Supporter retire de ${newMember.user.tag} (tag serveur retire)`);
      }
    } catch (err) {
      // Silently ignore - API might not return clan data for all users
    }
  }
});
// ═══════════════════════════════════════════════════════════════
// VOICE STATE TRACKING (pour /statistics)
// ═══════════════════════════════════════════════════════════════
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const userId = newState.member?.id || oldState.member?.id;
  const guildId = newState.guild?.id || oldState.guild?.id;
  
  if (!userId || !guildId) return;
  if (newState.member?.user?.bot) return;
  
  // User joined a voice channel
  if (!oldState.channelId && newState.channelId) {
    dbHelpers.startVoiceSession(guildId, userId);
  }
  // User left a voice channel
  else if (oldState.channelId && !newState.channelId) {
    dbHelpers.endVoiceSession(guildId, userId);
  }
});
// ═══════════════════════════════════════════════════════════════
//  ERROR HANDLING
// ═══════════════════════════════════════════════════════════════
client.on(Events.Error, (error) => {
  console.error('❌ Erreur Discord.js:', error);
});
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
});
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});
// ═══════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════
client.login(TOKEN);
