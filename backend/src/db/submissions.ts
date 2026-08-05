import crypto from 'crypto';
import { getDatabase } from './database';
import type { DiNoMapping } from '../services/dinoMapper';

export interface SubmissionRecord {
  id: string;
  formType: string;
  submittedAt: string;
  data: Record<string, unknown>;
  dinoMapping: DiNoMapping;
  pulledAt: string | null;
}

interface SubmissionRow {
  id: string;
  form_type: string;
  submitted_at: string;
  data_json: string;
  dino_json: string;
  pulled_at: string | null;
}

/** Eine vom Mandanten hochgeladene Datei, die mit der Submission bis zum
 * DiNo-Pull aufbewahrt wird. Bytes liegen Base64-kodiert in der DB. */
export interface SubmissionFileInput {
  fieldId?: string | null;
  fileName: string;
  contentType?: string | null;
  sizeBytes: number;
  dataBase64: string;
}

export interface SubmissionFileRecord extends SubmissionFileInput {
  id: string;
  submissionId: string;
  createdAt: string;
}

interface SubmissionFileRow {
  id: string;
  submission_id: string;
  field_id: string | null;
  file_name: string;
  content_type: string | null;
  size_bytes: number;
  data_base64: string;
  created_at: string;
}

function fileRowToRecord(row: SubmissionFileRow): SubmissionFileRecord {
  return {
    id: row.id,
    submissionId: row.submission_id,
    fieldId: row.field_id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    dataBase64: row.data_base64,
    createdAt: row.created_at,
  };
}

function rowToRecord(row: SubmissionRow): SubmissionRecord {
  return {
    id: row.id,
    formType: row.form_type,
    submittedAt: row.submitted_at,
    data: JSON.parse(row.data_json) as Record<string, unknown>,
    dinoMapping: JSON.parse(row.dino_json) as DiNoMapping,
    pulledAt: row.pulled_at,
  };
}

export function insertSubmission(
  formType: string,
  data: Record<string, unknown>,
  dinoMapping: DiNoMapping,
): SubmissionRecord {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  getDatabase()
    .prepare(`
      INSERT INTO submissions (id, form_type, submitted_at, data_json, dino_json, pulled_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `)
    .run(id, formType, now, JSON.stringify(data), JSON.stringify(dinoMapping));

  return getSubmission(id)!;
}

export function listPendingSubmissions(): SubmissionRecord[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM submissions ORDER BY submitted_at ASC')
    .all() as SubmissionRow[];

  return rows.map(rowToRecord);
}

export function markPulled(id: string): boolean {
  const result = getDatabase()
    .prepare('UPDATE submissions SET pulled_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);

  return result.changes > 0;
}

export function deleteSubmission(id: string): boolean {
  // FK ON DELETE CASCADE greift nur mit aktivierten foreign_keys-PRAGMA
  // (in better-sqlite3 nicht garantiert) — daher hier explizit aufraeumen.
  getDatabase().prepare('DELETE FROM submission_files WHERE submission_id = ?').run(id);
  const result = getDatabase()
    .prepare('DELETE FROM submissions WHERE id = ?')
    .run(id);

  return result.changes > 0;
}

/** Speichert die zu einer Submission hochgeladenen Dateien (Base64). */
export function insertSubmissionFiles(
  submissionId: string,
  files: SubmissionFileInput[],
): void {
  if (files.length === 0) return;
  const now = new Date().toISOString();
  const stmt = getDatabase().prepare(`
    INSERT INTO submission_files
      (id, submission_id, field_id, file_name, content_type, size_bytes, data_base64, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = getDatabase().transaction((rows: SubmissionFileInput[]) => {
    for (const f of rows) {
      stmt.run(
        crypto.randomUUID(),
        submissionId,
        f.fieldId ?? null,
        f.fileName,
        f.contentType ?? null,
        f.sizeBytes,
        f.dataBase64,
        now,
      );
    }
  });
  insertMany(files);
}

/** Liefert alle hochgeladenen Dateien einer Submission. */
export function getSubmissionFiles(submissionId: string): SubmissionFileRecord[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM submission_files WHERE submission_id = ? ORDER BY created_at ASC')
    .all(submissionId) as SubmissionFileRow[];

  return rows.map(fileRowToRecord);
}

export function getSubmission(id: string): SubmissionRecord | null {
  const row = getDatabase()
    .prepare('SELECT * FROM submissions WHERE id = ?')
    .get(id) as SubmissionRow | undefined;

  return row ? rowToRecord(row) : null;
}

export function cleanupExpiredSubmissions(ttlHours: number): number {
  const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000).toISOString();
  // Zugehoerige Dateien zuerst entfernen (kein verlaesslicher FK-Cascade).
  getDatabase()
    .prepare(
      `DELETE FROM submission_files WHERE submission_id IN
         (SELECT id FROM submissions WHERE submitted_at < ?)`,
    )
    .run(cutoff);
  const result = getDatabase()
    .prepare('DELETE FROM submissions WHERE submitted_at < ?')
    .run(cutoff);

  return result.changes;
}
