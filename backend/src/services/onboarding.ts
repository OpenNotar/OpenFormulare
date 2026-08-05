// ---------------------------------------------------------------------------
// Onboarding / Migrations-Übersicht
//
// Stellt dem Admin nach jedem Versionssprung eine Liste mit:
//   - Release Notes (Was ist neu?)
//   - Geänderten oder neuen Seed-Dialogen
//   - Erkannten lokalen Anpassungen (Warnung vor Überschreiben)
//
// zur Verfügung. Aktionen:
//   - Einzelnen Seed-Dialog übernehmen (= Schema in DB überschreiben +
//     Backup als neuer Eintrag in `dialog_versions`)
//   - Alle als gesehen markieren (= `app_version_seen` setzen)
//
// Detection-Strategie:
//   - "Lokal verändert" = mindestens ein Eintrag in `dialog_versions`
//     (funktioniert retroaktiv, keine Migration nötig)
//   - "Aktualisiert"    = Deep-Equal-Diff zwischen aktuellem DB-Schema
//     und Seed-JSON
//   - "Neu"             = Seed-Dialog existiert nicht in der DB UND
//     ist nicht im `seed_tombstones`-Tombstone vermerkt
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';

import { getDatabase, getDialog, createDialog, updateDialog } from '../db/database';
import { defaultDialogs } from '../db/defaultDialogs';
import { getSetting, setSetting, SETTING_KEYS } from '../db/settings';
import type { FormSchema } from '../db/types/schema';

// ---------------------------------------------------------------------------
// Versions-Tracking
// ---------------------------------------------------------------------------

let cachedCurrentVersion: string | null = null;

function readCurrentVersion(): string {
  if (cachedCurrentVersion) return cachedCurrentVersion;
  // Suche package.json relativ zur ausgeführten Datei. In dev liegt sie unter
  // `../../package.json` (src/services → src → backend); in Production unter
  // `../../package.json` (dist/services → dist → backend) — Pfade sind also
  // identisch.
  const candidates = [
    path.resolve(__dirname, '../../package.json'),
    path.resolve(__dirname, '../../../package.json'),
    path.resolve(process.cwd(), 'package.json'),
  ];
  for (const c of candidates) {
    try {
      const raw = fs.readFileSync(c, 'utf8');
      const json = JSON.parse(raw) as { version?: string; name?: string };
      if (json.name === 'openformulare-backend' && typeof json.version === 'string') {
        cachedCurrentVersion = json.version;
        return json.version;
      }
    } catch {
      /* nächste Pfad-Variante versuchen */
    }
  }
  return '0.0.0';
}

export function getCurrentAppVersion(): string {
  return readCurrentVersion();
}

export function getSeenAppVersion(): string {
  return getSetting<string>(SETTING_KEYS.appVersionSeen) ?? '0.0.0';
}

export function acknowledgeCurrentVersion(): void {
  setSetting(SETTING_KEYS.appVersionSeen, getCurrentAppVersion());
}

// Letztes Auto-Sync-Ergebnis vom Server-Start. `null` wenn beim letzten
// Start keine Änderungen am Seed-Bestand nötig waren (= Default-Zustand).
export interface LastAutoSync {
  at: string;
  inserted: number;
  updated: number;
  skipped: number;
  insertedIds: string[];
  updatedIds: string[];
}

export function getLastAutoSync(): LastAutoSync | null {
  return getSetting<LastAutoSync>(SETTING_KEYS.lastSeedAutoSync);
}

// Naive Semver-Vergleichsfunktion. Genügt für x.y.z ohne pre-release Tags.
function compareVersions(a: string, b: string): number {
  const aa = a.split('.').map((s) => parseInt(s, 10) || 0);
  const bb = b.split('.').map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const diff = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Release Notes
// ---------------------------------------------------------------------------

export interface ReleaseNoteHighlight {
  title: string;
  body: string;
}
export interface ReleaseNoteEntry {
  version: string;
  date: string;
  title: string;
  highlights: ReleaseNoteHighlight[];
}

let cachedNotes: ReleaseNoteEntry[] | null = null;

function loadReleaseNotes(): ReleaseNoteEntry[] {
  if (cachedNotes) return cachedNotes;
  const candidates = [
    path.resolve(__dirname, '../db/seeds/release-notes.json'),
    path.resolve(__dirname, '../../src/db/seeds/release-notes.json'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw) as { versions?: ReleaseNoteEntry[] };
      if (Array.isArray(parsed.versions)) {
        cachedNotes = parsed.versions;
        return parsed.versions;
      }
    } catch (err) {
      // Wir loggen — sonst verschwinden Tippfehler / ungültiges JSON
      // unbemerkt und der Admin sieht einfach „keine Release Notes".
      console.warn(`[onboarding] Konnte ${file} nicht parsen:`, err instanceof Error ? err.message : err);
    }
  }
  cachedNotes = [];
  return [];
}

