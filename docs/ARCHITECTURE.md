# Cheffies Discord Bot: Architecture

## Context
Cheffies is a Discord music bot. Each user saves their own YouTube Data API key with `/setkey`. `/play` searches YouTube with that key, so searches use the user's quota. The bot then streams the audio into the user's voice channel through yt-dlp + FFmpeg; the Data API itself can't stream audio.

Goals:
- **Stable:** one failure (a bad track, a dropped connection, a broken command) never takes the bot down.
- **Extensible:** adding a command, music source or storage backend means adding a file, without changing core code.

Stack: Node 22 + TypeScript (strict), discord.js v14, @discordjs/voice, better-sqlite3, yt-dlp, ffmpeg-static, pino (logging), zod (config validation), vitest (tests), ESLint (type-aware).

---

## 1. Layers

```
┌──────────────────────────────────────────────────────────┐
│  Discord layer      src/discord/, src/commands/          │  thin: parse input, call a service, reply
├──────────────────────────────────────────────────────────┤
│  Services           KeyService, MusicService             │  business rules, no discord.js imports*
├──────────────────────────────────────────────────────────┤
│  Ports (interfaces) KeyRepository, Cipher, TrackSource,  │  contracts the core depends on
│                     ApiKeyValidator, AudioStreamer       │
├──────────────────────────────────────────────────────────┤
│  Adapters           SqliteKeyRepository, AesGcmCipher,   │  swappable implementations
│                     YouTubeApiClient, YouTubeSource,     │
│                     YtDlpStreamer                        │
└──────────────────────────────────────────────────────────┘
        * except src/music/, which owns @discordjs/voice
```

Rule: dependencies point **downward, onto interfaces only**. `src/container.ts` is the only file that picks concrete adapters, so swapping SQLite for Postgres or adding SoundCloud only touches that file.

## 2. Folder layout

```
src/
  index.ts                  entry: env → config → container → commands → Discord client → login
  config.ts                 zod-validated env; lists every problem at once and exits
  container.ts              composition root: builds every adapter and service once
  lifecycle.ts              SIGINT/SIGTERM graceful shutdown, unhandled-error logging
  core/
    errors.ts               AppError → UserError (shown to users) and its subclasses
    logger.ts               pino with secret redaction (apiKey, key, token, ...)
    types.ts                TrackInfo, Track, ResolveContext
  ports/                    interfaces only
    KeyRepository.ts  Cipher.ts  ApiKeyValidator.ts  TrackSource.ts  AudioStreamer.ts
  adapters/
    crypto/AesGcmCipher.ts
    storage/database.ts             opens SQLite (WAL) and runs migrations
    storage/migrations.ts           append-only list, tracked with PRAGMA user_version
    storage/SqliteKeyRepository.ts
    sources/youtube/parse.ts        URL/duration parsing (pure functions)
    sources/youtube/YouTubeApiClient.ts  HTTP, timeouts, retry, error mapping; also the key validator
    sources/youtube/YouTubeSource.ts     TrackSource for links, playlists and search
    streaming/YtDlpStreamer.ts      spawns yt-dlp, waits for the first audio bytes
  services/
    KeyService.ts           save (validate → encrypt → store), getKey, remove, status
    MusicService.ts         picks a source, resolves, connects, enqueues; playback controls
    index.ts                the Services bag that commands receive
  music/
    Queue.ts                bounded FIFO queue (pure, unit-tested)
    GuildPlayer.ts          one per guild: queue + AudioPlayer + VoiceConnection
    PlayerRegistry.ts       Map<guildId, GuildPlayer>, created lazily, removed when destroyed
    types.ts                MusicPlayer / PlayerLookup interfaces (what services see)
  discord/
    Command.ts              Command contract, defineCommand(), customId()
    commandLoader.ts        auto-discovers src/commands/**
    interactionRouter.ts    routes slash/modal/component events; the error boundary
    guards.ts               requireGuild, requireVoiceChannel, requireSameChannelAsBot
    cooldowns.ts            per-user command cooldowns
    announcer.ts            posts "now playing" / skipped / left messages
    voiceStateHandler.ts    detects an empty channel and tells the player
    format.ts               durations, safe track links
    client.ts               intents: Guilds + GuildVoiceStates only
  commands/
    key/    setkey  removekey  keystatus
    music/  play  skip  stop  pause  resume  shuffle  queue  nowplaying
  scripts/deploy-commands.ts
tests/                      unit tests for every layer except live voice
```

## 3. Extension points

| You want to add… | You do… |
|---|---|
| A slash command | Add `src/commands/<group>/<name>.ts` with `export default defineCommand({...})`, then run `npm run deploy`. The loader finds it automatically. |
| A modal or button | Use `customId('<command>', '<action>')` and implement `handleModal` / `handleComponent` on that command. The router dispatches on the prefix. |
| A music source (SoundCloud, Spotify, ...) | Implement `TrackSource` in `src/adapters/sources/<name>/`, then add it to the `sources` array in `container.ts`, **before** YouTube (YouTube catches all plain-text searches). |
| A per-user credential for a new source | Add a field to `ResolveContext` and look it up in `MusicService.play`, the same way the YouTube key is. |
| A different database | Implement `KeyRepository`, then swap it in `container.ts`. |
| A new table or setting | Append a SQL string to `migrations.ts` (never edit old entries), then add a port + repository following `KeyRepository`. |
| A new service | Create it in `container.ts` and add it to `Services` in `services/index.ts`. |
| Loop / remove / move in the queue | Add the operation to `Queue.ts` (pure and testable), expose it on `MusicPlayer`/`GuildPlayer`, and add a command. |

