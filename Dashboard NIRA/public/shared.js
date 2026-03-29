const pageLabels = {
  activity: "Activite",
  dashboard: "Dashboard",
  home: "Accueil"
};

const guildStorageKey = "dashboardGuildId";

export function fetchJson(url) {
  return fetch(url).then(async (response) => {
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Erreur ${response.status}`);
    }

    return response.json();
  });
}

export function formatDate(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(Number(value || 0));
}

export function getStoredGuildId() {
  return window.localStorage.getItem(guildStorageKey) || "";
}

export function setStoredGuildId(guildId) {
  if (guildId) {
    window.localStorage.setItem(guildStorageKey, guildId);
    return;
  }

  window.localStorage.removeItem(guildStorageKey);
}

export function setHidden(element, hidden) {
  element.classList.toggle("hidden", hidden);
}

function parseAnimatedValue(rawValue) {
  const text = String(rawValue ?? "").trim();
  const match = text.match(/^([^0-9-]*)(-?[\d\s.,]+)(.*)$/);

  if (!match) {
    return null;
  }

  const normalizedNumber = match[2]
    .replace(/\s+/gu, "")
    .replace(/\u202f/gu, "")
    .replace(/\u00a0/gu, "")
    .replace(",", ".");
  const parsedValue = Number.parseFloat(normalizedNumber);

  if (Number.isNaN(parsedValue)) {
    return null;
  }

  return {
    prefix: match[1],
    suffix: match[3],
    value: parsedValue
  };
}

export function animateValue(element, rawValue) {
  const nextText = String(rawValue ?? "");

  if (element.dataset.displayValue === nextText) {
    return;
  }

  const nextParsed = parseAnimatedValue(nextText);
  const currentParsed =
    parseAnimatedValue(element.dataset.displayValue || element.textContent || "0") || {
      prefix: "",
      suffix: nextParsed?.suffix || "",
      value: 0
    };

  if (!nextParsed) {
    element.textContent = nextText;
    element.dataset.displayValue = nextText;
    return;
  }

  const duration = 700;
  const start = performance.now();
  const from = currentParsed.value;
  const to = nextParsed.value;
  const decimals = Number.isInteger(to) ? 0 : 1;

  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const currentValue = from + (to - from) * progress;
    const renderedNumber =
      decimals === 0
        ? formatNumber(Math.round(currentValue))
        : currentValue.toFixed(decimals).replace(".", ",");

    element.textContent = `${nextParsed.prefix}${renderedNumber}${nextParsed.suffix}`;

    if (progress < 1) {
      window.requestAnimationFrame(step);
      return;
    }

    element.textContent = nextText;
    element.dataset.displayValue = nextText;
  };

  window.requestAnimationFrame(step);
}

function renderUserChip(session) {
  const userChip = document.getElementById("user-chip");
  const loginLink = document.getElementById("login-link");
  const logoutButton = document.getElementById("logout-button");

  if (!userChip || !loginLink || !logoutButton) {
    return;
  }

  if (session.authenticated && session.user) {
    userChip.innerHTML = `
      <div class="avatar-shell">
        <img src="${session.user.avatarUrl}" alt="${session.user.username}" />
      </div>
      <span>${session.user.globalName}</span>
    `;

    setHidden(userChip, false);
    setHidden(logoutButton, false);
    setHidden(loginLink, true);
    return;
  }

  userChip.innerHTML = "";
  setHidden(userChip, true);
  setHidden(logoutButton, true);
  setHidden(loginLink, false);
}

function bindLogout() {
  const logoutButton = document.getElementById("logout-button");

  if (!logoutButton || logoutButton.dataset.bound === "true") {
    return;
  }

  logoutButton.dataset.bound = "true";
  logoutButton.addEventListener("click", async () => {
    await fetch("/auth/logout", {
      method: "POST"
    });

    window.location.href = "/";
  });
}

export function hydrateShell(session, currentPage) {
  document.querySelectorAll("[data-app-name]").forEach((element) => {
    element.textContent = session.app.name;
  });

  document.querySelectorAll("[data-app-logo]").forEach((element) => {
    element.setAttribute("src", session.app.logoUrl);
    element.setAttribute("alt", session.app.name);
  });

  document.querySelectorAll("[data-nav]").forEach((element) => {
    element.classList.toggle("is-active", element.dataset.nav === currentPage);
  });

  document.title = `${session.app.name} - ${pageLabels[currentPage] || "Dashboard"}`;

  renderUserChip(session);
  bindLogout();
}

export function renderBadgeAvatar(container, label, imageUrl) {
  if (imageUrl) {
    container.innerHTML = `<img src="${imageUrl}" alt="${label}" />`;
    return;
  }

  container.innerHTML = `<span class="initial-badge">${String(label || "?")
    .slice(0, 1)
    .toUpperCase()}</span>`;
}

export function startPolling(callback, intervalMs) {
  return window.setInterval(callback, intervalMs);
}
