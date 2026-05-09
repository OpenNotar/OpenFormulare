"use strict";
// Persistence layer for plugin metadata + settings.
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPlugins = listPlugins;
exports.getPlugin = getPlugin;
exports.upsertPlugin = upsertPlugin;
exports.setPluginEnabled = setPluginEnabled;
exports.getPluginSettings = getPluginSettings;
exports.setPluginSetting = setPluginSetting;
exports.replacePluginSettings = replacePluginSettings;
const database_1 = require("../db/database");
function mapRow(row) {
    return {
        id: row.id,
        version: row.version,
        enabled: row.enabled === 1,
        installedAt: row.installed_at,
        updatedAt: row.updated_at,
    };
}
function listPlugins() {
    const rows = (0, database_1.getDatabase)()
        .prepare('SELECT id, version, enabled, installed_at, updated_at FROM plugins ORDER BY id')
        .all();
    return rows.map(mapRow);
}
function getPlugin(id) {
    const row = (0, database_1.getDatabase)()
        .prepare('SELECT id, version, enabled, installed_at, updated_at FROM plugins WHERE id = ?')
        .get(id);
    return row ? mapRow(row) : null;
}
function upsertPlugin(id, version) {
    const db = (0, database_1.getDatabase)();
    const now = new Date().toISOString();
    const existing = getPlugin(id);
    if (existing) {
        if (existing.version !== version) {
            db.prepare('UPDATE plugins SET version = ?, updated_at = ? WHERE id = ?')
                .run(version, now, id);
        }
        return getPlugin(id);
    }
    db.prepare('INSERT INTO plugins (id, version, enabled, installed_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(id, version, now, now);
    return getPlugin(id);
}
function setPluginEnabled(id, enabled) {
    const existing = getPlugin(id);
    if (!existing)
        return null;
    (0, database_1.getDatabase)()
        .prepare('UPDATE plugins SET enabled = ?, updated_at = ? WHERE id = ?')
        .run(enabled ? 1 : 0, new Date().toISOString(), id);
    return getPlugin(id);
}
// ---------------------------------------------------------------------------
// Settings (key/value, namespaced per plugin)
// ---------------------------------------------------------------------------
function getPluginSettings(pluginId) {
    const rows = (0, database_1.getDatabase)()
        .prepare('SELECT key, value FROM plugin_settings WHERE plugin_id = ?')
        .all(pluginId);
    const out = {};
    for (const r of rows)
        out[r.key] = r.value;
    return out;
}
function setPluginSetting(pluginId, key, value) {
    const now = new Date().toISOString();
    (0, database_1.getDatabase)()
        .prepare(`INSERT INTO plugin_settings (plugin_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .run(pluginId, key, value, now);
}
function replacePluginSettings(pluginId, values) {
    const db = (0, database_1.getDatabase)();
    const tx = db.transaction((entries) => {
        db.prepare('DELETE FROM plugin_settings WHERE plugin_id = ?').run(pluginId);
        const insert = db.prepare('INSERT INTO plugin_settings (plugin_id, key, value, updated_at) VALUES (?, ?, ?, ?)');
        const now = new Date().toISOString();
        for (const [k, v] of entries)
            insert.run(pluginId, k, v, now);
    });
    tx(Object.entries(values));
}
