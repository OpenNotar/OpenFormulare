// Persistent key-value store for global settings: kontakt template, branding,
// person templates, dispatch / email / DiNo configuration. Values are stored
// as JSON strings.
//
// All reads go through `getEffectiveSetting`, which in DEMO_MODE first checks
// the in-memory session override (so demo visitors get their own sandbox of
// settings) and then falls back to the persisted DB value. Writes are routed
// to the session store in demo mode and to the DB in production.

import { getDatabase } from './database';
import { getDemoSetting, setDemoSetting } from './settingsStore';

// Inlined to avoid a cyclic import with runtimeMode.ts (which itself reads
// settings via getEffectiveSetting). DEMO_MODE is a boot-time env flag.
function isDemoModeEnv(): boolean {
  return (process.env.DEMO_MODE ?? '').trim().toLowerCase() === 'true';
}

interface Row {
  key: string;
  value: string;
  updated_at: string;
}

export function getSetting<T>(key: string): T | null {
  const row = getDatabase()
    .prepare('SELECT key, value, updated_at FROM settings WHERE key = ?')
    .get(key) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setSetting<T>(key: string, value: T): void {
  const json = JSON.stringify(value);
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, json, now);
}

// Read with optional demo session override. In demo mode an active session
// override takes precedence over the persisted value.
export function getEffectiveSetting<T>(sessionId: string | undefined, key: string): T | null {
  if (isDemoModeEnv() && sessionId) {
    const override = getDemoSetting<T>(sessionId, key);
    if (override !== undefined) return override;
  }
  return getSetting<T>(key);
}

// Write that lands in the session store under demo mode and in the DB otherwise.
export function setEffectiveSetting<T>(sessionId: string | undefined, key: string, value: T): void {
  if (isDemoModeEnv()) {
    if (!sessionId) {
      throw new Error('Demo-Session konnte nicht ermittelt werden.');
    }
    setDemoSetting(sessionId, key, value);
    return;
  }
  setSetting(key, value);
}

export const SETTING_KEYS = {
  kontaktStep: 'kontakt_step',
  branding: 'branding',
  personTemplateNatural: 'person_template_natural',
  personTemplateLegal: 'person_template_legal',
  dispatchConfig: 'dispatch_config',
  emailConfig: 'email_config',
  dinoConfig: 'dino_config',
  // Letzte App-Version, die vom Admin in der Onboarding-Übersicht bestätigt
  // wurde. Wird mit der aktuell laufenden Version (backend/package.json)
  // verglichen, um die "Was ist neu?"-Seite zu triggern.
  appVersionSeen: 'app_version_seen',
  // Letztes Auto-Sync-Ergebnis (welche Dialoge wurden beim Server-Start
  // automatisch importiert / aktualisiert). Wird vom Onboarding-Tool im UI
  // sichtbar gemacht, damit Admins nachvollziehen können, was die Migration
  // im Hintergrund gemacht hat.
  lastSeedAutoSync: 'last_seed_auto_sync',
} as const;
