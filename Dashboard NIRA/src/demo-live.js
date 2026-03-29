import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const activityTemplates = [
  {
    title: "Pic d'utilisation detecte",
    description: (overview) =>
      `${overview.commandsTotal.toLocaleString("fr-FR")} commandes cumulees, la courbe continue de grimper.`
  },
  {
    title: "Nouveau serveur actif",
    description: (overview) =>
      `${overview.serversTracked.toLocaleString("fr-FR")} serveurs sont maintenant suivis par le dashboard.`
  },
  {
    title: "Latence stabilisee",
    description: (overview) => `La latence moyenne tourne autour de ${overview.latencyMs} ms.`
  },
  {
    title: "Communautes en hausse",
    description: (overview) =>
      `${overview.communitiesReached.toLocaleString("fr-FR")} utilisateurs ont deja interagi avec le bot.`
  },
  {
    title: "Automations en mouvement",
    description: (overview) =>
      `${overview.automationsRunning.toLocaleString("fr-FR")} routines actives tournent cote bot.`
  }
];

let liveTimer = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createInitialState() {
  const baseMetrics = readJsonFile(config.dataFilePath, {});
  const liveMetrics = readJsonFile(config.liveDataFilePath, {});
  const mergedOverview = {
    commandsTotal: 0,
    communitiesReached: 0,
    serversTracked: 0,
    uptimePercent: 99.9,
    latencyMs: 48,
    automationsRunning: 1,
    ...(baseMetrics.overview || {}),
    ...(liveMetrics.overview || {})
  };

  return {
    demoTick: Number(liveMetrics.demoTick || 0),
    guildMetrics: { ...(liveMetrics.guildMetrics || {}) },
    overview: mergedOverview,
    recentActivity:
      (liveMetrics.recentActivity || baseMetrics.recentActivity || []).slice(0, 10)
  };
}

function updateOverview(state) {
  state.demoTick += 1;
  state.overview.commandsTotal += 6 + (state.demoTick % 11);
  state.overview.communitiesReached += state.demoTick % 4 === 0 ? 1 : 0;

  if (state.demoTick % 8 === 0) {
    state.overview.serversTracked = Math.max(
      1,
      state.overview.serversTracked + (state.demoTick % 16 === 0 ? 1 : 0),
    );
  }

  state.overview.uptimePercent = Number(
    clamp(
      99.82 + ((state.demoTick % 5) * 0.03),
      99.82,
      99.98,
    ).toFixed(2),
  );
  state.overview.latencyMs = clamp(
    state.overview.latencyMs + ((state.demoTick % 2 === 0 ? 1 : -1) * (2 + (state.demoTick % 3))),
    36,
    74,
  );
  state.overview.automationsRunning = clamp(
    state.overview.automationsRunning + (state.demoTick % 6 === 0 ? 1 : 0),
    1,
    9999,
  );
}

function updateGuildMetrics(state) {
  Object.values(state.guildMetrics).forEach((guildMetric, index) => {
    guildMetric.commands = Number(guildMetric.commands || 0) + 2 + ((state.demoTick + index) % 6);
    guildMetric.activeMembers = clamp(
      Number(guildMetric.activeMembers || 0) + (((state.demoTick + index) % 5) - 1),
      10,
      500000,
    );
    guildMetric.retention = clamp(
      Number(guildMetric.retention || 70) + (((state.demoTick + index) % 3) - 1),
      45,
      99,
    );
    guildMetric.modulesEnabled = clamp(Number(guildMetric.modulesEnabled || 1), 1, 20);
    guildMetric.latencyMs = clamp(
      Number(guildMetric.latencyMs || state.overview.latencyMs) + ((state.demoTick + index) % 2 === 0 ? 1 : -1),
      28,
      90,
    );
    guildMetric.conversionRate = clamp(
      Number(guildMetric.conversionRate || 20) + (((state.demoTick + index) % 3) - 1),
      5,
      95,
    );
    guildMetric.lastCommandAt = new Date().toISOString();
  });
}

function updateActivity(state) {
  const template = activityTemplates[state.demoTick % activityTemplates.length];
  const activityEntry = {
    description: template.description(state.overview),
    timestamp: new Date().toISOString(),
    title: template.title
  };

  state.recentActivity = [activityEntry, ...state.recentActivity]
    .filter((entry) => entry && entry.title && entry.timestamp)
    .slice(0, 10);
}

function buildPayload(state) {
  return {
    demoTick: state.demoTick,
    guildMetrics: state.guildMetrics,
    overview: state.overview,
    recentActivity: state.recentActivity
  };
}

function tick(state) {
  updateOverview(state);
  updateGuildMetrics(state);
  updateActivity(state);
  writeJsonFile(config.liveDataFilePath, buildPayload(state));
}

export function startDemoLiveMetrics() {
  if (config.liveMetricsUrl || !config.demoLiveEnabled || liveTimer) {
    return () => {};
  }

  const state = createInitialState();
  const intervalMs = Math.max(2500, config.liveRefreshMs || 2500);

  tick(state);
  liveTimer = setInterval(() => tick(state), intervalMs);
  liveTimer.unref?.();

  console.log(`Mode demo actif: data/live-metrics.json sera actualise toutes les ${intervalMs} ms.`);

  return () => {
    if (liveTimer) {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  };
}
