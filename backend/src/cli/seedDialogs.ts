// =====================================================================
//  CLI: Default-Dialoge neu einspielen.
//
//    npm run seed:dialogs            # idempotenter Sync (wie beim Start):
//                                    #   fehlende Dialoge einfügen, UNVERÄNDERTE
//                                    #   auf die neueste Version aktualisieren,
//                                    #   bearbeitete/eigene Dialoge in Ruhe lassen.
//    npm run seed:dialogs -- --force # KOMPLETT neu einspielen: alle System-
//                                    #   Dialoge löschen und frisch aus dem Seed
//                                    #   setzen (für Notare ohne Anpassungen).
//
//  In BEIDEN Modi werden eigene Dialoge des Notars (is_system=0) und die
//  settings-Tabelle NIEMALS angefasst.
//
//  Im Container z. B.:
//    docker exec <container> npm run seed:dialogs -- --force
// =====================================================================

// .env laden wie der Server (src/index.ts) — die Dialoge sind mit
// DIALOG_DB_PASSWORD verschlüsselt, ohne das schlägt der Seed fehl. Muss vor
// dem Import von ../db/database stehen (CommonJS-Emit hält die Reihenfolge ein).
import 'dotenv/config';

// Den Auto-Seed in getDatabase() unterdrücken — dieses CLI ist der alleinige
// Treiber, damit die ausgegebenen Zähler exakt stimmen.
process.env.OF_SKIP_STARTUP_SEED = '1';

import { reseedDialogs } from '../db/database';

const force = process.argv.includes('--force');

try {
  const r = reseedDialogs({ force });
  if (force) {
    console.log(
      `[seed:dialogs] FORCE abgeschlossen: ${r.removed} System-Dialoge entfernt, ` +
        `${r.inserted} aus dem Seed neu eingespielt. ` +
        `(Eigene Dialoge & Settings unberührt)`,
    );
  } else {
    console.log(
      `[seed:dialogs] Sync abgeschlossen: ${r.inserted} neu, ${r.updated} aktualisiert, ` +
        `${r.skipped} unverändert/übersprungen.`,
    );
  }
  process.exit(0);
} catch (err) {
  console.error('[seed:dialogs] fehlgeschlagen:', err);
  process.exit(1);
}
