from yoyo import step


steps = [
    step(
        """
        CREATE TABLE IF NOT EXISTS dialogs (
          id TEXT PRIMARY KEY,
          payload_ciphertext TEXT NOT NULL,
          payload_iv TEXT NOT NULL,
          payload_tag TEXT NOT NULL,
          payload_version INTEGER NOT NULL DEFAULT 1,
          is_active INTEGER NOT NULL DEFAULT 1,
          is_system INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
        """,
        "DROP TABLE IF EXISTS dialogs",
    )
]
