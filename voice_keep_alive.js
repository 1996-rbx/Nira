// ═══════════════════════════════════════════════════════════════
//  NIRA — Voice Keep-Alive
//  Connecte le bot en sourdine dans un salon vocal en permanence
//  avec reconnexion automatique si déconnecté.
//
//  INSTALLATION :
//  npm install @discordjs/voice @discordjs/opus
//
//  UTILISATION :
//  Soit intégré dans index.js (recommandé),
//  soit lancé seul : node voice-keepalive.js
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Events,
} = require('discord.js');
const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

// ── Config ─────────────────────────────────────────────────────
// Remplis ces deux variables dans ton .env
// ou directement ici si tu veux un fichier standalone
const VOICE_GUILD_ID   = process.env.VOICE_GUILD_ID   || 'TON_GUILD_ID';
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID || 'TON_CHANNEL_ID';
const RECONNECT_DELAY  = 5000; // ms avant de retenter si déco

// ── Connection ─────────────────────────────────────────────────
let currentConnection = null;
let reconnectTimer    = null;

async function connectToVoice(client) {
  try {
    const guild   = client.guilds.cache.get(VOICE_GUILD_ID);
    if (!guild) {
      console.error('[Voice] Guild introuvable :', VOICE_GUILD_ID);
      scheduleReconnect(client);
      return;
    }

    const channel = guild.channels.cache.get(VOICE_CHANNEL_ID);
    if (!channel) {
      console.error('[Voice] Salon vocal introuvable :', VOICE_CHANNEL_ID);
      scheduleReconnect(client);
      return;
    }

    console.log(`[Voice] Connexion à ${channel.name} (${guild.name})...`);

    currentConnection = joinVoiceChannel({
      channelId:      channel.id,
      guildId:        guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf:       true,  // sourdine — n'entend pas
      selfMute:       true,  // muet    — ne parle pas
    });

    // Attend que la connexion soit établie
    await entersState(currentConnection, VoiceConnectionStatus.Ready, 10_000);
    console.log(`[Voice] ✅ Connecté en sourdine dans : ${channel.name}`);

    // Reconnecte automatiquement si déconnecté
    currentConnection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.warn('[Voice] Déconnecté — tentative de reconnexion...');
      try {
        // Tente d'abord de se signaler ou de rejoindre à nouveau
        await Promise.race([
          entersState(currentConnection, VoiceConnectionStatus.Signalling,  RECONNECT_DELAY),
          entersState(currentConnection, VoiceConnectionStatus.Connecting,   RECONNECT_DELAY),
        ]);
        // Si on arrive ici, Discord reconnecte tout seul
      } catch {
        // Si ça échoue, on destroy et on relance
        currentConnection.destroy();
        scheduleReconnect(client);
      }
    });

    currentConnection.on(VoiceConnectionStatus.Destroyed, () => {
      console.warn('[Voice] Connexion détruite — relance...');
      scheduleReconnect(client);
    });

    currentConnection.on('error', (err) => {
      console.error('[Voice] Erreur :', err.message);
      scheduleReconnect(client);
    });

  } catch (err) {
    console.error('[Voice] Échec de connexion :', err.message);
    scheduleReconnect(client);
  }
}

function scheduleReconnect(client) {
  if (reconnectTimer) return; // évite les doubles tentatives
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToVoice(client);
  }, RECONNECT_DELAY);
}

// ─────────────────────────────────────────────────────────────
//  OPTION A — Intégration dans ton index.js existant
//  Colle uniquement cette fonction dans ton fichier
//  et appelle-la dans le Ready event :
//
//  client.once(Events.ClientReady, async () => {
//    ...
//    connectToVoice(client);   // ← ajoute cette ligne
//  });
//
//  N'oublie pas d'ajouter l'intent dans le client :
//  GatewayIntentBits.GuildVoiceStates,
// ─────────────────────────────────────────────────────────────

module.exports = { connectToVoice };


// ─────────────────────────────────────────────────────────────
//  OPTION B — Script standalone (node voice-keepalive.js)
//  Décommente le bloc ci-dessous si tu veux le lancer séparément
// ─────────────────────────────────────────────────────────────

/*

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, () => {
  console.log(`[Voice] Bot connecté : ${client.user.tag}`);
  connectToVoice(client);
});

client.on(Events.Error, (err) => {
  console.error('[Discord] Erreur :', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('[Process] Unhandled :', err?.message || err);
});

client.login(process.env.BOT_TOKEN);

*/
