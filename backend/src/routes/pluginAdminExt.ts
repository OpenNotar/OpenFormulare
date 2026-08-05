// Admin-side mount point for plugin-contributed routes.
//
// Plugins can declare an `adminRoutes(router, ctx)` function in their module.
// Those routers are mounted at /api/admin/plugins/<plugin-id>/ext, gated by
// requireAdminAuth. Typical use: pre-save connectivity tests, discovery
// helpers, anything that needs admin context but no public exposure.
//
// Dynamic dispatch: siehe pluginPublic.ts für die Begründung — `dispatchers`
// wird zur Laufzeit von activate/deactivate gepflegt, der äußere Router
// bleibt nach `app.use(…)` stehen.

import { Router, type Request, type Response, type NextFunction } from 'express';

import { requireAdminAuth, requireAdminRole } from '../auth/adminAuth';
import type { RegisteredPlugin } from '../plugins/registry';

const dispatchers = new Map<string, Router>();

export function registerPluginAdminRoutes(plugin: RegisteredPlugin): void {
  if (typeof plugin.module.adminRoutes !== 'function') {
    dispatchers.delete(plugin.manifest.id);
    return;
  }
  const sub = Router();
  try {
    plugin.module.adminRoutes(sub, plugin.context);
    dispatchers.set(plugin.manifest.id, sub);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    plugin.errors.push(`adminRoutes(): ${msg}`);
    plugin.context.log.error('Failed to register plugin admin routes', { error: msg });
    dispatchers.delete(plugin.manifest.id);
  }
}

export function unregisterPluginAdminRoutes(pluginId: string): void {
  dispatchers.delete(pluginId);
}

export function buildPluginAdminExtRouter(): Router {
  const router = Router();
  // Plugin-eigene Admin-Routen koennen Einstellungen aendern -> nur Administratoren.
  router.use(requireAdminAuth, requireAdminRole);
  router.use('/:pluginId/ext', (req: Request, res: Response, next: NextFunction) => {
    const sub = dispatchers.get(req.params.pluginId);
    if (!sub) {
      res.status(404).json({
        error: `Plugin "${req.params.pluginId}" ist nicht aktiv oder hat keine Admin-Routen.`,
      });
      return;
    }
    sub(req, res, next);
  });
  return router;
}
