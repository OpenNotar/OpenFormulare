from yoyo import step


steps = [
    step(
        """
        CREATE TABLE IF NOT EXISTS submissions (
          id TEXT PRIMARY KEY,
          form_type TEXT NOT NULL,
          submitted_at TEXT NOT NULL,
          data_json TEXT NOT NULL,
          dino_json TEXT NOT NULL,
          pulled_at TEXT
        )
        """,
        "DROP TABLE IF EXISTS submissions",
    )
]
