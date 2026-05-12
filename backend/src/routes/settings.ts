import { Router } from 'express';
import { requireAdminAuth } from '../auth/adminAuth';
import { encryptString } from '../db/crypto';
import {
  SETTING_KEYS,
  getSetting,
  getEffectiveSetting,
  setEffectiveSetting,
} from '../db/settings';
import { getDefaultKontaktStep, getDefaultPersonTemplates, getDefaultBranding } from '../db/sharedSteps';
import type { FormStep, FormField } from '../db/types/schema';
import {
  isDemoMode,
  getDispatchConfig,
  getEmailConfig,
  getDinoConfig,
  type DispatchConfig,
  type EmailConfig,
  type DinoConfig,
} from '../services/runtimeMode';

const publicRouter = Router();
const adminRouter = Router();

// ---------------------------------------------------------------------------
// Public: settings consumed by the form renderer (kontakt step, branding,
// person templates). Read-only, never returns sensitive backend config.
// ---------------------------------------------------------------------------

publicRouter.get('/branding', (_req, res) => {
  const stored = getSetting<unknown>(SETTING_KEYS.branding);
  res.json(stored ?? getDefaultBranding());
});

publicRouter.get('/kontakt-step', (_req, res) => {
  const stored = getSetting<FormStep>(SETTING_KEYS.kontaktStep);
  res.json(stored ?? getDefaultKontaktStep());
});

publicRouter.get('/person-templates', (_req, res) => {
  const natural = getSetting<FormField[]>(SETTING_KEYS.personTemplateNatural);
  const legal = getSetting<FormField[]>(SETTING_KEYS.personTemplateLegal);
  const defaults = getDefaultPersonTemplates();
  res.json({
    natural: natural ?? defaults.natural,
    legal: legal ?? defaults.legal,
  });
});

// ---------------------------------------------------------------------------
// Admin: read + update.
//
// In demo mode every write lands in the per-session in-memory store (see
// settingsStore.ts). Reads consult the session store first, so a demo user
// sees their own edits but never touches the real DB.
// ---------------------------------------------------------------------------

adminRouter.use(requireAdminAuth);

function sessionId(req: import('express').Request): string | undefined {
  return req.demoSessionId;
}

adminRouter.get('/branding', (req, res) => {
  const stored = getEffectiveSetting<unknown>(sessionId(req), SETTING_KEYS.branding);
  res.json(stored ?? getDefaultBranding());
});

adminRouter.put('/branding', (req, res) => {
  const body = req.body as Record<string, unknown>;
  setEffectiveSetting(sessionId(req), SETTING_KEYS.branding, body);
  res.json(body);
});

adminRouter.get('/kontakt-step', (req, res) => {
  const stored = getEffectiveSetting<FormStep>(sessionId(req), SETTING_KEYS.kontaktStep);
  res.json(stored ?? getDefaultKontaktStep());
});

adminRouter.put('/kontakt-step', (req, res) => {
  const body = req.body as FormStep;
  if (!body || typeof body !== 'object' || !Array.isArray(body.fields)) {
    res.status(400).json({ error: 'Ungültiger Kontakt-Step.' });
    return;
  }
  const step: FormStep = { ...body, id: 'kontakt' };
  setEffectiveSetting(sessionId(req), SETTING_KEYS.kontaktStep, step);
  res.json(step);
});

adminRouter.get('/person-templates', (req, res) => {
  const natural = getEffectiveSetting<FormField[]>(sessionId(req), SETTING_KEYS.personTemplateNatural);
  const legal = getEffectiveSetting<FormField[]>(sessionId(req), SETTING_KEYS.personTemplateLegal);
  const defaults = getDefaultPersonTemplates();
  res.json({
    natural: natural ?? defaults.natural,
    legal: legal ?? defaults.legal,
  });
});

adminRouter.put('/person-templates', (req, res) => {
  const body = req.body as { natural?: FormField[]; legal?: FormField[] };
  if (body.natural && !Array.isArray(body.natural)) {
    res.status(400).json({ error: 'Ungültige natural-Vorlage.' });
    return;
  }
  if (body.legal && !Array.isArray(body.legal)) {
    res.status(400).json({ error: 'Ungültige legal-Vorlage.' });
    return;
  }
  if (body.natural !== undefined) setEffectiveSetting(sessionId(req), SETTING_KEYS.personTemplateNatural, body.natural);
  if (body.legal !== undefined) setEffectiveSetting(sessionId(req), SETTING_KEYS.personTemplateLegal, body.legal);
  res.json(body);
});

// ---------------------------------------------------------------------------
// Dispatch: which transports run on submission, which docs are attached.
// ---------------------------------------------------------------------------

adminRouter.get('/dispatch', (req, res) => {
  res.json(getDispatchConfig(sessionId(req)));
});

