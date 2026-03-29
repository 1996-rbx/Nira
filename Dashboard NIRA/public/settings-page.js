import { fetchJson, hydrateShell } from "./shared.js";

const elements = {
  liveFilePath: document.getElementById("live-file-path"),
  liveSample: document.getElementById("live-sample"),
  oauthStatus: document.getElementById("oauth-status"),
  warningList: document.getElementById("warning-list")
};

function createInfoCard(title, body, extra = "") {
  return `
    <article class="info-card">
      <strong>${title}</strong>
      <p class="muted">${body}</p>
      ${extra}
    </article>
  `;
}

function renderWarnings(warnings) {
  const baseWarnings = warnings.length
    ? warnings
    : ["Aucun warning de configuration detecte cote dashboard."];

  elements.warningList.innerHTML = baseWarnings
    .map((warning) => createInfoCard("Verification", warning))
    .join("");
}

function renderOauth(session) {
  const configuredOrigin = new URL(session.app.publicBaseUrl).origin;
  const browserOrigin = window.location.origin;
  const originMatches = configuredOrigin === browserOrigin;
  const discordReady = session.app.discord.clientConfigured;
  const botReady = session.app.discord.botConfigured;
  const remoteMode = session.app.metricsSource?.mode === "remote";
  const remoteHealthy = session.app.metricsSource?.remoteHealthy;

  elements.oauthStatus.innerHTML = [
    createInfoCard(
      "0. Source des compteurs",
      remoteMode
        ? remoteHealthy === false
          ? "Le dashboard tente bien de lire les stats du bot a distance, mais la source live ne repond pas encore."
          : "Le dashboard lit les stats du bot depuis une source distante compatible Railway."
        : "Le dashboard lit encore data/live-metrics.json en local. Sur Railway, configure LIVE_METRICS_URL pour afficher les vraies stats.",
    ),
    createInfoCard(
      "1. Redirect URI Discord",
      "Dans Discord Developer Portal > OAuth2 > Redirects, ajoute exactement cette URL.",
      `<code class="code-chip">${session.app.discord.redirectUri}</code>`,
    ),
    createInfoCard(
      "2. Verification de l'URL ouverte",
      originMatches
        ? "L'URL ouverte dans ton navigateur correspond bien a PUBLIC_BASE_URL."
        : "L'URL ouverte dans le navigateur ne correspond pas a PUBLIC_BASE_URL. C'est une cause classique du login Discord qui echoue.",
      `<code class="code-chip">Navigateur: ${browserOrigin}</code><code class="code-chip">Config: ${configuredOrigin}</code>`,
    ),
    createInfoCard(
      "3. Etat des variables OAuth",
      discordReady
        ? "DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET sont bien presents."
        : "Il manque DISCORD_CLIENT_ID ou DISCORD_CLIENT_SECRET dans .env.",
      `<code class="code-chip">Scopes: ${session.app.discord.scopes.join(", ")}</code>`,
    ),
    createInfoCard(
      "4. Etat du token bot",
      botReady
        ? "DISCORD_BOT_TOKEN est present. Le dashboard peut tenter de filtrer les serveurs ou le bot est installe."
        : "DISCORD_BOT_TOKEN est absent. Le login peut marcher, mais le filtrage fin des serveurs ne sera pas disponible.",
    )
  ].join("");
}

function renderLiveSample() {
  elements.liveFilePath.textContent = "data/live-metrics.json ou LIVE_METRICS_URL";
  elements.liveSample.textContent = JSON.stringify(
    {
      overview: {
        commandsTotal: 1835000,
        communitiesReached: 146900,
        serversTracked: 331,
        uptimePercent: 99.99
      },
      guildMetrics: {
        "123456789012345678": {
          activeMembers: 2408,
          commands: 94512,
          conversionRate: 26,
          lastCommandAt: new Date().toISOString(),
          latencyMs: 42,
          modulesEnabled: 8,
          retention: 87
        }
      }
    },
    null,
    2,
  );
}

async function init() {
  const session = await fetchJson("/api/session");
  hydrateShell(session, "settings");
  renderOauth(session);
  renderWarnings(session.app.setupWarnings);
  renderLiveSample();
}

init().catch((error) => {
  elements.oauthStatus.innerHTML = createInfoCard("Erreur", error.message);
});
