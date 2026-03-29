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
  commandCatalogCard: document.getElementById("command-catalog-card"),
  controlCaptchaCard: document.getElementById("control-captcha-card"),
  controlContent: document.getElementById("control-content"),
  controlEmpty: document.getElementById("control-empty"),
  controlFeedback: document.getElementById("control-feedback"),
  controlGeneralCard: document.getElementById("control-general-card"),
  controlModePill: document.getElementById("control-mode-pill"),
  controlModulesCard: document.getElementById("control-modules-card"),
  controlReactionCard: document.getElementById("control-reaction-card"),
  controlSummary: document.getElementById("control-summary"),
  controlTicketCard: document.getElementById("control-ticket-card"),
  controlUpdated: document.getElementById("control-updated"),
  controlWelcomeCard: document.getElementById("control-welcome-card"),
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
  control: null,
  controlError: "",
  guildId: "",
  refreshTimer: null,
  session: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function createMetricCard(title, value, description) {
  return `
    <article class="info-card">
      <span class="metric-label">${escapeHtml(title)}</span>
      <strong class="metric-value" data-value="${escapeHtml(value)}">${escapeHtml(value)}</strong>
      <p class="muted">${escapeHtml(description)}</p>
    </article>
  `;
}

function createServerCard(title, value, description, progress) {
  return `
    <article class="info-card">
      <span class="metric-label">${escapeHtml(title)}</span>
      <strong class="metric-value" data-value="${escapeHtml(value)}">${escapeHtml(value)}</strong>
      <p class="muted">${escapeHtml(description)}</p>
      ${
        typeof progress === "number"
          ? `<div class="progress-track"><span style="width:${Math.max(
              0,
              Math.min(progress, 100)
            )}%"></span></div>`
          : ""
      }
    </article>
  `;
}

function buildStatusChip(label, variant = "remote") {
  return `<span class="status-chip is-${escapeHtml(variant)}">${escapeHtml(label)}</span>`;
}

function buildOptionItems(items, selectedValue, emptyLabel) {
  const options = [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...items.map(
      (item) => `
        <option value="${escapeHtml(item.id)}" ${item.id === selectedValue ? "selected" : ""}>
          ${escapeHtml(item.label)}
        </option>
      `
    )
  ];

  return options.join("");
}

function buildChannelOptions(control, selectedValue, emptyLabel, kinds) {
  const allowedKinds = new Set(kinds);
  const items = (control?.options?.channels || [])
    .filter((channel) => allowedKinds.has(channel.kind))
    .map((channel) => ({
      id: channel.id,
      label: channel.label
    }));

  return buildOptionItems(items, selectedValue, emptyLabel);
}

function buildRoleOptions(control, selectedValue, emptyLabel) {
  const items = (control?.options?.roles || []).map((role) => ({
    id: role.id,
    label: role.label
  }));

  return buildOptionItems(items, selectedValue, emptyLabel);
}

function buildLanguageOptions(selectedValue) {
  return buildOptionItems(
    [
      { id: "fr", label: "Francais" },
      { id: "en", label: "English" }
    ],
    selectedValue,
    "Choisir une langue"
  );
}

function showControlFeedback(message, type = "success") {
  elements.controlFeedback.textContent = message;
  elements.controlFeedback.className = `notice-card is-${type}`;
  setHidden(elements.controlFeedback, false);
}

function clearControlFeedback() {
  elements.controlFeedback.textContent = "";
  elements.controlFeedback.className = "notice-card hidden";
  setHidden(elements.controlFeedback, true);
}

function renderOverview(overview) {
  elements.overviewGrid.innerHTML = [
    createMetricCard(
      "Commandes lancees",
      formatNumber(overview.commandsTotal),
      "Compteur global depuis le debut du bot."
    ),
    createMetricCard(
      "Utilisateurs touches",
      formatNumber(overview.communitiesReached),
      "Audience totale atteinte par les fonctions du bot."
    ),
    createMetricCard(
      "Serveurs trackes",
      formatNumber(overview.serversTracked),
      "Serveurs actuellement suivis par le dashboard."
    ),
    createMetricCard(
      "Latence moyenne",
      `${overview.latencyMs} ms`,
      "Temps de reponse moyen remonte par le live dashboard."
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
    selectedGuild.lastCommandAt
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
      Math.min((selectedGuild.commands / 100000) * 100, 100)
    ),
    createServerCard(
      "Membres actifs",
      formatNumber(selectedGuild.activeMembers),
      "Membres touches recemment par le bot.",
      Math.min((selectedGuild.activeMembers / 5000) * 100, 100)
    ),
    createServerCard(
      "Retention",
      `${selectedGuild.retention}%`,
      "Retour estime des membres actifs.",
      selectedGuild.retention
    ),
    createServerCard(
      "Modules actifs",
      formatNumber(selectedGuild.modulesEnabled),
      "Nombre de modules actifs sur ce serveur.",
      Math.min((selectedGuild.modulesEnabled / 10) * 100, 100)
    ),
    createServerCard(
      "Latence",
      `${selectedGuild.latencyMs} ms`,
      "Temps de reponse moyen du bot.",
      Math.max(10, 100 - selectedGuild.latencyMs)
    ),
    createServerCard(
      "Conversion premium",
      `${selectedGuild.conversionRate}%`,
      "Part des membres qui utilisent les options avancees.",
      selectedGuild.conversionRate
    )
  ].join("");

  elements.serverGrid.querySelectorAll("[data-value]").forEach((element) => {
    animateValue(element, element.dataset.value);
  });
}

function renderDashboard(dashboard) {
  elements.refreshPill.textContent = `Auto refresh ${Math.round(
    dashboard.app.liveRefreshMs / 1000
  )}s`;
  elements.lastUpdated.textContent = `Mis a jour ${formatDate(dashboard.lastUpdatedAt)}`;
  renderOverview(dashboard.overview);
  renderGuildSelect(dashboard.guilds, dashboard.selectedGuild?.id || "");
  renderSelectedGuild(dashboard.selectedGuild);
}

function renderSummary(control) {
  const summary = control.summary;

  elements.controlSummary.innerHTML = [
    `
      <article class="summary-item">
        <span>Commandes detectees</span>
        <strong data-value="${summary.commandCount}">${summary.commandCount}</strong>
        <div class="command-tags">
          ${buildStatusChip(`${summary.dashboardReadyCount} pilotables`, "remote")}
        </div>
      </article>
    `,
    `
      <article class="summary-item">
        <span>Modules actifs</span>
        <strong data-value="${summary.enabledModuleCount}">${summary.enabledModuleCount}</strong>
        <div class="command-tags">
          ${buildStatusChip(summary.liveModeLabel, control.remote.connected ? "live" : "local")}
        </div>
      </article>
    `,
    `
      <article class="summary-item">
        <span>Automations serveur</span>
        <strong data-value="${summary.remoteFeaturesCount}">${summary.remoteFeaturesCount}</strong>
        <div class="command-tags">
          ${buildStatusChip(`${summary.reactionRolesCount} reaction role(s)`, "remote")}
        </div>
      </article>
    `
  ].join("");

  elements.controlSummary.querySelectorAll("[data-value]").forEach((element) => {
    animateValue(element, element.dataset.value);
  });
}

function buildToggleRow(name, title, description, checked) {
  return `
    <label class="toggle-item">
      <span class="toggle-copy">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </span>
      <span class="switch-control">
        <input type="checkbox" name="${escapeHtml(name)}" ${checked ? "checked" : ""} />
        <span></span>
      </span>
    </label>
  `;
}

function renderGeneralCard(control) {
  const general = control.settings.general;

  elements.controlGeneralCard.innerHTML = `
    <div class="admin-card-head">
      <div>
        <p class="eyebrow">General</p>
        <h3>Configuration globale</h3>
        <p class="muted">Retrouve ici les reglages de base qui remplacent les slash commands de configuration.</p>
      </div>
      ${buildStatusChip("/config", "remote")}
    </div>

    <form class="admin-form" data-control-form="save-general">
      <div class="field-grid">
        <label class="field-group">
          <span class="field-label">Prefixe</span>
          <input class="text-input" type="text" name="prefix" maxlength="8" value="${escapeHtml(
            general.prefix
          )}" />
        </label>

        <label class="field-group">
          <span class="field-label">Langue</span>
          <select class="select-control" name="language">
            ${buildLanguageOptions(general.language)}
          </select>
        </label>
      </div>

      <label class="field-group">
        <span class="field-label">Salon de logs</span>
        <select class="select-control" name="logChannelId">
          ${buildChannelOptions(control, general.logChannelId, "Aucun salon de logs", ["text"])}
        </select>
      </label>

      <div class="admin-actions">
        <span class="muted-inline">Equivalent des commandes /config logs, /config prefix et /config langue.</span>
        <button class="primary-button" type="submit">Enregistrer</button>
      </div>
    </form>
  `;
}

function renderModulesCard(control) {
  const modules = control.settings.modules;

  elements.controlModulesCard.innerHTML = `
    <div class="admin-card-head">
      <div>
        <p class="eyebrow">Modules</p>
        <h3>Activation rapide</h3>
        <p class="muted">Tu peux remplacer /module et une partie des boutons systeme directement depuis le dashboard.</p>
      </div>
      ${buildStatusChip("/module", "remote")}
    </div>

    <form class="admin-form" data-control-form="save-modules">
      <div class="toggle-list">
        ${buildToggleRow("logs", "Logs", "Active ou coupe l'historique staff et les logs automatiques.", modules.logs)}
        ${buildToggleRow(
          "automod",
          "Auto-moderation",
          "Spam, insultes et liens d'invitation bloques par le bot.",
          modules.automod
        )}
        ${buildToggleRow(
          "antiraid",
          "Anti-raid",
          "Protection sur les vagues de joins suspectes.",
          modules.antiraid
        )}
        ${buildToggleRow("leveling", "Leveling", "XP, niveaux et progression serveur.", modules.leveling)}
        ${buildToggleRow("economy", "Economie", "Daily, balance et commandes monnaie.", modules.economy)}
        ${buildToggleRow("fun", "Fun", "Commande communautaires et utilitaires legers.", modules.fun)}
      </div>

      <div class="admin-actions">
        <span class="muted-inline">Les modules critiques sont synchronises directement dans la base du bot.</span>
        <button class="primary-button" type="submit">Sauvegarder</button>
      </div>
    </form>
  `;
}

function renderCaptchaCard(control) {
  const captcha = control.settings.captcha;

  elements.controlCaptchaCard.innerHTML = `
    <div class="admin-card-head">
      <div>
        <p class="eyebrow">Securite</p>
        <h3>Captcha & acces</h3>
        <p class="muted">Configuration distante du parcours captcha, comme /setup-captcha mais sans passer par Discord.</p>
      </div>
      ${buildStatusChip("/setup-captcha", "remote")}
    </div>

    <form class="admin-form" data-control-form="save-captcha">
      <div class="toggle-list">
        ${buildToggleRow(
          "enabled",
          "Activer le captcha",
          "Force les nouveaux membres a valider un code avant d'obtenir le role final.",
          captcha.enabled
        )}
      </div>

      <div class="field-grid">
        <label class="field-group">
          <span class="field-label">Salon captcha</span>
          <select class="select-control" name="channelId">
            ${buildChannelOptions(control, captcha.channelId, "Choisir un salon", ["text"])}
          </select>
        </label>

        <label class="field-group">
          <span class="field-label">Role apres validation</span>
          <select class="select-control" name="roleId">
            ${buildRoleOptions(control, captcha.roleId, "Choisir un role")}
          </select>
        </label>
      </div>

      <label class="field-group">
        <span class="field-label">Nombre d'essais</span>
        <input class="text-input" type="number" min="1" max="10" name="retryLimit" value="${escapeHtml(
          captcha.retryLimit
        )}" />
      </label>

      <div class="admin-actions">
        <span class="muted-inline">Les nouveaux membres sont geres par le meme systeme que le slash command du bot.</span>
        <button class="primary-button" type="submit">Appliquer</button>
      </div>
    </form>
  `;
}

function renderReactionCard(control) {
  const reactionRoles = control.settings.reactionRoles.entries;
  const reactionList = reactionRoles.length
    ? reactionRoles
        .map(
          (entry) => `
            <article class="reaction-entry">
              <div class="reaction-head">
                <strong>${escapeHtml(entry.emoji)} -> ${escapeHtml(entry.roleName)}</strong>
                <button
                  class="ghost-button"
                  type="button"
                  data-control-action="delete-reaction"
                  data-reaction-id="${escapeHtml(entry.id)}"
                >
                  Supprimer
                </button>
              </div>
              <div class="reaction-meta">
                <span class="code-chip">#${escapeHtml(entry.channelName)}</span>
                <span class="code-chip">${escapeHtml(entry.messageId)}</span>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-inline">Aucun reaction role configure pour ce serveur.</div>`;

  elements.controlReactionCard.innerHTML = `
    <div class="admin-card-head">
      <div>
        <p class="eyebrow">Roles</p>
        <h3>Reaction roles</h3>
        <p class="muted">Publie un message avec reaction et relie-le a un role, sans taper /setup-reaction.</p>
      </div>
      ${buildStatusChip("/setup-reaction", "remote")}
    </div>

    <form class="admin-form" data-control-form="create-reaction">
      <div class="field-grid">
        <label class="field-group">
          <span class="field-label">Salon cible</span>
          <select class="select-control" name="channelId">
            ${buildChannelOptions(control, "", "Choisir un salon", ["text"])}
          </select>
        </label>

        <label class="field-group">
          <span class="field-label">Role a donner</span>
          <select class="select-control" name="roleId">
            ${buildRoleOptions(control, "", "Choisir un role")}
          </select>
        </label>
      </div>

      <div class="field-grid">
        <label class="field-group">
          <span class="field-label">Emoji</span>
          <input class="text-input" type="text" name="emoji" placeholder=":emoji: ou emoji unicode" />
        </label>

        <label class="field-group">
          <span class="field-label">Compteur actuel</span>
          <input class="text-input" type="text" value="${escapeHtml(
            `${control.settings.reactionRoles.count} reaction role(s)`
          )}" disabled />
        </label>
      </div>

      <label class="field-group">
        <span class="field-label">Message a publier</span>
        <textarea class="textarea-control" name="message" placeholder="Choisis ton role en reagissant ci-dessous !"></textarea>
      </label>

      <div class="admin-actions">
        <span class="muted-inline">Le bot envoie le message, ajoute la reaction et stocke l'association role/emoji.</span>
        <button class="primary-button" type="submit">Publier le reaction role</button>
      </div>
    </form>

    <div class="list-stack">
      ${reactionList}
    </div>
  `;
}

