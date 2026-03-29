const Database = require('better-sqlite3');
const path = require('node:path');

const db = new Database(path.join(__dirname, 'nira.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS dashboard_guild_stats (
    guild_id TEXT PRIMARY KEY,
    commands_total INTEGER DEFAULT 0,
    last_command_name TEXT,
    last_command_at TEXT
  );

  CREATE TABLE IF NOT EXISTS dashboard_seen_users (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS dashboard_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL
  );
`);

function getCount(query, params = []) {
  return db.prepare(query).get(...params).count || 0;
}

function touchDashboardUser(guildId, userId) {
  if (!guildId || !userId) {
    return;
  }

  db.prepare(`
    INSERT INTO dashboard_seen_users (guild_id, user_id, last_seen_at)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET last_seen_at = excluded.last_seen_at
  `).run(guildId, userId, new Date().toISOString());
}

function incrementDashboardCommand(guildId, commandName) {
  if (!guildId) {
    return;
  }

  db.prepare(`
    INSERT INTO dashboard_guild_stats (guild_id, commands_total, last_command_name, last_command_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(guild_id)
    DO UPDATE SET
      commands_total = commands_total + 1,
      last_command_name = excluded.last_command_name,
      last_command_at = excluded.last_command_at
  `).run(guildId, commandName || null, new Date().toISOString());
}

function addDashboardEvent(guildId, title, description) {
  if (!title) {
    return;
  }

  db.prepare(`
    INSERT INTO dashboard_events (guild_id, title, description, created_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId || null, title, description || null, new Date().toISOString());
}

function getGuildConfig(guildId) {
  if (!guildId) {
    return null;
  }

  return db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId) || null;
}

function isModuleEnabled(guildId, moduleName) {
  const row = db.prepare(
    'SELECT enabled FROM modules WHERE guild_id = ? AND module_name = ?',
  ).get(guildId, moduleName);

  return row ? row.enabled === 1 : true;
}

function getReactionRoleCount(guildId) {
  return getCount('SELECT COUNT(*) AS count FROM reaction_roles WHERE guild_id = ?', [guildId]);
}

function getGuildCommandStats(guildId) {
  return db.prepare('SELECT * FROM dashboard_guild_stats WHERE guild_id = ?').get(guildId) || null;
}

function getSeenUsersCount(guildId, sinceIso = null) {
  if (!sinceIso) {
    return getCount(
      'SELECT COUNT(*) AS count FROM dashboard_seen_users WHERE guild_id = ?',
      [guildId],
    );
  }

  return getCount(
    'SELECT COUNT(*) AS count FROM dashboard_seen_users WHERE guild_id = ? AND last_seen_at >= ?',
    [guildId, sinceIso],
  );
}

function getTrackedUsersCount() {
  return getCount('SELECT COUNT(DISTINCT user_id) AS count FROM dashboard_seen_users');
}

function getTotalCommands() {
  return db.prepare('SELECT COALESCE(SUM(commands_total), 0) AS total FROM dashboard_guild_stats').get()
    .total || 0;
}

function getRecentEvents(limit) {
  return db.prepare(`
    SELECT guild_id, title, description, created_at
    FROM dashboard_events
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  addDashboardEvent,
  db,
  getGuildCommandStats,
  getGuildConfig,
  getReactionRoleCount,
  getRecentEvents,
  getSeenUsersCount,
  getTotalCommands,
  getTrackedUsersCount,
  incrementDashboardCommand,
  isModuleEnabled,
  touchDashboardUser,
};
