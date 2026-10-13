# Cheffies Discord Bot: Architecture

## Context
This is a Discord music bot. Each user saves their own YouTube Data API key with `/setkey`. `/play` searches YouTube with that key, so the user's quota pays for search. The bot then streams the audio into the user's voice channel through yt-dlp + FFmpeg; the Data API itself can't stream audio.

Goals: **stable** (a single failure never takes the bot down) and **extensible** (adding a command, music source or storage backend means adding one file and touching no core code).

Stack: Node 20 + TypeScript (strict), discord.js v14, @discordjs/voice, better-sqlite3, yt-dlp, ffmpeg-static, pino (logging), zod (validation), vitest (tests).

---

## 1. Layers

```
┌──────────────────────────────────────────────────────────┐
│  Discord layer      commands/, interactions/             │  thin: parse input, reply
├──────────────────────────────────────────────────────────┤
│  Services           KeyService, MusicService             │  business rules, no discord.js imports*
├──────────────────────────────────────────────────────────┤
│  Ports (interfaces) KeyRepository, TrackSource,          │  contracts that core depends on
│                     Cipher, AudioStreamer                │
├──────────────────────────────────────────────────────────┤
│  Adapters           SqliteKeyRepository, YouTubeSource,  │  swappable implementations
│                     AesGcmCipher, YtDlpStreamer          │
└──────────────────────────────────────────────────────────┘
        * except the voice/player module, which owns @discordjs/voice
```

Rule: dependencies point **downward, onto interfaces only**. `container.ts` wires concrete adapters in one place, so swapping SQLite for Postgres or adding SoundCloud only touches that file.

## 2. Folder layout

```
src/
  index.ts                  entry: load config → build container → start bot → shutdown hooks
  config.ts                 zod-validated env (fails fast at boot with clear errors)
  container.ts              composition root: creates every adapter/service once
  core/
    logger.ts               pino, with a redaction list (apiKey, token, encKey)
    errors.ts               AppError hierarchy: UserError, KeyMissingError, QuotaError, SourceError…
    types.ts                Track, TrackRequest, shared types
  ports/                    interfaces only (no implementations)
    KeyRepository.ts        get(userId) / set(userId, enc) / delete(userId)
    Cipher.ts               encrypt(plain) / decrypt(enc)
    TrackSource.ts          id, canHandle(input), resolve(input, ctx) → Track[]
    AudioStreamer.ts        createStream(track) → Readable
  adapters/
    storage/SqliteKeyRepository.ts  (+ migrations/ with numbered .sql files)
    crypto/AesGcmCipher.ts
    sources/youtube/YouTubeApiClient.ts   raw HTTP, retries, error mapping
    sources/youtube/YouTubeSource.ts      implements TrackSource
    streaming/YtDlpStreamer.ts
  services/
    KeyService.ts           save (validate → encrypt → store), getKey, remove, status
    MusicService.ts         picks the TrackSource, enqueues, delegates to GuildPlayer
  music/
    GuildPlayer.ts          one per guild: queue + AudioPlayer + VoiceConnection state machine
    PlayerRegistry.ts       Map<guildId, GuildPlayer>, lazy create, cleanup on destroy
    Queue.ts                pure data structure (easy to unit-test; future shuffle/loop)
  discord/
    client.ts               Client creation, intents (Guilds, GuildVoiceStates)
    Command.ts              interface Command { data, execute(ctx) } + optional modal/button handlers
    commandLoader.ts        auto-discovers commands/*.ts, so a new command is just a new file
    interactionRouter.ts    routes slash/modal/button by customId; global try/catch → error replies
    guards.ts               reusable checks: requireVoiceChannel, requireKey, cooldown
  commands/
    key/setkey.ts  key/removekey.ts  key/keystatus.ts
    music/play.ts  skip.ts  stop.ts  pause.ts  resume.ts  queue.ts  nowplaying.ts
  scripts/deploy-commands.ts
tests/                       mirrors src/ (unit tests on services, Queue, adapters with fakes)
```

## 3. Extension points