function renderWelcomeCard(control) {
  const welcome = control.settings.welcome;

  elements.controlWelcomeCard.innerHTML = `
    <div class="admin-card-head">
      <div>
        <p class="eyebrow">Onboarding</p>
        <h3>Welcome embed</h3>
        <p class="muted">Le message d'accueil se regle ici avec les options utiles, comme sur les dashboards de bots Discord.</p>
      </div>
      ${buildStatusChip("welcome", "remote")}
    </div>

    <form class="admin-form" data-control-form="save-welcome">
      <div class="toggle-list">
        ${buildToggleRow(
          "enabled",
          "Activer le welcome",
          "Active le message d'accueil des nouveaux membres sur un salon choisi.",
          welcome.enabled
        )}
        ${buildToggleRow(
          "embed",
          "Format embed",
          "Utilise un embed propre plutot qu'un simple message brut.",
          welcome.embed
        )}
        ${buildToggleRow(
          "avatar",
          "Afficher l'avatar",
          "Ajoute l'avatar du membre dans le message de bienvenue.",
          welcome.avatar
        )}
      </div>

      <div class="field-grid">
        <label class="field-group">
          <span class="field-label">Salon welcome</span>
          <select class="select-control" name="channelId">
            ${buildChannelOptions(control, welcome.channelId, "Choisir un salon", ["text"])}
          </select>
        </label>

        <label class="field-group">
          <span class="field-label">Couleur</span>
          <input class="text-input" type="text" name="color" value="${escapeHtml(
            welcome.color
          )}" placeholder="#ff8a24" />
        </label>
      </div>

      <label class="field-group">
        <span class="field-label">Titre</span>
        <input class="text-input" type="text" name="title" maxlength="120" value="${escapeHtml(
          welcome.title
        )}" />
      </label>

      <label class="field-group">
        <span class="field-label">Message</span>
        <textarea class="textarea-control" name="message">${escapeHtml(welcome.message)}</textarea>
        <span class="helper-text">Variables supportees: {user}, {tag}, {username}, {server}, {count}</span>
      </label>

      <div class="admin-actions">
        <span class="muted-inline">Pense a garder un salon welcome et un texte court pour rester lisible.</span>
        <button class="primary-button" type="submit">Sauvegarder</button>
      </div>
    </form>
  `;
}

