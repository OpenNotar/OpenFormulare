// Public plugin SDK types.
//
// This file is the contract between the OpenFormulare core and any plugin.
// External plugin authors only need to depend on the symbols exported here
// (re-exported via `backend/src/plugins/index.ts` → `@openformulare/plugin-sdk`
// once we publish a standalone SDK package).

import type { Router } from 'express';

import type { DialogRecord } from '../db/database';
import type { FormSchema } from '../db/types/schema';

// ---------------------------------------------------------------------------
// Hook event payloads
// ---------------------------------------------------------------------------

export interface DialogSubmittedEvent {
  dialogId: string;
  dialog: DialogRecord;
  submission: Record<string, unknown>;
  submittedAt: string;
}

export interface DialogBeforeSubmitEvent {
  dialogId: string;
  dialog: DialogRecord;
  submission: Record<string, unknown>;
}

export interface RatingCreatedEvent {
  ratingId: string;
  templateId: string;
  context: Record<string, unknown>;
  createdAt: string;
}

export interface AppointmentRequestedEvent {
  source: 'dialog' | 'manual' | string;
  proposedAt: string;
  durationMinutes: number;
  participants: Array<{ name?: string; email?: string }>;
  context: Record<string, unknown>;
}

export interface DataExportedEvent {
  format: string;
  scope: 'dialog' | 'submission' | 'rating' | string;
  resourceId: string;
  payloadBytes: number;
}

export interface DataImportedEvent {
  format: string;
  scope: 'dialog' | 'submission' | 'rating' | string;
  resourceId: string;
  payloadBytes: number;
}

export interface PluginEventMap {
  'dialog:beforeSubmit': DialogBeforeSubmitEvent;
  'dialog:submitted': DialogSubmittedEvent;
  'rating:created': RatingCreatedEvent;
  'appointment:requested': AppointmentRequestedEvent;
  'data:exported': DataExportedEvent;
  'data:imported': DataImportedEvent;
}

export type PluginEventName = keyof PluginEventMap;

// ---------------------------------------------------------------------------
// Settings schema (subset of JSON Schema – just what the auto-form supports)
// ---------------------------------------------------------------------------

export interface PluginSettingDefinition {
  key: string;
  label: string;
  // 'json' stores a serialised JSON string; the admin UI can render a
  // specialised editor when `componentHint` is set.
  type: 'string' | 'number' | 'boolean' | 'password' | 'url' | 'select' | 'json';
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  // For string fields a regexp the value must match (validated on save).
  pattern?: string;
  // For number fields.
  min?: number;
  max?: number;
  // Optional hint that lets the admin UI swap in a dedicated editor for this
  // setting (e.g. "weekly-schedule"). Plugins use this to ship a friendly
  // configuration UI without bundling their own React code.
  componentHint?: string;
}

// ---------------------------------------------------------------------------
// Field-type registration
// ---------------------------------------------------------------------------

export interface PluginFieldType {
  // Unique field-type id (used in the form schema as `type: <id>`).
  id: string;
  label: string;
  // Optional description shown in the dialog editor's field-type picker.
  description?: string;
  // Default sub-type (e.g. inputs `text` vs `email`) – purely informational
  // for the editor; the runtime treats unknown plugin types as "leaf" fields.
  defaultProps?: Record<string, unknown>;
  // Frontend-side import path (relative to the plugin's frontend bundle root,
  // e.g. `dist/MyField.js`). Loaded by the admin UI/runtime when the field
  // type appears in a schema. Empty string ⇒ no UI component (server-side
  // only field).
  frontendEntry?: string;
  // Backend-only: formats the raw submission value for this field type into a
  // human-readable string. Called when rendering PDF / DOCX and when building
  // the human-readable JSON attachment, so plugin fields don't leak raw JSON
  // payloads to recipients. The function is NOT serialised to the admin UI.
  // Receives the plugin's own context so the formatter can read settings
  // (e.g. timezone, locale) without keeping module-global state.
  formatValue?: (
    value: unknown,
    field: { id: string; label: string; type: string },
    ctx: PluginContext,
  ) => string;
}

