"use strict";
// Builds the per-plugin context object passed into hooks, routes, and the
// activate/deactivate lifecycle.
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildContext = buildContext;
const database_1 = require("../db/database");
const store_1 = require("./store");
function makeLogger(pluginId) {
    const prefix = `[plugin:${pluginId}]`;
    return {
        info: (msg, meta) => console.log(`${prefix} ${msg}`, meta ?? ''),
        warn: (msg, meta) => console.warn(`${prefix} ${msg}`, meta ?? ''),
        error: (msg, meta) => console.error(`${prefix} ${msg}`, meta ?? ''),
        debug: (msg, meta) => {
            if (process.env.PLUGIN_DEBUG === '1') {
                console.debug(`${prefix} ${msg}`, meta ?? '');
            }
        },
    };
}
function makeSettingsApi(pluginId) {
    return {
        get(key, fallback) {
            const all = (0, store_1.getPluginSettings)(pluginId);
            const raw = all[key];
            if (raw === undefined)
                return fallback;
            // Settings are stored as strings; consumers cast to whatever they need.
            return raw;
        },
        getAll() {
            return (0, store_1.getPluginSettings)(pluginId);
        },
        set(key, value) {
            (0, store_1.setPluginSetting)(pluginId, key, String(value));
        },
    };
}
function buildContext(manifest) {
    return {
        pluginId: manifest.id,
        pluginVersion: manifest.version,
        log: makeLogger(manifest.id),
        settings: makeSettingsApi(manifest.id),
        core: {
            getDialog: (id) => (0, database_1.getDialog)(id),
            listDialogs: () => (0, database_1.listDialogs)(),
            getDialogSchema: (id) => (0, database_1.getDialog)(id),
        },
    };
}
