// Admin API for managing plugins.
//
// Read endpoints expose the merged view from the registry + DB so the admin
// UI can show installed plugins (even if they currently fail to load), their
// declared settings schema, and the stored values. Mutating endpoints persist
// to SQLite first, then update the in-memory registry.

import { Router } from 'express';

import { requireAdminAuth } from '../auth/adminAuth';
import {
  activatePlugin,
  deactivatePlugin,
} from '../plugins/loader';
import { registry } from '../plugins/registry';
import {
  getPluginSettings,
  replacePluginSettings,
  setPluginEnabled,
} from '../plugins/store';

const router = Router();

router.use(requireAdminAuth);

router.get('/', (_req, res) => {
  res.json(
    registry.list().map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description ?? '',
      author: p.manifest.author ?? '',
      homepage: p.manifest.homepage ?? '',
      enabled: p.enabled,
      hooks: Object.keys(p.module.hooks ?? {}),
      fieldTypes: (p.module.fieldTypes ?? []).map((ft) => ({
        id: ft.id,
        label: ft.label,
        description: ft.description ?? '',
      })),
      hasRoutes: typeof p.module.routes === 'function',
      settings: p.manifest.settings ?? [],
      errors: p.errors,
    })),
  );
});

router.get('/:id/settings', (req, res) => {
  const plugin = registry.get(req.params.id);
  if (!plugin) {
    res.status(404).json({ error: 'Plugin not found' });
    return;
  }
  res.json({
    schema: plugin.manifest.settings ?? [],
    values: getPluginSettings(plugin.manifest.id),
  });
});

router.put('/:id/settings', (req, res) => {
  const plugin = registry.get(req.params.id);
  if (!plugin) {
    res.status(404).json({ error: 'Plugin not found' });
    return;
  }
  const body = req.body as Record<string, unknown>;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Body must be an object of key/value pairs' });
    return;
  }
  const schema = plugin.manifest.settings ?? [];
  const values: Record<string, string> = {};
  for (const def of schema) {
    const raw = body[def.key];
    if (raw === undefined || raw === null || raw === '') {
      if (def.required && def.default === undefined) {
        res.status(400).json({ error: `Setting "${def.key}" is required` });
        return;
      }
      continue;
    }
    if (def.type === 'number') {
      const num = Number(raw);
      if (Number.isNaN(num)) {
        res.status(400).json({ error: `Setting "${def.key}" must be a number` });
        return;
      }
      if (def.min !== undefined && num < def.min) {
        res.status(400).json({ error: `Setting "${def.key}" must be >= ${def.min}` });
        return;
      }
      if (def.max !== undefined && num > def.max) {
        res.status(400).json({ error: `Setting "${def.key}" must be <= ${def.max}` });
        return;
      }
      values[def.key] = String(num);
    } else if (def.type === 'boolean') {
      values[def.key] = raw ? 'true' : 'false';
    } else {
      const str = String(raw);
      if (def.pattern) {
        const re = new RegExp(def.pattern);
        if (!re.test(str)) {
          res.status(400).json({ error: `Setting "${def.key}" does not match required format` });
          return;
        }
      }
      values[def.key] = str;
    }
  }
  replacePluginSettings(plugin.manifest.id, values);
  res.json({ ok: true, values });
});

router.post('/:id/enable', async (req, res) => {
  const plugin = registry.get(req.params.id);
  if (!plugin) {
    res.status(404).json({ error: 'Plugin not found' });
    return;
  }
  if (plugin.errors.includes('module failed to load')) {
    res.status(409).json({ error: 'Plugin failed to load – fix errors before enabling' });
    return;
  }
  try {
    await activatePlugin(plugin.manifest.id);
    setPluginEnabled(plugin.manifest.id, true);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Activation failed';
    res.status(500).json({ error: message });
  }
});

router.post('/:id/disable', async (req, res) => {
  const plugin = registry.get(req.params.id);
  if (!plugin) {
    res.status(404).json({ error: 'Plugin not found' });
    return;
  }
  try {
    await deactivatePlugin(plugin.manifest.id);
    setPluginEnabled(plugin.manifest.id, false);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deactivation failed';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Field types contributed by plugins (consumed by the dialog editor).
// ---------------------------------------------------------------------------

router.get('/_field-types', (_req, res) => {
  res.json(registry.fieldTypes());
});

export default router;
