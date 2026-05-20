# syntax=docker/dockerfile:1.6
#
# OpenFormulare – single-container production image.
# Frontend (Vite) and backend (Express + better-sqlite3 + Puppeteer) are
# packaged together. The backend serves the built frontend statically and
# the API on the same origin.
#

# ---------- Stage 1: build ----------
FROM node:20-bookworm-slim AS builder

WORKDIR /build

# Toolchain for native modules (better-sqlite3). Puppeteer's bundled Chromium
# download is skipped — the runtime image installs system Chromium instead.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    # Multi-Stage-Build kompiliert die Plugins weiter unten in einem
    # separaten Schritt — deshalb hier den postinstall-Hook im Root-
    # package.json überspringen (sonst würde er an dieser Stelle versuchen,
    # noch nicht kopierte Plugin-Sourcen zu bauen).
    OPENFORMULARE_SKIP_PLUGIN_BUILD=1

# Install dependencies first (cache-friendly). `tools/` muss vor `npm ci`
# rein, weil der Root-postinstall-Hook `node tools/build-plugins.mjs`
# aufruft — auch wenn er via OPENFORMULARE_SKIP_PLUGIN_BUILD=1 sofort
# zurückkehrt, muss die Datei zumindest existieren, damit Node sie laden
# kann. tools/ ändert sich selten und sprengt den Build-Cache kaum.
COPY package*.json ./
COPY tools tools
COPY frontend/package*.json frontend/
COPY backend/package*.json backend/
RUN npm ci --workspaces --include-workspace-root

# Workaround for npm optional-deps bug (npm/cli#4828): rollup's native binary
# is platform-specific, but `npm ci` doesn't reliably install it for the
# target arch when the lockfile was generated on a different host.
ARG TARGETARCH
RUN case "$TARGETARCH" in \
        amd64) ROLLUP_BIN=@rollup/rollup-linux-x64-gnu ;; \
        arm64) ROLLUP_BIN=@rollup/rollup-linux-arm64-gnu ;; \
        *) echo "Unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac && \
    npm install --workspace=frontend --no-save "$ROLLUP_BIN"

# Copy sources and build.
COPY frontend frontend
COPY backend backend

# Build the frontend without a hard-coded API URL → relative requests
# (`/api/...`) resolve against whichever origin the container is exposed on.
RUN VITE_API_URL='' npm run build:frontend

# Compile the backend and copy the seed fixtures into dist/.
RUN npm run build:backend

# Build any plugins shipped with the image. Plugins are independent npm
# projects under /plugins; we install + build each one. We rely on the
# backend's typescript compiler that's already on PATH inside the workspace.
COPY plugins plugins
RUN if [ -d plugins ]; then \
        for dir in plugins/*/; do \
            if [ -f "$dir/package.json" ]; then \
                echo "[plugins] building $dir"; \
                (cd "$dir" && npx --yes -p typescript@5.4 tsc -p tsconfig.json) || exit 1; \
            fi; \
        done; \
    fi

# Drop dev dependencies for the runtime image.
RUN npm prune --omit=dev --workspaces --include-workspace-root


# ---------- Stage 2: runtime ----------
FROM node:20-bookworm-slim AS runtime

# Chromium for Puppeteer-based PDF generation, Python + yoyo for migrations,
# tini as PID 1, curl for the healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium fonts-liberation \
        python3 python3-pip \
        tini curl ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages yoyo-migrations \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system openformulare \
    && useradd --system --gid openformulare --home /app openformulare

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=3001 \
    SQLITE_PATH=/data/dialogs.sqlite \
    YOYO_MIGRATIONS_DIR=/app/backend/migrations \
    FRONTEND_DIST_DIR=/app/frontend/dist \
    PLUGINS_DIR=/app/plugins \
    DEMO_MODE=false \
    CORS_ORIGIN=*

WORKDIR /app

# Production node_modules + compiled output + Python migration scripts.
# npm workspaces hoist all deps into /build/node_modules; per-workspace
# node_modules folders only exist for conflicts and don't need to be copied.
COPY --from=builder /build/node_modules                 ./node_modules
COPY --from=builder /build/backend/dist                 ./backend/dist
COPY --from=builder /build/backend/migrations           ./backend/migrations
COPY --from=builder /build/backend/scripts              ./backend/scripts
COPY --from=builder /build/backend/package.json         ./backend/package.json
COPY --from=builder /build/frontend/dist                ./frontend/dist
COPY --from=builder /build/plugins                      ./plugins
COPY --from=builder /build/package.json                 ./package.json

# Entrypoint: generate secrets on first start, run migrations, exec the server.
COPY docker/entrypoint.sh /usr/local/bin/openformulare-entrypoint
RUN chmod +x /usr/local/bin/openformulare-entrypoint

# Persistent volume for the encrypted SQLite database and generated secrets.
RUN mkdir -p /data && chown -R openformulare:openformulare /data /app
VOLUME ["/data"]

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

USER openformulare

ENTRYPOINT ["tini", "--", "openformulare-entrypoint"]
CMD ["node", "/app/backend/dist/index.js"]
