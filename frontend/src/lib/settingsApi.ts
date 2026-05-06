import type { FormStep, FormField } from '../types/schema';
import { getAdminToken } from './adminAuth';
import { getDemoHeaders } from './runtimeMode';

const apiUrl = import.meta.env.VITE_API_URL ?? '';

export interface BrandingSettings {
  notarName?: string;
  titleTemplate?: string;
  primaryColor?: string;
  colors?: {
    primary?: string;
    primaryDark?: string;
    accent?: string;
  };
  faviconUrl?: string;
  logoUrl?: string;
}

function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAdminToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...getDemoHeaders(),
    ...extra,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, init);
  if (!res.ok) {
    let msg = `Anfrage fehlgeschlagen (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

export function getBranding() {
  return request<BrandingSettings>('/api/admin/settings/branding', {
    headers: adminHeaders(),
  });
}

export function putBranding(branding: BrandingSettings) {
  return request<BrandingSettings>('/api/admin/settings/branding', {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(branding),
  });
}

// ---------------------------------------------------------------------------
// Kontakt step
// ---------------------------------------------------------------------------

export function getKontaktStep() {
  return request<FormStep>('/api/admin/settings/kontakt-step', {
    headers: adminHeaders(),
  });
}

export function putKontaktStep(step: FormStep) {
  return request<FormStep>('/api/admin/settings/kontakt-step', {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(step),
  });
}

// ---------------------------------------------------------------------------
// Person templates
// ---------------------------------------------------------------------------

export interface PersonTemplatesPayload {
  natural: FormField[];
  legal: FormField[];
}

export function getPersonTemplates() {
  return request<PersonTemplatesPayload>('/api/admin/settings/person-templates', {
    headers: adminHeaders(),
  });
}

export function putPersonTemplates(payload: PersonTemplatesPayload) {
  return request<PersonTemplatesPayload>('/api/admin/settings/person-templates', {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Dispatch (which transports run, which docs are attached)
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

export function getDispatchConfig() {
  return request<DispatchConfig>('/api/admin/settings/dispatch', {
    headers: adminHeaders(),
  });
}

export function putDispatchConfig(cfg: DispatchConfig) {
  return request<DispatchConfig>('/api/admin/settings/dispatch', {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(cfg),
  });
}

// ---------------------------------------------------------------------------
// Email config (SMTP + sender + signature + client template)
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

export function getEmailConfig() {
  return request<EmailConfig>('/api/admin/settings/email', {
    headers: adminHeaders(),
  });
}

export function putEmailConfig(cfg: EmailConfig) {
  return request<EmailConfig>('/api/admin/settings/email', {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(cfg),
  });
}

// ---------------------------------------------------------------------------
// DiNo config (API key, TTL)
// ---------------------------------------------------------------------------

export interface DinoConfig {
  apiKey: string;
  ttlHours: number;
}

export function getDinoConfig() {
  return request<DinoConfig>('/api/admin/settings/dino', {
    headers: adminHeaders(),
  });
}

export function putDinoConfig(cfg: DinoConfig) {
  return request<DinoConfig>('/api/admin/settings/dino', {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(cfg),
  });
}
