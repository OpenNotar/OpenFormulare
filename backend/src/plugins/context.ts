// Builds the per-plugin context object passed into hooks, routes, and the
// activate/deactivate lifecycle.

import { getDialog, listDialogs } from '../db/database';
import {
  getConfiguredSenderEmail,
  getConfiguredSenderName,
  sendGenericMail,
} from '../services/email';
import { getPluginSettings, setPluginSetting } from './store';
import type { PluginContext, PluginLogger, PluginManifest, PluginSettingsApi } from './types';

function makeLogger(pluginId: string): PluginLogger {
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

function makeSettingsApi(pluginId: string): PluginSettingsApi {
  return {
    get(key, fallback) {
      const all = getPluginSettings(pluginId);
      const raw = all[key];
      if (raw === undefined) return fallback;
      // Settings are stored as strings; consumers cast to whatever they need.
      return raw as unknown as typeof fallback;
    },
    getAll() {
      return getPluginSettings(pluginId);
    },
    set(key, value) {
      setPluginSetting(pluginId, key, String(value));
    },
  };
}

export function buildContext(manifest: PluginManifest): PluginContext {
  const log = makeLogger(manifest.id);
  return {
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    log,
    settings: makeSettingsApi(manifest.id),
    core: {
      getDialog: (id) => getDialog(id),
      listDialogs: () => listDialogs(),
      getDialogSchema: (id) => getDialog(id),
      sendEmail: async (opts) => {
        try {
          await sendGenericMail(opts);
        } catch (err) {
          // Fehler wird geloggt — Plugins können das try/catch'en, aber Hooks
          // sollen normalerweise nicht crashen, wenn der Mail-Versand scheitert.
          log.error('sendEmail fehlgeschlagen', {
            error: err instanceof Error ? err.message : String(err),
            to: opts.to,
          });
          throw err;
        }
      },
      getSenderEmail: () => getConfiguredSenderEmail(),
      getSenderName: () => getConfiguredSenderName(),
    },
  };
}
