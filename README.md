# Cheffies Discord Bot

A Discord music bot where **each user brings their own YouTube Data API key**.
People save their key once with `/setkey` (privately, encrypted), and their
`/play` searches run on their own quota.

> The YouTube Data API is used for searching and looking up videos and playlists.
> Audio is streamed with [yt-dlp](https://github.com/yt-dlp/yt-dlp) + FFmpeg.

## Commands

| Command | What it does |
|---|---|
| `/setkey` | Opens a private form to save your YouTube API key (validated, then encrypted) |
| `/keystatus` | Shows whether you have a key saved (masked) |
| `/removekey` | Deletes your saved key |
| `/play <link or search>` | Plays a YouTube video, playlist, or the top search result in your voice channel |
| `/skip` `/pause` `/resume` `/stop` | Playback controls (you must be in the bot's channel) |
| `/queue` `/nowplaying` `/shuffle` | See and manage what's coming up |

## Getting a YouTube API key (for users)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (free).
2. Enable **YouTube Data API v3**: *APIs & Services → Library*.
3. Create a key: *APIs & Services → Credentials → Create credentials → API key*.
4. Leave **Application restrictions** set to *None*. You can restrict the key to the YouTube Data API v3 only.
5. In Discord, run `/setkey` and paste the key.

The free quota is 10,000 units/day. A search costs about 101 units, a direct link about 1, and a playlist about 2 per 50 videos.

## Running the bot

### 1. Create the Discord application

1. Go to https://discord.com/developers/applications → **New Application**.
2. **Bot** tab: reset/copy the token (`DISCORD_TOKEN`). No privileged intents are needed.
3. **General Information**: copy the Application ID (`DISCORD_CLIENT_ID`).
4. Invite it with this URL, replacing `CLIENT_ID` with your Application ID. It grants View Channels, Send Messages, Connect and Speak:
   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=3148800`

### 2. Configure

```bash
cp .env.example .env
# fill in DISCORD_TOKEN, DISCORD_CLIENT_ID and:
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env
```

Keep `ENCRYPTION_KEY` safe and stable. If you change it, every saved user key becomes unreadable, and users have to run `/setkey` again.

### 3a. Run with Docker (recommended)

```bash
docker compose build
docker compose run --rm bot node dist/scripts/deploy-commands.js   # register slash commands
docker compose up -d
```

### 3b. Run with Node

You need Node 22+ and [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) on the `PATH` (or set `YTDLP_PATH`). FFmpeg is bundled through `ffmpeg-static`.

```bash
npm install
npm run deploy     # register slash commands (re-run when commands change)
npm run dev        # development, auto-reload + pretty logs
# or
npm run build && npm start
```

Set `DEV_GUILD_ID` while developing so command changes appear instantly in your test server.

## Development

```bash
npm run typecheck
npm run lint
npm test
```

How the code is organised, and how to add commands, music sources or storage backends, is described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Troubleshooting

- **"yt-dlp not found" at startup**: install yt-dlp or set `YTDLP_PATH`.
- **Tracks are skipped with "Couldn't play"**: update yt-dlp (`yt-dlp -U`, or rebuild the Docker image). YouTube changes often. If your server's IP is blocked, pass cookies with `YTDLP_EXTRA_ARGS=--cookies /app/data/cookies.txt`.
- **"key is restricted"**: set the key's Application restrictions to *None* in Google Cloud.
- **Commands don't show up**: run the deploy step. Global commands can take a while to appear; use `DEV_GUILD_ID` for testing.
