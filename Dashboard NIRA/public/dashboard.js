import {
  animateValue,
  fetchJson,
  formatDate,
  formatNumber,
  getStoredGuildId,
  hydrateShell,
  renderBadgeAvatar,
  setHidden,
  setStoredGuildId,
  startPolling
} from "./shared.js";

const elements = {
  guildSelect: document.getElementById("guild-select"),
  lastUpdated: document.getElementById("last-updated"),
  overviewGrid: document.getElementById("overview-grid"),
  refreshPill: document.getElementById("refresh-pill"),
  serverBotPill: document.getElementById("server-bot-pill"),
  serverContent: document.getElementById("server-content"),
  serverEmpty: document.getElementById("server-empty"),
  serverGrid: document.getElementById("server-grid"),
  serverIcon: document.getElementById("server-icon"),
  serverName: document.getElementById("server-name"),
  serverSubtitle: document.getElementById("server-subtitle")
};

const state = {
  guildId: "",
  refreshTimer: null,
  session: null
};

function createMetricCard(title, value, description) {
  return `
    <article class="info-card">
      <span class="metric-label">${title}</span>
      <strong class="metric-value" data-value="${value}">${value}</strong>
      <p class="muted">${description}</p>
    </article>
  `;
}

function createServerCard(title, value, description, progress) {
  return `
    <article class="info-card">
      <span class="metric-label">${title}</span>
      <strong class="metric-value" data-value="${value}">${value}</strong>
      <p class="muted">${description}</p>
      ${
        typeof progress === "number"
          ? `<div class="progress-track"><span style="width:${Math.max(
              0,
              Math.min(progress, 100),
            )}%"></span></div>`
          : ""
      }
    </article>
  `;
}

function renderOverview(overview) {
  elements.overviewGrid.innerHTML = [
    createMetricCard(
      "Commandes lancees",
      formatNumber(overview.commandsTotal),
      "Compteur global depuis le debut du bot.",
    ),
    createMetricCard(
      "Utilisateurs touches",
      formatNumber(overview.communitiesReached),
      "Audience totale atteinte par les fonctions du bot.",
    ),
    createMetricCard(
      "Serveurs trackes",
      formatNumber(overview.serversTracked),
      "Serveurs actuellement suivis par le dashboard.",
    ),
    createMetricCard(
      "Latence moyenne",
      `${overview.latencyMs} ms`,
      "Temps de reponse moyen remonte par le live dashboard.",
    )
  ].join("");

  elements.overviewGrid.querySelectorAll("[data-value]").forEach((element) => {
    animateValue(element, element.dataset.value);
  });
}

function renderGuildSelect(guilds, selectedGuildId) {
  elements.guildSelect.innerHTML = "";

  if (!guilds.length) {
    const option = document.createElement("option");
    option.textContent = "Aucun serveur";
    elements.guildSelect.appendChild(option);
    return;
  }

  guilds.forEach((guild) => {
    const option = document.createElement("option");
    option.value = guild.id;
    option.textContent = guild.name;
    option.selected = guild.id === selectedGuildId;
    elements.guildSelect.appendChild(option);
  });
}

function renderSelectedGuild(selectedGuild) {
  if (!selectedGuild) {
    setHidden(elements.serverEmpty, false);
    setHidden(elements.serverContent, true);
    return;
  }

  setHidden(elements.serverEmpty, true);
  setHidden(elements.serverContent, false);

  renderBadgeAvatar(elements.serverIcon, selectedGuild.name, selectedGuild.iconUrl);
  elements.serverName.textContent = selectedGuild.name;
  elements.serverSubtitle.textContent = `Derniere commande: ${formatDate(
    selectedGuild.lastCommandAt,
  )}`;

  if (selectedGuild.botInstalled === true) {
    elements.serverBotPill.textContent = "Bot detecte";
  } else if (selectedGuild.botInstalled === false) {
    elements.serverBotPill.textContent = "Bot absent";
  } else {
    elements.serverBotPill.textContent = "Etat du bot inconnu";
  }

  elements.serverGrid.innerHTML = [
    createServerCard(
      "Commandes serveur",
      formatNumber(selectedGuild.commands),
      "Total cumule sur ce serveur.",
      Math.min((selectedGuild.commands / 100000) * 100, 100),
    ),
    createServerCard(
      "Membres actifs",
      formatNumber(selectedGuild.activeMembers),
      "Membres touches recemment par le bot.",
      Math.min((selectedGuild.activeMembers / 5000) * 100, 100),
    ),
    createServerCard(
      "Retention",
      `${selectedGuild.retention}%`,
      "Retour estime des membres actifs.",
      selectedGuild.retention,
    ),
    createServerCard(
      "Modules actifs",
      formatNumber(selectedGuild.modulesEnabled),
      "Nombre de modules actifs sur ce serveur.",
      Math.min((selectedGuild.modulesEnabled / 10) * 100, 100),
    ),
    createServerCard(
      "Latence",
      `${selectedGuild.latencyMs} ms`,
      "Temps de reponse moyen du bot.",
      Math.max(10, 100 - selectedGuild.latencyMs),
    ),
    createServerCard(
      "Conversion premium",
      `${selectedGuild.conversionRate}%`,
      "Part des membres qui utilisent les options avancees.",
      selectedGuild.conversionRate,
    )
  ].join("");

  elements.serverGrid.querySelectorAll("[data-value]").forEach((element) => {
    animateValue(element, element.dataset.value);
  });
}

function renderDashboard(dashboard) {
  elements.refreshPill.textContent = `Auto refresh ${Math.round(
    dashboard.app.liveRefreshMs / 1000,
  )}s`;
  elements.lastUpdated.textContent = `Mis a jour ${formatDate(dashboard.lastUpdatedAt)}`;
  renderOverview(dashboard.overview);
  renderGuildSelect(dashboard.guilds, dashboard.selectedGuild?.id || "");
  renderSelectedGuild(dashboard.selectedGuild);
}

async function refresh() {
  const suffix = state.guildId ? `?guildId=${encodeURIComponent(state.guildId)}` : "";
  const dashboard = await fetchJson(`/api/dashboard${suffix}`);
  renderDashboard(dashboard);
}

async function init() {
  state.session = await fetchJson("/api/session");
  hydrateShell(state.session, "dashboard");

  state.guildId = getStoredGuildId() || state.session.guilds[0]?.id || "";
  await refresh();

  state.refreshTimer = startPolling(refresh, state.session.app.liveRefreshMs);
}

elements.guildSelect.addEventListener("change", async (event) => {
  state.guildId = event.target.value;
  setStoredGuildId(state.guildId);
  await refresh();
});

window.addEventListener("beforeunload", () => {
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
  }
});

init().catch((error) => {
  elements.serverEmpty.textContent = error.message;
  setHidden(elements.serverEmpty, false);
  setHidden(elements.serverContent, true);
});
