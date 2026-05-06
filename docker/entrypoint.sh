#!/bin/sh
# OpenFormulare container entrypoint.
#
# Responsibilities (in order):
#   1. Generate any missing secrets (admin password, session secret, DB key)
#      and persist them in the data volume so they survive restarts and
#      image upgrades.
#   2. Apply yoyo migrations against the encrypted SQLite store.
#   3. Exec the Node server as PID 1 (tini-supervised).
#
# Designed for single-container DockerHub deployment: pull the image, mount
# /data, set CORS_ORIGIN, start. No additional services required.

set -eu

DATA_DIR="${DATA_DIR:-/data}"
SECRETS_DIR="${DATA_DIR}/.secrets"
mkdir -p "${SECRETS_DIR}"

log() { printf '[entrypoint] %s\n' "$*"; }

# Reads/creates a secret file inside the data volume and exports the named
# variable. If the env var is already set, the existing value wins and is
# also persisted (so a one-off override sticks for next time).
ensure_secret() {
    var="$1"
    file="$2"
    bytes="${3:-32}"
    eval "current=\${$var:-}"
    if [ -n "${current}" ]; then
        printf '%s' "${current}" > "${file}"
        chmod 600 "${file}"
        log "${var} aus ENV übernommen und in ${file} gespeichert"
        return
    fi
    if [ -s "${file}" ]; then
        value=$(cat "${file}")
        log "${var} aus ${file} geladen"
    else
        value=$(node -e "console.log(require('crypto').randomBytes(${bytes}).toString('hex'))")
        printf '%s' "${value}" > "${file}"
        chmod 600 "${file}"
        log "${var} neu generiert und in ${file} gespeichert"
    fi
    export "${var}=${value}"
}

# ---- Sensible defaults ------------------------------------------------------
export PORT="${PORT:-3001}"
export CORS_ORIGIN="${CORS_ORIGIN:-*}"
export SQLITE_PATH="${SQLITE_PATH:-${DATA_DIR}/dialogs.sqlite}"
export DEMO_MODE="${DEMO_MODE:-false}"
export ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"

# ---- Secrets (auto-generated on first start) --------------------------------
ensure_secret ADMIN_SESSION_SECRET "${SECRETS_DIR}/admin-session-secret" 48
ensure_secret DIALOG_DB_PASSWORD   "${SECRETS_DIR}/dialog-db-password"   32
ensure_secret DIALOG_DB_SALT       "${SECRETS_DIR}/dialog-db-salt"       16

# Admin password: only generated if the operator did not provide one. The
# generated value is printed once on first boot so it can be captured from
# the container logs.
if [ -z "${ADMIN_PASSWORD:-}" ]; then
    if [ -s "${SECRETS_DIR}/admin-password" ]; then
        ADMIN_PASSWORD=$(cat "${SECRETS_DIR}/admin-password")
        export ADMIN_PASSWORD
        log "ADMIN_PASSWORD aus ${SECRETS_DIR}/admin-password geladen"
    else
        ADMIN_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")
        printf '%s' "${ADMIN_PASSWORD}" > "${SECRETS_DIR}/admin-password"
        chmod 600 "${SECRETS_DIR}/admin-password"
        export ADMIN_PASSWORD
        log "==================================================="
        log "Initiales Admin-Passwort generiert:"
        log "  Benutzer:  ${ADMIN_USERNAME}"
        log "  Passwort:  ${ADMIN_PASSWORD}"
        log "Bitte direkt nach dem ersten Login ändern oder über"
        log "die Umgebungsvariable ADMIN_PASSWORD übersteuern."
        log "Hinterlegt in ${SECRETS_DIR}/admin-password"
        log "==================================================="
    fi
fi

# ---- Migrations -------------------------------------------------------------
mkdir -p "$(dirname "${SQLITE_PATH}")"
log "Wende Datenbank-Migrationen an (${SQLITE_PATH})"
( cd /app/backend && python3 scripts/run_yoyo.py )
log "Migrationen abgeschlossen"

# ---- Boot -------------------------------------------------------------------
log "OpenFormulare startet auf Port ${PORT} (DEMO_MODE=${DEMO_MODE}, CORS_ORIGIN=${CORS_ORIGIN})"
exec "$@"