adminRouter.put('/dispatch', (req, res) => {
  const body = req.body as Partial<DispatchConfig> | undefined;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Ungültige Versandkonfiguration.' });
    return;
  }
  const current = getDispatchConfig(sessionId(req));
  const next: DispatchConfig = {
    dinoEnabled: typeof body.dinoEnabled === 'boolean' ? body.dinoEnabled : current.dinoEnabled,
    emailEnabled: typeof body.emailEnabled === 'boolean' ? body.emailEnabled : current.emailEnabled,
    attachments: {
      pdf: body.attachments?.pdf ?? current.attachments.pdf,
      docx: body.attachments?.docx ?? current.attachments.docx,
      json: body.attachments?.json ?? current.attachments.json,
      dinoJson: body.attachments?.dinoJson ?? current.attachments.dinoJson,
    },
  };
  setEffectiveSetting(sessionId(req), SETTING_KEYS.dispatchConfig, next);
  res.json(next);
});

// ---------------------------------------------------------------------------
// Email: SMTP credentials, sender, signature, client template.
//
// SMTP password is masked on read (********** if present, '' otherwise) so a
// shoulder-surfer in the admin UI can't read it back. On write an empty or
// fully-masked password keeps the previous value.
// ---------------------------------------------------------------------------

const SMTP_PASS_MASK = '••••••••';

function maskEmailConfig(cfg: EmailConfig): EmailConfig {
  return { ...cfg, smtpPass: cfg.smtpPass ? SMTP_PASS_MASK : '' };
}

adminRouter.get('/email', (req, res) => {
  res.json(maskEmailConfig(getEmailConfig(sessionId(req))));
});

adminRouter.put('/email', (req, res) => {
  const body = req.body as Partial<EmailConfig> | undefined;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Ungültige E-Mail-Konfiguration.' });
    return;
  }
  const current = getEmailConfig(sessionId(req));
  const incomingPass = typeof body.smtpPass === 'string' ? body.smtpPass : '';
  const keepPass = incomingPass === '' || incomingPass === SMTP_PASS_MASK;
  const effectivePass = keepPass ? current.smtpPass : incomingPass;
  const next: EmailConfig = {
    smtpHost: body.smtpHost ?? current.smtpHost,
    smtpPort: typeof body.smtpPort === 'number' ? body.smtpPort : current.smtpPort,
    smtpUser: body.smtpUser ?? current.smtpUser,
    smtpPass: effectivePass,
    smtpDebug: typeof body.smtpDebug === 'boolean' ? body.smtpDebug : current.smtpDebug,
    fromEmail: body.fromEmail ?? current.fromEmail,
    fromName: body.fromName ?? current.fromName,
    notarEmail: body.notarEmail ?? current.notarEmail,
    htmlSignature: body.htmlSignature ?? current.htmlSignature,
    clientSubjectTemplate: body.clientSubjectTemplate ?? current.clientSubjectTemplate,
    clientBodyTemplate: body.clientBodyTemplate ?? current.clientBodyTemplate,
  };
  // Persistiert wird ein verschlüsselter smtpPass — die in-memory `next`-Sicht
  // behält Klartext, damit `maskEmailConfig` korrekt entscheiden kann, ob das
  // Maskierungs-Token angezeigt wird.
  setEffectiveSetting(sessionId(req), SETTING_KEYS.emailConfig, {
    ...next,
    smtpPass: effectivePass ? encryptString(effectivePass) : '',
  });
  res.json(maskEmailConfig(next));
});

// ---------------------------------------------------------------------------
// DiNo: API key + TTL for the pull endpoint.
//
// The API key is masked on read (same scheme as SMTP password).
// ---------------------------------------------------------------------------

const DINO_KEY_MASK = '••••••••';

function maskDinoConfig(cfg: DinoConfig): DinoConfig {
  return { ...cfg, apiKey: cfg.apiKey ? DINO_KEY_MASK : '' };
}

adminRouter.get('/dino', (req, res) => {
  res.json(maskDinoConfig(getDinoConfig(sessionId(req))));
});

adminRouter.put('/dino', (req, res) => {
  const body = req.body as Partial<DinoConfig> | undefined;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Ungültige DiNo-Konfiguration.' });
    return;
  }
  const current = getDinoConfig(sessionId(req));
  const incomingKey = typeof body.apiKey === 'string' ? body.apiKey : '';
  const keepKey = incomingKey === '' || incomingKey === DINO_KEY_MASK;
  const effectiveKey = keepKey ? current.apiKey : incomingKey;
  const next: DinoConfig = {
    apiKey: effectiveKey,
    ttlHours: typeof body.ttlHours === 'number' ? body.ttlHours : current.ttlHours,
  };
  // DiNo-API-Key wird verschlüsselt persistiert (Lesen via maybeDecryptString
  // in getDinoConfig).
  setEffectiveSetting(sessionId(req), SETTING_KEYS.dinoConfig, {
    ...next,
    apiKey: effectiveKey ? encryptString(effectiveKey) : '',
  });
  res.json(maskDinoConfig(next));
});

// Status snapshot — useful for the admin UI to show what is currently active.
adminRouter.get('/runtime', (req, res) => {
  const dispatch = getDispatchConfig(sessionId(req));
  res.json({
    demoMode: isDemoMode(),
    dinoEnabled: !isDemoMode() && dispatch.dinoEnabled,
    emailEnabled: !isDemoMode() && dispatch.emailEnabled,
    attachments: dispatch.attachments,
  });
});

export { publicRouter, adminRouter };
