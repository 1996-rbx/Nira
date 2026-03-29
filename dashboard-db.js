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

function ensureGuildConfig(guildId) {
  if (!guildId) {
    return null;
  }

  let row = db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId);

  if (!row) {
    db.prepare('INSERT OR IGNORE INTO guilds (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId);
  }

  return row || null;
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
  return ensureGuildConfig(guildId);
}

function updateGuildConfig(guildId, data) {
  const entries = Object.entries(data || {}).filter(([, value]) => value !== undefined);

  if (!guildId || entries.length === 0) {
    return getGuildConfig(guildId);
  }

  ensureGuildConfig(guildId);

  const columns = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([, value]) => value);

  db.prepare(`UPDATE guilds SET ${columns} WHERE guild_id = ?`).run(...values, guildId);
  return getGuildConfig(guildId);
}

function isModuleEnabled(guildId, moduleName) {
  const row = db.prepare(
    'SELECT enabled FROM modules WHERE guild_id = ? AND module_name = ?',
  ).get(guildId, moduleName);

  return row ? row.enabled === 1 : true;
}

function setModuleEnabled(guildId, moduleName, enabled) {
  if (!guildId || !moduleName) {
    return;
  }

  db.prepare(`
    INSERT INTO modules (guild_id, module_name, enabled)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, module_name)
    DO UPDATE SET enabled = excluded.enabled
  `).run(guildId, moduleName, enabled ? 1 : 0);
}

function getReactionRoleCount(guildId) {
  return getCount('SELECT COUNT(*) AS count FROM reaction_roles WHERE guild_id = ?', [guildId]);
}

function listReactionRoles(guildId) {
  return db.prepare(`
    SELECT id, guild_id, channel_id, message_id, emoji, role_id
    FROM reaction_roles
    WHERE guild_id = ?
    ORDER BY id DESC
  `).all(guildId);
}

function addReactionRole(guildId, channelId, messageId, emoji, roleId) {
  db.prepare(`
    INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, channelId, messageId, emoji, roleId);
}

function removeReactionRoleById(guildId, reactionRoleId) {
  const row = db.prepare(`
    SELECT id, guild_id, channel_id, message_id, emoji, role_id
    FROM reaction_roles
    WHERE guild_id = ? AND id = ?
  `).get(guildId, reactionRoleId);

  if (!row) {
    return null;
  }

  db.prepare('DELETE FROM reaction_roles WHERE id = ? AND guild_id = ?').run(reactionRoleId, guildId);
  return row;
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

function getOpenTicketCount(guildId) {
  return getCount(
    "SELECT COUNT(*) AS count FROM tickets WHERE guild_id = ? AND status = 'open'",
    [guildId],
  );
}

module.exports = {
  addDashboardEvent,
  addReactionRole,
  db,
  ensureGuildConfig,
  getGuildCommandStats,
  getGuildConfig,
  getOpenTicketCount,
  getReactionRoleCount,
  getRecentEvents,
  getSeenUsersCount,
  getTotalCommands,
  getTrackedUsersCount,
  incrementDashboardCommand,
  isModuleEnabled,
  listReactionRoles,
  removeReactionRoleById,
  setModuleEnabled,
  touchDashboardUser,
  updateGuildConfig,
};
