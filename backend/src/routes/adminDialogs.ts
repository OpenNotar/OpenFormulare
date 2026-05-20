import { Router } from 'express';
import { requireAdminAuth } from '../auth/adminAuth';
import {
  createDialog,
  getDialog,
  getDialogVersion,
  listDialogVersionsWithDiff,
  listDialogs,
  updateDialog,
} from '../db/database';
import * as demoStore from '../db/demoStore';
import { acquireLock, getLock, releaseLock } from '../db/dialogLocks';
import { isDemoMode } from '../services/runtimeMode';
import type { FormSchema } from '../db/types/schema';

const router = Router();

router.use(requireAdminAuth);

router.get('/', (req, res) => {
  const all = isDemoMode()
    ? demoStore.listDialogs(req.demoSessionId!)
    : listDialogs();
  res.json(all);
});

router.get('/export', (_req, res) => {
  if (isDemoMode()) {
    res.status(403).json({ error: 'Export ist im Demo-Modus deaktiviert.' });
    return;
  }
  const dialogs = listDialogs();
  res.setHeader('Content-Disposition', 'attachment; filename="dialogs-export.json"');
  res.json(dialogs.map(({ id, title, description, category, icon, isActive, isSystem, steps }) => ({
    id, title, description, category, icon, isActive, isSystem, steps,
  })));
});

router.post('/import', (req, res) => {
  if (isDemoMode()) {
    res.status(403).json({ error: 'Import ist im Demo-Modus deaktiviert.' });
    return;
  }

  const body = req.body as FormSchema | FormSchema[];
  const schemas = Array.isArray(body) ? body : [body];
  const results: { id: string; action: 'created' | 'updated' }[] = [];

  for (const schema of schemas) {
    if (!schema?.id || !schema?.title || !Array.isArray(schema?.steps)) {
      res.status(400).json({ error: `Ungültiges Schema: ${schema?.id ?? '(kein id)'}` });
      return;
    }
    const existing = getDialog(schema.id);
    if (existing) {
      updateDialog(schema.id, schema);
      results.push({ id: schema.id, action: 'updated' });
    } else {
      createDialog(schema);
      results.push({ id: schema.id, action: 'created' });
    }
  }
  res.json({ imported: results.length, results });
});

router.get('/:id', (req, res) => {
  const dialog = isDemoMode()
    ? demoStore.getDialog(req.demoSessionId!, req.params.id)
    : getDialog(req.params.id);
  if (!dialog) {
    res.status(404).json({ error: 'Dialog nicht gefunden' });
    return;
  }
  res.json(dialog);
});

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

router.post('/:id/lock', (req, res) => {
  if (isDemoMode()) {
    // Demo sessions are fully isolated — locking would falsely block other
    // demo users editing the same dialog id in their own copies.
    res.json({ locked: true });
    return;
  }
  const token = req.adminUser!;
  const ok = acquireLock(req.params.id, token);
  if (!ok) {
    const info = getLock(req.params.id, token);
    res.status(409).json({ error: 'Dialog wird bereits bearbeitet', lock: info });
    return;
  }
  res.json({ locked: true });
});

router.delete('/:id/lock', (req, res) => {
  if (isDemoMode()) {
    res.status(204).end();
    return;
  }
  releaseLock(req.params.id, req.adminUser!);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

router.get('/:id/versions', (req, res) => {
  if (isDemoMode()) {
    const sid = req.demoSessionId!;
    const dialog = demoStore.getDialog(sid, req.params.id);
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden' });
      return;
    }
    res.json(demoStore.listDialogVersionsWithDiff(sid, req.params.id));
    return;
  }

  const dialog = getDialog(req.params.id);
  if (!dialog) {
    res.status(404).json({ error: 'Dialog nicht gefunden' });
    return;
  }
  res.json(listDialogVersionsWithDiff(req.params.id));
});

router.get('/:id/versions/:vid', (req, res) => {
  const version = isDemoMode()
    ? demoStore.getDialogVersion(req.demoSessionId!, req.params.id, Number(req.params.vid))
    : getDialogVersion(req.params.id, Number(req.params.vid));
  if (!version) {
    res.status(404).json({ error: 'Version nicht gefunden' });
    return;
  }
  res.json(version);
});

router.post('/:id/versions/:vid/restore', (req, res) => {
  if (!isDemoMode()) {
    const token = req.adminUser!;
    const conflict = getLock(req.params.id, token);
    if (conflict) {
      res.status(409).json({ error: 'Dialog wird bereits bearbeitet', lock: conflict });
      return;
    }
  }

  if (isDemoMode()) {
    const sid = req.demoSessionId!;
    const version = demoStore.getDialogVersion(sid, req.params.id, Number(req.params.vid));
    if (!version) {
      res.status(404).json({ error: 'Version nicht gefunden' });
      return;
    }
    const updated = demoStore.updateDialog(sid, req.params.id, version.schema);
    if (!updated) {
      res.status(404).json({ error: 'Dialog nicht gefunden' });
      return;
    }
    res.json(updated);
    return;
  }

  const version = getDialogVersion(req.params.id, Number(req.params.vid));
  if (!version) {
    res.status(404).json({ error: 'Version nicht gefunden' });
    return;
  }

  const updated = updateDialog(req.params.id, version.schema);
  if (!updated) {
    res.status(404).json({ error: 'Dialog nicht gefunden' });
    return;
  }
  res.json(updated);
});

export default router;
