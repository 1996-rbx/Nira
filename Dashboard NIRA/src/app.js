import crypto from "node:crypto";
import http from "node:http";
import { config } from "./config.js";
import {
  buildDiscordAuthorizeUrl,
  exchangeCodeForAccessToken,
  fetchCurrentUser,
  fetchCurrentUserGuilds,
  filterGuildsByBotPresence,
  isDiscordAuthConfigured
} from "./discord.js";
import { getDashboardPayload, getSessionPayload } from "./data.js";
import {
  clearCookie,
  parseCookies,
  sendJson,
  sendRedirect,
  sendText,
  serveStaticAsset,
  setCookie
} from "./http.js";
import {
  createSession,
  deleteSession,
  getSession,
  makeSignedValue,
  verifySignedValue
} from "./session-store.js";

async function getRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function resolveSessionContext(request) {
  const cookies = parseCookies(request);
  const session = getSession(cookies[config.cookieName]);

  if (!session) {
    return {
      cookies,
      guilds: [],
      session: null
    };
  }

  return {
    cookies,
    guilds: session.guilds || [],
    session
  };
}

function setSessionCookie(response, signedSessionId, expiresAt) {
  setCookie(response, config.cookieName, signedSessionId, {
    expires: new Date(expiresAt),
    maxAge: Math.floor(config.sessionTtlMs / 1000)
  });
}

function setOauthStateCookie(response, state) {
  setCookie(response, config.oauthStateCookieName, makeSignedValue(state), {
    maxAge: 60 * 10
  });
}

function parseSelectedGuildId(request) {
  const url = new URL(request.url, config.publicBaseUrl);
  return url.searchParams.get("guildId");
}

async function handleDiscordLogin(response) {
  if (!isDiscordAuthConfigured()) {
    sendText(
      response,
      503,
      "Renseigne DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET dans le fichier .env avant d'activer la connexion Discord.",
    );
    return;
  }

  const state = crypto.randomBytes(24).toString("hex");

  setOauthStateCookie(response, state);
  sendRedirect(response, buildDiscordAuthorizeUrl(state));
}

async function handleDiscordCallback(request, response) {
  if (!isDiscordAuthConfigured()) {
    sendText(response, 503, "Configuration OAuth Discord incomplÃ¨te.");
    return;
  }

  const url = new URL(request.url, config.publicBaseUrl);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request);
  const expectedState = verifySignedValue(cookies[config.oauthStateCookieName]);

  if (!code || !state || !expectedState || state !== expectedState) {
    sendText(response, 400, "Le paramÃ¨tre state Discord est invalide ou expirÃ©.");
    return;
  }

  try {
    const tokenResponse = await exchangeCodeForAccessToken(code);
    const user = await fetchCurrentUser(tokenResponse.access_token);
    const userGuilds = await fetchCurrentUserGuilds(tokenResponse.access_token);
    const filteredGuilds = await filterGuildsByBotPresence(userGuilds);
    const { expiresAt, signedSessionId } = createSession({
      accessToken: tokenResponse.access_token,
      guilds: filteredGuilds,
      user
    });

    clearCookie(response, config.oauthStateCookieName);
    setSessionCookie(response, signedSessionId, expiresAt);
    sendRedirect(response, "/");
  } catch (error) {
    sendText(
      response,
      500,
      `Connexion Discord impossible pour le moment.\n\n${error.message}`,
    );
  }
}

async function handleLogout(request, response) {
  const cookies = parseCookies(request);

  deleteSession(cookies[config.cookieName]);
  clearCookie(response, config.cookieName);
  sendJson(response, 200, {
    ok: true
  });
}

async function handleSession(request, response) {
  const { guilds, session } = await resolveSessionContext(request);
  sendJson(response, 200, getSessionPayload(session, guilds));
}

async function handleDashboard(request, response) {
  const { guilds, session } = await resolveSessionContext(request);
  const selectedGuildId = parseSelectedGuildId(request);

  sendJson(response, 200, await getDashboardPayload(session, guilds, selectedGuildId));
}

export function createAppServer() {
  return http.createServer(async (request, response) => {
    if (!request.url || !request.method) {
      sendText(response, 400, "RequÃªte invalide.");
      return;
    }

    const pathname = new URL(request.url, config.publicBaseUrl).pathname;

    if (request.method === "GET" && pathname === "/auth/discord/login") {
      await handleDiscordLogin(response);
      return;
    }

    if (request.method === "GET" && pathname === "/auth/discord/callback") {
      await handleDiscordCallback(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/auth/logout") {
      await getRequestBody(request);
      await handleLogout(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/api/session") {
      await handleSession(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/api/dashboard") {
      await handleDashboard(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/settings") {
      sendRedirect(response, "/dashboard");
      return;
    }

    if (request.method === "GET" && serveStaticAsset(request, response)) {
      return;
    }

    sendText(response, 404, "Page introuvable.");
  });
}
