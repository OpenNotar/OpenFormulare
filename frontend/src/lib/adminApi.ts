// Gemeinsamer Zugriff auf die Admin-API.
//
// Wichtig ist hier die zentrale 401-Behandlung: läuft eine Sitzung ab oder
// wird sie serverseitig ungültig (Passwort-/Rollenwechsel, Deaktivierung,
// oder ein Token aus einer Version vor dem Update), dann darf die Oberfläche
// nicht einfach die rohe Server-Meldung anzeigen. Sonst steht der Benutzer vor
// „Ungültige oder abgelaufene Anmeldung" an einer Stelle, die nichts mit der
// Anmeldung zu tun hat — und merkt erst beim nächsten Neuladen, dass er
// abgemeldet ist.
//
// Stattdessen: Sitzung sofort verwerfen und eine eindeutige Meldung werfen,
// auf die die Seiten mit einer Weiterleitung zum Login reagieren.

import { adminLogout, getAdminToken } from './adminAuth';
import { getDemoHeaders } from './runtimeMode';

export const apiUrl = import.meta.env.VITE_API_URL ?? '';

export const SESSION_EXPIRED_MESSAGE =
  'Die Sitzung ist abgelaufen. Bitte melde dich erneut an.';

export class SessionExpiredError extends Error {
  constructor(message = SESSION_EXPIRED_MESSAGE) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export function isSessionExpired(error: unknown): boolean {
  return error instanceof SessionExpiredError;
}

export function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAdminToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...getDemoHeaders(),
    ...extra,
  };
}

export async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, init);

  if (res.status === 401) {
    // Das gespeicherte Token ist nicht mehr brauchbar — gar nicht erst
    // weiterverwenden, sonst schlägt jeder folgende Request ebenso fehl.
    adminLogout();
    throw new SessionExpiredError();
  }

  if (!res.ok) {
    let msg = `Anfrage fehlgeschlagen (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* Antwort war kein JSON — Standardmeldung behalten */ }
    throw new Error(msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
