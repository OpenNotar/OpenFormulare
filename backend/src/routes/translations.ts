// Admin API for managing per-dialog translations.
//
// GET   /api/admin/translations/:dialogId            → list languages with stored translations
// GET   /api/admin/translations/:dialogId/:lang      → load a single language map
// PUT   /api/admin/translations/:dialogId/:lang      → save / overwrite a language map
// DELETE /api/admin/translations/:dialogId/:lang     → drop a language
// GET   /api/admin/translations/:dialogId/keys       → enumerate translatable keys + canonical German strings
//
// The public dialog endpoint serves translated schemas via
// /api/dialogs/:id?lang=xx (see routes/dialogs.ts).

import { Router } from 'express';
import { z } from 'zod';
import { requireAdminAuth } from '../auth/adminAuth';
import { getDialog } from '../db/database';
import {
  getTranslation,
  setTranslation,
  deleteTranslation,
  listDialogLanguages,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../db/translations';
import { collectTranslatableStrings } from '../services/i18nKeys';

const router = Router();

router.use(requireAdminAuth);

const langSchema = z.enum(SUPPORTED_LANGUAGES);
const translationsSchema = z.record(z.string(), z.string());

router.get('/:dialogId/keys', (req, res) => {
  const dialog = getDialog(req.params.dialogId);
  if (!dialog) {
    res.status(404).json({ error: 'Dialog nicht gefunden' });
    return;
  }
  const strings = collectTranslatableStrings(dialog);
  res.json({ dialogId: dialog.id, keys: strings });
});

router.get('/:dialogId', (req, res) => {
  const languages = listDialogLanguages(req.params.dialogId);
  res.json({ dialogId: req.params.dialogId, languages });
});

router.get('/:dialogId/:lang', (req, res) => {
  const parsedLang = langSchema.safeParse(req.params.lang);
  if (!parsedLang.success) {
    res.status(400).json({ error: 'Sprache nicht unterstützt' });
    return;
  }
  const map = getTranslation(req.params.dialogId, parsedLang.data as SupportedLanguage);
  res.json({
    dialogId: req.params.dialogId,
    language: parsedLang.data,
    translations: map ?? {},
  });
});

router.put('/:dialogId/:lang', (req, res) => {
  const parsedLang = langSchema.safeParse(req.params.lang);
  if (!parsedLang.success) {
    res.status(400).json({ error: 'Sprache nicht unterstützt' });
    return;
  }
  const dialog = getDialog(req.params.dialogId);
  if (!dialog) {
    res.status(404).json({ error: 'Dialog nicht gefunden' });
    return;
  }
  const parsed = translationsSchema.safeParse(req.body?.translations ?? req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ungültige Übersetzungsdaten' });
    return;
  }
  setTranslation(req.params.dialogId, parsedLang.data as SupportedLanguage, parsed.data);
  res.json({
    dialogId: req.params.dialogId,
    language: parsedLang.data,
    translations: parsed.data,
  });
});

router.delete('/:dialogId/:lang', (req, res) => {
  const parsedLang = langSchema.safeParse(req.params.lang);
  if (!parsedLang.success) {
    res.status(400).json({ error: 'Sprache nicht unterstützt' });
    return;
  }
  const removed = deleteTranslation(req.params.dialogId, parsedLang.data as SupportedLanguage);
  if (!removed) {
    res.status(404).json({ error: 'Keine Übersetzung vorhanden' });
    return;
  }
  res.status(204).send();
});

export default router;
