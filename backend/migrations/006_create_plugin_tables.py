from yoyo import step


steps = [
    step(
        """
        CREATE TABLE IF NOT EXISTS plugins (
          id TEXT PRIMARY KEY,
          version TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 0,
          installed_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
        """,
        "DROP TABLE IF EXISTS plugins",
    ),
    step(
        """
        CREATE TABLE IF NOT EXISTS plugin_settings (
          plugin_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (plugin_id, key),
          FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
        )
        """,
        "DROP TABLE IF EXISTS plugin_settings",
    ),
]