| You want to add…        | You do…                                                                 |
|-------------------------|-------------------------------------------------------------------------|
| A slash command         | Add `src/commands/<group>/<name>.ts` exporting a `Command`. The loader picks it up. |
| A music source (Spotify, SoundCloud) | Implement `TrackSource`, then register it in `container.ts`. `MusicService` uses the first source whose `canHandle` matches. |
| A different database    | Implement `KeyRepository`, then swap it in `container.ts`.               |
| A per-guild setting (DJ role, volume) | Add a `GuildSettingsRepository` port + a migration file, following the same pattern. |
| Buttons on "Now playing" | Give the command a `components` handler. The router dispatches on a `customId` prefix (`music:skip`). |

The `TrackSource.resolve` context carries `{ userId, apiKey? }`, so any future per-user credential works the same way the YouTube key does.

## 4. Key flow (per-user YouTube key)

```
/setkey → Modal (key never appears in chat)
  → KeyService.save(userId, key)
      → YouTubeApiClient.validate(key)   1 quota unit; maps 400/403 → InvalidKey / ApiNotEnabled / Quota
      → Cipher.encrypt(key)              AES-256-GCM, random IV, auth tag; ENCRYPTION_KEY from env
      → KeyRepository.set(userId, enc)
  → ephemeral "Saved ✓ (…abcd)"
```
`/keystatus` shows the key masked. `/removekey` deletes it. Every key-related reply is ephemeral, and the logger redacts keys.

## 5. Play flow

```
/play <query|url>
  guards: in voice channel → user has key (else hint to /setkey)
  → MusicService.request(guildId, userId, input)
      → source = sources.find(canHandle)  → resolve() → Track[]  (playlists capped at 50)
      → PlayerRegistry.get(guildId).enqueue(tracks)
  GuildPlayer: Idle → join → stream next via AudioStreamer → Playing → (Idle → next | empty → idle timer)
```

## 6. Stability measures
- **Fail fast at boot**: invalid env, a missing ffmpeg/yt-dlp binary or a DB that won't open aborts with a clear message.
- **Error boundary**: `interactionRouter` wraps every handler. `UserError`s become friendly ephemeral replies. Unknown errors are logged with an id and the user sees "Something went wrong (ref: X)". Commands defer early to avoid Discord's 3-second timeout.
- **Isolation per guild**: a crash in one `GuildPlayer` (a stream error, for example) skips that track or resets that guild only. Each player listens to its own `error` events.
- **Voice resilience**: on `Disconnected` the player tries to reconnect within 5s, and destroys and cleans up if that fails. It auto-leaves after 5 minutes idle or when the channel is empty.
- **External calls**: the YouTube client uses timeouts + one retry with backoff on 5xx. Quota errors aren't retried.
- **Process level**: `unhandledRejection`/`uncaughtException` are logged. On SIGINT/SIGTERM the bot shuts down gracefully (destroys voice connections, closes the DB, logs out).
- **Data**: SQLite in WAL mode, plus versioned migrations run at startup.
- **Rate limiting**: a small per-user cooldown on `/play` and `/setkey`.

## 7. Configuration (`.env.example`)
`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DEV_GUILD_ID` (optional, for fast command deploys), `ENCRYPTION_KEY` (`openssl rand -base64 32`), `DB_PATH=./data/bot.db`, `LOG_LEVEL=info`.

## 8. Docs
- `README.md`: setup, Discord app + invite scopes, getting a YouTube API key, run/deploy.
- `docs/ARCHITECTURE.md`: this document, with the diagrams above and the "how to extend" table.

## 9. Testing strategy
- `npm run build` (tsc strict), `npm run lint`, and `npm test`. Tests cover the cipher round-trip/tamper check, the repository on `:memory:`, KeyService with a fake client, the Queue, source selection in MusicService, and the router error boundary.
- Manual smoke test: deploy commands → invalid key rejected → valid key saved → `/play` in voice → `/queue` `/skip` `/stop` → `/removekey` → `/play` asks for the key again.

