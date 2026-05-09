// Frontend API client + lightweight cache for plugin metadata.
//
// Two consumers:
//  - the dialog editor: lists plugin-contributed field types in the
//    "add field" picker and uses their metadata for default props.
//  - the FieldRenderer: looks up an unknown field type to decide how to
//    render it (falls back to a generic input based on `behavior`).

import { getAdminToken } from './adminAuth';
import { getDemoHeaders } from './runtimeMode';

const apiUrl = import.meta.env.VITE_API_URL ?? '';

function adminHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...getDemoHeaders(),
    ...adminHeaders(),
    ...(init?.headers ?? {}),
  };
  const r = await fetch(`${apiUrl}${path}`, { ...init, headers });
  if (!r.ok) {
    let message = `API request failed with ${r.status}`;
    try {
      const err = (await r.json()) as { error?: string };
      if (err.error) message = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export interface PluginFieldTypeInfo {
  pluginId: string;
  id: string;
  label: string;
  description?: string;
  defaultProps?: Record<string, unknown>;
  // Hint for the runtime renderer: which built-in field shape to emulate.
  // Defaults to 'text'. Plugins ship metadata only; the frontend renders
  // them via the generic PluginField component (or a dedicated component
  // for richer behaviours like 'calendar').
  behavior?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date' | 'calendar';
}

export interface PluginAdminInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage: string;
  enabled: boolean;
  hooks: string[];
  fieldTypes: Array<{ id: string; label: string; description: string }>;
  hasRoutes: boolean;
  settings: Array<{
    key: string;
    label: string;
    type: string;
    description?: string;
    required?: boolean;
    default?: string | number | boolean;
    options?: Array<{ value: string; label: string }>;
  }>;
  errors: string[];
}

let fieldTypesCache: PluginFieldTypeInfo[] | null = null;
let fieldTypesPromise: Promise<PluginFieldTypeInfo[]> | null = null;

export async function listPluginFieldTypes(): Promise<PluginFieldTypeInfo[]> {
  if (fieldTypesCache) return fieldTypesCache;
  if (fieldTypesPromise) return fieldTypesPromise;
  fieldTypesPromise = fetch(`${apiUrl}/api/admin/plugins/_field-types`, {
    headers: { ...getDemoHeaders(), ...adminHeaders() },
  })
    .then(async (r) => {
      if (!r.ok) return [] as PluginFieldTypeInfo[];
      const data = (await r.json()) as PluginFieldTypeInfo[];
      fieldTypesCache = data;
      return data;
    })
    .catch(() => [] as PluginFieldTypeInfo[]);
  return fieldTypesPromise;
}

export function clearPluginFieldTypeCache() {
  fieldTypesCache = null;
  fieldTypesPromise = null;
}

export function listAdminPlugins() {
  return adminRequest<PluginAdminInfo[]>('/api/admin/plugins');
}

export function getPluginSettings(id: string) {
  return adminRequest<{
    schema: PluginAdminInfo['settings'];
    values: Record<string, string>;
  }>(`/api/admin/plugins/${encodeURIComponent(id)}/settings`);
}

export function savePluginSettings(
  id: string,
  values: Record<string, string | number | boolean>,
) {
  return adminRequest<{ ok: true; values: Record<string, string> }>(
    `/api/admin/plugins/${encodeURIComponent(id)}/settings`,
    {
      method: 'PUT',
      body: JSON.stringify(values),
    },
  );
}

export function setPluginEnabled(id: string, enabled: boolean) {
  const action = enabled ? 'enable' : 'disable';
  return adminRequest<{ ok: true }>(
    `/api/admin/plugins/${encodeURIComponent(id)}/${action}`,
    { method: 'POST' },
  );
}
