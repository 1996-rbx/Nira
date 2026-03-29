import fs from "node:fs";
import path from "node:path";

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const publicBaseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";

export const config = {
  appName: process.env.APP_NAME || "Discord Dashboard",
  cookieName: "nira_session",
  demoLiveEnabled: process.env.DEMO_LIVE_MODE !== "false",
  oauthStateCookieName: "nira_oauth_state",
  dataFilePath: path.resolve(process.cwd(), "data", "metrics.json"),
  dashboardSharedSecret: process.env.LIVE_METRICS_TOKEN || "",
  discordApiBaseUrl: "https://discord.com/api/v10",
  discordBotToken: process.env.DISCORD_BOT_TOKEN || "",
  discordClientId: process.env.DISCORD_CLIENT_ID || "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || "",
  liveDataFilePath: path.resolve(process.cwd(), "data", "live-metrics.json"),
  liveMetricsTimeoutMs: Number.parseInt(process.env.LIVE_METRICS_TIMEOUT_MS || "4000", 10),
  liveMetricsUrl: process.env.LIVE_METRICS_URL || "",
  liveRefreshMs: Number.parseInt(process.env.LIVE_REFRESH_MS || "2500", 10),
  port: Number.parseInt(process.env.PORT || "3000", 10),
  publicBaseUrl,
  redirectUri: new URL("/auth/discord/callback", publicBaseUrl).toString(),
  sessionSecret: process.env.SESSION_SECRET || "dev-session-secret",
  sessionTtlMs: 1000 * 60 * 60 * 24
};

export function getSetupWarnings() {
  const warnings = [];

  if (!config.liveMetricsUrl) {
    warnings.push(
      "Le dashboard lit encore data/live-metrics.json en local. Sur Railway, configure LIVE_METRICS_URL pour recuperer les vraies stats du bot.",
    );
  }

  if (!config.discordClientId || !config.discordClientSecret) {
    warnings.push(
      "Le login Discord reste inactive tant que DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET ne sont pas renseignes.",
    );
  }

  if (!config.discordBotToken) {
    warnings.push(
      "Le filtrage des serveurs ou le bot est deja installe reste inactif tant que DISCORD_BOT_TOKEN n'est pas renseigne.",
    );
  }

  if (config.sessionSecret === "dev-session-secret") {
    warnings.push(
      "SESSION_SECRET utilise encore la valeur de developpement. Change-la avant de mettre le dashboard en ligne.",
    );
  }

  return warnings;
}
