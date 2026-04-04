// ═══════════════════════════════════════════════════════════════
//  NIRA — Système de Tickets complet
//  Fichier : tickets.js
//
//  INSTALLATION :
//  1. Ajoute en haut de index.js :
//     const tickets = require('./tickets');
//  2. Ajoute les commandes dans le tableau commands (voir bas du fichier)
//  3. Ajoute les handlers dans InteractionCreate (voir bas du fichier)
// ═══════════════════════════════════════════════════════════════

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const { dbHelpers, Colors } = require('./utils');

// ═══════════════════════════════════════════════════════════════
//  CONSTANTES
// ═══════════════════════════════════════════════════════════════

// Catégories de tickets — chaque admin peut les activer via /ticket-config
const DEFAULT_CATEGORIES = [
  { id: 'support',      label: '🛠️ Support technique',  emoji: '🛠️', description: 'Problème avec le bot ou le serveur' },
  { id: 'report',       label: '🚨 Signalement',          emoji: '🚨', description: 'Signaler un membre ou un comportement' },
  { id: 'partnership',  label: '🤝 Partenariat',          emoji: '🤝', description: 'Proposition de partenariat' },
  { id: 'suggestion',   label: '💡 Suggestion',           emoji: '💡', description: 'Proposer une idée' },
  { id: 'other',        label: '📩 Autre',                emoji: '📩', description: 'Toute autre demande' },
];

// ═══════════════════════════════════════════════════════════════
//  HELPERS INTERNES
// ═══════════════════════════════════════════════════════════════

function getConfig(guildId) {
  return dbHelpers.getGuild(guildId);
}

function isStaff(member, config) {
  if (!config.ticket_staff_role) return member.permissions.has(PermissionFlagsBits.ManageChannels);
  return member.roles.cache.has(config.ticket_staff_role) || member.permissions.has(PermissionFlagsBits.Administrator);
}