// ---------------------------------------------------------------------------
// Logger / context handed to plugins
// ---------------------------------------------------------------------------

export interface PluginLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}

export interface PluginSettingsApi {
  get<T = string>(key: string, fallback?: T): T | undefined;
  getAll(): Record<string, string>;
  set(key: string, value: string | number | boolean): void;
}

export interface PluginMailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface PluginMailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: PluginMailAttachment[];
  replyTo?: string;
}

export interface PluginContext {
  pluginId: string;
  pluginVersion: string;
  log: PluginLogger;
  settings: PluginSettingsApi;
  // Read-only access to dialogs (so plugins can look up a dialog after a
  // submission event without touching the DB directly) plus generic helpers
  // shared with all plugins (email, sender info). New helpers go here so
  // plugin authors don't need their own SMTP/HTTP setup.
  core: {
    getDialog(id: string): DialogRecord | null;
    listDialogs(): DialogRecord[];
    getDialogSchema(id: string): FormSchema | null;
    // Versendet eine E-Mail über die zentral im Admin-Bereich konfigurierten
    // SMTP-Settings. Im SMTP-Debug-Modus wird nichts versendet, sondern eine
    // Hinweiszeile geloggt — Plugins müssen das nicht selbst prüfen.
    sendEmail(opts: PluginMailOptions): Promise<void>;
    // Liefert die im Admin-Bereich konfigurierte Absender-Adresse (`fromEmail`)
    // bzw. den Anzeigenamen (`fromName`). `null`, falls nicht konfiguriert.
    // Nützlich z. B. für `ORGANIZER` in iCal-Einladungen.
    getSenderEmail(): string | null;
    getSenderName(): string | null;
  };
}

// ---------------------------------------------------------------------------
// Plugin manifest + module shape
// ---------------------------------------------------------------------------

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  // Path to the compiled entry file, relative to the plugin's directory.
  // Defaults to `dist/index.js`.
  main?: string;
  // Settings exposed to the admin UI.
  settings?: PluginSettingDefinition[];
}

export type HookHandler<E extends PluginEventName> = (
  event: PluginEventMap[E],
  ctx: PluginContext,
) => void | Promise<void>;

export type HookHandlerMap = {
  [E in PluginEventName]?: HookHandler<E>;
};

export interface PluginModule {
  id: string;
  hooks?: HookHandlerMap;
  // Express router mounted at /api/plugins/<plugin-id>.
  // Plugins can use this to expose their own HTTP endpoints (callback URLs,
  // webhooks, sync endpoints, …). Plugins handle their own auth where needed.
  routes?: (router: Router, ctx: PluginContext) => void;
  // Express router mounted at /api/admin/plugins/<plugin-id>/ext, behind
  // requireAdminAuth. Use this for admin-only operations a plugin needs to
  // expose to the management UI (e.g. probing/discovering an external system
  // before saving credentials).
  adminRoutes?: (router: Router, ctx: PluginContext) => void;
  // Field types contributed by this plugin.
  fieldTypes?: PluginFieldType[];
  // Lifecycle hooks for plugin activation/deactivation.
  onActivate?: (ctx: PluginContext) => void | Promise<void>;
  onDeactivate?: (ctx: PluginContext) => void | Promise<void>;
}

/**
 * Helper for plugin authors – purely a typing aid, no runtime behaviour.
 *
 * @example
 * ```ts
 * import { definePlugin } from '@openformulare/plugin-sdk';
 *
 * export default definePlugin({
 *   id: 'my-plugin',
 *   hooks: {
 *     'dialog:submitted': async (event, ctx) => {
 *       ctx.log.info('Dialog submitted', { dialogId: event.dialogId });
 *     },
 *   },
 * });
 * ```
 */
export function definePlugin(plugin: PluginModule): PluginModule {
  return plugin;
}
