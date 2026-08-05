from yoyo import step


steps = [
    step(
        """
        CREATE TABLE IF NOT EXISTS submission_files (
          id TEXT PRIMARY KEY,
          submission_id TEXT NOT NULL,
          field_id TEXT,
          file_name TEXT NOT NULL,
          content_type TEXT,
          size_bytes INTEGER NOT NULL,
          data_base64 TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
        )
        """,
        "DROP TABLE IF EXISTS submission_files",
    ),
    step(
        "CREATE INDEX IF NOT EXISTS idx_submission_files_submission "
        "ON submission_files(submission_id)",
        "DROP INDEX IF EXISTS idx_submission_files_submission",
    ),
]
