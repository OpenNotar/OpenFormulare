import { Router } from 'express';
import { z } from 'zod';
import { requireAdminAuth } from '../auth/adminAuth';
import {
  createDialog,
  deleteDialog,
  getDialog,
  listDialogs,
  toggleDialogActive,
  toggleDialogUnlisted,
  updateDialog,
} from '../db/database';
import * as demoStore from '../db/demoStore';
import { isDemoMode } from '../services/runtimeMode';

const router = Router();

const dialogSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().default(''),
  category: z.string().optional().default('Allgemein'),
  categories: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  unlisted: z.boolean().optional(),
  steps: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      fields: z.array(z.any()),
    }),
  ).min(1),
});

router.get('/', (req, res) => {
  const all = isDemoMode()
    ? demoStore.listDialogs(req.demoSessionId!)
    : listDialogs();
  // Öffentliche Übersicht: nur aktive UND nicht-versteckte Dialoge. Versteckte
  // Dialoge bleiben über GET /:id (Direkt-Link) erreichbar — sie sollen sich
  // wie „unlisted" verhalten, nicht wie „deaktiviert".
  res.json(all.filter((dialog) => dialog.isActive !== false && !dialog.unlisted));
});

router.get('/:id', (req, res) => {
  const dialog = isDemoMode()
    ? demoStore.getDialog(req.demoSessionId!, req.params.id)
    : getDialog(req.params.id);
  if (!dialog || dialog.isActive === false) {
    res.status(404).json({ error: 'Dialog nicht gefunden' });
    return;
  }

  res.json(dialog);
});

router.use(requireAdminAuth);

router.post('/', (req, res) => {
  const parsed = dialogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ungültiger Dialog', details: parsed.error.issues });
    return;
  }

  try {
    const dialog = isDemoMode()
      ? demoStore.createDialog(req.demoSessionId!, parsed.data)
      : createDialog(parsed.data);
    res.status(201).json(dialog);
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Dialog konnte nicht erstellt werden',
    });
  }
});

router.put('/:id', (req, res) => {
  const parsed = dialogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ungültiger Dialog', details: parsed.error.issues });
    return;
  }

  try {
    const dialog = isDemoMode()
      ? demoStore.updateDialog(req.demoSessionId!, req.params.id, parsed.data)
      : updateDialog(req.params.id, parsed.data);
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden' });
      return;
    }

    res.json(dialog);
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Dialog konnte nicht aktualisiert werden',
    });
  }
});

router.delete('/:id', (req, res) => {
  const deleted = isDemoMode()
    ? demoStore.deleteDialog(req.demoSessionId!, req.params.id)
    : deleteDialog(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Dialog nicht gefunden' });
    return;
  }

  res.status(204).send();
});

router.patch('/:id/toggle-active', (req, res) => {
  const dialog = isDemoMode()
    ? demoStore.toggleDialogActive(req.demoSessionId!, req.params.id)
    : toggleDialogActive(req.params.id);
  if (!dialog) {
    res.status(404).json({ error: 'Dialog nicht gefunden' });
    return;
  }

  res.json(dialog);
});

router.patch('/:id/toggle-unlisted', (req, res) => {
  const dialog = isDemoMode()
    ? demoStore.toggleDialogUnlisted(req.demoSessionId!, req.params.id)
    : toggleDialogUnlisted(req.params.id);
  if (!dialog) {
    res.status(404).json({ error: 'Dialog nicht gefunden' });
    return;
  }

  res.json(dialog);
});

export default router;
