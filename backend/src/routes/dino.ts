import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  cleanupExpiredSubmissions,
  deleteSubmission,
  listPendingSubmissions,
  markPulled,
} from '../db/submissions';
import { buildPayload } from '../services/dinoPayload';
import { isDemoMode, getDinoConfig } from '../services/runtimeMode';

const router = Router();

function blockInDemoMode(_req: Request, res: Response, next: NextFunction) {
  if (isDemoMode()) {
    res.status(503).json({ error: 'DiNo-Anbindung im Demo-Modus deaktiviert' });
    return;
  }
  next();
}

function requireDinoApiKey(req: Request, res: Response, next: NextFunction) {
  const { apiKey } = getDinoConfig();
  if (!apiKey) {
    res.status(500).json({ error: 'DiNo API-Key nicht konfiguriert (Admin → Einstellungen → DiNo).' });
    return;
  }

  const provided = req.headers['x-api-key'];
  if (!provided || provided !== apiKey) {
    res.status(401).json({ error: 'Ungültiger API-Key' });
    return;
  }

  next();
}

router.use(blockInDemoMode);
router.use(requireDinoApiKey);

// GET /api/dino/submissions
// Liefert offene Einreichungen im DiNo-DialogInbox-Format und markiert sie als abgerufen.
router.get('/submissions', (_req, res) => {
  const { ttlHours } = getDinoConfig();
  const deleted = cleanupExpiredSubmissions(ttlHours);
  if (deleted > 0) {
    console.log(`[dino] ${deleted} abgelaufene Einreichung(en) bereinigt`);
  }

  const submissions = listPendingSubmissions();

  for (const s of submissions) {
    if (!s.pulledAt) {
      markPulled(s.id);
    }
  }

  const result = submissions.map((s) =>
    buildPayload(s.id, s.formType, s.submittedAt, s.pulledAt, s.data, s.dinoMapping),
  );

  res.json({ count: result.length, submissions: result });
});

// DELETE /api/dino/submissions/:id
// DiNo bestätigt erfolgreichen Inbox-Insert. Datensatz wird gelöscht.
router.delete('/submissions/:id', (req, res) => {
  const { id } = req.params;
  const deleted = deleteSubmission(id);

  if (!deleted) {
    res.status(404).json({ error: 'Einreichung nicht gefunden' });
    return;
  }

  res.json({ success: true });
});

export default router;
