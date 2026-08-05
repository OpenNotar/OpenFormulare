from yoyo import step


# Merkt sich vom Admin gelöschte Default-(System-)Dialoge, damit der
# idempotente Seed-Sync beim Start sie NICHT wieder einfügt. Nur für
# Seed-/System-Dialoge relevant; eigene Dialoge des Notars werden ohnehin
# nie vom Seed angefasst.
steps = [
    step(
        """
        CREATE TABLE IF NOT EXISTS seed_tombstones (
          dialog_id TEXT PRIMARY KEY,
          deleted_at TEXT NOT NULL
        )
        """,
        "DROP TABLE IF EXISTS seed_tombstones",
    ),
]
