from yoyo import step


steps = [
    step(
        """
        CREATE TABLE IF NOT EXISTS dialog_translations (
          dialog_id TEXT NOT NULL,
          language TEXT NOT NULL,
          translations_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (dialog_id, language),
          FOREIGN KEY (dialog_id) REFERENCES dialogs(id) ON DELETE CASCADE
        )
        """,
        "DROP TABLE IF EXISTS dialog_translations",
    ),
]
