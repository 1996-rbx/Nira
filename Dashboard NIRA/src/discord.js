import { config } from "./config.js";

const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

function buildDiscordApiHeaders(token, tokenType = "Bearer") {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded"
  };

  if (token) {
    headers.Authorization = `${tokenType} ${token}`;
  }

  return headers;
}

async function fetchDiscordJson(url, init) {
  const response = await fetch(url, init);

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Discord API ${response.status}: ${errorText}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export function isDiscordAuthConfigured() {
  return Boolean(config.discordClientId && config.discordClientSecret);
}

export function buildDiscordAuthorizeUrl(state) {
  const url = new URL(`${config.discordApiBaseUrl}/oauth2/authorize`);

  url.searchParams.set("client_id", config.discordClientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "identify guilds");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeCodeForAccessToken(code) {
  const body = new URLSearchParams({
    client_id: config.discordClientId,
    client_secret: config.discordClientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri
  });

  return fetchDiscordJson(`${config.discordApiBaseUrl}/oauth2/token`, {
    body,
    headers: buildDiscordApiHeaders(""),
    method: "POST"
  });
}

export async function fetchCurrentUser(accessToken) {
  return fetchDiscordJson(`${config.discordApiBaseUrl}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export async function fetchCurrentUserGuilds(accessToken) {
  const guilds = await fetchDiscordJson(`${config.discordApiBaseUrl}/users/@me/guilds`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return guilds.filter((guild) => {
    if (guild.owner) {
      return true;
    }

    const permissions = BigInt(guild.permissions || "0");
    return Boolean((permissions & MANAGE_GUILD) || (permissions & ADMINISTRATOR));
  });
}

export function buildDiscordAvatarUrl(user) {
  if (!user?.avatar) {
    return `https://cdn.discordapp.com/embed/avatars/${Number(user?.discriminator || 0) % 5}.png`;
  }

  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

export function buildGuildIconUrl(guild) {
  if (!guild?.icon) {
    return null;
  }

  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

async function checkBotPresenceInGuild(guildId) {
  if (!config.discordBotToken) {
    return null;
  }

  try {
    await fetchDiscordJson(`${config.discordApiBaseUrl}/guilds/${guildId}`, {
      headers: {
        Authorization: `Bot ${config.discordBotToken}`
      }
    });

    return true;
  } catch (error) {
    if (error.status === 401 || error.status === 429) {
      return null;
    }

    if (error.status === 403 || error.status === 404) {
      return false;
    }

    throw error;
  }
}

export async function filterGuildsByBotPresence(guilds) {
  if (!config.discordBotToken) {
    return guilds.map((guild) => ({
      ...guild,
      botInstalled: null
    }));
  }

  try {
    const checks = await Promise.all(
      guilds.map(async (guild) => ({
        botInstalled: await checkBotPresenceInGuild(guild.id),
        guild
      })),
    );

    const installedGuilds = checks
      .filter((entry) => entry.botInstalled === true)
      .map((entry) => ({
        ...entry.guild,
        botInstalled: true
      }));

    if (installedGuilds.length > 0) {
      return installedGuilds;
    }

    return checks.map((entry) => ({
      ...entry.guild,
      botInstalled: entry.botInstalled
    }));
  } catch {
    return guilds.map((guild) => ({
      ...guild,
      botInstalled: null
    }));
  }
}
