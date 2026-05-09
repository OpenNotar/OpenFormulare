"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabase = getDatabase;
exports.listDialogs = listDialogs;
exports.getDialog = getDialog;
exports.createDialog = createDialog;
exports.updateDialog = updateDialog;
exports.deleteDialog = deleteDialog;
exports.listDialogVersionsWithDiff = listDialogVersionsWithDiff;
exports.getDialogVersion = getDialogVersion;
exports.toggleDialogActive = toggleDialogActive;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("./crypto");
const defaultDialogs_1 = require("./defaultDialogs");
const sharedSteps_1 = require("./sharedSteps");
const schemaDiff_1 = require("../services/schemaDiff");
const yoyo_1 = require("./yoyo");
let database = null;
function getDatabasePath() {
    const configured = process.env.SQLITE_PATH;
    if (configured) {
        return path_1.default.resolve(configured);
    }
    const cwd = process.cwd();
    const dataDir = path_1.default.basename(cwd) === 'backend'
        ? path_1.default.resolve(cwd, 'data')
        : path_1.default.resolve(cwd, 'backend', 'data');
    return path_1.default.join(dataDir, 'dialogs.sqlite');
}
function ensureParentDir(filePath) {
    fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
}
function rowToDialog(row) {
    const schema = (0, crypto_1.decryptSchema)({
        ciphertext: row.payload_ciphertext,
        iv: row.payload_iv,
        tag: row.payload_tag,
        version: row.payload_version,
    });
    const normalized = (0, sharedSteps_1.ensureKontaktStepAtEnd)(schema);
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
function seedDefaultDialogs(db) {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM dialogs').get();
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
    const tx = db.transaction((dialogs) => {
        for (const dialog of dialogs) {
            // No need to inject the kontakt step here – it is appended at read
            // time by `rowToDialog` from the central settings.kontakt_step.
            const normalized = dialog;
            const encrypted = (0, crypto_1.encryptSchema)(normalized);
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
    tx(defaultDialogs_1.defaultDialogs);
}
function getDatabase() {
    if (database) {
        return database;
    }
    const dbPath = getDatabasePath();
    ensureParentDir(dbPath);
    (0, yoyo_1.runYoyoMigrations)(dbPath);
    database = new better_sqlite3_1.default(dbPath);
    database.pragma('journal_mode = WAL');
    seedDefaultDialogs(database);
    return database;
}
function listDialogs() {
    const rows = getDatabase()
        .prepare('SELECT id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at FROM dialogs')
        .all();
    return rows
        .map(rowToDialog)
        .sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));
}
function getDialog(id) {
    const row = getDatabase()
        .prepare('SELECT id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at FROM dialogs WHERE id = ?')
        .get(id);
    return row ? rowToDialog(row) : null;
}
function createDialog(input) {
    const now = new Date().toISOString();
    const dialog = (0, sharedSteps_1.ensureKontaktStepAtEnd)({
        ...input,
        description: input.description ?? '',
        category: input.category ?? 'Allgemein',
        isActive: input.isActive ?? true,
    });
    const encrypted = (0, crypto_1.encryptSchema)(dialog);
    getDatabase()
        .prepare(`
      INSERT INTO dialogs (
        id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `)
        .run(dialog.id, encrypted.ciphertext, encrypted.iv, encrypted.tag, encrypted.version, dialog.isActive ? 1 : 0, now, now);
    return getDialog(dialog.id);
}
function updateDialog(currentId, input) {
    const db = getDatabase();
    const rawRow = db
        .prepare('SELECT id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at FROM dialogs WHERE id = ?')
        .get(currentId);
    if (!rawRow)
        return null;
    saveVersion(db, currentId, rawRow);
    const dialog = (0, sharedSteps_1.ensureKontaktStepAtEnd)({
        ...input,
        description: input.description ?? '',
        category: input.category ?? 'Allgemein',
        isActive: input.isActive ?? (rawRow.is_active === 1),
    });
    const nextId = dialog.id;
    const encrypted = (0, crypto_1.encryptSchema)(dialog);
    db
        .prepare(`
      UPDATE dialogs
      SET id = ?, payload_ciphertext = ?, payload_iv = ?, payload_tag = ?, payload_version = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `)
        .run(nextId, encrypted.ciphertext, encrypted.iv, encrypted.tag, encrypted.version, dialog.isActive ? 1 : 0, new Date().toISOString(), currentId);
    return getDialog(nextId);
}
function deleteDialog(id) {
    const result = getDatabase().prepare('DELETE FROM dialogs WHERE id = ?').run(id);
    return result.changes > 0;
}
const MAX_VERSIONS = 20;
function saveVersion(db, dialogId, row) {
    const lastRow = db
        .prepare('SELECT version_number FROM dialog_versions WHERE dialog_id = ? ORDER BY version_number DESC LIMIT 1')
        .get(dialogId);
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
function listDialogVersionsWithDiff(dialogId) {
    const db = getDatabase();
    const rows = db
        .prepare('SELECT id, dialog_id, version_number, payload_ciphertext, payload_iv, payload_tag, payload_version, saved_at FROM dialog_versions WHERE dialog_id = ? ORDER BY version_number DESC')
        .all(dialogId);
    if (rows.length === 0)
        return [];
    const currentRow = db
        .prepare('SELECT id, payload_ciphertext, payload_iv, payload_tag, payload_version, is_active, is_system, created_at, updated_at FROM dialogs WHERE id = ?')
        .get(dialogId);
    const currentSchema = currentRow
        ? (0, crypto_1.decryptSchema)({ ciphertext: currentRow.payload_ciphertext, iv: currentRow.payload_iv, tag: currentRow.payload_tag, version: currentRow.payload_version })
        : null;
    const schemas = rows.map((r) => (0, crypto_1.decryptSchema)({ ciphertext: r.payload_ciphertext, iv: r.payload_iv, tag: r.payload_tag, version: r.payload_version }));
    return rows.map((r, i) => {
        const after = i === 0 ? currentSchema : schemas[i - 1];
        return {
            id: r.id,
            dialogId: r.dialog_id,
            versionNumber: r.version_number,
            savedAt: r.saved_at,
            changes: after ? (0, schemaDiff_1.diffSchemas)(schemas[i], after) : [],
        };
    });
}
function getDialogVersion(dialogId, versionId) {
    const row = getDatabase()
        .prepare('SELECT id, dialog_id, version_number, payload_ciphertext, payload_iv, payload_tag, payload_version, saved_at FROM dialog_versions WHERE dialog_id = ? AND id = ?')
        .get(dialogId, versionId);
    if (!row)
        return null;
    const schema = (0, crypto_1.decryptSchema)({
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
function toggleDialogActive(id) {
    const existing = getDialog(id);
    if (!existing) {
        return null;
    }
    getDatabase()
        .prepare('UPDATE dialogs SET is_active = ?, updated_at = ? WHERE id = ?')
        .run(existing.isActive ? 0 : 1, new Date().toISOString(), id);
    return getDialog(id);
}
