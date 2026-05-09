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

import fs from 'fs';
import path from 'path';

import { buildContext } from './context';
import { registry } from './registry';
import { upsertPlugin, getPlugin } from './store';
import type { PluginManifest, PluginModule } from './types';

export interface LoadResult {
  loaded: number;
  activated: number;
  failed: number;
}

function pluginsDir(): string {
  if (process.env.PLUGINS_DIR) return path.resolve(process.env.PLUGINS_DIR);
  // Two defaults so dev and the docker image both work.
  const repoRoot = path.resolve(__dirname, '../../..');
  const candidates = [
    path.join(repoRoot, 'plugins'),
    '/app/plugins',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function readManifest(dir: string): PluginManifest | null {
  const manifestPath = path.join(dir, 'plugin.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as PluginManifest;
    if (!parsed.id || !parsed.name || !parsed.version) {
      console.warn(`[plugins] manifest at ${manifestPath} missing id/name/version`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[plugins] failed to parse ${manifestPath}:`, err);
    return null;
  }
}

function resolveEntry(dir: string, manifest: PluginManifest): string {
  const main = manifest.main ?? 'dist/index.js';
  return path.join(dir, main);
}

function loadModule(entry: string): PluginModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(entry);
    const exported = (mod && (mod.default ?? mod)) as PluginModule;
    if (!exported || typeof exported !== 'object' || !exported.id) {
      console.warn(`[plugins] entry ${entry} did not export a valid plugin module`);
      return null;
    }
    return exported;
  } catch (err) {
    console.warn(`[plugins] failed to require ${entry}:`, err);
    return null;
  }
}

export async function loadPlugins(): Promise<LoadResult> {
  const dir = pluginsDir();
  const result: LoadResult = { loaded: 0, activated: 0, failed: 0 };

  if (!fs.existsSync(dir)) {
    console.log(`[plugins] no plugins directory at ${dir} – skipping`);
    return result;
  }

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory());

  for (const dirent of entries) {
    const pluginDir = path.join(dir, dirent.name);
    const manifest = readManifest(pluginDir);
    if (!manifest) {
      result.failed += 1;
      continue;
    }

    upsertPlugin(manifest.id, manifest.version);
    const dbRow = getPlugin(manifest.id)!;
    const entry = resolveEntry(pluginDir, manifest);
    const errors: string[] = [];

    if (!fs.existsSync(entry)) {
      const msg = `entry not found: ${entry}`;
      errors.push(msg);
      console.warn(`[plugins] ${manifest.id}: ${msg}`);
    }

    const module = fs.existsSync(entry) ? loadModule(entry) : null;
    if (!module) {
      errors.push('module failed to load');
      // Register a stub so the admin UI can still show / disable it.
      registry.register({
        manifest,
        module: { id: manifest.id },
        context: buildContext(manifest),
        enabled: false,
        errors,
        rootDir: pluginDir,
      });
      result.failed += 1;
      continue;
    }

    const ctx = buildContext(manifest);
    const registered = {
      manifest,
      module,
      context: ctx,
      enabled: dbRow.enabled,
      errors,
      rootDir: pluginDir,
    };
    registry.register(registered);
    result.loaded += 1;

    if (dbRow.enabled && module.onActivate) {
      try {
        await module.onActivate(ctx);
        result.activated += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`onActivate: ${msg}`);
        console.warn(`[plugins] ${manifest.id} onActivate failed:`, err);
      }
    } else if (dbRow.enabled) {
      result.activated += 1;
    }
  }

  console.log(
    `[plugins] loaded=${result.loaded} activated=${result.activated} failed=${result.failed}`,
  );
  return result;
}

export async function activatePlugin(id: string): Promise<void> {
  const plugin = registry.get(id);
  if (!plugin) throw new Error(`Plugin ${id} not found`);
  if (plugin.enabled) return;
  if (plugin.module.onActivate) {
    await plugin.module.onActivate(plugin.context);
  }
  registry.setEnabled(id, true);
}

export async function deactivatePlugin(id: string): Promise<void> {
  const plugin = registry.get(id);
  if (!plugin) throw new Error(`Plugin ${id} not found`);
  if (!plugin.enabled) return;
  if (plugin.module.onDeactivate) {
    try {
      await plugin.module.onDeactivate(plugin.context);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      plugin.errors.push(`onDeactivate: ${msg}`);
    }
  }
  registry.setEnabled(id, false);
}
