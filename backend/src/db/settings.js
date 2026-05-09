"use strict";
// Persistent key-value store for global settings: kontakt template, branding,
// person templates, dispatch / email / DiNo configuration. Values are stored
// as JSON strings.
//
// All reads go through `getEffectiveSetting`, which in DEMO_MODE first checks
// the in-memory session override (so demo visitors get their own sandbox of
// settings) and then falls back to the persisted DB value. Writes are routed
// to the session store in demo mode and to the DB in production.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETTING_KEYS = void 0;
exports.getSetting = getSetting;
exports.setSetting = setSetting;
exports.getEffectiveSetting = getEffectiveSetting;
exports.setEffectiveSetting = setEffectiveSetting;
const database_1 = require("./database");
const settingsStore_1 = require("./settingsStore");
// Inlined to avoid a cyclic import with runtimeMode.ts (which itself reads
// settings via getEffectiveSetting). DEMO_MODE is a boot-time env flag.
function isDemoModeEnv() {
    return (process.env.DEMO_MODE ?? '').trim().toLowerCase() === 'true';
}
function getSetting(key) {
    const row = (0, database_1.getDatabase)()
        .prepare('SELECT key, value, updated_at FROM settings WHERE key = ?')
        .get(key);
    if (!row)
        return null;
    try {
        return JSON.parse(row.value);
    }
    catch {
        return null;
    }
}
function setSetting(key, value) {
    const json = JSON.stringify(value);
    const now = new Date().toISOString();
    (0, database_1.getDatabase)()
        .prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .run(key, json, now);
}
// Read with optional demo session override. In demo mode an active session
// override takes precedence over the persisted value.
function getEffectiveSetting(sessionId, key) {
    if (isDemoModeEnv() && sessionId) {
        const override = (0, settingsStore_1.getDemoSetting)(sessionId, key);
        if (override !== undefined)
            return override;
    }
    return getSetting(key);
}
// Write that lands in the session store under demo mode and in the DB otherwise.
function setEffectiveSetting(sessionId, key, value) {
    if (isDemoModeEnv()) {
        if (!sessionId) {
            throw new Error('Demo-Session konnte nicht ermittelt werden.');
        }
        (0, settingsStore_1.setDemoSetting)(sessionId, key, value);
        return;
    }
    setSetting(key, value);
}
exports.SETTING_KEYS = {
    kontaktStep: 'kontakt_step',
    branding: 'branding',
    personTemplateNatural: 'person_template_natural',
    personTemplateLegal: 'person_template_legal',
    dispatchConfig: 'dispatch_config',
    emailConfig: 'email_config',
    dinoConfig: 'dino_config',
};
