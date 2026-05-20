// Centralised runtime mode configuration.
//
// - DEMO_MODE stays in the .env file: it is a boot-time decision that
//   determines whether the whole backend runs in a sandbox (no admin login,
//   no email, no submission persisted, no DiNo connection).
// - All other runtime options (dispatch toggles, SMTP / signature / template,
//   DiNo API key + TTL) live in the settings table and are managed via the
//   admin UI. Demo visitors get a per-session sandbox of these settings.
//
// Legacy .env keys (SMTP_*, FROM_*, NOTAR_EMAIL, DINO_*, EMAIL_ENABLED,
// DINO_ENABLED, DINO_MODE) are still consulted as a last-resort fallback so
// a fresh install with a populated .env keeps working until the admin opens
// the new settings UI.

import { SETTING_KEYS, getEffectiveSetting } from '../db/settings';
import { maybeDecryptString } from '../db/crypto';

function envFlag(name: string): boolean | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  return raw.trim().toLowerCase() === 'true';
}

export function isDemoMode(): boolean {
  return envFlag('DEMO_MODE') === true;
}

// ---------------------------------------------------------------------------
// Dispatch (which transports run on submission, which docs are attached)
// ---------------------------------------------------------------------------

export interface AttachmentSelection {
  pdf: boolean;
  docx: boolean;
  json: boolean;
  dinoJson: boolean;
}

export interface DispatchConfig {
  dinoEnabled: boolean;
  emailEnabled: boolean;
  attachments: AttachmentSelection;
}

const DEFAULT_ATTACHMENTS: AttachmentSelection = {
  pdf: true,
  docx: true,
  json: true,
  dinoJson: true,
};

function dispatchEnvFallback(): DispatchConfig {
  const explicitDino = envFlag('DINO_ENABLED');
  const explicitEmail = envFlag('EMAIL_ENABLED');
  const legacy = envFlag('DINO_MODE');
  return {
    dinoEnabled: explicitDino ?? (legacy === true),
    emailEnabled: explicitEmail ?? (legacy !== true),
    attachments: { ...DEFAULT_ATTACHMENTS },
  };
}

export function getDispatchConfig(sessionId?: string): DispatchConfig {
  const stored = getEffectiveSetting<Partial<DispatchConfig>>(sessionId, SETTING_KEYS.dispatchConfig);
  const fallback = dispatchEnvFallback();
  if (!stored) return fallback;
  return {
    dinoEnabled: stored.dinoEnabled ?? fallback.dinoEnabled,
    emailEnabled: stored.emailEnabled ?? fallback.emailEnabled,
    attachments: { ...DEFAULT_ATTACHMENTS, ...(stored.attachments ?? {}) },
  };
}

export function isDinoEnabled(sessionId?: string): boolean {
  if (isDemoMode()) return false;
  return getDispatchConfig(sessionId).dinoEnabled;
}

export function isEmailEnabled(sessionId?: string): boolean {
  if (isDemoMode()) return false;
  return getDispatchConfig(sessionId).emailEnabled;
}

// ---------------------------------------------------------------------------
// Email config (SMTP + sender + notar recipient + signature + client template)
// ---------------------------------------------------------------------------

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpDebug: boolean;
  fromEmail: string;
  fromName: string;
  notarEmail: string;
  htmlSignature: string;
  clientSubjectTemplate: string;
  clientBodyTemplate: string;
}

export const DEFAULT_CLIENT_SUBJECT = 'Ihre Anfrage ist eingegangen: {title}';