async function sendLog(guild, embed) {
  const config = getConfig(guild.id);
  if (!config.log_channel) return;
  try {
    const ch = await guild.channels.fetch(config.log_channel);
    if (ch) await ch.send({ embeds: [embed] });
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════
//  CRÉATION D'UN TICKET
// ═══════════════════════════════════════════════════════════════

async function createTicket(guild, member, reason, category = 'other') {
  const config = getConfig(guild.id);
  if (!config.ticket_staff_role) {
    throw new Error('Tickets non configurés. Un admin doit utiliser `/ticket-setup`.');
  }

  // Vérifie ticket existant
  const existing = dbHelpers.getOpenTickets(guild.id).find(t => t.user_id === member.id);
  if (existing) {
    throw new Error(`Tu as déjà un ticket ouvert : <#${existing.channel_id}>`);
  }

  const count  = dbHelpers.getTicketCount(guild.id) + 1;
  const padded = String(count).padStart(4, '0');
  const cat    = DEFAULT_CATEGORIES.find(c => c.id === category) || DEFAULT_CATEGORIES[0];

  // Permissions du salon
  const perms = [
    { id: guild.id,                 deny:  [PermissionFlagsBits.ViewChannel] },
    { id: member.id,                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
    { id: config.ticket_staff_role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles] },
    { id: guild.members.me.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
  ];

  const channelOptions = {
    name:                 `${cat.emoji}・ticket-${padded}`,
    type:                 ChannelType.GuildText,
    topic:                `Ticket #${padded} | ${cat.label} | ${member.user.tag} | ${reason || 'Aucune raison'}`,
    permissionOverwrites: perms,
  };
  if (config.ticket_category) channelOptions.parent = config.ticket_category;

  const ticketChannel = await guild.channels.create(channelOptions);
  dbHelpers.createTicket(guild.id, ticketChannel.id, member.id, count, reason || null);

  // ── Message d'ouverture ──
  const embed = new EmbedBuilder()
    .setTitle(`${cat.emoji} Ticket #${padded} — ${cat.label}`)
    .setDescription(
      `Bienvenue ${member} !\n\n` +
      `> Un membre du staff va te répondre rapidement.\n` +
      `> Décris ton problème en détail avec un maximum d'informations.\n` +
      (reason ? `\n**Raison :** ${reason}` : '')
    )
    .addFields(
      { name: '👤 Auteur',    value: `${member} (\`${member.user.tag}\`)`, inline: true },
      { name: '📂 Catégorie', value: cat.label,                            inline: true },
      { name: '🔢 Numéro',    value: `#${padded}`,                         inline: true },
    )
    .setColor(0x5865F2)
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
    .setFooter({ text: `Ticket ouvert le` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Prendre en charge').setStyle(ButtonStyle.Secondary).setEmoji('✋'),
    new ButtonBuilder().setCustomId('ticket_add_member').setLabel('Ajouter un membre').setStyle(ButtonStyle.Success).setEmoji('➕'),
  );

  await ticketChannel.send({
    content: `${member} <@&${config.ticket_staff_role}>`,
    embeds:  [embed],
    components: [row],
  });

  // Log
  await sendLog(guild, new EmbedBuilder()
    .setTitle('🎫 Ticket ouvert')
    .addFields(
      { name: 'Auteur',     value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
      { name: 'Catégorie',  value: cat.label,                               inline: true },
      { name: 'Salon',      value: `${ticketChannel}`,                      inline: true },
    )
    .setColor(0x57F287)
    .setTimestamp());

  return { channel: ticketChannel, number: padded };
}

// ═══════════════════════════════════════════════════════════════
//  FERMETURE D'UN TICKET
// ═══════════════════════════════════════════════════════════════

async function closeTicket(interaction) {
  const ticket = dbHelpers.getTicketByChannel(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });

  const config  = getConfig(interaction.guild.id);
  const staff   = isStaff(interaction.member, config);
  const isOwner = ticket.user_id === interaction.user.id;

  if (!staff && !isOwner) {
    return interaction.reply({ content: '❌ Seul le staff ou l\'auteur du ticket peut le fermer.', ephemeral: true });
  }

  // Message de confirmation avant suppression
  const confirmEmbed = new EmbedBuilder()
    .setDescription(`🔒 Ticket fermé par ${interaction.user}.\nSuppression dans **5 secondes**...`)
    .setColor(0xED4245)
    .setTimestamp();

  await interaction.reply({ embeds: [confirmEmbed] });
  dbHelpers.closeTicket(interaction.channel.id);

  await sendLog(interaction.guild, new EmbedBuilder()
    .setTitle('🔒 Ticket fermé')
    .addFields(
      { name: 'Salon',     value: interaction.channel.name,                         inline: true },
      { name: 'Fermé par', value: `${interaction.user.tag}`,                        inline: true },
      { name: 'Auteur',    value: `<@${ticket.user_id}>`,                           inline: true },
    )
    .setColor(0xFEE75C)
    .setTimestamp());

  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

// ═══════════════════════════════════════════════════════════════
//  GESTION DES BOUTONS TICKET
// ═══════════════════════════════════════════════════════════════

async function handleButton(interaction) {
  const { customId, guild, member, user, channel } = interaction;

  // ── Fermer ──
  if (customId === 'ticket_close') {
    return closeTicket(interaction);
  }

  // ── Claim ──
  if (customId === 'ticket_claim') {
    const config = getConfig(guild.id);
    if (!isStaff(member, config)) {
      return interaction.reply({ content: '❌ Seul le staff peut prendre en charge un ticket.', ephemeral: true });
    }
    const ticket = dbHelpers.getTicketByChannel(channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
    if (ticket.claimed_by) {
      return interaction.reply({ content: `❌ Ticket déjà pris en charge par <@${ticket.claimed_by}>.`, ephemeral: true });
    }
    dbHelpers.claimTicket(channel.id, user.id);
    await channel.setName(channel.name.replace('🎫', '✅').replace('🛠️', '✅').replace('🚨', '✅').replace('🤝', '✅').replace('💡', '✅').replace('📩', '✅')).catch(() => {});
    return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${user} a pris en charge ce ticket.`).setColor(0x57F287)] });
  }

  // ── Ajouter un membre ──
  if (customId === 'ticket_add_member') {
    const config = getConfig(guild.id);
    if (!isStaff(member, config)) {
      return interaction.reply({ content: '❌ Seul le staff peut ajouter des membres.', ephemeral: true });
    }
    const modal = new ModalBuilder()
      .setCustomId('ticket_add_member_modal')
      .setTitle('Ajouter un membre au ticket');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('member_id')
        .setLabel('ID du membre à ajouter')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 123456789012345678')
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(19),
    ));
    return interaction.showModal(modal);
  }

  // ── Panneau — ouvrir un ticket ──
  if (customId === 'ticket_panel_open') {
    const config = getConfig(guild.id);
    if (!config.ticket_staff_role) {
      return interaction.reply({ content: '❌ Tickets non configurés.', ephemeral: true });
    }

    // Si catégories activées → select menu
    if (config.ticket_use_categories) {
      const select = new StringSelectMenuBuilder()
        .setCustomId('ticket_select_category')
        .setPlaceholder('Choisir une catégorie...')
        .addOptions(DEFAULT_CATEGORIES.map(cat => ({
          label:       cat.label,
          description: cat.description,
          value:       cat.id,
          emoji:       cat.emoji,
        })));
      return interaction.reply({
        content: '**Quelle est la raison de ton ticket ?**',
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    }

    // Sinon → modal direct
    return showTicketModal(interaction, 'other');
  }

  // ── Select catégorie ──
  if (interaction.isStringSelectMenu && customId === 'ticket_select_category') {
    const category = interaction.values?.[0] || 'other';
    return showTicketModal(interaction, category);
  }
}

async function showTicketModal(interaction, category) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_create_modal:${category}`)
    .setTitle('📩 Ouvrir un ticket');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('ticket_reason')
      .setLabel('Décris ta demande')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Explique ton problème ou ta demande en détail...')
      .setRequired(false)
      .setMaxLength(500),
  ));
  return interaction.showModal(modal);
}

// ═══════════════════════════════════════════════════════════════
//  GESTION DES MODALS
// ═══════════════════════════════════════════════════════════════

async function handleModal(interaction) {
  const { customId, guild, member } = interaction;

  // ── Créer un ticket ──
  if (customId.startsWith('ticket_create_modal')) {
    const category = customId.split(':')[1] || 'other';
    const reason   = interaction.fields.getTextInputValue('ticket_reason') || null;
    await interaction.deferReply({ ephemeral: true });
    try {
      const { channel, number } = await createTicket(guild, member, reason, category);
      return interaction.editReply({ content: `✅ Ton ticket a été créé : ${channel} (**#${number}**)` });
    } catch (err) {
      return interaction.editReply({ content: `❌ ${err.message}` });
    }
  }

  // ── Ajouter un membre ──
  if (customId === 'ticket_add_member_modal') {
    const memberId = interaction.fields.getTextInputValue('member_id').trim();
    const ticket   = dbHelpers.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
    try {
      const targetMember = await guild.members.fetch(memberId);
      await interaction.channel.permissionOverwrites.edit(targetMember.id, {
        ViewChannel:        true,
        SendMessages:       true,
        ReadMessageHistory: true,
        AttachFiles:        true,
      });
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${targetMember} a été ajouté au ticket.`).setColor(0x57F287)] });
    } catch (_) {
      return interaction.reply({ content: '❌ Membre introuvable. Vérifie l\'ID.', ephemeral: true });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  GESTION DES SELECT MENUS
// ═══════════════════════════════════════════════════════════════

async function handleSelectMenu(interaction) {
  if (interaction.customId === 'ticket_select_category') {
    const category = interaction.values[0];
    return showTicketModal(interaction, category);
  }
}

// ═══════════════════════════════════════════════════════════════
//  COMMANDES SLASH — handlers
//  Ces fonctions sont appelées depuis index.js
// ═══════════════════════════════════════════════════════════════

// /ticket-setup
async function cmdSetup(interaction) {
  const { guild, options } = interaction;
  const panelChannel   = options.getChannel('salon');
  const staffRole      = options.getRole('staff');
  const ticketCategory = options.getChannel('categorie');
  const useCategories  = options.getBoolean('categories') ?? true;
  const panelTitle     = options.getString('titre')   || '🎫 Support';
  const panelDesc      = options.getString('message') || 'Ouvre un ticket pour contacter le staff.\n\n> Décris ton problème en détail.\n> Un membre du staff te répondra rapidement.';
  const panelColor     = options.getString('couleur') || '#5865F2';

  dbHelpers.getGuild(guild.id);
  dbHelpers.updateGuild(guild.id, {
    ticket_channel:        panelChannel.id,
    ticket_staff_role:     staffRole.id,
    ticket_category:       ticketCategory?.id || null,
    ticket_use_categories: useCategories ? 1 : 0,
  });

  // Panneau d'ouverture
  const hexColor = parseInt(panelColor.replace('#', ''), 16);
  const panelEmbed = new EmbedBuilder()
    .setTitle(panelTitle)
    .setDescription(panelDesc)
    .setColor(isNaN(hexColor) ? 0x5865F2 : hexColor)
    .setFooter({ text: `${guild.name} · Support` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_panel_open').setLabel('Ouvrir un ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
  );

  await panelChannel.send({ embeds: [panelEmbed], components: [row] });

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setTitle('✅ Système de tickets configuré')
      .addFields(
        { name: '📍 Panneau',    value: `${panelChannel}`,                              inline: true },
        { name: '👮 Staff',      value: `${staffRole}`,                                 inline: true },
        { name: '📂 Catégorie',  value: ticketCategory ? `${ticketCategory}` : 'Racine', inline: true },
        { name: '🗂️ Sélection',  value: useCategories ? 'Activée' : 'Désactivée',       inline: true },
      )
      .setColor(0x57F287)
      .setTimestamp()],
    ephemeral: true,
  });
}

// /ticket (ouvrir manuellement)
async function cmdOpen(interaction) {
  const { guild, member, options } = interaction;
  const config = dbHelpers.getGuild(guild.id);
  if (!config.ticket_staff_role) {
    return interaction.reply({ content: '❌ Tickets non configurés. Un admin doit utiliser `/ticket-setup`.', ephemeral: true });
  }
  const reason   = options.getString('raison') || null;
  const catId    = options.getString('categorie') || 'other';
  const modal    = new ModalBuilder().setCustomId(`ticket_create_modal:${catId}`).setTitle('📩 Ouvrir un ticket');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('ticket_reason').setLabel('Décris ta demande').setStyle(TextInputStyle.Paragraph).setPlaceholder('Explique ton problème...').setRequired(false).setMaxLength(500).setValue(reason || ''),
  ));
  return interaction.showModal(modal);
}

// /ticket-close
async function cmdClose(interaction) {
  return closeTicket(interaction);
}

// /ticket-claim
async function cmdClaim(interaction) {
  const { guild, member, user, channel } = interaction;
  const config = dbHelpers.getGuild(guild.id);
  if (!isStaff(member, config)) return interaction.reply({ content: '❌ Réservé au staff.', ephemeral: true });
  const ticket = dbHelpers.getTicketByChannel(channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
  if (ticket.claimed_by) return interaction.reply({ content: `❌ Ticket déjà pris en charge par <@${ticket.claimed_by}>.`, ephemeral: true });
  dbHelpers.claimTicket(channel.id, user.id);
  await channel.setName(channel.name.replace(/^[^\u2022]+·/, '✅·')).catch(() => {});
  return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${user} a pris en charge ce ticket.`).setColor(0x57F287)] });
}

// /ticket-add
async function cmdAdd(interaction) {
  const { guild, member, options, channel } = interaction;
  const config = dbHelpers.getGuild(guild.id);
  if (!isStaff(member, config)) return interaction.reply({ content: '❌ Réservé au staff.', ephemeral: true });
  const ticket = dbHelpers.getTicketByChannel(channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
  const targetMember = options.getMember('membre');
  if (!targetMember) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
  await channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
  return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${targetMember} a été ajouté.`).setColor(0x57F287)] });
}

// /ticket-remove
async function cmdRemove(interaction) {
  const { guild, member, options, channel } = interaction;
  const config = dbHelpers.getGuild(guild.id);
  if (!isStaff(member, config)) return interaction.reply({ content: '❌ Réservé au staff.', ephemeral: true });
  const ticket = dbHelpers.getTicketByChannel(channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });
  const targetMember = options.getMember('membre');
  if (!targetMember) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
  if (targetMember.id === ticket.user_id) return interaction.reply({ content: '❌ Impossible de retirer l\'auteur du ticket.', ephemeral: true });
  await channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: false });
  return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ ${targetMember} a été retiré.`).setColor(0x57F287)] });
}

