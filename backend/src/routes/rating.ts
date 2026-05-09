/**
 * Mandanten-zugängliche API zum Bewertungsbogen.
 *
 *  GET  /api/rating/:token         - Form-Definition + Branding holen
 *  POST /api/rating/:token/submit  - Antworten absenden
 *
 * Keine Auth — der Token ist die Capability. Single-Use, ablaufend.
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  getSession,
  markOpened,
  submitSession,
  type RatingAnswer,
  type RatingQuestion,
} from '../db/ratingSessions';
import { emit as emitPluginEvent } from '../plugins/hookBus';

const router = Router();

function publicSessionShape(token: string, sess: ReturnType<typeof getSession>) {
  if (!sess) return null;
  return {
    token,
    status: sess.status,
    formTitle: sess.formTitle,
    questions: sess.formDefinition.questions,
    thresholdScore: sess.thresholdScore,
    thanksText: sess.thanksText,
    thanksLinkLabel: sess.thanksLinkLabel,
    thanksLinkUrl: sess.thanksLinkUrl,
    recipient: {
      firstName: sess.recipientFirstName,
      lastName: sess.recipientLastName,
    },
    submittedAt: sess.submittedAt,
    overallScore: sess.overallScore,
    expiresAt: sess.expiresAt,
  };
}

router.get('/:token', (req, res) => {
  const { token } = req.params;
  const sess = getSession(token);
  if (!sess) {
    res.status(404).json({ error: 'Bewertungsbogen nicht gefunden' });
    return;
  }
  if (sess.expiresAt && new Date(sess.expiresAt).getTime() < Date.now()) {
    res.status(410).json({ error: 'Bewertungsbogen abgelaufen' });
    return;
  }
  if (sess.status === 'pending') {
    markOpened(token);
  }
  res.json(publicSessionShape(token, sess));
});

const answerSchema = z.object({
  idRatingFormQuestion: z.union([z.number(), z.string()]),
  AnswerNumeric: z.number().nullable().optional(),
  AnswerText: z.string().nullable().optional(),
});

const submitSchema = z.object({
  answers: z.array(answerSchema),
});

function computeOverall(questions: RatingQuestion[], answers: RatingAnswer[]): number | null {
  const byId = new Map<string | number, RatingQuestion>();
  for (const q of questions) byId.set(q.id, q);
  let sum = 0;
  let count = 0;
  for (const a of answers) {
    const q = byId.get(a.idRatingFormQuestion);
    if (!q) continue;
    if (q.countsForOverall === false) continue;
    if (a.AnswerNumeric == null) continue;
    sum += a.AnswerNumeric;
    count += 1;
  }
  return count > 0 ? Math.round((sum / count) * 100) / 100 : null;
}

router.post('/:token/submit', async (req, res) => {
  const { token } = req.params;
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Antworten ungueltig', issues: parsed.error.issues });
    return;
  }
  const sess = getSession(token);
  if (!sess) {
    res.status(404).json({ error: 'Bewertungsbogen nicht gefunden' });
    return;
  }
  if (sess.status === 'submitted') {
    res.status(409).json({ error: 'Bewertungsbogen wurde bereits abgegeben' });
    return;
  }
  if (sess.expiresAt && new Date(sess.expiresAt).getTime() < Date.now()) {
    res.status(410).json({ error: 'Bewertungsbogen abgelaufen' });
    return;
  }

  const overall = computeOverall(sess.formDefinition.questions, parsed.data.answers);
  const updated = submitSession(token, {
    answers: parsed.data.answers,
    overallScore: overall,
  });

  if (!updated) {
    res.status(500).json({ error: 'Speichern fehlgeschlagen' });
    return;
  }

  await emitPluginEvent('rating:created', {
    ratingId: token,
    templateId: String(updated.formTitle ?? ''),
    context: {
      formTitle: updated.formTitle,
      overallScore: updated.overallScore,
      recipient: { firstName: sess.recipientFirstName, lastName: sess.recipientLastName },
    },
    createdAt: updated.submittedAt ?? new Date().toISOString(),
  });

  const showLink =
    sess.thresholdScore != null &&
    overall != null &&
    overall >= sess.thresholdScore &&
    !!sess.thanksLinkUrl;

  res.json({
    submittedAt: updated.submittedAt,
    overallScore: updated.overallScore,
    thanksText: updated.thanksText ?? 'Vielen Dank fuer Ihre Rueckmeldung.',
    thanksLink: showLink
      ? { label: updated.thanksLinkLabel ?? 'Mehr erfahren', url: updated.thanksLinkUrl }
      : null,
  });
});

export default router;
