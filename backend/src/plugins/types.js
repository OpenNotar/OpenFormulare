"use strict";
// Public plugin SDK types.
//
// This file is the contract between the OpenFormulare core and any plugin.
// External plugin authors only need to depend on the symbols exported here
// (re-exported via `backend/src/plugins/index.ts` → `@openformulare/plugin-sdk`
// once we publish a standalone SDK package).
Object.defineProperty(exports, "__esModule", { value: true });
exports.definePlugin = definePlugin;
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
function definePlugin(plugin) {
    return plugin;
}
