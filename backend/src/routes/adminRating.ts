/**
 * Admin-API fuer Bewertungsbogen — sowohl Templates (OF-Standalone-Modus)
 * als auch Sessions-Liste (zum Inspizieren / manuellen Aufraeumen).
 *
 *  GET    /api/admin/rating/templates           - Templates auflisten
 *  POST   /api/admin/rating/templates           - Template anlegen
 *  PUT    /api/admin/rating/templates/:id       - Template aktualisieren
 *  DELETE /api/admin/rating/templates/:id       - Template loeschen
 *
 *  POST   /api/admin/rating/sessions            - Standalone-Session aus Template anlegen (Token zurueck)
 *  GET    /api/admin/rating/sessions            - alle Sessions (Filter status/source)
 *  DELETE /api/admin/rating/sessions/:token     - Session manuell loeschen
 */

import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAdminAuth, requireAdminRole } from '../auth/adminAuth';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from '../db/ratingTemplates';
import {
  deleteSession,
  listSessions,
  upsertSession,
} from '../db/ratingSessions';

const router = Router();

// Bewertungsvorlagen gehoeren zur Konfiguration -> nur Administratoren.
router.use(requireAdminAuth, requireAdminRole);

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

const templateSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  definition: z.object({
    title: z.string(),
    questions: z.array(questionSchema),
  }),
  thresholdScore: z.number().nullable().optional(),
  thanksText: z.string().nullable().optional(),
  thanksLinkLabel: z.string().nullable().optional(),
  thanksLinkUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get('/templates', (_req, res) => {
  res.json({ templates: listTemplates() });
});

router.post('/templates', (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Template ungueltig', issues: parsed.error.issues });
    return;
  }
  const created = createTemplate(parsed.data);
  res.json(created);
});

router.put('/templates/:id', (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Template ungueltig', issues: parsed.error.issues });
    return;
  }
  const updated = updateTemplate(req.params.id, parsed.data);
  if (!updated) {
    res.status(404).json({ error: 'Template nicht gefunden' });
    return;
  }
  res.json(updated);
});

router.delete('/templates/:id', (req, res) => {
  const ok = deleteTemplate(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Template nicht gefunden' });
    return;
  }
  res.json({ success: true });
});

const standaloneSessionSchema = z.object({
  templateId: z.string(),
  recipientFirstName: z.string().nullable().optional(),
  recipientLastName: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

router.post('/sessions', (req, res) => {
  const parsed = standaloneSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Sessiondaten ungueltig', issues: parsed.error.issues });
    return;
  }
  const template = getTemplate(parsed.data.templateId);
  if (!template) {
    res.status(404).json({ error: 'Template nicht gefunden' });
    return;
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const session = upsertSession({
    token,
    source: 'standalone',
    originId: template.id,
    formTitle: template.title,
    formDefinition: template.definition,
    thresholdScore: template.thresholdScore,
    thanksText: template.thanksText,
    thanksLinkLabel: template.thanksLinkLabel,
    thanksLinkUrl: template.thanksLinkUrl,
    recipientFirstName: parsed.data.recipientFirstName ?? null,
    recipientLastName: parsed.data.recipientLastName ?? null,
    expiresAt: parsed.data.expiresAt ?? null,
  });
  res.json({ token: session.token, status: session.status });
});

router.get('/sessions', (req, res) => {
  const status = req.query.status as 'pending' | 'submitted' | 'expired' | undefined;
  const source = req.query.source as 'dino' | 'standalone' | undefined;
  res.json({ sessions: listSessions({ status, source }) });
});

router.delete('/sessions/:token', (req, res) => {
  const ok = deleteSession(req.params.token);
  if (!ok) {
    res.status(404).json({ error: 'Session nicht gefunden' });
    return;
  }
  res.json({ success: true });
});

export default router;
