# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Toolchain only used if better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:22-bookworm-slim
# Standalone yt-dlp binary (no Python needed). Rebuild the image to pick up yt-dlp updates.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && case "$(dpkg --print-architecture)" in arm64) suffix=_aarch64 ;; *) suffix= ;; esac \
 && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux${suffix}" -o /usr/local/bin/yt-dlp \
 && chmod 755 /usr/local/bin/yt-dlp \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    DB_PATH=/app/data/bot.db \
    YTDLP_PATH=/usr/local/bin/yt-dlp
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]
