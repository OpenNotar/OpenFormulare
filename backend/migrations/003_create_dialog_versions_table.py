from yoyo import step

steps = [
    step(
        """
        CREATE TABLE IF NOT EXISTS dialog_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dialog_id TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          payload_ciphertext TEXT NOT NULL,
          payload_iv TEXT NOT NULL,
          payload_tag TEXT NOT NULL,
          payload_version INTEGER NOT NULL DEFAULT 1,
          saved_at TEXT NOT NULL
        )
        """,
        "DROP TABLE IF EXISTS dialog_versions",
    )
]
