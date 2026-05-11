// Public mount point for plugin-contributed routes.
//
// Each enabled plugin that defines a `routes` function is mounted at
// /api/plugins/<plugin-id>. This is also the natural place for plugins to
// expose webhook callback URLs and read-only endpoints (e.g. the
// Terminfindung-plugin's `/api/plugins/terminfindung/slots` endpoint).

import { Router } from 'express';

import { registry } from '../plugins/registry';

export function buildPluginPublicRouter(): Router {
  const router = Router();

  for (const plugin of registry.enabledPlugins()) {
    if (typeof plugin.module.routes !== 'function') continue;
    const sub = Router();
    try {
      plugin.module.routes(sub, plugin.context);
      router.use(`/${plugin.manifest.id}`, sub);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      plugin.errors.push(`routes(): ${msg}`);
      plugin.context.log.error('Failed to register plugin routes', { error: msg });
    }
  }

  return router;
}
