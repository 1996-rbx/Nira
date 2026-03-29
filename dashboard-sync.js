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

function clampPercent(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(100, Math.round(value)));
}

function ensureLiveFileDirectory() {
  fs.mkdirSync(path.dirname(DASHBOARD_LIVE_FILE), { recursive: true });
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

  if (analyticsDb.getReactionRoleCount(guildId) > 0) {
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

  runtimeState.apiServer = http.createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/api/dashboard/live') {
      response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (DASHBOARD_SHARED_SECRET && request.headers['x-dashboard-token'] !== DASHBOARD_SHARED_SECRET) {
      response.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({
      ...getDashboardSnapshot(client),
      lastUpdatedAt: new Date().toISOString(),
    }));
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
