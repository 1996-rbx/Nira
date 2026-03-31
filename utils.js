const { createCanvas } = require('canvas');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
// ═══════════════════════════════════════════════════════════════
//  DATABASE
// ═══════════════════════════════════════════════════════════════
const db = new Database(path.join(__dirname, 'nira.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS guilds (
    guild_id TEXT PRIMARY KEY,
    prefix TEXT DEFAULT '!',
    language TEXT DEFAULT 'fr',
    log_channel TEXT,
    captcha_enabled INTEGER DEFAULT 0,
    captcha_channel TEXT,
    captcha_role TEXT,
    captcha_retry_limit INTEGER DEFAULT 3,
    automod_enabled INTEGER DEFAULT 0,
    antiraid_enabled INTEGER DEFAULT 0,
    leveling_enabled INTEGER DEFAULT 1,
    welcome_channel TEXT,
    welcome_message TEXT DEFAULT 'Bienvenue {user} sur **{server}** ! Tu es le membre numéro **{count}**.',
    welcome_embed INTEGER DEFAULT 1,
    welcome_color TEXT DEFAULT '#5865F2',
    welcome_title TEXT DEFAULT 'Bienvenue !',
    welcome_avatar INTEGER DEFAULT 1,
    ticket_channel TEXT,
    ticket_staff_role TEXT,
    ticket_category TEXT,
    ticket_count INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS reaction_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    role_id TEXT NOT NULL,
    UNIQUE(message_id, emoji)
  );
  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS levels (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    last_message TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS economy (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    balance INTEGER DEFAULT 0,
    last_daily TEXT,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    prize TEXT NOT NULL,
    winner_count INTEGER DEFAULT 1,
    end_time TEXT NOT NULL,
    ended INTEGER DEFAULT 0,
    host_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS giveaway_entries (
    giveaway_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (giveaway_id, user_id),
    FOREIGN KEY (giveaway_id) REFERENCES giveaways(id)
  );
  CREATE TABLE IF NOT EXISTS captcha_pending (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    code TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS mod_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    moderator_id TEXT,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS mutes (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    unmute_at TEXT,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS modules (
    guild_id TEXT NOT NULL,
    module_name TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    PRIMARY KEY (guild_id, module_name)
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    ticket_number INTEGER NOT NULL,
    status TEXT DEFAULT 'open',
    claimed_by TEXT,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    closed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS statistics_channels (
    guild_id TEXT NOT NULL,
    type TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, type)
  );
  CREATE TABLE IF NOT EXISTS member_statistics (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  voice_time INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
  );

CREATE TABLE IF NOT EXISTS voice_sessions (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
  );
`);

// Migration: add new columns to existing guilds table if they don't exist
const guildCols = db.prepare("PRAGMA table_info(guilds)").all().map(c => c.name);
const newCols = [
  ['welcome_channel',   'TEXT'],
  ['welcome_message',   "TEXT DEFAULT 'Bienvenue {user} sur **{server}** !'"],
  ['welcome_embed',     'INTEGER DEFAULT 1'],
  ['welcome_color',     "TEXT DEFAULT '#5865F2'"],
  ['welcome_title',     "TEXT DEFAULT 'Bienvenue !'"],
  ['welcome_avatar',    'INTEGER DEFAULT 1'],
  ['ticket_channel',    'TEXT'],
  ['ticket_staff_role', 'TEXT'],
  ['ticket_category',   'TEXT'],
  ['ticket_count',      'INTEGER DEFAULT 0'],
];
for (const [col, type] of newCols) {
  if (!guildCols.includes(col)) {
    db.prepare(`ALTER TABLE guilds ADD COLUMN ${col} ${type}`).run();
  }
}

// ═══════════════════════════════════════════════════════════════
//  DATABASE HELPERS
// ═══════════════════════════════════════════════════════════════
const dbHelpers = {
  // ── Guild ──────────────────────────────────────────────────
  getGuild(guildId) {
    let row = db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare('INSERT OR IGNORE INTO guilds (guild_id) VALUES (?)').run(guildId);
      row = db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId);
    }
    return row;
  },
  updateGuild(guildId, data) {
    const keys = Object.keys(data);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => data[k]);
    db.prepare(`UPDATE guilds SET ${sets} WHERE guild_id = ?`).run(...values, guildId);
  },

  // ── Reaction Roles ─────────────────────────────────────────
  addReactionRole(guildId, channelId, messageId, emoji, roleId) {
    db.prepare('INSERT OR REPLACE INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, channelId, messageId, emoji, roleId);
  },
  getReactionRole(messageId, emoji) {
    return db.prepare('SELECT * FROM reaction_roles WHERE message_id = ? AND emoji = ?').get(messageId, emoji);
  },
  getReactionRolesByMessage(messageId) {
    return db.prepare('SELECT * FROM reaction_roles WHERE message_id = ?').all(messageId);
  },
  removeReactionRole(messageId, emoji) {
    db.prepare('DELETE FROM reaction_roles WHERE message_id = ? AND emoji = ?').run(messageId, emoji);
  },

  // ── Warnings ───────────────────────────────────────────────
  addWarning(guildId, userId, modId, reason) {
    db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)')
      .run(guildId, userId, modId, reason);
    return db.prepare('SELECT COUNT(*) as count FROM warnings WHERE guild_id = ? AND user_id = ?').get(guildId, userId).count;
  },
  getWarnings(guildId, userId) {
    return db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC').all(guildId, userId);
  },
  clearWarnings(guildId, userId) {
    db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  },

  // ── Leveling ───────────────────────────────────────────────
  getLevel(guildId, userId) {
    let row = db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    if (!row) {
      db.prepare('INSERT OR IGNORE INTO levels (guild_id, user_id) VALUES (?, ?)').run(guildId, userId);
      row = { guild_id: guildId, user_id: userId, xp: 0, level: 0 };
    }
    return row;
  },
  addXP(guildId, userId, amount) {
    this.getLevel(guildId, userId);
    const now = new Date().toISOString();
    db.prepare('UPDATE levels SET xp = xp + ?, last_message = ? WHERE guild_id = ? AND user_id = ?')
      .run(amount, now, guildId, userId);
    const row = db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    const requiredXP = getRequiredXP(row.level);
    if (row.xp >= requiredXP) {
      db.prepare('UPDATE levels SET level = level + 1, xp = xp - ? WHERE guild_id = ? AND user_id = ?')
        .run(requiredXP, guildId, userId);
      return { leveledUp: true, newLevel: row.level + 1 };
    }
    return { leveledUp: false };
  },
  getLeaderboard(guildId, limit = 10) {
    return db.prepare('SELECT * FROM levels WHERE guild_id = ? ORDER BY level DESC, xp DESC LIMIT ?').all(guildId, limit);
  },

  // ── Economy ────────────────────────────────────────────────
  getBalance(guildId, userId) {
    let row = db.prepare('SELECT * FROM economy WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    if (!row) {
      db.prepare('INSERT OR IGNORE INTO economy (guild_id, user_id) VALUES (?, ?)').run(guildId, userId);
      row = { guild_id: guildId, user_id: userId, balance: 0, last_daily: null };
    }
    return row;
  },
  addBalance(guildId, userId, amount) {
    this.getBalance(guildId, userId);
    db.prepare('UPDATE economy SET balance = balance + ? WHERE guild_id = ? AND user_id = ?').run(amount, guildId, userId);
  },
  claimDaily(guildId, userId) {
    const eco = this.getBalance(guildId, userId);
    const now = new Date();
    if (eco.last_daily) {
      const diff = now - new Date(eco.last_daily);
      if (diff < 86400000) {
        const remaining = 86400000 - diff;
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        return { success: false, remaining: `${hours}h ${minutes}m` };
      }
    }
    const reward = 100 + Math.floor(Math.random() * 50);
    db.prepare('UPDATE economy SET balance = balance + ?, last_daily = ? WHERE guild_id = ? AND user_id = ?')
      .run(reward, now.toISOString(), guildId, userId);
    return { success: true, reward, newBalance: eco.balance + reward };
  },

  // ── Captcha ────────────────────────────────────────────────
  setCaptcha(guildId, userId, code) {
    db.prepare('INSERT OR REPLACE INTO captcha_pending (guild_id, user_id, code, attempts) VALUES (?, ?, ?, 0)')
      .run(guildId, userId, code);
  },
  getCaptcha(guildId, userId) {
    return db.prepare('SELECT * FROM captcha_pending WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  },
  incrementCaptchaAttempt(guildId, userId) {
    db.prepare('UPDATE captcha_pending SET attempts = attempts + 1 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  },
  removeCaptcha(guildId, userId) {
    db.prepare('DELETE FROM captcha_pending WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  },

  // ── Mod Logs ───────────────────────────────────────────────
  addModLog(guildId, action, targetId, modId, reason) {
    db.prepare('INSERT INTO mod_logs (guild_id, action, target_id, moderator_id, reason) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, action, targetId, modId, reason);
  },
  getModLogs(guildId, limit = 20) {
    return db.prepare('SELECT * FROM mod_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit);
  },

  // ── Mutes ──────────────────────────────────────────────────
  addMute(guildId, userId, unmuteAt) {
    db.prepare('INSERT OR REPLACE INTO mutes (guild_id, user_id, unmute_at) VALUES (?, ?, ?)').run(guildId, userId, unmuteAt);
  },
  removeMute(guildId, userId) {
    db.prepare('DELETE FROM mutes WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  },
  getExpiredMutes() {
    return db.prepare("SELECT * FROM mutes WHERE unmute_at <= datetime('now')").all();
  },

  // ── Giveaways ──────────────────────────────────────────────
  createGiveaway(guildId, channelId, messageId, prize, winnerCount, endTime, hostId) {
    const info = db.prepare('INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winner_count, end_time, host_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(guildId, channelId, messageId, prize, winnerCount, endTime, hostId);
    return info.lastInsertRowid;
  },
  enterGiveaway(giveawayId, userId) {
    db.prepare('INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)').run(giveawayId, userId);
  },
  getGiveawayEntries(giveawayId) {
    return db.prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?').all(giveawayId);
  },
  getActiveGiveaways() {
    return db.prepare("SELECT * FROM giveaways WHERE ended = 0 AND end_time <= datetime('now')").all();
  },
  endGiveaway(giveawayId) {
    db.prepare('UPDATE giveaways SET ended = 1 WHERE id = ?').run(giveawayId);
  },

  // ── Modules ────────────────────────────────────────────────
  isModuleEnabled(guildId, moduleName) {
    const row = db.prepare('SELECT enabled FROM modules WHERE guild_id = ? AND module_name = ?').get(guildId, moduleName);
    return row ? row.enabled === 1 : true;
  },
  setModule(guildId, moduleName, enabled) {
    db.prepare('INSERT OR REPLACE INTO modules (guild_id, module_name, enabled) VALUES (?, ?, ?)').run(guildId, moduleName, enabled ? 1 : 0);
  },

  // ── Tickets ────────────────────────────────────────────────
  createTicket(guildId, channelId, userId, ticketNumber, reason) {
    const info = db.prepare('INSERT INTO tickets (guild_id, channel_id, user_id, ticket_number, reason) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, channelId, userId, ticketNumber, reason || null);
    // Increment counter
    db.prepare('UPDATE guilds SET ticket_count = ticket_count + 1 WHERE guild_id = ?').run(guildId);
    return info.lastInsertRowid;
  },
  getTicketByChannel(channelId) {
    return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
  },
  getOpenTickets(guildId) {
    return db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC").all(guildId);
  },
  closeTicket(channelId) {
    db.prepare("UPDATE tickets SET status = 'closed', closed_at = datetime('now') WHERE channel_id = ?").run(channelId);
  },
  claimTicket(channelId, modId) {
    db.prepare("UPDATE tickets SET claimed_by = ? WHERE channel_id = ?").run(modId, channelId);
  },
  getTicketCount(guildId) {
    const row = db.prepare('SELECT ticket_count FROM guilds WHERE guild_id = ?').get(guildId);
    return row?.ticket_count || 0;
  },

  // ── Statistics Channels ────────────────────────────────────
  setStatChannel(guildId, type, channelId) {
    db.prepare('INSERT OR REPLACE INTO statistics_channels (guild_id, type, channel_id) VALUES (?, ?, ?)').run(guildId, type, channelId);
  },
  getStatChannels(guildId) {
    return db.prepare('SELECT * FROM statistics_channels WHERE guild_id = ?').all(guildId);
  },
  getAllStatChannels() {
    return db.prepare('SELECT * FROM statistics_channels').all();
  },
};

// ═══════════════════════════════════════════════════════════════
//  XP CALCULATOR
// ═══════════════════════════════════════════════════════════════
function getRequiredXP(level) {
  return 5 * (level * level) + 50 * level + 100;
}

// ═══════════════════════════════════════════════════════════════
//  CAPTCHA GENERATOR
// ═══════════════════════════════════════════════════════════════
function generateCaptchaCode(length = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < length; i++) code += chars.charAt(crypto.randomInt(chars.length));
  return code;
}
function generateCaptchaImage(code) {
  const width = 280, height = 100;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `rgba(${crypto.randomInt(100, 200)},${crypto.randomInt(100, 200)},${crypto.randomInt(100, 200)},0.4)`;
    ctx.lineWidth = 1 + Math.random();
    ctx.beginPath();
    ctx.moveTo(crypto.randomInt(width), crypto.randomInt(height));
    ctx.lineTo(crypto.randomInt(width), crypto.randomInt(height));
    ctx.stroke();
  }
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(${crypto.randomInt(150, 255)},${crypto.randomInt(150, 255)},${crypto.randomInt(150, 255)},0.3)`;
    ctx.beginPath();
    ctx.arc(crypto.randomInt(width), crypto.randomInt(height), crypto.randomInt(1, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  const fonts = ['bold 36px Arial', 'bold 38px Courier', 'bold 34px Georgia', 'bold 40px Verdana'];
  const colors = ['#e94560', '#00b4d8', '#ff6b6b', '#ffd93d', '#a8ff78', '#f47fff'];
  const startX = 25;
  const charWidth = (width - 50) / code.length;
  for (let i = 0; i < code.length; i++) {
    ctx.save();
    ctx.font = fonts[crypto.randomInt(fonts.length)];
    ctx.fillStyle = colors[crypto.randomInt(colors.length)];
    ctx.translate(startX + i * charWidth + crypto.randomInt(-5, 5), 55 + crypto.randomInt(-10, 10));
    ctx.rotate((Math.random() - 0.5) * 0.4);
    ctx.fillText(code[i], 0, 0);
    ctx.restore();
  }
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(${crypto.randomInt(100, 255)},${crypto.randomInt(100, 255)},${crypto.randomInt(100, 255)},0.5)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(crypto.randomInt(width), crypto.randomInt(height));
    ctx.bezierCurveTo(crypto.randomInt(width), crypto.randomInt(height), crypto.randomInt(width), crypto.randomInt(height), crypto.randomInt(width), crypto.randomInt(height));
    ctx.stroke();
  }
  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════════
//  COLORS
// ═══════════════════════════════════════════════════════════════
const Colors = {
  PRIMARY:    0x5865F2,
  SUCCESS:    0x57F287,
  WARNING:    0xFEE75C,
  ERROR:      0xED4245,
  INFO:       0x5865F2,
  PREMIUM:    0xF47FFF,
  MODERATION: 0xFFA500,
};

// ═══════════════════════════════════════════════════════════════
//  ANTI-SPAM
// ═══════════════════════════════════════════════════════════════
const spamTracker = new Map();
function checkSpam(userId, guildId) {
  const key = `${guildId}-${userId}`;
  const now = Date.now();
  if (!spamTracker.has(key)) spamTracker.set(key, []);
  const timestamps = spamTracker.get(key);
  timestamps.push(now);
  const filtered = timestamps.filter(t => now - t < 10000);
  spamTracker.set(key, filtered);
  return filtered.length >= 5;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of spamTracker) {
    const f = ts.filter(t => now - t < 10000);
    if (f.length === 0) spamTracker.delete(key);
    else spamTracker.set(key, f);
  }
}, 60000);

// ═══════════════════════════════════════════════════════════════
//  BAD WORDS
// ═══════════════════════════════════════════════════════════════
const defaultBadWords = ['connard','connasse','enculé','putain','merde','salope','pute','nique','fdp','ntm','tg','bastard','bitch','fuck','shit','asshole'];
function containsBadWord(content) {
  const lower = content.toLowerCase();
  return defaultBadWords.some(w => lower.includes(w));
}

// ═══════════════════════════════════════════════════════════════
//  DURATION PARSER
// ═══════════════════════════════════════════════════════════════
function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d|j)$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, j: 86400000 };
  return value * (multipliers[unit] || 0);
}
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}j ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ═══════════════════════════════════════════════════════════════
//  WELCOME MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════
function buildWelcomeMessage(config, member) {
  const msg = (config.welcome_message || 'Bienvenue {user} !')
    .replace(/{user}/g, member.toString())
    .replace(/{tag}/g, member.user.tag)
    .replace(/{username}/g, member.user.username)
    .replace(/{server}/g, member.guild.name)
    .replace(/{count}/g, member.guild.memberCount.toString());
  return msg;
}

module.exports = {
  db,
  dbHelpers,
  getRequiredXP,
  generateCaptchaCode,
  generateCaptchaImage,
  Colors,
  checkSpam,
  containsBadWord,
  parseDuration,
  formatDuration,
  buildWelcomeMessage,
};
