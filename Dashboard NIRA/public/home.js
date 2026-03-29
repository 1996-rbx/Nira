import {
  animateValue,
  fetchJson,
  formatDate,
  formatNumber,
  hydrateShell,
  startPolling
} from "./shared.js";

const elements = {
  heroCommands: document.getElementById("hero-commands"),
  heroMainLink: document.getElementById("hero-main-link"),
  heroUptime: document.getElementById("hero-uptime"),
  heroUsers: document.getElementById("hero-users"),
  homeActivity: document.getElementById("home-activity"),
  homeSummary: document.getElementById("home-summary"),
  lastUpdated: document.getElementById("last-updated"),
  livePill: document.getElementById("live-pill"),
  welcomeText: document.getElementById("welcome-text")
};

let refreshTimer = null;

function createSummaryCard(title, value, description) {
  return `
    <article class="info-card">
      <span class="metric-label">${title}</span>
      <strong class="metric-value" data-value="${value}">${value}</strong>
      <p class="muted">${description}</p>
    </article>
  `;
}

function renderActivity(items) {
  elements.homeActivity.innerHTML = items
    .slice(0, 4)
    .map(
      (item) => `
        <article class="activity-card">
          <span class="activity-time">${formatDate(item.timestamp)}</span>
          <strong>${item.title}</strong>
          <p class="muted">${item.description}</p>
        </article>
      `,
    )
    .join("");
}

function renderDashboard(session, dashboard) {
  elements.welcomeText.textContent = dashboard.welcome;
  elements.livePill.textContent = `Auto refresh ${Math.round(
    dashboard.app.liveRefreshMs / 1000,
  )}s`;
  elements.lastUpdated.textContent = `Mis a jour ${formatDate(dashboard.lastUpdatedAt)}`;

  elements.heroMainLink.textContent = session.authenticated
    ? "Ouvrir le dashboard"
    : "Connecter Discord";
  elements.heroMainLink.setAttribute(
    "href",
    session.authenticated ? "/dashboard" : "/auth/discord/login",
  );

  animateValue(elements.heroCommands, formatNumber(dashboard.overview.commandsTotal));
  animateValue(elements.heroUsers, formatNumber(dashboard.overview.communitiesReached));
  animateValue(elements.heroUptime, `${Number(dashboard.overview.uptimePercent || 0).toFixed(2)}%`);

  elements.homeSummary.innerHTML = [
    createSummaryCard(
      "Serveurs suivis",
      formatNumber(dashboard.overview.serversTracked),
      "Nombre de serveurs actuellement exposes au dashboard.",
    ),
    createSummaryCard(
      "Automations actives",
      formatNumber(dashboard.overview.automationsRunning),
      "Jobs et taches qui tournent cote bot.",
    ),
    createSummaryCard(
      "Serveurs accessibles",
      formatNumber(session.guilds.length),
      session.authenticated
        ? "Serveurs gerables recuperes via ton compte Discord."
        : "Connecte ton compte pour afficher la liste des serveurs gerables.",
    )
  ].join("");

  elements.homeSummary.querySelectorAll("[data-value]").forEach((element) => {
    animateValue(element, element.dataset.value);
  });

  renderActivity(dashboard.activity);
}

async function refresh(session) {
  const dashboard = await fetchJson("/api/dashboard");
  renderDashboard(session, dashboard);
}

async function init() {
  const session = await fetchJson("/api/session");
  hydrateShell(session, "home");
  await refresh(session);

  refreshTimer = startPolling(() => refresh(session), session.app.liveRefreshMs);
}

window.addEventListener("beforeunload", () => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
  }
});

init().catch((error) => {
  elements.welcomeText.textContent = error.message;
});
