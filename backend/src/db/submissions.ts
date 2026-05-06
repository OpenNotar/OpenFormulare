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
  const result = getDatabase()
    .prepare('DELETE FROM submissions WHERE id = ?')
    .run(id);

  return result.changes > 0;
}

export function getSubmission(id: string): SubmissionRecord | null {
  const row = getDatabase()
    .prepare('SELECT * FROM submissions WHERE id = ?')
    .get(id) as SubmissionRow | undefined;

  return row ? rowToRecord(row) : null;
}

export function cleanupExpiredSubmissions(ttlHours: number): number {
  const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000).toISOString();
  const result = getDatabase()
    .prepare('DELETE FROM submissions WHERE submitted_at < ?')
    .run(cutoff);

  return result.changes;
}