// /ticket-list
async function cmdList(interaction) {
  const { guild, member } = interaction;
  const config  = dbHelpers.getGuild(guild.id);
  if (!isStaff(member, config)) return interaction.reply({ content: '❌ Réservé au staff.', ephemeral: true });
  const open    = dbHelpers.getOpenTickets(guild.id);
  const total   = dbHelpers.getTicketCount(guild.id);

  if (!open.length) {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎫 Tickets ouverts').setDescription('*Aucun ticket ouvert en ce moment.*').setColor(0x57F287).setTimestamp()], ephemeral: true });
  }

  const list = open.slice(0, 25).map((t, i) => {
    const claimed = t.claimed_by ? `✅ <@${t.claimed_by}>` : '⏳ En attente';
    const date    = `<t:${Math.floor(new Date(t.created_at).getTime() / 1000)}:R>`;
    return `**${i + 1}.** <#${t.channel_id}> — <@${t.user_id}> — ${claimed} — ${date}`;
  }).join('\n');

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setTitle(`🎫 Tickets ouverts — ${open.length}/${total} total`)
      .setDescription(list)
      .setColor(0x5865F2)
      .setTimestamp()],
    ephemeral: true,
  });
}

// /ticket-info
async function cmdInfo(interaction) {
  const { guild, channel } = interaction;
  const ticket = dbHelpers.getTicketByChannel(channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });

  const createdAt = Math.floor(new Date(ticket.created_at).getTime() / 1000);

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setTitle(`🎫 Ticket #${String(ticket.ticket_number).padStart(4, '0')}`)
      .addFields(
        { name: '👤 Auteur',         value: `<@${ticket.user_id}>`,                         inline: true },
        { name: '🔖 Statut',         value: ticket.status === 'open' ? '🟢 Ouvert' : '🔴 Fermé', inline: true },
        { name: '✋ Pris en charge', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Personne', inline: true },
        { name: '📅 Ouvert le',      value: `<t:${createdAt}:F>`,                            inline: true },
        { name: '📝 Raison',         value: ticket.reason || 'Aucune raison précisée',        inline: false },
      )
      .setColor(0x5865F2)
      .setTimestamp()],
    ephemeral: true,
  });
}

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Handlers d'events
  handleButton,
  handleModal,
  handleSelectMenu,
  // Handlers de commandes
  cmdSetup,
  cmdOpen,
  cmdClose,
  cmdClaim,
  cmdAdd,
  cmdRemove,
  cmdList,
  cmdInfo,
};

