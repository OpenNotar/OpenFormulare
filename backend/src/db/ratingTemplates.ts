/**
 * rating_form_templates: wiederverwendbare Bewertungsbogen-Vorlagen fuer den
 * OF-Standalone-Modus. DiNo-getriebene Sessions verwenden ihren eigenen,
 * eingebetteten Form-Snapshot und benoetigen keine Templates.
 */

import crypto from 'crypto';
import { getDatabase } from './database';
import type { RatingFormDefinition } from './ratingSessions';

export interface RatingTemplateRecord {
  id: string;
  title: string;
  definition: RatingFormDefinition;
  thresholdScore: number | null;
  thanksText: string | null;
  thanksLinkLabel: string | null;
  thanksLinkUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TemplateRow {
  id: string;
  title: string;
  definition_json: string;
  threshold_score: number | null;
  thanks_text: string | null;
  thanks_link_label: string | null;
  thanks_link_url: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: TemplateRow): RatingTemplateRecord {
  return {
    id: row.id,
    title: row.title,
    definition: JSON.parse(row.definition_json) as RatingFormDefinition,
    thresholdScore: row.threshold_score,
    thanksText: row.thanks_text,
    thanksLinkLabel: row.thanks_link_label,
    thanksLinkUrl: row.thanks_link_url,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertTemplateInput {
  id?: string;
  title: string;
  definition: RatingFormDefinition;
  thresholdScore?: number | null;
  thanksText?: string | null;
  thanksLinkLabel?: string | null;
  thanksLinkUrl?: string | null;
  isActive?: boolean;
}

export function listTemplates(): RatingTemplateRecord[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM rating_form_templates ORDER BY title')
    .all() as TemplateRow[];
  return rows.map(rowToRecord);
}

export function getTemplate(id: string): RatingTemplateRecord | null {
  const row = getDatabase()
    .prepare('SELECT * FROM rating_form_templates WHERE id = ?')
    .get(id) as TemplateRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function createTemplate(input: UpsertTemplateInput): RatingTemplateRecord {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO rating_form_templates
         (id, title, definition_json, threshold_score, thanks_text,
          thanks_link_label, thanks_link_url, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.title,
      JSON.stringify(input.definition),
      input.thresholdScore ?? null,
      input.thanksText ?? null,
      input.thanksLinkLabel ?? null,
      input.thanksLinkUrl ?? null,
      input.isActive === false ? 0 : 1,
      now,
      now,
    );
  return getTemplate(id)!;
}

export function updateTemplate(id: string, input: UpsertTemplateInput): RatingTemplateRecord | null {
  const existing = getTemplate(id);
  if (!existing) return null;
  getDatabase()
    .prepare(
      `UPDATE rating_form_templates SET
         title = ?, definition_json = ?, threshold_score = ?, thanks_text = ?,
         thanks_link_label = ?, thanks_link_url = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.title ?? existing.title,
      JSON.stringify(input.definition ?? existing.definition),
      input.thresholdScore ?? null,
      input.thanksText ?? null,
      input.thanksLinkLabel ?? null,
      input.thanksLinkUrl ?? null,
      input.isActive === false ? 0 : 1,
      new Date().toISOString(),
      id,
    );
  return getTemplate(id);
}

export function deleteTemplate(id: string): boolean {
  const result = getDatabase()
    .prepare('DELETE FROM rating_form_templates WHERE id = ?')
    .run(id);
  return result.changes > 0;
}
