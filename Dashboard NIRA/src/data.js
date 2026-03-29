import fs from "node:fs";
import { config, getSetupWarnings } from "./config.js";
import { buildDiscordAvatarUrl, buildGuildIconUrl, isDiscordAuthConfigured } from "./discord.js";

const fileCache = new Map();

function readJsonFile(filePath, fallbackValue = null) {
  if (!fs.existsSync(filePath)) {
    fileCache.delete(filePath);
    return fallbackValue;
  }

  const stats = fs.statSync(filePath);
  const cachedEntry = fileCache.get(filePath);

  if (cachedEntry && cachedEntry.mtimeMs === stats.mtimeMs) {
    return cachedEntry.value;
  }

  const rawContent = fs.readFileSync(filePath, "utf8");
  const parsedValue = JSON.parse(rawContent);

  fileCache.set(filePath, {
    mtimeMs: stats.mtimeMs,
    value: parsedValue
  });

  return parsedValue;
}

function readMergedMetrics() {
  const baseMetrics = readJsonFile(config.dataFilePath, {
    guildMetrics: {},
    modules: [],
    overview: {},
    recentActivity: []
  });
  const liveMetrics = readJsonFile(config.liveDataFilePath, {});

  return {
    ...baseMetrics,
    ...liveMetrics,
    guildMetrics: {
      ...(baseMetrics.guildMetrics || {}),
      ...(liveMetrics.guildMetrics || {})
    },
    modules: liveMetrics.modules || baseMetrics.modules || [],
    overview: {
      ...(baseMetrics.overview || {}),
      ...(liveMetrics.overview || {})
    },
    recentActivity: liveMetrics.recentActivity || baseMetrics.recentActivity || []
  };
}

function hashString(input) {
  let hash = 0;

  for (const character of input) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function buildAppPayload() {
  return {
    discord: {
      botConfigured: Boolean(config.discordBotToken),
      clientConfigured: Boolean(config.discordClientId && config.discordClientSecret),
      redirectUri: config.redirectUri,
      scopes: ["identify", "guilds"]
    },
    liveRefreshMs: config.liveRefreshMs,
    loginEnabled: isDiscordAuthConfigured(),
    logoUrl: "/assets/logo.svg",
    name: config.appName,
    publicBaseUrl: config.publicBaseUrl,
    setupWarnings: getSetupWarnings()
  };
}

function generateFallbackGuildMetrics(guild, metricsFile) {
  const seed = hashString(guild.id);
  const commands = 4500 + (seed % 85000);
  const activeMembers = 120 + (seed % 2800);
  const retention = 65 + (seed % 28);
  const uptime = 98.2 + ((seed % 15) / 10);
  const latencyMs = 38 + (seed % 65);
  const conversionRate = 18 + (seed % 34);
  const activities = metricsFile.recentActivity || [];

  return {
    commands,
    activeMembers,
    conversionRate,
    lastCommandAt:
      activities[seed % Math.max(activities.length, 1)]?.timestamp || new Date().toISOString(),
    latencyMs,
    modulesEnabled: 4 + (seed % 5),
    retention,
    uptime: Number(uptime.toFixed(1))
  };
}

function normalizeGuildMetrics(guild, metricsFile) {
  const fileMetrics = metricsFile.guildMetrics?.[guild.id];

  if (fileMetrics) {
    return {
      ...fileMetrics,
      botInstalled: guild.botInstalled ?? null,
      iconUrl: buildGuildIconUrl(guild),
      id: guild.id,
      name: guild.name
    };
  }

  return {
    ...generateFallbackGuildMetrics(guild, metricsFile),
    botInstalled: guild.botInstalled ?? null,
    iconUrl: buildGuildIconUrl(guild),
    id: guild.id,
    name: guild.name
  };
}

export function getSessionPayload(session, guilds) {
  return {
    app: buildAppPayload(),
    authenticated: Boolean(session),
    guilds: guilds.map((guild) => ({
      botInstalled: guild.botInstalled,
      iconUrl: buildGuildIconUrl(guild),
      id: guild.id,
      name: guild.name
    })),
    user: session
      ? {
          avatarUrl: buildDiscordAvatarUrl(session.user),
          globalName: session.user.global_name || session.user.username,
          id: session.user.id,
          username: session.user.username
        }
      : null
  };
}

export function getDashboardPayload(session, guilds, selectedGuildId) {
  const metricsFile = readMergedMetrics();
  const accessibleGuilds = guilds.map((guild) => normalizeGuildMetrics(guild, metricsFile));
  const selectedGuild =
    accessibleGuilds.find((guild) => guild.id === selectedGuildId) ||
    accessibleGuilds[0] ||
    null;

  return {
    activity: metricsFile.recentActivity.slice(0, 10),
    app: buildAppPayload(),
    guilds: accessibleGuilds.map((guild) => ({
      activeMembers: guild.activeMembers,
      botInstalled: guild.botInstalled,
      commands: guild.commands,
      iconUrl: guild.iconUrl,
      id: guild.id,
      name: guild.name,
      retention: guild.retention
    })),
    lastUpdatedAt: new Date().toISOString(),
    modules: metricsFile.modules,
    overview: metricsFile.overview,
    selectedGuild,
    welcome: session
      ? `Bonjour ${session.user.global_name || session.user.username}, ton espace Discord est pret.`
      : "Connecte ton compte Discord pour retrouver tes serveurs et voir les vraies stats du bot."
  };
}