// ═══════════════════════════════════════════════════════════════
//
//  ══ BLOCS À COLLER DANS index.js ══
//
//  ── 1. Import (tout en haut, après require('./utils')) ──
//
//  const tickets = require('./tickets');
//
// ─────────────────────────────────────────────────────────────
//
//  ── 2. Commandes slash (dans le tableau commands, AVANT .map()) ──
//
//  new SlashCommandBuilder()
//    .setName('ticket-setup')
//    .setDescription('Configurer le système de tickets')
//    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
//    .addChannelOption(o => o.setName('salon').setDescription('Salon où envoyer le panneau').setRequired(true))
//    .addRoleOption(o => o.setName('staff').setDescription('Rôle staff').setRequired(true))
//    .addChannelOption(o => o.setName('categorie').setDescription('Catégorie Discord pour les tickets'))
//    .addBooleanOption(o => o.setName('categories').setDescription('Menu de sélection de catégorie ? (défaut: oui)'))
//    .addStringOption(o => o.setName('titre').setDescription('Titre du panneau'))
//    .addStringOption(o => o.setName('message').setDescription('Description du panneau'))
//    .addStringOption(o => o.setName('couleur').setDescription('Couleur hex du panneau (ex: #5865F2)')),
//
//  new SlashCommandBuilder()
//    .setName('ticket')
//    .setDescription('Ouvrir un ticket de support')
//    .addStringOption(o => o.setName('raison').setDescription('Raison du ticket'))
//    .addStringOption(o => o.setName('categorie').setDescription('Catégorie')
//      .addChoices(
//        { name: '🛠️ Support technique', value: 'support' },
//        { name: '🚨 Signalement',        value: 'report'  },
//        { name: '🤝 Partenariat',        value: 'partnership' },
//        { name: '💡 Suggestion',         value: 'suggestion' },
//        { name: '📩 Autre',              value: 'other'   },
//      )),
//
//  new SlashCommandBuilder()
//    .setName('ticket-close')
//    .setDescription('Fermer le ticket actuel'),
//
//  new SlashCommandBuilder()
//    .setName('ticket-claim')
//    .setDescription('Prendre en charge ce ticket')
//    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
//
//  new SlashCommandBuilder()
//    .setName('ticket-add')
//    .setDescription('Ajouter un membre au ticket')
//    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
//    .addUserOption(o => o.setName('membre').setDescription('Le membre à ajouter').setRequired(true)),
//
//  new SlashCommandBuilder()
//    .setName('ticket-remove')
//    .setDescription('Retirer un membre du ticket')
//    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
//    .addUserOption(o => o.setName('membre').setDescription('Le membre à retirer').setRequired(true)),
//
//  new SlashCommandBuilder()
//    .setName('ticket-list')
//    .setDescription('Voir tous les tickets ouverts')
//    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
//
//  new SlashCommandBuilder()
//    .setName('ticket-info')
//    .setDescription('Voir les informations du ticket actuel'),
//
// ─────────────────────────────────────────────────────────────
//
//  ── 3. Dans InteractionCreate, avant le `if (!interaction.isChatInputCommand()) return;` ──
//
//  // Tickets — boutons
//  if (interaction.isButton() && (
//    interaction.customId.startsWith('ticket_') ||
//    interaction.customId === 'ticket_panel_open'
//  )) {
//    return tickets.handleButton(interaction);
//  }
//
//  // Tickets — select menu
//  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_category') {
//    return tickets.handleSelectMenu(interaction);
//  }
//
//  // Tickets — modals
//  if (interaction.isModalSubmit() && (
//    interaction.customId.startsWith('ticket_create_modal') ||
//    interaction.customId === 'ticket_add_member_modal'
//  )) {
//    return tickets.handleModal(interaction);
//  }
//
// ─────────────────────────────────────────────────────────────
//
//  ── 4. Dans le bloc try{} des commandes slash ──
//
//  if (commandName === 'ticket-setup')  return tickets.cmdSetup(interaction);
//  if (commandName === 'ticket')        return tickets.cmdOpen(interaction);
//  if (commandName === 'ticket-close')  return tickets.cmdClose(interaction);
//  if (commandName === 'ticket-claim')  return tickets.cmdClaim(interaction);
//  if (commandName === 'ticket-add')    return tickets.cmdAdd(interaction);
//  if (commandName === 'ticket-remove') return tickets.cmdRemove(interaction);
//  if (commandName === 'ticket-list')   return tickets.cmdList(interaction);
//  if (commandName === 'ticket-info')   return tickets.cmdInfo(interaction);
//
// ═══════════════════════════════════════════════════════════════