## 4. Key flow (per-user YouTube key)

```
/setkey → modal (the key never appears in chat)
  → KeyService.save(userId, key)
      → format check                      (no API call for obvious junk)
      → YouTubeApiClient.validate(key)    videos.list, 1 quota unit
          400 key invalid       → InvalidKeyError
          403 quotaExceeded     → QuotaExceededError
          403 SERVICE_DISABLED  → ApiNotEnabledError ("enable YouTube Data API v3")
          403 key restricted    → InvalidKeyError ("set Application restrictions to None")
      → AesGcmCipher.encrypt(key)         AES-256-GCM, random IV, auth tag, "v1." prefix
      → KeyRepository.set(userId, encrypted)
  → ephemeral "✅ Key saved (••••••abcd)"
```

- `/keystatus` shows the key masked. `/removekey` deletes it. Every reply about a key is ephemeral.
- If a stored key can't be decrypted (because `ENCRYPTION_KEY` changed), it is deleted and the user is asked to run `/setkey` again.
- Request URLs contain the key, so they are never logged or put into errors. The logger also redacts key-like fields.

## 5. Play flow

```
/play <query|url>
  requireGuild → requireVoiceChannel (incl. Connect/Speak permission) → deferReply
  → MusicService.play
      → source = first TrackSource whose canHandle(query)
      → apiKey = KeyService.getKey(user)        (KeyMissingError → "run /setkey")
      → source.resolve(query, { userId, apiKey })
           video link → videos.list   ·  playlist → playlistItems (capped) + videos.list
           search     → search.list (5 results) + videos.list, first playable one
      → (only now) PlayerRegistry.getOrCreate(guild).connect(voice)
      → player.enqueue(tracks tagged with requestedBy)
  → reply "▶️ Starting …" / "➕ Queued … at #n"

GuildPlayer:
  enqueue → playNext → AudioStreamer.createStream → demuxProbe → AudioPlayer.play
  Idle → next track …  queue empty → idle timer → leave
```

## 6. Stability measures

- **Fail fast at boot.** Invalid env (all problems listed at once), a missing yt-dlp, a missing FFmpeg, or a database from a newer build each stop the bot at startup with a clear message.
- **Single error boundary.** `interactionRouter` catches everything:
  - A `UserError` becomes a private reply.
  - Any other error is logged with a short reference id, and the user sees "Something went wrong (ref: abcd1234)".
  - A deferred public reply is replaced by a private error message.
  - A failing error reply (for example, an expired interaction) is logged and swallowed.
- **Validate before side effects.** `/play` resolves the query before joining voice, so a typo or a missing key never makes the bot join a channel for nothing. `/setkey` validates the key before storing it.
- **Per-guild isolation.** Each `GuildPlayer` owns its own queue, audio player and connection:
  - A track that fails to start is announced and skipped.
  - A playback error moves on to the next track.
  - A lost connection destroys only that guild's player, and the registry makes a fresh one on the next `/play`.
- **No silent tracks.** `YtDlpStreamer` waits for the first audio bytes (30s timeout). A yt-dlp failure rejects with yt-dlp's own message, and a no-op `error` listener keeps late stream errors from crashing the process.
- **Voice resilience.**
  - After a disconnect, the player waits up to 5s for the connection to start reconnecting, then gives up and leaves.
  - It leaves after `IDLE_TIMEOUT_SECONDS` with an empty queue or nobody listening.
  - It connects with `selfDeaf` set.
- **External calls.** The YouTube client uses a 10s timeout and retries once on network errors or 5xx responses. Quota and key errors are never retried. API errors become specific, actionable messages.
- **Process level.**
  - SIGINT/SIGTERM trigger a graceful shutdown: leave voice, close the database, log out, with a 10s forced-exit fallback.
  - `unhandledRejection` is logged.
  - `uncaughtException` triggers a clean exit, and Docker's `restart: unless-stopped` brings the bot back.
- **Data.** SQLite runs in WAL mode with a busy timeout and transactional, versioned migrations.
- **Abuse limits.** There are per-user cooldowns (`/play` 3s, `/setkey` 5s), plus a queue cap (`MAX_QUEUE_LENGTH`) and a playlist cap (`MAX_PLAYLIST_ITEMS`).
- **Static checks.** TypeScript runs in strict mode with `noUncheckedIndexedAccess`. ESLint enforces `no-floating-promises` and `no-misused-promises`, which catch the unawaited promises that most often cause silent failures in bots.

## 7. Configuration

See `.env.example`.

- **Required:** `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `ENCRYPTION_KEY` (`openssl rand -base64 32`).
- **Optional:** `DEV_GUILD_ID`, `DB_PATH`, `LOG_LEVEL`, `YTDLP_PATH`, `YTDLP_EXTRA_ARGS`, `IDLE_TIMEOUT_SECONDS`, `MAX_PLAYLIST_ITEMS`, `MAX_QUEUE_LENGTH`.

## 8. Testing strategy

- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all run in CI (`.github/workflows/ci.yml`).
- Unit tests cover:
  - config validation
  - the cipher (round-trip, tampering, wrong key)
  - the SQLite repository and migrations
  - KeyService (with a fake validator)
  - YouTube URL and duration parsing
  - API client error mapping and retries (with a fake `fetch`)
  - YouTubeSource
  - the Queue
  - MusicService (with fake sources and player)
  - the router's error boundary and cooldowns
  - command discovery
- `GuildPlayer` (live voice) is covered by the manual smoke test: deploy commands → invalid key rejected → valid key saved → `/play` in voice → `/queue` `/skip` `/pause` `/resume` `/stop` → `/removekey` → `/play` asks for a key again.
