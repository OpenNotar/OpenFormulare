/**
 * rating_sessions: token-scoped Bewertungs-Instanzen.
 * Quelle: entweder DiNo-Push (`source = 'dino'`) oder OF-Admin-Standalone
 * (`source = 'standalone'`).
 */

import { getDatabase } from './database';

export type RatingQuestionType = 'stars' | 'scale' | 'yesno' | 'text';

export interface RatingQuestion {
  id: number | string;
  label: string;
  type: RatingQuestionType;
  minValue?: number | null;
  maxValue?: number | null;
  isRequired?: boolean;
  orderNo?: number;
  countsForOverall?: boolean;
}

export interface RatingFormDefinition {
  title: string;
  questions: RatingQuestion[];
}

export interface RatingAnswer {
  idRatingFormQuestion: number | string;
  AnswerNumeric?: number | null;
  AnswerText?: string | null;
}

export type RatingSessionStatus = 'pending' | 'submitted' | 'expired';

export interface RatingSessionRecord {
  token: string;
  source: 'dino' | 'standalone';
  originId: string | null;
  formTitle: string;
  formDefinition: RatingFormDefinition;
  thresholdScore: number | null;
  thanksText: string | null;
  thanksLinkLabel: string | null;
  thanksLinkUrl: string | null;
  recipientFirstName: string | null;
  recipientLastName: string | null;
  status: RatingSessionStatus;
  expiresAt: string | null;
  createdAt: string;
  openedAt: string | null;
  submittedAt: string | null;
  pulledAt: string | null;
  overallScore: number | null;
  answers: RatingAnswer[] | null;
}

interface SessionRow {
  token: string;
  source: string;
  origin_id: string | null;
  form_title: string;
  form_definition_json: string;
  threshold_score: number | null;
  thanks_text: string | null;
  thanks_link_label: string | null;
  thanks_link_url: string | null;
  recipient_first_name: string | null;
  recipient_last_name: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
  opened_at: string | null;
  submitted_at: string | null;
  pulled_at: string | null;
  overall_score: number | null;
  answers_json: string | null;
}

function rowToRecord(row: SessionRow): RatingSessionRecord {
  return {
    token: row.token,
    source: (row.source as 'dino' | 'standalone') ?? 'dino',
    originId: row.origin_id,
    formTitle: row.form_title,
    formDefinition: JSON.parse(row.form_definition_json) as RatingFormDefinition,
    thresholdScore: row.threshold_score,
    thanksText: row.thanks_text,
    thanksLinkLabel: row.thanks_link_label,
    thanksLinkUrl: row.thanks_link_url,
    recipientFirstName: row.recipient_first_name,
    recipientLastName: row.recipient_last_name,
    status: (row.status as RatingSessionStatus) ?? 'pending',
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    openedAt: row.opened_at,
    submittedAt: row.submitted_at,
    pulledAt: row.pulled_at,
    overallScore: row.overall_score,
    answers: row.answers_json ? (JSON.parse(row.answers_json) as RatingAnswer[]) : null,
  };
}

export interface CreateSessionInput {
  token: string;
  source: 'dino' | 'standalone';
  originId?: string | null;
  formTitle: string;
  formDefinition: RatingFormDefinition;
  thresholdScore?: number | null;
  thanksText?: string | null;
  thanksLinkLabel?: string | null;
  thanksLinkUrl?: string | null;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  expiresAt?: string | null;
}

