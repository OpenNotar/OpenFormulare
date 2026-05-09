from yoyo import step


steps = [
    # Wiederverwendbare Bewertungsbogen-Vorlagen (OF-standalone-Modus).
    step(
        """
        CREATE TABLE IF NOT EXISTS rating_form_templates (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          definition_json TEXT NOT NULL,
          threshold_score REAL,
          thanks_text TEXT,
          thanks_link_label TEXT,
          thanks_link_url TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
        """,
        "DROP TABLE IF EXISTS rating_form_templates",
    ),
    # Aktive Token-Sessions (DiNo-Push oder OF-Standalone).
    # form_definition_json haelt den Snapshot der Fragen, sodass der
    # Mandant einen stabilen Bogen sieht — auch wenn das Template spaeter
    # geaendert/geloescht wird.
    step(
        """
        CREATE TABLE IF NOT EXISTS rating_sessions (
          token TEXT PRIMARY KEY,
          source TEXT NOT NULL,                    -- 'dino' | 'standalone'
          origin_id TEXT,                          -- DiNo idRatingResponse oder Template-ID
          form_title TEXT NOT NULL,
          form_definition_json TEXT NOT NULL,      -- Snapshot der Fragen
          threshold_score REAL,
          thanks_text TEXT,
          thanks_link_label TEXT,
          thanks_link_url TEXT,
          recipient_first_name TEXT,
          recipient_last_name TEXT,
          status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'submitted' | 'expired'
          expires_at TEXT,
          created_at TEXT NOT NULL,
          opened_at TEXT,
          submitted_at TEXT,
          pulled_at TEXT,
          overall_score REAL,
          answers_json TEXT
        )
        """,
        "DROP TABLE IF EXISTS rating_sessions",
    ),
    step(
        "CREATE INDEX IF NOT EXISTS idx_rating_sessions_status ON rating_sessions (status)",
        "DROP INDEX IF EXISTS idx_rating_sessions_status",
    ),
    step(
        "CREATE INDEX IF NOT EXISTS idx_rating_sessions_source ON rating_sessions (source)",
        "DROP INDEX IF EXISTS idx_rating_sessions_source",
    ),
]
