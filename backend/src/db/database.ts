import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { decryptSchema, encryptSchema } from './crypto';
import { defaultDialogs } from './defaultDialogs';
import { ensureKontaktStepAtEnd } from './sharedSteps';
import type { FormSchema } from './types/schema';
import { diffSchemas } from '../services/schemaDiff';
import { runYoyoMigrations } from './yoyo';
import { SUPPORTED_LANGUAGES } from './translations';

export interface DialogRecord extends FormSchema {
  description: string;
  category: string;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DialogRow {
  id: string;
  payload_ciphertext: string;
  payload_iv: string;
  payload_tag: string;
  payload_version: number;
  is_active: number;
  is_system: number;
  created_at: string;
  updated_at: string;
}

let database: Database.Database | null = null;

function getDatabasePath(): string {
  const configured = process.env.SQLITE_PATH;
  if (configured) {
    return path.resolve(configured);
  }

  const cwd = process.cwd();
  const dataDir = path.basename(cwd) === 'backend'
    ? path.resolve(cwd, 'data')
    : path.resolve(cwd, 'backend', 'data');

  return path.join(dataDir, 'dialogs.sqlite');
}

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function rowToDialog(row: DialogRow): DialogRecord {
  const schema = decryptSchema({
    ciphertext: row.payload_ciphertext,
    iv: row.payload_iv,
    tag: row.payload_tag,
    version: row.payload_version,
  });
  const normalized = ensureKontaktStepAtEnd(schema);

  return {
    ...normalized,
    id: row.id,
    description: normalized.description ?? '',
    category: normalized.category ?? '',
    isActive: row.is_active === 1,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SeedSyncResult {
  inserted: number;
  updated: number;
  skipped: number;
  removed: number;
  // Welche Dialog-IDs konkret betroffen waren. Wird vom Onboarding-Tool
  // benutzt, um "Auto-Sync hat XY mitgenommen" sichtbar zu machen.
  insertedIds?: string[];
  updatedIds?: string[];
}

// Stabile, schlüssel-sortierte JSON-Repräsentation für den Inhalts-Vergleich.
// `isActive`/`isSystem` werden ausgeklammert, weil sie spaltengetragen sind
// (nicht Teil des inhaltlichen Dialogs) und sonst False-Positives erzeugen.
function canonicalForCompare(schema: FormSchema): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        if (key === 'isActive' || key === 'isSystem') continue;
        out[key] = stable((value as Record<string, unknown>)[key]);
      }
      return out;
    }
    return value;
  };
  return JSON.stringify(stable(schema));
}