// Gibt alle Notes-Einträge zurück, deren Version > seenVersion ist (also
// noch nicht bestätigt). Sortiert absteigend (neueste zuerst).
export function getUnseenReleaseNotes(): ReleaseNoteEntry[] {
  const seen = getSeenAppVersion();
  const notes = loadReleaseNotes();
  return notes
    .filter((n) => compareVersions(n.version, seen) > 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

// ---------------------------------------------------------------------------
// Seed-Diff
// ---------------------------------------------------------------------------

export type SeedChangeStatus = 'new' | 'changed' | 'unchanged' | 'tombstoned';

export interface SeedChangeEntry {
  dialogId: string;
  title: string;
  status: SeedChangeStatus;
  // Wenn der Admin den Dialog in der lokalen Instanz nach dem Initial-Seed
  // bearbeitet hat. Heuristik: ein oder mehrere Einträge in `dialog_versions`.
  userModified: boolean;
  // Verkürzte Beschreibung der Änderung (nur für 'changed'); zeigt Steps /
  // Felder-Anzahl + ob Icon oder Sprachen neu sind.
  summary?: string;
}

// Tiefer struktureller Vergleich. Reihenfolge in Arrays ist relevant
// (Schritte / Felder sind sortiert).
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== (b as unknown[]).length) return false;
    return a.every((x, i) => deepEqual(x, (b as unknown[])[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

function summarizeChange(seed: FormSchema, current: FormSchema): string {
  const bits: string[] = [];
  if (seed.icon && seed.icon !== current.icon) bits.push('Icon');
  if (
    Array.isArray(seed.languages) && seed.languages.length > 0 &&
    !(Array.isArray(current.languages) && current.languages.length === seed.languages.length)
  ) {
    bits.push('Sprachen');
  }
  const seedFieldCount = (seed.steps ?? []).reduce((n, s) => n + s.fields.length, 0);
  const currentFieldCount = (current.steps ?? []).reduce((n, s) => n + s.fields.length, 0);
  if (seedFieldCount !== currentFieldCount) {
    bits.push(`${currentFieldCount} → ${seedFieldCount} Felder`);
  } else {
    const stepCount = (seed.steps ?? []).length;
    if (stepCount !== (current.steps ?? []).length) bits.push('Schritte');
    else bits.push('Schema-Änderung');
  }
  return bits.join(', ');
}

function hasUserModifications(db: ReturnType<typeof getDatabase>, dialogId: string): boolean {
  const row = db
    .prepare('SELECT COUNT(*) as c FROM dialog_versions WHERE dialog_id = ?')
    .get(dialogId) as { c: number } | undefined;
  return !!(row && row.c > 0);
}

function isTombstoned(db: ReturnType<typeof getDatabase>, dialogId: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM seed_tombstones WHERE dialog_id = ?')
    .get(dialogId);
  return !!row;
}

export function computeSeedChanges(): SeedChangeEntry[] {
  const db = getDatabase();
  const out: SeedChangeEntry[] = [];

  for (const seed of defaultDialogs) {
    const dbDialog = getDialog(seed.id);
    if (!dbDialog) {
      if (isTombstoned(db, seed.id)) {
        out.push({
          dialogId: seed.id,
          title: seed.title,
          status: 'tombstoned',
          userModified: false,
        });
        continue;
      }
      out.push({
        dialogId: seed.id,
        title: seed.title,
        status: 'new',
        userModified: false,
      });
      continue;
    }

    // Kontakt-Step liegt nicht im Seed (wird per Settings appended) – beim
    // Vergleich filtern wir ihn raus, sonst würde der Diff immer schlagen.
    const currentForDiff: FormSchema = {
      ...dbDialog,
      steps: (dbDialog.steps ?? []).filter((s) => s.id !== 'kontakt'),
    };
    // Felder, die nicht Teil des Seed-Schemas sind, beim Vergleich entfernen
    // (createdAt/updatedAt sind DB-side stamps).
    const stripMeta = (s: FormSchema): FormSchema => {
      const { createdAt, updatedAt, isSystem, ...rest } = s as FormSchema & {
        createdAt?: string; updatedAt?: string; isSystem?: boolean;
      };
      void createdAt; void updatedAt; void isSystem;
      return rest as FormSchema;
    };

    const eq = deepEqual(stripMeta(currentForDiff), stripMeta(seed));
    if (eq) {
      out.push({
        dialogId: seed.id,
        title: seed.title,
        status: 'unchanged',
        userModified: false,
      });
      continue;
    }

    out.push({
      dialogId: seed.id,
      title: seed.title,
      status: 'changed',
      userModified: hasUserModifications(db, seed.id),
      summary: summarizeChange(seed, currentForDiff),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

// Übernimmt den Seed-Dialog komplett (Überschreibung). Falls der Dialog
// schon existiert, wird der bisherige Stand vor dem Update automatisch in
// `dialog_versions` gesichert (passiert durch updateDialog → saveVersion).
// Falls der Dialog noch nicht existiert, wird er angelegt.
export function importSeedDialog(dialogId: string): SeedChangeEntry | null {
  const seed = defaultDialogs.find((d) => d.id === dialogId);
  if (!seed) return null;

  const dbDialog = getDialog(seed.id);
  if (dbDialog) {
    updateDialog(seed.id, { ...seed, isActive: dbDialog.isActive });
  } else {
    createDialog({ ...seed, isSystem: true });
  }
  // Nach dem Import den Status neu berechnen
  return computeSeedChanges().find((e) => e.dialogId === seed.id) ?? null;
}
