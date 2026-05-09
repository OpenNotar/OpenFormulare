// Persistence layer for plugin metadata + settings.

import { getDatabase } from '../db/database';

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
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function setPluginSetting(pluginId: string, key: string, value: string): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO plugin_settings (plugin_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(pluginId, key, value, now);
}

export function replacePluginSettings(pluginId: string, values: Record<string, string>): void {
  const db = getDatabase();
  const tx = db.transaction((entries: Array<[string, string]>) => {
    db.prepare('DELETE FROM plugin_settings WHERE plugin_id = ?').run(pluginId);
    const insert = db.prepare(
      'INSERT INTO plugin_settings (plugin_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
    );
    const now = new Date().toISOString();
    for (const [k, v] of entries) insert.run(pluginId, k, v, now);
  });
  tx(Object.entries(values));
}
