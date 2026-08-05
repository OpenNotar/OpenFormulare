import { getCachedRuntimeMode, getDemoHeaders } from './runtimeMode';

const TOKEN_KEY = 'notar-admin-token';
const USERNAME_KEY = 'notar-admin-username';
const ROLE_KEY = 'notar-admin-role';
const apiUrl = import.meta.env.VITE_API_URL ?? '';

/**
 * `admin` darf alles (inkl. Einstellungen, Plugins, Benutzerverwaltung),
 * `moderator` darf Dialoge und Übersetzungen pflegen.
 *
 * Die Rolle hier steuert nur, was in der UI angeboten wird — durchgesetzt
 * wird sie serverseitig (requireAdminRole).
 */
export type AdminRole = 'admin' | 'moderator';

export interface AdminLoginResult {
  token: string;
  username: string;
  role: AdminRole;
}

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function isAdminAuthenticated() {
  if (getCachedRuntimeMode()?.demoMode) return true;
  return Boolean(getStoredToken());
}

export function getAdminUsername() {
  return localStorage.getItem(USERNAME_KEY);
}

export function getAdminRole(): AdminRole {
  // Unbekannt/alt gespeichert -> als Moderator behandeln. Lieber zu wenig
  // anbieten als eine Admin-Ansicht zeigen, die der Server dann mit 403
  // ablehnt.
  return localStorage.getItem(ROLE_KEY) === 'admin' ? 'admin' : 'moderator';
}

export function isAdminRole() {
  return getAdminRole() === 'admin';
}

export function getAdminToken() {
  return getStoredToken();
}

/** Token nach dem Ändern des eigenen Passworts austauschen (der Wechsel macht
 *  das alte Token serverseitig ungültig). */
export function setAdminToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export async function adminLogin(username: string, password: string) {
  const response = await fetch(`${apiUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const payload = (await response.json()) as { error?: string } & Partial<AdminLoginResult>;
  if (!response.ok || !payload.token || !payload.username) {
    throw new Error(payload.error || 'Login fehlgeschlagen');
  }

  localStorage.setItem(TOKEN_KEY, payload.token);
  localStorage.setItem(USERNAME_KEY, payload.username);
  localStorage.setItem(ROLE_KEY, payload.role === 'admin' ? 'admin' : 'moderator');
  return payload as AdminLoginResult;
}

export async function verifyAdminSession() {
  if (getCachedRuntimeMode()?.demoMode) {
    localStorage.setItem(USERNAME_KEY, 'Demo');
    localStorage.setItem(ROLE_KEY, 'admin');
    return 'Demo';
  }

  const token = getStoredToken();
  if (!token) {
    return null;
  }

  const response = await fetch(`${apiUrl}/api/admin/auth/me`, {
    headers: { Authorization: `Bearer ${token}`, ...getDemoHeaders() },
  });

  if (!response.ok) {
    adminLogout();
    return null;
  }

  const payload = (await response.json()) as { username: string; role?: AdminRole };
  localStorage.setItem(USERNAME_KEY, payload.username);
  localStorage.setItem(ROLE_KEY, payload.role === 'admin' ? 'admin' : 'moderator');
  return payload.username;
}

export function adminLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(ROLE_KEY);
}