function renderTicketCard(control) {
  const tickets = control.settings.tickets;

  elements.controlTicketCard.innerHTML = `
    <div class="admin-card-head">
      <div>
        <p class="eyebrow">Support</p>
        <h3>Tickets & staff</h3>
        <p class="muted">Parametre les tickets, le role staff et la categorie de rangement depuis le dashboard.</p>
      </div>
      ${buildStatusChip("tickets", "remote")}
    </div>

    <form class="admin-form" data-control-form="save-tickets">
      <div class="toggle-list">
        ${buildToggleRow(
          "enabled",
          "Activer les tickets",
          "Utilise le salon et la categorie definis pour les futures ouvertures de tickets.",
          tickets.enabled
        )}
      </div>

      <div class="field-grid">
        <label class="field-group">
          <span class="field-label">Salon panneau tickets</span>
          <select class="select-control" name="channelId">
            ${buildChannelOptions(control, tickets.channelId, "Choisir un salon", ["text"])}
          </select>
        </label>

        <label class="field-group">
          <span class="field-label">Role staff</span>
          <select class="select-control" name="staffRoleId">
            ${buildRoleOptions(control, tickets.staffRoleId, "Choisir un role")}
          </select>
        </label>
      </div>

      <label class="field-group">
        <span class="field-label">Categorie tickets</span>
        <select class="select-control" name="categoryId">
          ${buildChannelOptions(control, tickets.categoryId, "Choisir une categorie", ["category"])}
        </select>
      </label>

      <div class="admin-actions">
        <span class="muted-inline">${escapeHtml(
          `${tickets.openCount} ticket(s) ouverts, ${tickets.ticketCount} ticket(s) cumules.`
        )}</span>
        <button class="primary-button" type="submit">Mettre a jour</button>
      </div>
    </form>
  `;
}