// =====================================================================
//  Idempotenter Seed-Sync.
//
//  Läuft bei jedem Start (force=false) und hält die Default-Dialoge aktuell,
//  OHNE Anpassungen des Notars zu überschreiben:
//    - Default-Dialog fehlt  → einfügen (außer er steht im Tombstone).
//    - Default-Dialog da, is_system=1 und UNVERÄNDERT → mit neuem Seed
//      überschreiben. "Unverändert" = updated_at == created_at UND keine
//      dialog_versions-Einträge (jeder Edit bumpt beides bzw. eines davon).
//    - Verändert (modified) oder eigener Dialog (is_system=0) → nie anfassen.
//
//  Mit force=true: Dialoge KOMPLETT neu einspielen — alle System-Dialoge
//  (+ deren Versionen + Tombstones) löschen und frisch aus dem Seed setzen.
//  Eigene Dialoge des Notars (is_system=0) und die settings-Tabelle bleiben
//  in JEDEM Fall unangetastet.
// =====================================================================
function seedDefaultDialogs(
  db: Database.Database,
  options: { force?: boolean } = {},
): SeedSyncResult {
  const force = options.force === true;
  const now = new Date().toISOString();
  const result: SeedSyncResult = {
    inserted: 0, updated: 0, skipped: 0, removed: 0,
    insertedIds: [], updatedIds: [],
  };

  const insert = db.prepare(`
    INSERT INTO dialogs (
      id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at
    ) VALUES (
      @id, @payload_ciphertext, @payload_iv, @payload_tag, @payload_version, @is_active, @is_system, @created_at, @updated_at
    )
  `);
  const insertSeed = (dialog: FormSchema, createdAt: string) => {
    const encrypted = encryptSchema(dialog);
    insert.run({
      id: dialog.id,
      payload_ciphertext: encrypted.ciphertext,
      payload_iv: encrypted.iv,
      payload_tag: encrypted.tag,
      payload_version: encrypted.version,
      is_active: dialog.isActive === false ? 0 : 1,
      is_system: dialog.isSystem ? 1 : 0,
      created_at: createdAt,
      updated_at: createdAt,
    });
  };

  if (force) {
    // Maßgeblich ist die ID-Liste aus dem Seed — NICHT die Spalte `is_system`.
    // Die Spalte ist in bestehenden Instanzen nachweislich unzuverlaessig
    // (Seed-Dialoge mit is_system=0, eigene Dialoge mit is_system=1). Wuerde
    // man sie hier verwenden, gaebe es zwei Fehler auf einmal:
    //   - ein Seed-Dialog mit is_system=0 bliebe stehen -> UNIQUE-Constraint
    //     beim Neu-Einfuegen -> kompletter Reseed bricht ab
    //   - ein EIGENER Dialog mit is_system=1 wuerde geloescht -> Datenverlust
    // Ueber die ID-Liste kann per Definition nur getroffen werden, was auch
    // im Seed steht; alles andere ist unantastbar.
    const seedIds = defaultDialogs.map((d) => d.id);
    const placeholders = seedIds.map(() => '?').join(', ');
    const tx = db.transaction(() => {
      db.prepare(
        `DELETE FROM dialog_versions WHERE dialog_id IN (${placeholders})`,
      ).run(...seedIds);
      const del = db.prepare(`DELETE FROM dialogs WHERE id IN (${placeholders})`).run(...seedIds);
      result.removed = del.changes ?? 0;
      db.prepare('DELETE FROM seed_tombstones').run();
      for (const dialog of defaultDialogs) {
        insertSeed(dialog, now);
        result.inserted++;
        result.insertedIds!.push(dialog.id);
      }
    });
    tx();
    return result;
  }

  // --- idempotenter Sync (force=false) ---
  const getRow = db.prepare(
    'SELECT id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at FROM dialogs WHERE id = ?',
  );
  const isTombstoned = db.prepare('SELECT 1 FROM seed_tombstones WHERE dialog_id = ?');
  const versionCount = db.prepare(
    'SELECT COUNT(*) AS c FROM dialog_versions WHERE dialog_id = ?',
  );
  const updatePayload = db.prepare(`
    UPDATE dialogs
    SET payload_ciphertext = ?, payload_iv = ?, payload_tag = ?, payload_version = ?, is_active = ?, updated_at = created_at
    WHERE id = ?
  `);

  const tx = db.transaction(() => {
    for (const dialog of defaultDialogs) {
      const row = getRow.get(dialog.id) as DialogRow | undefined;

      if (!row) {
        // Vom Admin gelöschte Default-Dialoge nicht wieder auferstehen lassen.
        if (isTombstoned.get(dialog.id)) {
          result.skipped++;
          continue;
        }
        insertSeed(dialog, now);
        result.inserted++;
        result.insertedIds!.push(dialog.id);
        continue;
      }

      // Eigene Dialoge des Notars niemals anfassen.
      if (row.is_system !== 1) {
        result.skipped++;
        continue;
      }

      const unmodified =
        row.updated_at === row.created_at &&
        (versionCount.get(dialog.id) as { c: number }).c === 0;
      if (!unmodified) {
        result.skipped++;
        continue;
      }

      // Unverändert → nur überschreiben, wenn sich der Inhalt unterscheidet
      // (vermeidet unnötige Schreibzugriffe bei jedem Start).
      const stored = decryptSchema({
        ciphertext: row.payload_ciphertext,
        iv: row.payload_iv,
        tag: row.payload_tag,
        version: row.payload_version,
      });
      if (canonicalForCompare(stored) === canonicalForCompare(dialog)) {
        result.skipped++;
        continue;
      }

      const encrypted = encryptSchema(dialog);
      updatePayload.run(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        encrypted.version,
        dialog.isActive === false ? 0 : 1,
        dialog.id,
      );
      result.updated++;
      result.updatedIds!.push(dialog.id);
    }
  });
  tx();
  return result;
}

