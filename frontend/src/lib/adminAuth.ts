import { getCachedRuntimeMode, getDemoHeaders } from './runtimeMode';

const TOKEN_KEY = 'notar-admin-token';
const USERNAME_KEY = 'notar-admin-username';
const apiUrl = import.meta.env.VITE_API_URL ?? '';

export interface AdminLoginResult {
  token: string;
  username: string;
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

export function getAdminToken() {
  return getStoredToken();
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
  return payload as AdminLoginResult;
}

export async function verifyAdminSession() {
  if (getCachedRuntimeMode()?.demoMode) {
    localStorage.setItem(USERNAME_KEY, 'Demo');
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

  const payload = (await response.json()) as { username: string };
  localStorage.setItem(USERNAME_KEY, payload.username);
  return payload.username;
}

export function adminLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}
