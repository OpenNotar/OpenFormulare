import { setAdminToken, type AdminRole } from './adminAuth';
import { adminHeaders, adminRequest as request } from './adminApi';

export interface AdminUser {
  id: string;
  username: string;
  role: AdminRole;
  isActive: boolean;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  admin: 'Administrator',
  moderator: 'Moderator',
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  admin: 'Darf alles — Dialoge, Einstellungen, Plugins und Benutzer.',
  moderator: 'Darf Dialoge und Übersetzungen pflegen, aber keine Einstellungen ändern.',
};

export function listUsers() {
  return request<{ users: AdminUser[]; roles: AdminRole[] }>('/api/admin/users', {
    headers: adminHeaders(),
  });
}

export function createUser(input: {
  username: string;
  password: string;
  role: AdminRole;
  isActive?: boolean;
}) {
  return request<AdminUser>('/api/admin/users', {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
}

export function updateUser(
  id: string,
  changes: { username?: string; password?: string; role?: AdminRole; isActive?: boolean },
) {
  return request<AdminUser>(`/api/admin/users/${id}`, {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(changes),
  });
}

export function deleteUser(id: string) {
  return request<{ success: boolean }>(`/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
}

/**
 * Eigenes Passwort ändern. Der Wechsel macht das bisherige Token serverseitig
 * ungültig, deshalb wird das frisch ausgestellte direkt übernommen — sonst
 * würde der Benutzer unmittelbar nach dem Speichern abgemeldet.
 */
export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const result = await request<{ token: string; username: string; role: AdminRole }>(
    '/api/admin/auth/password',
    {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ currentPassword, newPassword }),
    },
  );
  setAdminToken(result.token);
  return result;
}
