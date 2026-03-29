# Discord Dashboard

Dashboard Discord avec plusieurs pages, une connexion OAuth Discord et des compteurs live pour ton bot.

## Ce que le projet fait

- page d'accueil premium avec navigation en haut a droite
- pages separees pour l'accueil, le dashboard, l'activite et les reglages
- connexion Discord OAuth2 cote serveur
- recuperation des serveurs gerables par l'utilisateur
- filtrage optionnel des serveurs ou le bot est present via `DISCORD_BOT_TOKEN`
- logo remplacable via `public/assets/logo.svg`
- donnees de base dans `data/metrics.json`
- donnees live dans `data/live-metrics.json`

## Lancer le projet

1. Copie `.env.example` vers `.env`
2. Renseigne au minimum `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` et `SESSION_SECRET`
3. Ajoute `DISCORD_BOT_TOKEN` si tu veux filtrer les serveurs ou le bot est vraiment installe
4. Ajuste `LIVE_REFRESH_MS` si tu veux un rafraichissement plus rapide ou plus lent
5. Lance le serveur avec `node server.js`
6. Ouvre [http://localhost:3000](http://localhost:3000)

## Configuration Discord

Dans le portail developpeur Discord :

- ajoute `http://localhost:3000/auth/discord/callback` dans les Redirects OAuth2
- active les scopes `identify` et `guilds`
- garde le `Client Secret` uniquement cote serveur

## Brancher tes vraies metriques

Le fichier `data/metrics.json` contient :

- `overview` pour les compteurs globaux
- `recentActivity` pour la colonne activite
- `modules` pour les cartes de modules
- `guildMetrics` pour injecter des stats reelles par serveur Discord, via leur ID

Le fichier `data/live-metrics.json` peut etre reecrit regulierement par ton bot pour faire bouger les compteurs sans redemarrer le dashboard.

Exemple :

```json
{
  "overview": {
    "commandsTotal": 1835000,
    "communitiesReached": 146900,
    "serversTracked": 331,
    "uptimePercent": 99.99
  },
  "guildMetrics": {
    "123456789012345678": {
      "commands": 91234,
      "activeMembers": 2412,
      "conversionRate": 24,
      "lastCommandAt": "2026-03-29T10:42:00.000Z",
      "latencyMs": 47,
      "modulesEnabled": 8,
      "retention": 88
    }
  }
}
```

## Limite actuelle

Les sessions sont stockees en memoire. C'est tres bien pour une premiere version, mais pour une vraie prod multi-instance il faudra brancher Redis ou une solution equivalente.
