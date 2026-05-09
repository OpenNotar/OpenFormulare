/**
 * DiNo-API fuer Bewertungsbogen-Sessions. Erweitert das bestehende DiNo-Pull-
 * Pattern (X-Api-Key, kein OAuth) um eine zweite Pull-Familie:
 *
 *  POST   /api/dino/rating/sessions          - Session anlegen / aktualisieren
 *  GET    /api/dino/rating/sessions          - abgegebene Antworten pollen
 *  DELETE /api/dino/rating/sessions/:token   - Session aufraeumen
 *
 * Auth: gleicher API-Key wie /api/dino (Settings → DiNo).
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  deleteSession,
  expireOverdueSessions,
  listSessions,
  markPulled,
  upsertSession,
  type RatingFormDefinition,
} from '../db/ratingSessions';
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

const questionSchema = z.object({
  id: z.union([z.number(), z.string()]),
  label: z.string(),
  type: z.enum(['stars', 'scale', 'yesno', 'text']),
  minValue: z.number().int().nullable().optional(),
  maxValue: z.number().int().nullable().optional(),
  isRequired: z.boolean().optional(),
  orderNo: z.number().int().optional(),
  countsForOverall: z.boolean().optional(),
});

const sessionSchema = z.object({
  token: z.string().min(8).max(128),
  expiresAt: z.string().nullable().optional(),
  thresholdScore: z.number().nullable().optional(),
  thanksText: z.string().nullable().optional(),
  thanksLinkLabel: z.string().nullable().optional(),
  thanksLinkUrl: z.string().nullable().optional(),
  form: z.object({
    title: z.string(),
    questions: z.array(questionSchema),
  }),
  recipient: z
    .object({
      firstName: z.string().nullable().optional(),
      lastName: z.string().nullable().optional(),
    })
    .optional(),
  originId: z.union([z.string(), z.number()]).nullable().optional(),
});

// POST /api/dino/rating/sessions
router.post('/sessions', (req, res) => {
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ungültige Session-Daten', issues: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const definition: RatingFormDefinition = {
    title: data.form.title,
    questions: data.form.questions.map((q) => ({
      id: q.id,
      label: q.label,
      type: q.type,
      minValue: q.minValue ?? null,
      maxValue: q.maxValue ?? null,
      isRequired: q.isRequired ?? true,
      orderNo: q.orderNo ?? 0,
      countsForOverall: q.countsForOverall ?? true,
    })),
  };
  const record = upsertSession({
    token: data.token,
    source: 'dino',
    originId: data.originId != null ? String(data.originId) : null,
    formTitle: data.form.title,
    formDefinition: definition,
    thresholdScore: data.thresholdScore ?? null,
    thanksText: data.thanksText ?? null,
    thanksLinkLabel: data.thanksLinkLabel ?? null,
    thanksLinkUrl: data.thanksLinkUrl ?? null,
    recipientFirstName: data.recipient?.firstName ?? null,
    recipientLastName: data.recipient?.lastName ?? null,
    expiresAt: data.expiresAt ?? null,
  });
  res.status(200).json({ token: record.token, status: record.status });
});

// GET /api/dino/rating/sessions?status=submitted&since=...
router.get('/sessions', (req, res) => {
  const expired = expireOverdueSessions();
  if (expired > 0) {
    console.log(`[dino-rating] ${expired} abgelaufene Session(s) markiert`);
  }

  const status = (req.query.status as string | undefined) ?? 'submitted';
  if (!['pending', 'submitted', 'expired'].includes(status)) {
    res.status(400).json({ error: 'status ungueltig' });
    return;
  }
  const since = (req.query.since as string | undefined) || undefined;
  const sessions = listSessions({
    status: status as 'pending' | 'submitted' | 'expired',
    since,
  });

  // markPulled fuer alle, die noch nicht gepulled wurden
  for (const s of sessions) {
    if (!s.pulledAt && s.status === 'submitted') {
      markPulled(s.token);
    }
  }

  res.json({
    count: sessions.length,
    sessions: sessions.map((s) => ({
      token: s.token,
      status: s.status,
      submittedAt: s.submittedAt,
      overallScore: s.overallScore,
      answers: s.answers ?? [],
      originId: s.originId,
    })),
  });
});

// DELETE /api/dino/rating/sessions/:token
router.delete('/sessions/:token', (req, res) => {
  const ok = deleteSession(req.params.token);
  if (!ok) {
    res.status(404).json({ error: 'Session nicht gefunden' });
    return;
  }
  res.json({ success: true });
});

export default router;
