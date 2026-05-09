// Runtime registry – the in-memory representation of all known plugins.
//
// One process-wide instance ([[registry]]) is used by:
//   - the loader (writes during startup + on enable/disable)
//   - the hook bus (reads when emitting events)
//   - the admin API (reads to expose state to the UI)
//   - the field-type API (reads to expose contributed field types)

import type {
  PluginContext,
  PluginFieldType,
  PluginManifest,
  PluginModule,
} from './types';

export interface RegisteredPlugin {
  manifest: PluginManifest;
  module: PluginModule;
  context: PluginContext;
  enabled: boolean;
  // Errors encountered while loading or activating; surfaced in the admin UI.
  errors: string[];
  // Absolute path the module was loaded from.
  rootDir: string;
}

class Registry {
  private readonly plugins = new Map<string, RegisteredPlugin>();

  register(plugin: RegisteredPlugin): void {
    this.plugins.set(plugin.manifest.id, plugin);
  }

  unregister(id: string): void {
    this.plugins.delete(id);
  }

  get(id: string): RegisteredPlugin | undefined {
    return this.plugins.get(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    const p = this.plugins.get(id);
    if (p) p.enabled = enabled;
  }

  list(): RegisteredPlugin[] {
    return Array.from(this.plugins.values()).sort((a, b) =>
      a.manifest.id.localeCompare(b.manifest.id),
    );
  }

  enabledPlugins(): RegisteredPlugin[] {
    return this.list().filter((p) => p.enabled);
  }

  fieldTypes(): Array<PluginFieldType & { pluginId: string }> {
    const out: Array<PluginFieldType & { pluginId: string }> = [];
    for (const p of this.enabledPlugins()) {
      for (const ft of p.module.fieldTypes ?? []) {
        out.push({ ...ft, pluginId: p.manifest.id });
      }
    }
    return out;
  }
}

export const registry = new Registry();