export const DEFAULT_CLIENT_BODY = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px">
  <div style="background:#1a3a5c;color:#fff;padding:20px 24px;margin-bottom:24px">
    <h1 style="font-size:18px;margin:0">Anfrage erhalten</h1>
  </div>
  <div style="padding:0 24px">
    <p>Sehr geehrte/r {submittedBy},</p>
    <p style="margin-top:12px">vielen Dank f&uuml;r Ihre Anfrage zum Thema <strong>{title}</strong>. Wir haben Ihre Angaben erhalten und werden uns in K&uuml;rze bei Ihnen melden.</p>
    <table style="border-collapse:collapse;width:100%;margin-top:20px;background:#f8f9fa;border-radius:6px;padding:12px">
      <tr><td style="padding:6px 12px;color:#666;width:160px">Formular</td><td style="padding:6px 12px;font-weight:600">{title}</td></tr>
      <tr><td style="padding:6px 12px;color:#666">Eingereicht am</td><td style="padding:6px 12px">{submittedAt}</td></tr>
    </table>
    <p style="margin-top:24px;color:#555;font-size:13px">
      Bitte bewahren Sie diese E-Mail als Nachweis Ihrer Einreichung auf.<br/>
      Bei R&uuml;ckfragen antworten Sie einfach auf diese E-Mail.
    </p>
    <p style="margin-top:24px">Mit freundlichen Gr&uuml;&szlig;en<br/><strong>{notarName}</strong></p>
  </div>
</div>`;

function emailEnvFallback(): EmailConfig {
  return {
    smtpHost: process.env.SMTP_HOST ?? '',
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
    smtpDebug: envFlag('SMTP_DEBUG') === true,
    fromEmail: process.env.FROM_EMAIL ?? '',
    fromName: process.env.FROM_NAME ?? 'OpenFormulare',
    notarEmail: process.env.NOTAR_EMAIL ?? '',
    htmlSignature: '',
    clientSubjectTemplate: DEFAULT_CLIENT_SUBJECT,
    clientBodyTemplate: DEFAULT_CLIENT_BODY,
  };
}

export function getEmailConfig(sessionId?: string): EmailConfig {
  const stored = getEffectiveSetting<Partial<EmailConfig>>(sessionId, SETTING_KEYS.emailConfig);
  const fallback = emailEnvFallback();
  if (!stored) return fallback;
  // smtpPass kann als `enc:v1:…`-Token in der DB liegen — bei der Rückgabe
  // an SMTP-Konsumenten entschlüsseln wir transparent. Plain-Werte (Legacy)
  // gehen unverändert durch.
  const storedPass = typeof stored.smtpPass === 'string' ? stored.smtpPass : '';
  return {
    smtpHost: stored.smtpHost ?? fallback.smtpHost,
    smtpPort: typeof stored.smtpPort === 'number' ? stored.smtpPort : fallback.smtpPort,
    smtpUser: stored.smtpUser ?? fallback.smtpUser,
    smtpPass: storedPass ? maybeDecryptString(storedPass) : fallback.smtpPass,
    smtpDebug: typeof stored.smtpDebug === 'boolean' ? stored.smtpDebug : fallback.smtpDebug,
    fromEmail: stored.fromEmail ?? fallback.fromEmail,
    fromName: stored.fromName ?? fallback.fromName,
    notarEmail: stored.notarEmail ?? fallback.notarEmail,
    htmlSignature: stored.htmlSignature ?? fallback.htmlSignature,
    clientSubjectTemplate: stored.clientSubjectTemplate ?? fallback.clientSubjectTemplate,
    clientBodyTemplate: stored.clientBodyTemplate ?? fallback.clientBodyTemplate,
  };
}

// ---------------------------------------------------------------------------
// DiNo config (API key for the pull endpoint, TTL for stale submissions)
// ---------------------------------------------------------------------------

export interface DinoConfig {
  apiKey: string;
  ttlHours: number;
}

function dinoEnvFallback(): DinoConfig {
  return {
    apiKey: process.env.DINO_API_KEY ?? '',
    ttlHours: parseInt(process.env.DINO_TTL_HOURS ?? '72', 10),
  };
}

export function getDinoConfig(sessionId?: string): DinoConfig {
  const stored = getEffectiveSetting<Partial<DinoConfig>>(sessionId, SETTING_KEYS.dinoConfig);
  const fallback = dinoEnvFallback();
  if (!stored) return fallback;
  const storedKey = typeof stored.apiKey === 'string' ? stored.apiKey : '';
  return {
    apiKey: storedKey ? maybeDecryptString(storedKey) : fallback.apiKey,
    ttlHours: typeof stored.ttlHours === 'number' ? stored.ttlHours : fallback.ttlHours,
  };
}
