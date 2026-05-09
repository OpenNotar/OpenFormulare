"use strict";
// Runtime registry – the in-memory representation of all known plugins.
//
// One process-wide instance ([[registry]]) is used by:
//   - the loader (writes during startup + on enable/disable)
//   - the hook bus (reads when emitting events)
//   - the admin API (reads to expose state to the UI)
//   - the field-type API (reads to expose contributed field types)
Object.defineProperty(exports, "__esModule", { value: true });
exports.registry = void 0;
class Registry {
    constructor() {
        this.plugins = new Map();
    }
    register(plugin) {
        this.plugins.set(plugin.manifest.id, plugin);
    }
    unregister(id) {
        this.plugins.delete(id);
    }
    get(id) {
        return this.plugins.get(id);
    }
    setEnabled(id, enabled) {
        const p = this.plugins.get(id);
        if (p)
            p.enabled = enabled;
    }
    list() {
        return Array.from(this.plugins.values()).sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
    }
    enabledPlugins() {
        return this.list().filter((p) => p.enabled);
    }
    fieldTypes() {
        const out = [];
        for (const p of this.enabledPlugins()) {
            for (const ft of p.module.fieldTypes ?? []) {
                out.push({ ...ft, pluginId: p.manifest.id });
            }
        }
        return out;
    }
}
exports.registry = new Registry();
