import {
  animateValue,
  fetchJson,
  formatDate,
  formatNumber,
  hydrateShell,
  startPolling
} from "./shared.js";

const elements = {
  activityList: document.getElementById("activity-list"),
  activitySummary: document.getElementById("activity-summary"),
  lastUpdated: document.getElementById("last-updated"),
  moduleList: document.getElementById("module-list")
};

let refreshTimer = null;

function createMetricCard(title, value, description) {
  return `
    <article class="info-card">
      <span class="metric-label">${title}</span>
      <strong class="metric-value" data-value="${value}">${value}</strong>
      <p class="muted">${description}</p>
    </article>
  `;
}

function renderActivity(items) {
  elements.activityList.innerHTML = items
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

function renderModules(items) {
  elements.moduleList.innerHTML = items
    .map(
      (item) => `
        <article class="info-card">
          <strong>${item.title}</strong>
          <p class="muted">${item.description}</p>
        </article>
      `,
    )
    .join("");
}

function renderSummary(dashboard) {
  elements.activitySummary.innerHTML = [
    createMetricCard(
      "Commandes",
      formatNumber(dashboard.overview.commandsTotal),
      "Compteur global actuel.",
    ),
    createMetricCard(
      "Serveurs",
      formatNumber(dashboard.overview.serversTracked),
      "Serveurs suivis maintenant.",
    ),
    createMetricCard(
      "Automations",
      formatNumber(dashboard.overview.automationsRunning),
      "Taches actives cote bot.",
    )
  ].join("");

  elements.activitySummary.querySelectorAll("[data-value]").forEach((element) => {
    animateValue(element, element.dataset.value);
  });
}

async function refresh() {
  const dashboard = await fetchJson("/api/dashboard");
  elements.lastUpdated.textContent = `Mis a jour ${formatDate(dashboard.lastUpdatedAt)}`;
  renderActivity(dashboard.activity);
  renderModules(dashboard.modules);
  renderSummary(dashboard);
}

async function init() {
  const session = await fetchJson("/api/session");
  hydrateShell(session, "activity");
  await refresh();
  refreshTimer = startPolling(refresh, session.app.liveRefreshMs);
}

window.addEventListener("beforeunload", () => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
  }
});

init().catch((error) => {
  elements.activityList.innerHTML = `<article class="activity-card"><strong>Erreur</strong><p class="muted">${error.message}</p></article>`;
});