export function upsertSession(input: CreateSessionInput): RatingSessionRecord {
  const now = new Date().toISOString();
  const existing = getSession(input.token);
  if (existing) {
    // Idempotent: nur Form-Definition + Metadaten aktualisieren, keine Antworten anfassen.
    getDatabase()
      .prepare(
        `UPDATE rating_sessions SET
           source = ?, origin_id = ?, form_title = ?, form_definition_json = ?,
           threshold_score = ?, thanks_text = ?, thanks_link_label = ?, thanks_link_url = ?,
           recipient_first_name = ?, recipient_last_name = ?, expires_at = ?
         WHERE token = ?`,
      )
      .run(
        input.source,
        input.originId ?? null,
        input.formTitle,
        JSON.stringify(input.formDefinition),
        input.thresholdScore ?? null,
        input.thanksText ?? null,
        input.thanksLinkLabel ?? null,
        input.thanksLinkUrl ?? null,
        input.recipientFirstName ?? null,
        input.recipientLastName ?? null,
        input.expiresAt ?? null,
        input.token,
      );
    return getSession(input.token)!;
  }

  getDatabase()
    .prepare(
      `INSERT INTO rating_sessions
         (token, source, origin_id, form_title, form_definition_json,
          threshold_score, thanks_text, thanks_link_label, thanks_link_url,
          recipient_first_name, recipient_last_name,
          status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .run(
      input.token,
      input.source,
      input.originId ?? null,
      input.formTitle,
      JSON.stringify(input.formDefinition),
      input.thresholdScore ?? null,
      input.thanksText ?? null,
      input.thanksLinkLabel ?? null,
      input.thanksLinkUrl ?? null,
      input.recipientFirstName ?? null,
      input.recipientLastName ?? null,
      input.expiresAt ?? null,
      now,
    );

  return getSession(input.token)!;
}

export function getSession(token: string): RatingSessionRecord | null {
  const row = getDatabase()
    .prepare('SELECT * FROM rating_sessions WHERE token = ?')
    .get(token) as SessionRow | undefined;
  if (!row) return null;
  return rowToRecord(row);
}

export function markOpened(token: string): void {
  getDatabase()
    .prepare(
      `UPDATE rating_sessions SET opened_at = COALESCE(opened_at, ?) WHERE token = ?`,
    )
    .run(new Date().toISOString(), token);
}

export interface SubmissionInput {
  answers: RatingAnswer[];
  overallScore: number | null;
}

export function submitSession(token: string, input: SubmissionInput): RatingSessionRecord | null {
  const now = new Date().toISOString();
  const existing = getSession(token);
  if (!existing || existing.status === 'submitted') {
    return existing;
  }
  if (existing.expiresAt && new Date(existing.expiresAt).getTime() < Date.now()) {
    getDatabase()
      .prepare(`UPDATE rating_sessions SET status = 'expired' WHERE token = ?`)
      .run(token);
    return null;
  }
  getDatabase()
    .prepare(
      `UPDATE rating_sessions SET
         answers_json = ?, overall_score = ?, status = 'submitted', submitted_at = ?
       WHERE token = ?`,
    )
    .run(JSON.stringify(input.answers), input.overallScore, now, token);
  return getSession(token);
}

export interface ListFilter {
  status?: RatingSessionStatus;
  source?: 'dino' | 'standalone';
  since?: string; // ISO timestamp; nur submitted_at > since
}

export function listSessions(filter: ListFilter = {}): RatingSessionRecord[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.source) {
    conditions.push('source = ?');
    params.push(filter.source);
  }
  if (filter.since) {
    conditions.push('(submitted_at IS NOT NULL AND submitted_at > ?)');
    params.push(filter.since);
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const rows = getDatabase()
    .prepare(`SELECT * FROM rating_sessions ${where} ORDER BY created_at DESC`)
    .all(...params) as SessionRow[];
  return rows.map(rowToRecord);
}

export function deleteSession(token: string): boolean {
  const result = getDatabase()
    .prepare('DELETE FROM rating_sessions WHERE token = ?')
    .run(token);
  return result.changes > 0;
}

export function markPulled(token: string): void {
  getDatabase()
    .prepare(`UPDATE rating_sessions SET pulled_at = ? WHERE token = ?`)
    .run(new Date().toISOString(), token);
}

export function expireOverdueSessions(): number {
  const now = new Date().toISOString();
  const result = getDatabase()
    .prepare(
      `UPDATE rating_sessions SET status = 'expired'
         WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?`,
    )
    .run(now);
  return result.changes;
}
