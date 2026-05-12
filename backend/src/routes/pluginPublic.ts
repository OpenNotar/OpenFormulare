// Public mount point for plugin-contributed routes.
//
// Each enabled plugin that defines a `routes` function is mounted at
// /api/plugins/<plugin-id>. This is also the natural place for plugins to
// expose webhook callback URLs and read-only endpoints (e.g. the
// Terminfindung-plugin's `/api/plugins/terminfindung/slots` endpoint).
//
// Implementation note — DYNAMIC DISPATCH:
//
// Der äußere Router wird einmal beim Boot via `app.use('/api/plugins', …)`
// gemountet und bleibt unverändert. Welcher Sub-Router pro Plugin
// tatsächlich greift, wird zur Request-Zeit aus der `dispatchers`-Map
// gezogen — `activatePlugin` und `deactivatePlugin` (siehe loader.ts)
// pflegen diese Map, sodass ein neu aktiviertes Plugin sofort erreichbar
// ist, ohne Server-Restart.

import { Router, type Request, type Response, type NextFunction } from 'express';

import type { RegisteredPlugin } from '../plugins/registry';

// pluginId → Sub-Router (von plugin.module.routes() erzeugt).
const dispatchers = new Map<string, Router>();

export function registerPluginPublicRoutes(plugin: RegisteredPlugin): void {
  if (typeof plugin.module.routes !== 'function') {
    dispatchers.delete(plugin.manifest.id);
    return;
  }
  const sub = Router();
  try {
    plugin.module.routes(sub, plugin.context);
    dispatchers.set(plugin.manifest.id, sub);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    plugin.errors.push(`routes(): ${msg}`);
    plugin.context.log.error('Failed to register plugin routes', { error: msg });
    dispatchers.delete(plugin.manifest.id);
  }
}

export function unregisterPluginPublicRoutes(pluginId: string): void {
  dispatchers.delete(pluginId);
}

export function buildPluginPublicRouter(): Router {
  const router = Router();
  router.use('/:pluginId', (req: Request, res: Response, next: NextFunction) => {
    const sub = dispatchers.get(req.params.pluginId);
    if (!sub) {
      res.status(404).json({
        error: `Plugin "${req.params.pluginId}" ist nicht aktiv oder hat keine öffentlichen Routen.`,
      });
      return;
    }
    sub(req, res, next);
  });
  return router;
}
