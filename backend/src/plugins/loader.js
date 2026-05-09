"use strict";
// Plugin loader.
//
// On startup we scan PLUGINS_DIR for subdirectories. Each directory must
// contain a `plugin.json` (the manifest) and a compiled JS entry file
// (default: dist/index.js). The manifest is read first (so the admin UI can
// show the plugin even if loading the module itself fails), then the module
// is `require`-d. If `enabled` is true in the DB, the module's `onActivate`
// hook is called.
//
// Plugins are loaded *in-process*. There is no sandbox – plugins run with the
// same privileges as the core. This is documented in the plugin developer
// guide (docs/plugin-development.md) so that operators understand the trust
// model.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPlugins = loadPlugins;
exports.activatePlugin = activatePlugin;
exports.deactivatePlugin = deactivatePlugin;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const context_1 = require("./context");
const registry_1 = require("./registry");
const store_1 = require("./store");
function pluginsDir() {
    if (process.env.PLUGINS_DIR)
        return path_1.default.resolve(process.env.PLUGINS_DIR);
    // Two defaults so dev and the docker image both work.
    const repoRoot = path_1.default.resolve(__dirname, '../../..');
    const candidates = [
        path_1.default.join(repoRoot, 'plugins'),
        '/app/plugins',
    ];
    for (const c of candidates) {
        if (fs_1.default.existsSync(c))
            return c;
    }
    return candidates[0];
}
function readManifest(dir) {
    const manifestPath = path_1.default.join(dir, 'plugin.json');
    if (!fs_1.default.existsSync(manifestPath))
        return null;
    try {
        const raw = fs_1.default.readFileSync(manifestPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed.id || !parsed.name || !parsed.version) {
            console.warn(`[plugins] manifest at ${manifestPath} missing id/name/version`);
            return null;
        }
        return parsed;
    }
    catch (err) {
        console.warn(`[plugins] failed to parse ${manifestPath}:`, err);
        return null;
    }
}
function resolveEntry(dir, manifest) {
    const main = manifest.main ?? 'dist/index.js';
    return path_1.default.join(dir, main);
}
function loadModule(entry) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(entry);
        const exported = (mod && (mod.default ?? mod));
        if (!exported || typeof exported !== 'object' || !exported.id) {
            console.warn(`[plugins] entry ${entry} did not export a valid plugin module`);
            return null;
        }
        return exported;
    }
    catch (err) {
        console.warn(`[plugins] failed to require ${entry}:`, err);
        return null;
    }
}
async function loadPlugins() {
    const dir = pluginsDir();
    const result = { loaded: 0, activated: 0, failed: 0 };
    if (!fs_1.default.existsSync(dir)) {
        console.log(`[plugins] no plugins directory at ${dir} – skipping`);
        return result;
    }
    const entries = fs_1.default
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory());
    for (const dirent of entries) {
        const pluginDir = path_1.default.join(dir, dirent.name);
        const manifest = readManifest(pluginDir);
        if (!manifest) {
            result.failed += 1;
            continue;
        }
        (0, store_1.upsertPlugin)(manifest.id, manifest.version);
        const dbRow = (0, store_1.getPlugin)(manifest.id);
        const entry = resolveEntry(pluginDir, manifest);
        const errors = [];
        if (!fs_1.default.existsSync(entry)) {
            const msg = `entry not found: ${entry}`;
            errors.push(msg);
            console.warn(`[plugins] ${manifest.id}: ${msg}`);
        }
        const module = fs_1.default.existsSync(entry) ? loadModule(entry) : null;
        if (!module) {
            errors.push('module failed to load');
            // Register a stub so the admin UI can still show / disable it.
            registry_1.registry.register({
                manifest,
                module: { id: manifest.id },
                context: (0, context_1.buildContext)(manifest),
                enabled: false,
                errors,
                rootDir: pluginDir,
            });
            result.failed += 1;
            continue;
        }
        const ctx = (0, context_1.buildContext)(manifest);
        const registered = {
            manifest,
            module,
            context: ctx,
            enabled: dbRow.enabled,
            errors,
            rootDir: pluginDir,
        };
        registry_1.registry.register(registered);
        result.loaded += 1;
        if (dbRow.enabled && module.onActivate) {
            try {
                await module.onActivate(ctx);
                result.activated += 1;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`onActivate: ${msg}`);
                console.warn(`[plugins] ${manifest.id} onActivate failed:`, err);
            }
        }
        else if (dbRow.enabled) {
            result.activated += 1;
        }
    }
    console.log(`[plugins] loaded=${result.loaded} activated=${result.activated} failed=${result.failed}`);
    return result;
}
async function activatePlugin(id) {
    const plugin = registry_1.registry.get(id);
    if (!plugin)
        throw new Error(`Plugin ${id} not found`);
    if (plugin.enabled)
        return;
    if (plugin.module.onActivate) {
        await plugin.module.onActivate(plugin.context);
    }
    registry_1.registry.setEnabled(id, true);
}
async function deactivatePlugin(id) {
    const plugin = registry_1.registry.get(id);
    if (!plugin)
        throw new Error(`Plugin ${id} not found`);
    if (!plugin.enabled)
        return;
    if (plugin.module.onDeactivate) {
        try {
            await plugin.module.onDeactivate(plugin.context);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            plugin.errors.push(`onDeactivate: ${msg}`);
        }
    }
    registry_1.registry.setEnabled(id, false);
}
