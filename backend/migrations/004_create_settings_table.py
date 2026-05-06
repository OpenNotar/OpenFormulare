from yoyo import step


steps = [
    step(
        """
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
        """,
        "DROP TABLE IF EXISTS settings",
    )
]