function renderCommandCatalog(control) {
  const groupsMarkup = control.commands
    .map(
      (group) => `
        <section class="command-group">
          <div class="admin-card-head">
            <div>
              <p class="eyebrow">${escapeHtml(group.category)}</p>
              <h3>${escapeHtml(group.title)}</h3>
              <p class="muted">${escapeHtml(group.description)}</p>
            </div>
            ${buildStatusChip(`${group.items.length} commandes`, "remote")}
          </div>

          <div class="command-group-list">
            ${group.items
              .map(
                (item) => `
                  <article class="command-item">
                    <div class="command-head">
                      <strong>${escapeHtml(item.label)}</strong>
                      <div class="command-tags">
                        ${buildStatusChip(item.remoteReady ? "Dashboard" : "Discord", item.remoteReady ? "remote" : "local")}
                        ${item.permissions ? buildStatusChip(item.permissions, "local") : ""}
                      </div>
                    </div>
                    <p>${escapeHtml(item.description)}</p>
                    <div class="command-tags">
                      ${item.hint ? `<span class="code-chip">${escapeHtml(item.hint)}</span>` : ""}
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `
    )
    .join("");

  elements.commandCatalogCard.innerHTML = `
    <div class="admin-card-head">
      <div>
        <p class="eyebrow">Catalogue</p>
        <h3>Toutes les commandes du bot</h3>
        <p class="muted">Les commandes sont regroupees ici avec un badge clair pour voir ce qui se gere deja dans le dashboard.</p>
      </div>
      ${buildStatusChip(`${control.summary.commandCount} commandes`, "remote")}
    </div>

    <div class="command-groups">
      ${groupsMarkup}
    </div>
  `;
}

function renderControlSection() {
  if (!state.session?.authenticated) {
    elements.controlModePill.textContent = "Connexion requise";
    elements.controlUpdated.textContent = "Connecte Discord pour debloquer le pilotage.";
    elements.controlEmpty.textContent =
      "Connecte Discord et choisis un serveur pour piloter les modules et retrouver toutes les commandes du bot.";
    setHidden(elements.controlEmpty, false);
    setHidden(elements.controlContent, true);
    return;
  }

  if (!state.guildId) {
    elements.controlModePill.textContent = "Serveur requis";
    elements.controlUpdated.textContent = "Selectionne un serveur";
    elements.controlEmpty.textContent =
      "Selectionne un serveur dans la liste ci-dessus pour charger les formulaires de gestion distante.";
    setHidden(elements.controlEmpty, false);
    setHidden(elements.controlContent, true);
    return;
  }

  if (state.controlError) {
    elements.controlModePill.textContent = "Indisponible";
    elements.controlUpdated.textContent = "Pont distant en erreur";
    elements.controlEmpty.textContent = state.controlError;
    setHidden(elements.controlEmpty, false);
    setHidden(elements.controlContent, true);
    return;
  }

  if (!state.control) {
    elements.controlModePill.textContent = "Chargement";
    elements.controlUpdated.textContent = "Synchronisation du bot";
    elements.controlEmpty.textContent = "Le dashboard charge la configuration distante du bot...";
    setHidden(elements.controlEmpty, false);
    setHidden(elements.controlContent, true);
    return;
  }

  const control = state.control;

  elements.controlModePill.textContent = control.remote.connected
    ? "Pilotage live du bot"
    : "Catalogue local";
  elements.controlUpdated.textContent = `Maj ${formatDate(control.lastUpdatedAt)}`;

  renderSummary(control);
  renderGeneralCard(control);
  renderModulesCard(control);
  renderCaptchaCard(control);
  renderReactionCard(control);
  renderWelcomeCard(control);
  renderTicketCard(control);
  renderCommandCatalog(control);

  setHidden(elements.controlEmpty, true);
  setHidden(elements.controlContent, false);
}

function collectCheckbox(form, name) {
  return form.querySelector(`input[name="${name}"]`)?.checked || false;
}

function collectValue(form, name) {
  return form.querySelector(`[name="${name}"]`)?.value?.trim?.() ?? "";
}

function buildPayloadFromForm(form) {
  const action = form.dataset.controlForm;

  if (action === "save-general") {
    return {
      action,
      data: {
        language: collectValue(form, "language") || "fr",
        logChannelId: collectValue(form, "logChannelId") || null,
        prefix: collectValue(form, "prefix") || "!"
      }
    };
  }

  if (action === "save-modules") {
    return {
      action,
      data: {
        antiraid: collectCheckbox(form, "antiraid"),
        automod: collectCheckbox(form, "automod"),
        economy: collectCheckbox(form, "economy"),
        fun: collectCheckbox(form, "fun"),
        leveling: collectCheckbox(form, "leveling"),
        logs: collectCheckbox(form, "logs")
      }
    };
  }

  if (action === "save-captcha") {
    return {
      action,
      data: {
        channelId: collectValue(form, "channelId") || null,
        enabled: collectCheckbox(form, "enabled"),
        retryLimit: Number.parseInt(collectValue(form, "retryLimit") || "3", 10),
        roleId: collectValue(form, "roleId") || null
      }
    };
  }

  if (action === "save-welcome") {
    return {
      action,
      data: {
        avatar: collectCheckbox(form, "avatar"),
        channelId: collectValue(form, "channelId") || null,
        color: collectValue(form, "color") || "#ff8a24",
        embed: collectCheckbox(form, "embed"),
        enabled: collectCheckbox(form, "enabled"),
        message: collectValue(form, "message"),
        title: collectValue(form, "title") || "Bienvenue !"
      }
    };
  }

  if (action === "save-tickets") {
    return {
      action,
      data: {
        categoryId: collectValue(form, "categoryId") || null,
        channelId: collectValue(form, "channelId") || null,
        enabled: collectCheckbox(form, "enabled"),
        staffRoleId: collectValue(form, "staffRoleId") || null
      }
    };
  }

  if (action === "create-reaction") {
    return {
      action,
      data: {
        channelId: collectValue(form, "channelId") || null,
        emoji: collectValue(form, "emoji"),
        message: collectValue(form, "message"),
        roleId: collectValue(form, "roleId") || null
      }
    };
  }

  return null;
}

async function postControlAction(payload) {
  if (!state.guildId) {
    return;
  }

  showControlFeedback("Synchronisation avec le bot en cours...", "success");

  const response = await fetch(`/api/control?guildId=${encodeURIComponent(state.guildId)}`, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    method: "POST"
  });

  const rawMessage = await response.text();
  let result = {};

  if (rawMessage) {
    try {
      result = JSON.parse(rawMessage);
    } catch {
      result = {
        message: rawMessage
      };
    }
  }

  if (!response.ok) {
    throw new Error(result.message || result.error || `Erreur ${response.status}`);
  }

  showControlFeedback(result.message || "Configuration synchronisee avec le bot.", "success");
  await refresh();
}

async function refresh() {
  const suffix = state.guildId ? `?guildId=${encodeURIComponent(state.guildId)}` : "";
  const dashboardPromise = fetchJson(`/api/dashboard${suffix}`);
  const controlPromise =
    state.session?.authenticated && state.guildId
      ? fetchJson(`/api/control${suffix}`).catch((error) => ({
          __error: error.message
        }))
      : Promise.resolve(null);

  const [dashboard, controlPayload] = await Promise.all([dashboardPromise, controlPromise]);

  renderDashboard(dashboard);

  if (controlPayload?.__error) {
    state.control = null;
    state.controlError = controlPayload.__error;
  } else {
    state.control = controlPayload;
    state.controlError = "";
  }

  renderControlSection();
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
  clearControlFeedback();
  await refresh();
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-control-form]");

  if (!form) {
    return;
  }

  event.preventDefault();

  const payload = buildPayloadFromForm(form);

  if (!payload) {
    return;
  }

  try {
    await postControlAction(payload);
  } catch (error) {
    showControlFeedback(error.message, "error");
  }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-control-action]");

  if (!button) {
    return;
  }

  if (button.dataset.controlAction === "delete-reaction") {
    try {
      await postControlAction({
        action: "delete-reaction",
        data: {
          reactionRoleId: button.dataset.reactionId
        }
      });
    } catch (error) {
      showControlFeedback(error.message, "error");
    }
  }
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
  state.controlError = error.message;
  renderControlSection();
});
