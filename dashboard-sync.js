const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} = require('discord.js');
const analyticsDb = require('./dashboard-db');

const TOKEN = process.env.BOT_TOKEN || '';
const DASHBOARD_LIVE_FILE = process.env.DASHBOARD_LIVE_FILE
  || path.resolve(__dirname, 'Dashboard NIRA', 'data', 'live-metrics.json');
const DASHBOARD_API_HOST = process.env.DASHBOARD_API_HOST || '0.0.0.0';
const DASHBOARD_API_PORT = Number.parseInt(process.env.DASHBOARD_API_PORT || '3001', 10);
const DASHBOARD_REFRESH_MS = Number.parseInt(process.env.DASHBOARD_REFRESH_MS || '10000', 10);
const DASHBOARD_SHARED_SECRET = process.env.DASHBOARD_SHARED_SECRET || '';
const RECENT_ACTIVITY_LIMIT = 12;

const runtimeState = {
  apiServer: null,
  client: null,
  startedAt: Date.now(),
  syncInterval: null,
  syncTimeout: null,
};

const COMMAND_CATALOG = [
  {
    category: 'Configuration',
    title: 'Reglages serveur',
    description: 'Toutes les commandes qui regent le comportement general du bot et ses modules.',
    items: [
      {
        label: '/config logs',
        description: 'Choisir le salon de logs staff.',
        hint: 'General > Salon de logs',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/config prefix',
        description: 'Changer le prefixe principal du bot.',
        hint: 'General > Prefixe',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/config langue',
        description: 'Basculer la langue du bot en fr ou en.',
        hint: 'General > Langue',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/config automod',
        description: 'Activer ou couper l auto-moderation.',
        hint: 'Modules > Auto-moderation',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/config antiraid',
        description: 'Activer ou couper la protection anti-raid.',
        hint: 'Modules > Anti-raid',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/config leveling',
        description: 'Activer ou couper le systeme de niveaux.',
        hint: 'Modules > Leveling',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/module',
        description: 'Activer ou desactiver un module par categorie.',
        hint: 'Modules > Activation rapide',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/setup-captcha',
        description: 'Configurer le salon, le role et le nombre d essais captcha.',
        hint: 'Captcha & acces',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/setup-reaction',
        description: 'Publier un message reaction role et sauvegarder le mapping emoji -> role.',
        hint: 'Reaction roles',
        permissions: 'Manage Roles',
        remoteReady: true,
      },
      {
        label: '/captcha',
        description: 'Vue systeme et bascule du module captcha.',
        hint: 'Captcha & acces',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/reaction-roles',
        description: 'Vue systeme des reaction roles.',
        hint: 'Reaction roles',
        permissions: 'Manage Roles',
        remoteReady: true,
      },
      {
        label: '/automod',
        description: 'Vue systeme auto-moderation.',
        hint: 'Modules > Auto-moderation',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/antiraid',
        description: 'Vue systeme anti-raid.',
        hint: 'Modules > Anti-raid',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/leveling',
        description: 'Vue systeme leveling.',
        hint: 'Modules > Leveling',
        permissions: 'Admin',
        remoteReady: true,
      },
      {
        label: '/economie',
        description: 'Vue systeme economie.',
        hint: 'Modules > Economie',
        permissions: 'Admin',
        remoteReady: true,
      },
    ],
  },
  {
    category: 'Moderation',
    title: 'Actions staff',
    description: 'Commandes de moderation a executer depuis Discord pour garder le contexte membre/message.',
    items: [
      {
        label: '/ban',
        description: 'Bannir un utilisateur.',
        hint: 'Discord',
        permissions: 'Ban Members',
        remoteReady: false,
      },
      {
        label: '/kick',
        description: 'Expulser un utilisateur.',
        hint: 'Discord',
        permissions: 'Kick Members',
        remoteReady: false,
      },
      {
        label: '/mute',
        description: 'Mute temporaire d un utilisateur.',
        hint: 'Discord',
        permissions: 'Moderate Members',
        remoteReady: false,
      },
      {
        label: '/unmute',
        description: 'Retirer un mute en cours.',
        hint: 'Discord',
        permissions: 'Moderate Members',
        remoteReady: false,
      },
      {
        label: '/warn',
        description: 'Ajouter un avertissement staff.',
        hint: 'Discord',
        permissions: 'Moderate Members',
        remoteReady: false,
      },
      {
        label: '/warnings',
        description: 'Voir la liste des warnings d un membre.',
        hint: 'Discord',
        permissions: 'Moderate Members',
        remoteReady: false,
      },
      {
        label: '/clear',
        description: 'Supprimer plusieurs messages.',
        hint: 'Discord',
        permissions: 'Manage Messages',
        remoteReady: false,
      },
    ],
  },
  {
    category: 'Communaute',
    title: 'Utilitaires & economie',
    description: 'Les commandes communautaires restent referencees ici pour tout retrouver rapidement.',
    items: [
      { label: '/level', description: 'Voir le niveau et l XP.', hint: 'Discord', permissions: 'Tous', remoteReady: false },
      { label: '/rank', description: 'Afficher le classement du serveur.', hint: 'Discord', permissions: 'Tous', remoteReady: false },
      { label: '/daily', description: 'Recuperer la prime quotidienne.', hint: 'Discord', permissions: 'Tous', remoteReady: false },
      { label: '/balance', description: 'Voir le solde economie.', hint: 'Discord', permissions: 'Tous', remoteReady: false },
      { label: '/giveaway', description: 'Lancer un giveaway.', hint: 'Discord', permissions: 'Manage Guild', remoteReady: false },
      { label: '/poll', description: 'Creer un sondage.', hint: 'Discord', permissions: 'Tous', remoteReady: false },
      { label: '/userinfo', description: 'Voir le profil d un utilisateur.', hint: 'Discord', permissions: 'Tous', remoteReady: false },
      { label: '/serverinfo', description: 'Voir le resume du serveur.', hint: 'Discord', permissions: 'Tous', remoteReady: false },
      { label: '/help', description: 'Afficher l aide du bot.', hint: 'Discord', permissions: 'Tous', remoteReady: false },
    ],
  },
];

