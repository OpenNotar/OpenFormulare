// Public re-exports for the plugin SDK. Plugin authors import from
// `@openformulare/plugin-sdk` (mapped to this file once a standalone npm
// package is published).

export { definePlugin } from './types';
export type {
  AppointmentRequestedEvent,
  DataExportedEvent,
  DataImportedEvent,
  DialogBeforeSubmitEvent,
  DialogSubmittedEvent,
  HookHandler,
  HookHandlerMap,
  PluginContext,
  PluginEventMap,
  PluginEventName,
  PluginFieldType,
  PluginLogger,
  PluginManifest,
  PluginModule,
  PluginSettingDefinition,
  PluginSettingsApi,
  RatingCreatedEvent,
} from './types';

export { emit as emitPluginEvent } from './hookBus';
export { registry as pluginRegistry } from './registry';
export {
  activatePlugin,
  deactivatePlugin,
  loadPlugins,
} from './loader';
