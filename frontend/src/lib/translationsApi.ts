// Admin client for the per-dialog translations API.
//
// All endpoints require admin auth and live under /api/admin/translations.

import { getAdminToken } from './adminAuth';
import { getDemoHeaders } from './runtimeMode';

const apiUrl = import.meta.env.VITE_API_URL ?? '';

export type TranslationMap = Record<string, string>;

interface ListResponse {
  dialogId: string;
  languages: string[];
}

interface GetResponse {
  dialogId: string;
  language: string;
  translations: TranslationMap;
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

export function listDialogTranslations(dialogId: string): Promise<ListResponse> {
  return request<ListResponse>(`/api/admin/translations/${encodeURIComponent(dialogId)}`, {
    headers: adminHeaders(),
  });
}

export function getDialogTranslation(dialogId: string, language: string): Promise<GetResponse> {
  return request<GetResponse>(
    `/api/admin/translations/${encodeURIComponent(dialogId)}/${encodeURIComponent(language)}`,
    { headers: adminHeaders() },
  );
}

export function putDialogTranslation(
  dialogId: string,
  language: string,
  translations: TranslationMap,
): Promise<GetResponse> {
  return request<GetResponse>(
    `/api/admin/translations/${encodeURIComponent(dialogId)}/${encodeURIComponent(language)}`,
    {
      method: 'PUT',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ translations }),
    },
  );
}

export function deleteDialogTranslation(dialogId: string, language: string): Promise<void> {
  return request<void>(
    `/api/admin/translations/${encodeURIComponent(dialogId)}/${encodeURIComponent(language)}`,
    { method: 'DELETE', headers: adminHeaders() },
  );
}
