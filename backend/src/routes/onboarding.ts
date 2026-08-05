// Admin-API für das Onboarding-Migrationstool. Liefert Release-Notes,
// Seed-Diff-Liste und erlaubt das Übernehmen einzelner Seed-Dialoge.

import { Router } from 'express';
import { z } from 'zod';
import { requireAdminAuth, requireAdminRole } from '../auth/adminAuth';
import {
  getCurrentAppVersion,
  getSeenAppVersion,
  acknowledgeCurrentVersion,
  getUnseenReleaseNotes,
  computeSeedChanges,
  importSeedDialog,
  getLastAutoSync,
} from '../services/onboarding';

const router = Router();
// Migrations-/Seed-Uebernahme veraendert den Dialogbestand -> nur Administratoren.
router.use(requireAdminAuth, requireAdminRole);

router.get('/status', (_req, res) => {
  const currentVersion = getCurrentAppVersion();
  const seenVersion = getSeenAppVersion();
  res.json({
    currentVersion,
    seenVersion,
    hasNewVersion: currentVersion !== seenVersion,
    releaseNotes: getUnseenReleaseNotes(),
    seedChanges: computeSeedChanges(),
    lastAutoSync: getLastAutoSync(),
  });
});

const importSchema = z.object({ dialogId: z.string().min(1) });

router.post('/import-seed', (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'dialogId erforderlich' });
    return;
  }
  const entry = importSeedDialog(parsed.data.dialogId);
  if (!entry) {
    res.status(404).json({ error: `Seed-Dialog "${parsed.data.dialogId}" nicht gefunden.` });
    return;
  }
  res.json(entry);
});

router.post('/acknowledge', (_req, res) => {
  acknowledgeCurrentVersion();
  res.json({ seenVersion: getSeenAppVersion() });
});

export default router;