// Öffentlicher Einstieg für CLI/Ops: idempotenter Sync oder kompletter
// Force-Reseed der Dialoge. Settings werden NIE berührt.
export function reseedDialogs(options: { force?: boolean } = {}): SeedSyncResult {
  const db = getDatabase();
  const result = seedDefaultDialogs(db, options);
  // `--force` loescht die Dialoge und damit (FK ON DELETE CASCADE) auch deren
  // Uebersetzungen. Die mitgelieferten Sprachpakete direkt wieder einspielen,
  // damit das CLI keinen Zustand hinterlaesst, der erst beim naechsten
  // Server-Start vollstaendig wird.
  seedDefaultTranslations(db);
  return result;
}

// Bulk-load any pre-translated language packs that ship next to the default
// dialog JSON ({dialogId}.{lang}.json).
//
// Runs independently of dialog seeding so that users who upgrade an existing
// install also get the base English translations once. Skips rows that
// already exist – never overwrites an admin's edited translations.
function seedDefaultTranslations(db: Database.Database) {
  const dir = path.join(__dirname, 'seeds', 'translations');
  if (!fs.existsSync(dir)) return;

  const exists = db.prepare(
    'SELECT 1 FROM dialog_translations WHERE dialog_id = ? AND language = ?',
  );
  const insert = db.prepare(`
    INSERT INTO dialog_translations
      (dialog_id, language, translations_json, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  const dialogExists = db.prepare('SELECT 1 FROM dialogs WHERE id = ?');
  const now = new Date().toISOString();
  const validLangs = new Set<string>(SUPPORTED_LANGUAGES as readonly string[]);
  let loaded = 0;

  for (const entry of fs.readdirSync(dir)) {
    const match = /^([a-z0-9-]+)\.([a-z]{2})\.json$/.exec(entry);
    if (!match) continue;
    const [, dialogId, lang] = match;
    if (!validLangs.has(lang)) continue; // 'de' is the canonical schema – skip
    if (!dialogExists.get(dialogId)) continue; // dialog removed by admin – ignore
    if (exists.get(dialogId, lang)) continue; // already loaded or admin-edited – never overwrite

    const full = path.join(dir, entry);
    try {
      const raw = fs.readFileSync(full, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, string>;
      insert.run(dialogId, lang, JSON.stringify(parsed), now);
      loaded++;
    } catch (err) {
      console.warn(`[seed] failed to load ${entry}:`, err);
    }
  }

  if (loaded > 0) {
    console.log(`[seed] loaded ${loaded} translation pack(s) from ${dir}`);
  }
}

export function getDatabase() {
  if (database) {
    return database;
  }

  const dbPath = getDatabasePath();
  ensureParentDir(dbPath);
  runYoyoMigrations(dbPath);
  database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  // OF_SKIP_STARTUP_SEED erlaubt es der seed:dialogs-CLI, der alleinige
  // Treiber zu sein (sauberes Zählen, keine Doppelausführung). Der Server
  // setzt das Flag nie → Auto-Sync läuft beim Start wie gewohnt.
  if (!process.env.OF_SKIP_STARTUP_SEED) {
    const sync = seedDefaultDialogs(database);
    if (sync.inserted || sync.updated) {
      console.log(
        `[seed] dialog sync: ${sync.inserted} neu, ${sync.updated} aktualisiert, ${sync.skipped} unverändert/übersprungen`,
      );
      // Auto-Sync-Ergebnis persistieren, damit das Onboarding-Tool sichtbar
      // machen kann, was im Hintergrund passiert ist (sonst „unsichtbare"
      // Migration, die der Notar nicht nachvollziehen kann).
      try {
        const stmt = database.prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        );
        stmt.run(
          'last_seed_auto_sync',
          JSON.stringify({
            at: new Date().toISOString(),
            inserted: sync.inserted,
            updated: sync.updated,
            skipped: sync.skipped,
            insertedIds: sync.insertedIds ?? [],
            updatedIds: sync.updatedIds ?? [],
          }),
          new Date().toISOString(),
        );
      } catch (err) {
        console.warn('[seed] konnte Auto-Sync-Ergebnis nicht persistieren:', err);
      }
    }
    seedDefaultTranslations(database);
  }

  return database;
}

export function listDialogs(): DialogRecord[] {
  const rows = getDatabase()
    .prepare(
      'SELECT id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at FROM dialogs',
    )
    .all() as DialogRow[];

  return rows
    .map(rowToDialog)
    .sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));
}

export function getDialog(id: string): DialogRecord | null {
  const row = getDatabase()
    .prepare(
      'SELECT id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at FROM dialogs WHERE id = ?',
    )
    .get(id) as DialogRow | undefined;

  return row ? rowToDialog(row) : null;
}

export interface UpsertDialogInput extends FormSchema {
  description?: string;
  category?: string;
  categories?: string[];
  isActive?: boolean;
}

export function createDialog(input: UpsertDialogInput): DialogRecord {
  const now = new Date().toISOString();
  const dialog = ensureKontaktStepAtEnd({
    ...input,
    description: input.description ?? '',
    category: input.category ?? 'Allgemein',
    isActive: input.isActive ?? true,
  });
  const encrypted = encryptSchema(dialog);

  getDatabase()
    .prepare(`
      INSERT INTO dialogs (
        id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `)
    .run(
      dialog.id,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      encrypted.version,
      dialog.isActive ? 1 : 0,
      now,
      now,
    );

  return getDialog(dialog.id)!;
}

export function updateDialog(currentId: string, input: UpsertDialogInput): DialogRecord | null {
  const db = getDatabase();
  const rawRow = db
    .prepare('SELECT id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at FROM dialogs WHERE id = ?')
    .get(currentId) as DialogRow | undefined;
  if (!rawRow) return null;

  saveVersion(db, currentId, rawRow);

  const dialog = ensureKontaktStepAtEnd({
    ...input,
    description: input.description ?? '',
    category: input.category ?? 'Allgemein',
    isActive: input.isActive ?? (rawRow.is_active === 1),
  });
  const nextId = dialog.id;
  const encrypted = encryptSchema(dialog);
  const idChanged = nextId !== currentId;

  // Bei einem ID-Wechsel (= Route ändern) müssen alle Child-Zeilen, die per
  // FK auf `dialogs.id` zeigen, mit umgezogen werden. `dialog_translations`
  // hat ein ON DELETE CASCADE, aber kein ON UPDATE CASCADE — daher würde ein
  // direkter UPDATE der Parent-ID an der FK scheitern.
  //
  // Lösung: in einer Transaktion `PRAGMA defer_foreign_keys = ON` setzen.
  // SQLite verschiebt die FK-Prüfung dann auf den COMMIT, sodass Parent
  // und Children in beliebiger Reihenfolge umbenannt werden können, solange
  // der Endzustand konsistent ist. Das Pragma wird nach dem COMMIT
  // automatisch wieder zurückgesetzt.
  // Beim Umbenennen eines Default-Dialogs würde der nächste Server-Start
  // die ursprüngliche ID nicht mehr finden und den Dialog als „neu" aus dem
  // Seed wiedereinfügen → Notar hätte plötzlich beide Versionen. Wir setzen
  // daher einen Tombstone auf die alte ID + degradieren den umbenannten
  // Dialog zu einem regulären Notar-Dialog (`is_system = 0`), damit er
  // künftig nicht mehr Teil des Auto-Sync-Pools ist.
  const isRenameOfSystemDialog = idChanged && rawRow.is_system === 1;

  // Bei einem ID-Wechsel (= Route ändern) müssen alle Child-Zeilen, die per
  // FK auf `dialogs.id` zeigen, mit umgezogen werden. `dialog_translations`
  // hat ein ON DELETE CASCADE, aber kein ON UPDATE CASCADE — daher würde ein
  // direkter UPDATE der Parent-ID an der FK scheitern.
  //
  // Lösung: in einer Transaktion `PRAGMA defer_foreign_keys = ON` setzen.
  // SQLite verschiebt die FK-Prüfung dann auf den COMMIT, sodass Parent
  // und Children in beliebiger Reihenfolge umbenannt werden können, solange
  // der Endzustand konsistent ist. Das Pragma wird nach dem COMMIT
  // automatisch wieder zurückgesetzt.
  const tx = db.transaction(() => {
    if (idChanged) {
      const conflict = db.prepare('SELECT 1 FROM dialogs WHERE id = ?').get(nextId);
      if (conflict) {
        throw new Error(`Dialog mit Route "${nextId}" existiert bereits.`);
      }
      db.exec('PRAGMA defer_foreign_keys = ON');
      db.prepare('UPDATE dialog_translations SET dialog_id = ? WHERE dialog_id = ?').run(nextId, currentId);
      db.prepare('UPDATE dialog_versions SET dialog_id = ? WHERE dialog_id = ?').run(nextId, currentId);
    }

    db.prepare(`
        UPDATE dialogs
        SET id = ?, payload_ciphertext = ?, payload_iv = ?, payload_tag = ?, payload_version = ?, is_active = ?, is_system = ?, updated_at = ?
        WHERE id = ?
      `).run(
        nextId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        encrypted.version,
        dialog.isActive ? 1 : 0,
        isRenameOfSystemDialog ? 0 : rawRow.is_system,
        new Date().toISOString(),
        currentId,
      );

    if (isRenameOfSystemDialog) {
      // Tombstone für die alte System-ID, damit Auto-Sync sie nicht
      // wieder einspielt. Falls bereits ein Tombstone existiert (z. B. nach
      // wiederholtem Rename), wird er aktualisiert.
      db.prepare(
        'INSERT OR REPLACE INTO seed_tombstones (dialog_id, deleted_at) VALUES (?, ?)',
      ).run(currentId, new Date().toISOString());
    }
  });
  tx();

  return getDialog(nextId);
}

export function deleteDialog(id: string): boolean {
  const db = getDatabase();
  // is_system VOR dem Löschen lesen — gelöschte Default-Dialoge bekommen einen
  // Tombstone, damit der Seed-Sync sie nicht beim nächsten Start neu einfügt.
  const row = db.prepare('SELECT is_system FROM dialogs WHERE id = ?').get(id) as
    | { is_system: number }
    | undefined;
  const result = db.prepare('DELETE FROM dialogs WHERE id = ?').run(id);
  if (result.changes > 0 && row?.is_system === 1) {
    db.prepare(
      'INSERT OR REPLACE INTO seed_tombstones (dialog_id, deleted_at) VALUES (?, ?)',
    ).run(id, new Date().toISOString());
  }
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

interface VersionRow {
  id: number;
  dialog_id: string;
  version_number: number;
  payload_ciphertext: string;
  payload_iv: string;
  payload_tag: string;
  payload_version: number;
  saved_at: string;
}

export interface DialogVersion {
  id: number;
  dialogId: string;
  versionNumber: number;
  savedAt: string;
}

export interface DialogVersionFull extends DialogVersion {
  schema: FormSchema;
}

const MAX_VERSIONS = 20;

function saveVersion(db: Database.Database, dialogId: string, row: DialogRow) {
  const lastRow = db
    .prepare('SELECT version_number FROM dialog_versions WHERE dialog_id = ? ORDER BY version_number DESC LIMIT 1')
    .get(dialogId) as { version_number: number } | undefined;
  const nextVersionNumber = (lastRow?.version_number ?? 0) + 1;

  db.prepare(`
    INSERT INTO dialog_versions (dialog_id, version_number, payload_ciphertext, payload_iv, payload_tag, payload_version, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(dialogId, nextVersionNumber, row.payload_ciphertext, row.payload_iv, row.payload_tag, row.payload_version, new Date().toISOString());

  db.prepare(`
    DELETE FROM dialog_versions
    WHERE dialog_id = ?
      AND id NOT IN (
        SELECT id FROM dialog_versions WHERE dialog_id = ? ORDER BY version_number DESC LIMIT ?
      )
  `).run(dialogId, dialogId, MAX_VERSIONS);
}

export interface DialogVersionWithChanges extends DialogVersion {
  changes: string[];
}

export function listDialogVersionsWithDiff(dialogId: string): DialogVersionWithChanges[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT id, dialog_id, version_number, payload_ciphertext, payload_iv, payload_tag, payload_version, saved_at FROM dialog_versions WHERE dialog_id = ? ORDER BY version_number DESC')
    .all(dialogId) as VersionRow[];

  if (rows.length === 0) return [];

  const currentRow = db
    .prepare('SELECT id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at FROM dialogs WHERE id = ?')
    .get(dialogId) as DialogRow | undefined;

  const currentSchema = currentRow
    ? decryptSchema({ ciphertext: currentRow.payload_ciphertext, iv: currentRow.payload_iv, tag: currentRow.payload_tag, version: currentRow.payload_version })
    : null;

  const schemas = rows.map((r) =>
    decryptSchema({ ciphertext: r.payload_ciphertext, iv: r.payload_iv, tag: r.payload_tag, version: r.payload_version }),
  );

  return rows.map((r, i) => {
    const after = i === 0 ? currentSchema : schemas[i - 1];
    return {
      id: r.id,
      dialogId: r.dialog_id,
      versionNumber: r.version_number,
      savedAt: r.saved_at,
      changes: after ? diffSchemas(schemas[i], after) : [],
    };
  });
}

export function getDialogVersion(dialogId: string, versionId: number): DialogVersionFull | null {
  const row = getDatabase()
    .prepare('SELECT id, dialog_id, version_number, payload_ciphertext, payload_iv, payload_tag, payload_version, saved_at FROM dialog_versions WHERE dialog_id = ? AND id = ?')
    .get(dialogId, versionId) as VersionRow | undefined;
  if (!row) return null;

  const schema = decryptSchema({
    ciphertext: row.payload_ciphertext,
    iv: row.payload_iv,
    tag: row.payload_tag,
    version: row.payload_version,
  });

  return {
    id: row.id,
    dialogId: row.dialog_id,
    versionNumber: row.version_number,
    savedAt: row.saved_at,
    schema,
  };
}

export function toggleDialogActive(id: string): DialogRecord | null {
  const existing = getDialog(id);
  if (!existing) {
    return null;
  }

  getDatabase()
    .prepare('UPDATE dialogs SET is_active = ?, updated_at = ? WHERE id = ?')
    .run(existing.isActive ? 0 : 1, new Date().toISOString(), id);

  return getDialog(id);
}

// Toggle für das im verschlüsselten Payload getragene `unlisted`-Flag.
// Schreibt nur die Payload-Spalten neu — kein saveVersion()-Aufruf, weil
// dieser Schalter ein reines Sichtbarkeits-Setting ist und die Versionsliste
// sonst mit jedem Klick wüchse.
export function toggleDialogUnlisted(id: string): DialogRecord | null {
  const existing = getDialog(id);
  if (!existing) {
    return null;
  }
  const next: FormSchema = { ...existing, unlisted: !existing.unlisted };
  const encrypted = encryptSchema(next);
  getDatabase()
    .prepare(`
      UPDATE dialogs
      SET payload_ciphertext = ?, payload_iv = ?, payload_tag = ?, payload_version = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      encrypted.version,
      new Date().toISOString(),
      id,
    );
  return getDialog(id);
}
