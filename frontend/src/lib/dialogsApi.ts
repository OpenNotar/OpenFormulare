import type { FormSchema } from '../types/schema';
import { getAdminToken } from './adminAuth';
import { getDemoHeaders } from './runtimeMode';

export interface DialogRecord extends FormSchema {
  description?: string;
  category?: string;
  isActive?: boolean;
  isSystem?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const apiUrl = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const mergedHeaders = {
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...getDemoHeaders(),
    ...(init?.headers ?? {}),
  };

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: mergedHeaders,
  });

  if (!response.ok) {
    let message = `API request failed with ${response.status}`;
    try {
      const error = (await response.json()) as { error?: string };
      if (error.error) {
        message = error.error;
      }
    } catch {
      // Ignore JSON parsing errors and keep the generic message.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function listDialogs() {
  return request<DialogRecord[]>('/api/dialogs');
}

export function getDialog(id: string, language?: string) {
  const qs = language && language !== 'de' ? `?lang=${encodeURIComponent(language)}` : '';
  return request<DialogRecord>(`/api/dialogs/${id}${qs}`);
}

function getAdminHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function listAdminDialogs() {
  return request<DialogRecord[]>('/api/admin/dialogs', {
    headers: getAdminHeaders(),
  });
}

export function getAdminDialog(id: string) {
  return request<DialogRecord>(`/api/admin/dialogs/${id}`, {
    headers: getAdminHeaders(),
  });
}

export function createDialog(dialog: FormSchema) {
  return request<DialogRecord>('/api/dialogs', {
    method: 'POST',
    headers: getAdminHeaders(),
    body: JSON.stringify(dialog),
  });
}

export function updateDialog(currentId: string, dialog: FormSchema) {
  return request<DialogRecord>(`/api/dialogs/${currentId}`, {
    method: 'PUT',
    headers: getAdminHeaders(),
    body: JSON.stringify(dialog),
  });
}

export function removeDialog(id: string) {
  return request<void>(`/api/dialogs/${id}`, {
    method: 'DELETE',
    headers: getAdminHeaders(),
  });
}

export function toggleDialogActive(id: string) {
  return request<DialogRecord>(`/api/dialogs/${id}/toggle-active`, {
    method: 'PATCH',
    headers: getAdminHeaders(),
  });
}

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

export function acquireLock(id: string) {
  return request<{ locked: boolean }>(`/api/admin/dialogs/${id}/lock`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
}

export function releaseLock(id: string) {
  return request<void>(`/api/admin/dialogs/${id}/lock`, {
    method: 'DELETE',
    headers: getAdminHeaders(),
  });
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export interface DialogVersion {
  id: number;
  dialogId: string;
  versionNumber: number;
  savedAt: string;
  changes: string[];
}

export interface DialogVersionFull extends DialogVersion {
  schema: import('../types/schema').FormSchema;
}

export function listVersions(id: string) {
  return request<DialogVersion[]>(`/api/admin/dialogs/${id}/versions`, {
    headers: getAdminHeaders(),
  });
}

export function restoreVersion(dialogId: string, versionId: number) {
  return request<DialogRecord>(`/api/admin/dialogs/${dialogId}/versions/${versionId}/restore`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

export async function exportAllDialogs(): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(`${apiUrl}/api/admin/dialogs/export`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...getDemoHeaders(),
    },
  });
  if (!res.ok) throw new Error(`Export fehlgeschlagen: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dialogs-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  imported: number;
  results: { id: string; action: 'created' | 'updated' }[];
}

export function importDialogs(schemas: import('../types/schema').FormSchema[]) {
  return request<ImportResult>('/api/admin/dialogs/import', {
    method: 'POST',
    headers: getAdminHeaders(),
    body: JSON.stringify(schemas),
  });
}
