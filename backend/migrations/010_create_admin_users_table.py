from yoyo import step


# Benutzerverwaltung für den Admin-Bereich.
#
# Ersetzt den bisherigen Einzel-Login aus ADMIN_USERNAME/ADMIN_PASSWORD:
# diese .env-Werte legen beim ersten Start nur noch den initialen Benutzer an,
# danach ist ausschliesslich diese Tabelle maßgeblich (der Kunde kann Name und
# Passwort also frei ändern).
#
# Rollen:
#   admin     - darf alles, inkl. Einstellungen, Plugins und Benutzerverwaltung
#   moderator - darf Dialoge und Übersetzungen pflegen
#
# token_version wird bei Passwort-/Rollenwechsel und Deaktivierung erhöht und
# ist Teil des Session-Tokens -> bestehende Sessions werden dadurch ungültig.
steps = [
    step(
        """
        CREATE TABLE IF NOT EXISTS admin_users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
          is_active INTEGER NOT NULL DEFAULT 1,
          token_version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_login_at TEXT
        )
        """,
        "DROP TABLE IF EXISTS admin_users",
    ),
    step(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_username "
        "ON admin_users(username COLLATE NOCASE)",
        "DROP INDEX IF EXISTS idx_admin_users_username",
    ),
]
