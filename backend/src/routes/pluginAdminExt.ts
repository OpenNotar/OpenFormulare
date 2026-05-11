// Admin-side mount point for plugin-contributed routes.
//
// Plugins can declare an `adminRoutes(router, ctx)` function in their module.
// Those routers are mounted at /api/admin/plugins/<plugin-id>/ext, gated by
// requireAdminAuth. Typical use: pre-save connectivity tests, discovery
// helpers, anything that needs admin context but no public exposure.

import { Router } from 'express';

import { requireAdminAuth } from '../auth/adminAuth';
import { registry } from '../plugins/registry';

export function buildPluginAdminExtRouter(): Router {
  const router = Router();
  router.use(requireAdminAuth);

  for (const plugin of registry.list()) {
    if (typeof plugin.module.adminRoutes !== 'function') continue;
    const sub = Router();
    try {
      plugin.module.adminRoutes(sub, plugin.context);
      router.use(`/${plugin.manifest.id}/ext`, sub);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      plugin.errors.push(`adminRoutes(): ${msg}`);
      plugin.context.log.error('Failed to register plugin admin routes', { error: msg });
    }
  }

  return router;
}
