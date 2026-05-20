// Persistence layer for plugin metadata + settings.
//
// Settings vom Typ `password` (laut Plugin-Manifest) werden mit `encryptString`
// verschlüsselt persistiert. Reads entschlüsseln transparent — alte Plain-
// Werte funktionieren weiterhin, werden beim nächsten Save aber automatisch
// in die verschlüsselte Form überführt.

import { getDatabase } from '../db/database';
import { encryptString, maybeDecryptString } from '../db/crypto';

export interface PluginRow {
  id: string;
  version: string;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
}

interface RawPluginRow {
  id: string;
  version: string;
  enabled: number;
  installed_at: string;
  updated_at: string;
}

function mapRow(row: RawPluginRow): PluginRow {
  return {
    id: row.id,
    version: row.version,
    enabled: row.enabled === 1,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
  };
}

export function listPlugins(): PluginRow[] {
  const rows = getDatabase()
    .prepare('SELECT id, version, enabled, installed_at, updated_at FROM plugins ORDER BY id')
    .all() as RawPluginRow[];
  return rows.map(mapRow);
}

export function getPlugin(id: string): PluginRow | null {
  const row = getDatabase()
    .prepare('SELECT id, version, enabled, installed_at, updated_at FROM plugins WHERE id = ?')
    .get(id) as RawPluginRow | undefined;
  return row ? mapRow(row) : null;
}

export function upsertPlugin(id: string, version: string): PluginRow {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = getPlugin(id);
  if (existing) {
    if (existing.version !== version) {
      db.prepare('UPDATE plugins SET version = ?, updated_at = ? WHERE id = ?')
        .run(version, now, id);
    }
    return getPlugin(id)!;
  }
  db.prepare(
    'INSERT INTO plugins (id, version, enabled, installed_at, updated_at) VALUES (?, ?, 0, ?, ?)',
  ).run(id, version, now, now);
  return getPlugin(id)!;
}

export function setPluginEnabled(id: string, enabled: boolean): PluginRow | null {
  const existing = getPlugin(id);
  if (!existing) return null;
  getDatabase()
    .prepare('UPDATE plugins SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, new Date().toISOString(), id);
  return getPlugin(id);
}

// ---------------------------------------------------------------------------
// Settings (key/value, namespaced per plugin)
// ---------------------------------------------------------------------------

export function getPluginSettings(pluginId: string): Record<string, string> {
  const rows = getDatabase()
    .prepare('SELECT key, value FROM plugin_settings WHERE plugin_id = ?')
    .all(pluginId) as Array<{ key: string; value: string }>;
  const out: Record<string, string> = {};
  // maybeDecryptString lässt nicht-verschlüsselte Werte unverändert durch —
  // damit funktionieren bestehende Plain-Text-Einträge weiter.
  for (const r of rows) out[r.key] = maybeDecryptString(r.value);
  return out;
}

// Schreibt einen einzelnen Setting-Wert. Caller markieren mit `isSecret=true`,
// dass dieser Wert vor dem Persistieren verschlüsselt werden soll.
export function setPluginSetting(
  pluginId: string,
  key: string,
  value: string,
  isSecret = false,
): void {
  const now = new Date().toISOString();
  const stored = isSecret ? encryptString(value) : value;
  getDatabase()
    .prepare(
      `INSERT INTO plugin_settings (plugin_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(pluginId, key, stored, now);
}

// Ersetzt sämtliche Settings eines Plugins in einer Transaktion. Optional
// kann ein `secretKeys`-Set übergeben werden — diese Werte werden mit
// `encryptString` verschlüsselt persistiert.
export function replacePluginSettings(
  pluginId: string,
  values: Record<string, string>,
  secretKeys: ReadonlySet<string> = new Set(),
): void {
  const db = getDatabase();
  const tx = db.transaction((entries: Array<[string, string]>) => {
    db.prepare('DELETE FROM plugin_settings WHERE plugin_id = ?').run(pluginId);
    const insert = db.prepare(
      'INSERT INTO plugin_settings (plugin_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
    );
    const now = new Date().toISOString();
    for (const [k, v] of entries) {
      const stored = secretKeys.has(k) ? encryptString(v) : v;
      insert.run(pluginId, k, stored, now);
    }
  });
  tx(Object.entries(values));
}
