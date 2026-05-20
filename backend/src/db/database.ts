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

function seedDefaultDialogs(db: Database.Database) {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM dialogs').get() as {
    count: number;
  };
  if (countRow.count > 0) {
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO dialogs (
      id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at
    ) VALUES (
      @id, @payload_ciphertext, @payload_iv, @payload_tag, @payload_version, @is_active, @is_system, @created_at, @updated_at
    )
  `);

  const tx = db.transaction((dialogs: FormSchema[]) => {
    for (const dialog of dialogs) {
      // No need to inject the kontakt step here – it is appended at read
      // time by `rowToDialog` from the central settings.kontakt_step.
      const normalized = dialog;
      const encrypted = encryptSchema(normalized);
      insert.run({
        id: normalized.id,
        payload_ciphertext: encrypted.ciphertext,
        payload_iv: encrypted.iv,
        payload_tag: encrypted.tag,
        payload_version: encrypted.version,
        is_active: normalized.isActive === false ? 0 : 1,
        is_system: normalized.isSystem ? 1 : 0,
        created_at: now,
        updated_at: now,
      });
    }
  });

  tx(defaultDialogs);
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
  seedDefaultDialogs(database);
  seedDefaultTranslations(database);

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

  db
    .prepare(`
      UPDATE dialogs
      SET id = ?, payload_ciphertext = ?, payload_iv = ?, payload_tag = ?, payload_version = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      nextId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      encrypted.version,
      dialog.isActive ? 1 : 0,
      new Date().toISOString(),
      currentId,
    );

  return getDialog(nextId);
}

export function deleteDialog(id: string): boolean {
  const result = getDatabase().prepare('DELETE FROM dialogs WHERE id = ?').run(id);
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