function clampPercent(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(100, Math.round(value)));
}

function ensureLiveFileDirectory() {
  fs.mkdirSync(path.dirname(DASHBOARD_LIVE_FILE), { recursive: true });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function ensureAuthorizedRequest(request, response) {
  if (!DASHBOARD_SHARED_SECRET || request.headers['x-dashboard-token'] === DASHBOARD_SHARED_SECRET) {
    return true;
  }

  sendJson(response, 401, { error: 'Unauthorized' });
  return false;
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

function cleanString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function sanitizeHexColor(value, fallback = '#ff8a24') {
  const text = cleanString(value, fallback);
  return /^#[0-9a-f]{6}$/iu.test(text) ? text : fallback;
}

function countCommandItems() {
  return COMMAND_CATALOG.reduce((total, group) => total + group.items.length, 0);
}

function countRemoteReadyCommands() {
  return COMMAND_CATALOG.reduce(
    (total, group) => total + group.items.filter((item) => item.remoteReady).length,
    0,
  );
}

function getGuildModuleCount(guildId) {
  const config = analyticsDb.getGuildConfig(guildId);
  let enabledModules = 0;

  if (!config) {
    return enabledModules;
  }

  if (config.log_channel && analyticsDb.isModuleEnabled(guildId, 'logs')) {
    enabledModules += 1;
  }

  if (config.captcha_enabled) {
    enabledModules += 1;
  }

  if (config.automod_enabled && analyticsDb.isModuleEnabled(guildId, 'automod')) {
    enabledModules += 1;
  }

  if (config.antiraid_enabled) {
    enabledModules += 1;
  }

  if (analyticsDb.isModuleEnabled(guildId, 'leveling')) {
    enabledModules += 1;
  }

  if (analyticsDb.isModuleEnabled(guildId, 'economy')) {
    enabledModules += 1;
  }

  if (analyticsDb.isModuleEnabled(guildId, 'fun')) {
    enabledModules += 1;
  }

  if (analyticsDb.getReactionRoleCount(guildId) > 0) {
    enabledModules += 1;
  }

  if (config.welcome_channel) {
    enabledModules += 1;
  }

  if (config.ticket_channel) {
    enabledModules += 1;
  }

  return enabledModules;
}

function getGuildUsageStats(guild, now) {
  const last24Hours = new Date(now - (24 * 60 * 60 * 1000)).toISOString();
  const last7Days = new Date(now - (7 * 24 * 60 * 60 * 1000)).toISOString();
  const last30Days = new Date(now - (30 * 24 * 60 * 60 * 1000)).toISOString();
  const commandStats = analyticsDb.getGuildCommandStats(guild.id);
  const seenTotal = analyticsDb.getSeenUsersCount(guild.id);
  const seen30Days = analyticsDb.getSeenUsersCount(guild.id, last30Days);
  const seen7Days = analyticsDb.getSeenUsersCount(guild.id, last7Days);
  const seen24Hours = analyticsDb.getSeenUsersCount(guild.id, last24Hours);
  const memberBase = Math.max(guild.memberCount || 0, seenTotal || 0, 1);
  const activeMembers = seen30Days > 0 ? seen30Days : Math.max(guild.memberCount || 0, 1);

  return {
    activeMembers,
    commands: commandStats?.commands_total || 0,
    conversionRate: clampPercent((seen24Hours / memberBase) * 100, 24),
    lastCommandAt: commandStats?.last_command_at || new Date(now).toISOString(),
    latencyMs: Math.max(0, guild.client.ws.ping || 0),
    modulesEnabled: getGuildModuleCount(guild.id),
    retention: clampPercent((seen7Days / memberBase) * 100, 68),
  };
}

function buildOverview(client) {
  const trackedUsers = analyticsDb.getTrackedUsersCount();
  const communityFallback = client.guilds.cache.reduce(
    (total, guild) => total + Math.max(guild.memberCount || 0, 0),
    0,
  );

  return {
    automationsRunning: 3,
    commandsTotal: analyticsDb.getTotalCommands(),
    communitiesReached: Math.max(trackedUsers, communityFallback),
    latencyMs: Math.max(0, client.ws.ping || 0),
    premiumServers: client.guilds.cache.filter((guild) => (guild.premiumSubscriptionCount || 0) > 0).size,
    serversTracked: client.guilds.cache.size,
    uptimePercent: 100,
  };
}

function buildModulesSummary(client) {
  const trackedGuildIds = client.guilds.cache.map((guild) => guild.id);

  const countByModule = (moduleName) => trackedGuildIds.filter((guildId) => {
    const config = analyticsDb.getGuildConfig(guildId);

    if (!config) {
      return false;
    }

    if (moduleName === 'logs') {
      return Boolean(config.log_channel) && analyticsDb.isModuleEnabled(guildId, 'logs');
    }

    if (moduleName === 'automod') {
      return Boolean(config.automod_enabled) && analyticsDb.isModuleEnabled(guildId, 'automod');
    }

    if (moduleName === 'antiraid') {
      return Boolean(config.antiraid_enabled);
    }

    return analyticsDb.isModuleEnabled(guildId, moduleName);
  }).length;

  return [
    {
      title: 'Moderation',
      description: `${countByModule('automod')} serveur(s) ont l auto-moderation active.`,
    },
    {
      title: 'Leveling',
      description: `${countByModule('leveling')} serveur(s) utilisent actuellement le systeme de niveaux.`,
    },
    {
      title: 'Economie',
      description: `${countByModule('economy')} serveur(s) ont le module economie actif.`,
    },
  ];
}

function buildRecentActivity() {
  const events = analyticsDb.getRecentEvents(RECENT_ACTIVITY_LIMIT);

  if (events.length === 0) {
    return [
      {
        title: 'Bot connecte',
        description: 'Le service live du dashboard attend les premieres interactions.',
        timestamp: new Date(runtimeState.startedAt).toISOString(),
      },
    ];
  }

  return events.map((event) => ({
    description: event.description || 'Activite synchronisee depuis le bot.',
    timestamp: event.created_at,
    title: event.title,
  }));
}

async function hydrateGuildCollections(guild) {
  await Promise.allSettled([
    guild.channels.fetch(),
    guild.roles.fetch(),
  ]);
}

function serializeChannelOptions(guild) {
  return guild.channels.cache
    .filter((channel) => channel && !channel.isThread?.())
    .map((channel) => {
      const isCategory = channel.type === 4;
      const isText = !isCategory && channel.isTextBased?.();

      if (!isCategory && !isText) {
        return null;
      }

      return {
        id: channel.id,
        kind: isCategory ? 'category' : 'text',
        label: isCategory
          ? channel.name
          : `${channel.parent?.name ? `${channel.parent.name} / ` : ''}#${channel.name}`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

function serializeRoleOptions(guild) {
  return guild.roles.cache
    .filter((role) => role && role.id !== guild.id && !role.managed)
    .map((role) => ({
      id: role.id,
      label: role.name,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

function buildReactionRoleEntries(guild) {
  return analyticsDb.listReactionRoles(guild.id).map((entry) => ({
    channelId: entry.channel_id,
    channelName: guild.channels.cache.get(entry.channel_id)?.name || 'salon-introuvable',
    emoji: entry.emoji,
    id: String(entry.id),
    messageId: entry.message_id,
    roleId: entry.role_id,
    roleName: guild.roles.cache.get(entry.role_id)?.name || 'role-introuvable',
  }));
}

function buildControlSettings(guild) {
  const config = analyticsDb.getGuildConfig(guild.id);
  const reactionRoles = buildReactionRoleEntries(guild);
  const modules = {
    antiraid: Boolean(config?.antiraid_enabled),
    automod: Boolean(config?.automod_enabled) && analyticsDb.isModuleEnabled(guild.id, 'automod'),
    captcha: Boolean(config?.captcha_enabled && config?.captcha_channel && config?.captcha_role),
    economy: analyticsDb.isModuleEnabled(guild.id, 'economy'),
    fun: analyticsDb.isModuleEnabled(guild.id, 'fun'),
    leveling: analyticsDb.isModuleEnabled(guild.id, 'leveling'),
    logs: Boolean(config?.log_channel) && analyticsDb.isModuleEnabled(guild.id, 'logs'),
    reactionRoles: reactionRoles.length > 0,
    tickets: Boolean(config?.ticket_channel),
    welcome: Boolean(config?.welcome_channel),
  };

  return {
    general: {
      language: config?.language || 'fr',
      logChannelId: config?.log_channel || '',
      prefix: config?.prefix || '!',
    },
    modules,
    captcha: {
      channelId: config?.captcha_channel || '',
      enabled: Boolean(config?.captcha_enabled),
      retryLimit: config?.captcha_retry_limit || 3,
      roleId: config?.captcha_role || '',
    },
    reactionRoles: {
      count: reactionRoles.length,
      entries: reactionRoles,
    },
    tickets: {
      categoryId: config?.ticket_category || '',
      channelId: config?.ticket_channel || '',
      enabled: Boolean(config?.ticket_channel),
      openCount: analyticsDb.getOpenTicketCount(guild.id),
      staffRoleId: config?.ticket_staff_role || '',
      ticketCount: config?.ticket_count || 0,
    },
    welcome: {
      avatar: config?.welcome_avatar !== 0,
      channelId: config?.welcome_channel || '',
      color: config?.welcome_color || '#ff8a24',
      embed: config?.welcome_embed !== 0,
      enabled: Boolean(config?.welcome_channel),
      message: config?.welcome_message || 'Bienvenue {user} sur **{server}** !',
      title: config?.welcome_title || 'Bienvenue !',
    },
  };
}

async function getControlSnapshot(client, guildId) {
  const guild = client.guilds.cache.get(guildId);

  if (!guild) {
    const error = new Error('Serveur introuvable pour le pilotage distant.');
    error.statusCode = 404;
    throw error;
  }

  await hydrateGuildCollections(guild);

  const settings = buildControlSettings(guild);
  const enabledModuleCount = Object.values(settings.modules).filter(Boolean).length;

  return {
    commands: COMMAND_CATALOG,
    guild: {
      id: guild.id,
      name: guild.name,
    },
    lastUpdatedAt: new Date().toISOString(),
    options: {
      channels: serializeChannelOptions(guild),
      roles: serializeRoleOptions(guild),
    },
    remote: {
      connected: true,
      mode: 'internal-api',
    },
    settings,
    summary: {
      commandCount: countCommandItems(),
      dashboardReadyCount: countRemoteReadyCommands(),
      enabledModuleCount,
      liveModeLabel: 'Mode Railway',
      reactionRolesCount: settings.reactionRoles.count,
      remoteFeaturesCount: 6,
    },
  };
}

function requireGuildChannel(guild, channelId, acceptedKinds) {
  const channel = guild.channels.cache.get(channelId);
  const isCategory = channel?.type === 4;
  const kind = isCategory ? 'category' : (channel?.isTextBased?.() ? 'text' : null);

  if (!channel || !kind || !acceptedKinds.includes(kind)) {
    throw new Error('Le salon selectionne est invalide pour cette action.');
  }

  return channel;
}

function requireGuildRole(guild, roleId) {
  const role = guild.roles.cache.get(roleId);

  if (!role || role.id === guild.id) {
    throw new Error('Le role selectionne est invalide.');
  }

  return role;
}

async function applyControlAction(client, guildId, actionPayload) {
  const guild = client.guilds.cache.get(guildId);

  if (!guild) {
    const error = new Error('Serveur introuvable pour le pilotage distant.');
    error.statusCode = 404;
    throw error;
  }

  await hydrateGuildCollections(guild);

  const action = cleanString(actionPayload?.action);
  const data = actionPayload?.data || {};

  if (!action) {
    throw new Error('Aucune action de pilotage n a ete fournie.');
  }

  if (action === 'save-general') {
    analyticsDb.updateGuildConfig(guildId, {
      language: cleanString(data.language, 'fr'),
      log_channel: cleanString(data.logChannelId, '') || null,
      prefix: cleanString(data.prefix, '!').slice(0, 8),
    });
    analyticsDb.addDashboardEvent(guildId, 'Configuration generale', `Les reglages de base ont ete mis a jour sur ${guild.name}.`);
    scheduleDashboardSync(200);
    return { message: 'Configuration generale mise a jour.' };
  }

  if (action === 'save-modules') {
    const logsEnabled = toBoolean(data.logs);
    const automodEnabled = toBoolean(data.automod);
    const antiraidEnabled = toBoolean(data.antiraid);
    const levelingEnabled = toBoolean(data.leveling);
    const economyEnabled = toBoolean(data.economy);
    const funEnabled = toBoolean(data.fun);

    analyticsDb.setModuleEnabled(guildId, 'logs', logsEnabled);
    analyticsDb.setModuleEnabled(guildId, 'automod', automodEnabled);
    analyticsDb.setModuleEnabled(guildId, 'antiraid', antiraidEnabled);
    analyticsDb.setModuleEnabled(guildId, 'leveling', levelingEnabled);
    analyticsDb.setModuleEnabled(guildId, 'economy', economyEnabled);
    analyticsDb.setModuleEnabled(guildId, 'fun', funEnabled);
    analyticsDb.updateGuildConfig(guildId, {
      antiraid_enabled: antiraidEnabled ? 1 : 0,
      automod_enabled: automodEnabled ? 1 : 0,
      leveling_enabled: levelingEnabled ? 1 : 0,
    });
    analyticsDb.addDashboardEvent(guildId, 'Modules synchronises', `Les modules principaux ont ete ajustes sur ${guild.name}.`);
    scheduleDashboardSync(200);
    return { message: 'Modules mis a jour.' };
  }

  if (action === 'save-captcha') {
    const enabled = toBoolean(data.enabled);
    const channelId = cleanString(data.channelId, '');
    const roleId = cleanString(data.roleId, '');
    const retryLimit = Math.max(1, Math.min(10, toInt(data.retryLimit, 3)));

    if (enabled) {
      requireGuildChannel(guild, channelId, ['text']);
      requireGuildRole(guild, roleId);
    }

    analyticsDb.updateGuildConfig(guildId, {
      captcha_channel: enabled ? channelId : null,
      captcha_enabled: enabled ? 1 : 0,
      captcha_retry_limit: retryLimit,
      captcha_role: enabled ? roleId : null,
    });
    analyticsDb.addDashboardEvent(guildId, 'Captcha synchronise', `Le module captcha a ete ${enabled ? 'active' : 'desactive'} sur ${guild.name}.`);
    scheduleDashboardSync(200);
    return { message: 'Captcha mis a jour.' };
  }

  if (action === 'save-welcome') {
    const enabled = toBoolean(data.enabled);
    const channelId = cleanString(data.channelId, '');

    if (enabled) {
      requireGuildChannel(guild, channelId, ['text']);
    }

    analyticsDb.updateGuildConfig(guildId, {
      welcome_avatar: toBoolean(data.avatar) ? 1 : 0,
      welcome_channel: enabled ? channelId : null,
      welcome_color: sanitizeHexColor(data.color, '#ff8a24'),
      welcome_embed: toBoolean(data.embed) ? 1 : 0,
      welcome_message: cleanString(data.message, 'Bienvenue {user} sur **{server}** !'),
      welcome_title: cleanString(data.title, 'Bienvenue !').slice(0, 120),
    });
    analyticsDb.addDashboardEvent(guildId, 'Welcome synchronise', `Le message de bienvenue a ete ${enabled ? 'configure' : 'desactive'} sur ${guild.name}.`);
    scheduleDashboardSync(200);
    return { message: 'Welcome mis a jour.' };
  }

  if (action === 'save-tickets') {
    const enabled = toBoolean(data.enabled);
    const channelId = cleanString(data.channelId, '');
    const staffRoleId = cleanString(data.staffRoleId, '');
    const categoryId = cleanString(data.categoryId, '');

    if (enabled) {
      requireGuildChannel(guild, channelId, ['text']);
      if (staffRoleId) {
        requireGuildRole(guild, staffRoleId);
      }
      if (categoryId) {
        requireGuildChannel(guild, categoryId, ['category']);
      }
    }

    analyticsDb.updateGuildConfig(guildId, {
      ticket_category: enabled ? (categoryId || null) : null,
      ticket_channel: enabled ? channelId : null,
      ticket_staff_role: enabled ? (staffRoleId || null) : null,
    });
    analyticsDb.addDashboardEvent(guildId, 'Tickets synchronises', `La configuration tickets a ete ${enabled ? 'mise a jour' : 'desactivee'} sur ${guild.name}.`);
    scheduleDashboardSync(200);
    return { message: 'Tickets mis a jour.' };
  }

  if (action === 'create-reaction') {
    const channel = requireGuildChannel(guild, cleanString(data.channelId, ''), ['text']);
    const role = requireGuildRole(guild, cleanString(data.roleId, ''));
    const emoji = cleanString(data.emoji);
    const message = cleanString(data.message);

    if (!emoji || !message) {
      throw new Error('Renseigne un emoji et un message avant de publier un reaction role.');
    }

    const sentMessage = await channel.send({ content: message });
    const reaction = await sentMessage.react(emoji);
    const resolvedEmoji = reaction.emoji.id
      ? `${reaction.emoji.name}:${reaction.emoji.id}`
      : reaction.emoji.name;

    analyticsDb.addReactionRole(guildId, channel.id, sentMessage.id, resolvedEmoji, role.id);
    analyticsDb.addDashboardEvent(guildId, 'Reaction role publie', `Un nouveau reaction role a ete publie dans #${channel.name} sur ${guild.name}.`);
    scheduleDashboardSync(200);
    return { message: 'Reaction role publie avec succes.' };
  }

  if (action === 'delete-reaction') {
    const reactionRoleId = toInt(data.reactionRoleId, 0);
    const removedEntry = analyticsDb.removeReactionRoleById(guildId, reactionRoleId);

    if (!removedEntry) {
      throw new Error('Reaction role introuvable ou deja supprime.');
    }

    try {
      const channel = guild.channels.cache.get(removedEntry.channel_id);

      if (channel?.isTextBased?.()) {
        const message = await channel.messages.fetch(removedEntry.message_id);
        await message.delete();
      }
    } catch {
      // Keep the database cleanup even if the original message is already gone.
    }

    analyticsDb.addDashboardEvent(guildId, 'Reaction role supprime', `Un reaction role a ete retire du dashboard sur ${guild.name}.`);
    scheduleDashboardSync(200);
    return { message: 'Reaction role supprime.' };
  }

  throw new Error(`Action de pilotage inconnue: ${action}`);
}

function getDashboardSnapshot(client) {
  if (!client?.isReady?.()) {
    return {
      guildMetrics: {},
      modules: [],
      overview: {
        automationsRunning: 0,
        commandsTotal: 0,
        communitiesReached: 0,
        latencyMs: 0,
        premiumServers: 0,
        serversTracked: 0,
        uptimePercent: 0,
      },
      recentActivity: [],
    };
  }

  const now = Date.now();
  const guildMetrics = {};

  for (const guild of client.guilds.cache.values()) {
    guildMetrics[guild.id] = getGuildUsageStats(guild, now);
  }

  return {
    guildMetrics,
    modules: buildModulesSummary(client),
    overview: buildOverview(client),
    recentActivity: buildRecentActivity(),
  };
}

function syncDashboardSnapshot(client) {
  try {
    ensureLiveFileDirectory();
    fs.writeFileSync(DASHBOARD_LIVE_FILE, JSON.stringify(getDashboardSnapshot(client), null, 2), 'utf8');
  } catch (error) {
    console.error('[dashboard-sync] Echec ecriture snapshot:', error);
  }
}

function scheduleDashboardSync(delayMs = 1200) {
  if (runtimeState.syncTimeout || !runtimeState.client) {
    return;
  }

  runtimeState.syncTimeout = setTimeout(() => {
    runtimeState.syncTimeout = null;
    syncDashboardSnapshot(runtimeState.client);
  }, delayMs);
}

function trackSeenUser(guildId, userId) {
  if (!guildId || !userId) {
    return;
  }

  analyticsDb.touchDashboardUser(guildId, userId);
}

function trackCommandUsage(interaction) {
  if (!interaction?.guildId || !interaction?.user?.id || !interaction.isChatInputCommand()) {
    return;
  }

  trackSeenUser(interaction.guildId, interaction.user.id);
  analyticsDb.incrementDashboardCommand(interaction.guildId, interaction.commandName);
  analyticsDb.addDashboardEvent(
    interaction.guildId,
    `Commande /${interaction.commandName}`,
    `${interaction.user.tag} a lance /${interaction.commandName} sur ${interaction.guild?.name || 'un serveur'}.`,
  );
  scheduleDashboardSync(500);
}

function trackMessageActivity(message) {
  if (!message?.guild?.id || !message?.author?.id || message.author.bot) {
    return;
  }

  trackSeenUser(message.guild.id, message.author.id);
  scheduleDashboardSync(1500);
}

function trackMemberJoin(member) {
  if (!member?.guild?.id || !member?.user?.id || member.user.bot) {
    return;
  }

  trackSeenUser(member.guild.id, member.user.id);
  analyticsDb.addDashboardEvent(
    member.guild.id,
    'Membre rejoint',
    `${member.user.tag} a rejoint ${member.guild.name}.`,
  );
  scheduleDashboardSync(1000);
}

function trackMemberLeave(member) {
  if (!member?.guild?.id || !member?.user?.tag || member.user.bot) {
    return;
  }

  analyticsDb.addDashboardEvent(
    member.guild.id,
    'Membre parti',
    `${member.user.tag} a quitte ${member.guild.name}.`,
  );
  scheduleDashboardSync(1000);
}

function startApiServer(client) {
  if (runtimeState.apiServer) {
    return;
  }

  runtimeState.apiServer = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${DASHBOARD_API_HOST}:${DASHBOARD_API_PORT}`);

    if (!ensureAuthorizedRequest(request, response)) {
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/dashboard/live') {
      sendJson(response, 200, {
        ...getDashboardSnapshot(client),
        lastUpdatedAt: new Date().toISOString(),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/dashboard/control') {
      try {
        const guildId = cleanString(url.searchParams.get('guildId'));

        if (!guildId) {
          sendJson(response, 400, { error: 'guildId manquant.' });
          return;
        }

        sendJson(response, 200, await getControlSnapshot(client, guildId));
      } catch (error) {
        sendJson(response, error.statusCode || 500, { error: error.message || 'Erreur serveur.' });
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/dashboard/control') {
      try {
        const guildId = cleanString(url.searchParams.get('guildId'));

        if (!guildId) {
          sendJson(response, 400, { error: 'guildId manquant.' });
          return;
        }

        const rawBody = await readRequestBody(request);
        const payload = rawBody ? JSON.parse(rawBody) : {};
        const result = await applyControlAction(client, guildId, payload);

        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, error.statusCode || 500, { error: error.message || 'Erreur serveur.' });
      }
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  });

  runtimeState.apiServer.listen(DASHBOARD_API_PORT, DASHBOARD_API_HOST, () => {
    console.log(`[dashboard-sync] API live disponible sur ${DASHBOARD_API_HOST}:${DASHBOARD_API_PORT}`);
  });
}

function startDashboardAnalytics() {
  if (!TOKEN) {
    console.warn('[dashboard-sync] BOT_TOKEN absent, service analytics non demarre.');
    return null;
  }

  if (runtimeState.client) {
    return runtimeState.client;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.MessageContent,
    ],
    partials: [
      Partials.Channel,
      Partials.GuildMember,
      Partials.Message,
      Partials.Reaction,
    ],
  });

  runtimeState.client = client;

  client.once(Events.ClientReady, () => {
    analyticsDb.addDashboardEvent(
      null,
      'Dashboard connecte',
      `Le service live est actif sur ${client.guilds.cache.size} serveur(s).`,
    );
    startApiServer(client);
    syncDashboardSnapshot(client);
    runtimeState.syncInterval = setInterval(() => {
      syncDashboardSnapshot(client);
    }, DASHBOARD_REFRESH_MS);
    console.log(`[dashboard-sync] Client analytics connecte: ${client.user.tag}`);
  });

  client.on(Events.InteractionCreate, trackCommandUsage);
  client.on(Events.MessageCreate, trackMessageActivity);
  client.on(Events.GuildMemberAdd, trackMemberJoin);
  client.on(Events.GuildMemberRemove, trackMemberLeave);
  client.on(Events.Error, (error) => {
    console.error('[dashboard-sync] Erreur Discord.js:', error);
  });

  client.login(TOKEN).catch((error) => {
    console.error('[dashboard-sync] Impossible de connecter le client analytics:', error);
  });

  return client;
}

module.exports = {
  getDashboardSnapshot,
  scheduleDashboardSync,
  startDashboardAnalytics,
};
