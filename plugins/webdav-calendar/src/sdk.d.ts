// Standalone copy of the OpenFormulare Plugin SDK type definitions.
//
// This file is intentionally self-contained so that plugin authors only need
// the plugin directory itself (no access to the full OpenFormulare source
// tree) to develop and type-check their plugin.
//
// Keep this in sync with backend/src/plugins/types.ts whenever the public
// plugin API changes. The runtime contract is documented in
// docs/plugin-development.md.

declare module '@openformulare/plugin-sdk' {
  import type { Router } from 'express';

  // -- Generic record shapes the SDK exposes --

  export interface DialogRecord {
    id: string;
    title: string;
    description: string;
    category: string;
    isActive: boolean;
    isSystem: boolean;
    createdAt: string;
    updatedAt: string;
    [k: string]: unknown;
  }

  export interface FormSchema {
    id: string;
    title: string;
    [k: string]: unknown;
  }

  // -- Hook event payloads --

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

  // -- Settings --

  export interface PluginSettingDefinition {
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'password' | 'url' | 'select';
    description?: string;
    required?: boolean;
    default?: string | number | boolean;
    options?: Array<{ value: string; label: string }>;
    pattern?: string;
    min?: number;
    max?: number;
  }

  export interface PluginFieldType {
    id: string;
    label: string;
    description?: string;
    defaultProps?: Record<string, unknown>;
    frontendEntry?: string;
  }

  // -- Logger / context --

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

  export interface PluginContext {
    pluginId: string;
    pluginVersion: string;
    log: PluginLogger;
    settings: PluginSettingsApi;
    core: {
      getDialog(id: string): DialogRecord | null;
      listDialogs(): DialogRecord[];
      getDialogSchema(id: string): FormSchema | null;
    };
  }

  export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    homepage?: string;
    main?: string;
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
    routes?: (router: Router, ctx: PluginContext) => void;
    fieldTypes?: PluginFieldType[];
    onActivate?: (ctx: PluginContext) => void | Promise<void>;
    onDeactivate?: (ctx: PluginContext) => void | Promise<void>;
  }

  export function definePlugin(plugin: PluginModule): PluginModule;
}
