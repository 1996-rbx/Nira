import { config } from "./config.js";

function ensureBotControlConfigured() {
  if (!config.botControlUrl) {
    throw new Error(
      "Le pilotage distant du bot n'est pas configure. Renseigne LIVE_METRICS_URL ou BOT_CONTROL_URL sur Railway.",
    );
  }
}

function buildHeaders() {
  const headers = {
    Accept: "application/json"
  };

  if (config.dashboardSharedSecret) {
    headers["x-dashboard-token"] = config.dashboardSharedSecret;
  }

  return headers;
}

async function requestBotControl(method, guildId, body = null) {
  ensureBotControlConfigured();

  const url = new URL(config.botControlUrl);

  if (guildId) {
    url.searchParams.set("guildId", guildId);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.botControlTimeoutMs);
  const headers = buildHeaders();

  if (body !== null) {
    headers["Content-Type"] = "application/json; charset=utf-8";
  }

  try {
    const response = await fetch(url, {
      body: body === null ? undefined : JSON.stringify(body),
      headers,
      method,
      signal: controller.signal
    });

    const rawText = await response.text();
    const payload = rawText ? JSON.parse(rawText) : null;

    if (!response.ok) {
      throw new Error(payload?.error || payload?.message || `Erreur bot ${response.status}`);
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Le bot n'a pas repondu a temps pour le pilotage distant.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function getRemoteControlPayload(guildId) {
  return requestBotControl("GET", guildId);
}

export function updateRemoteControlPayload(guildId, action) {
  return requestBotControl("POST", guildId, action);
}
