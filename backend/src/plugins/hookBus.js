"use strict";
// Hook bus – fans out events to subscribed plugins.
//
// All hooks run sequentially per plugin (predictable side-effect ordering),
// but plugins themselves run in parallel (Promise.all) so a slow plugin does
// not block the other handlers.
//
// Plugin handler errors are caught and logged: a buggy plugin must not break
// the core. For `dialog:beforeSubmit` plugins MAY mutate `event.submission`
// directly to transform the payload before it is persisted.
Object.defineProperty(exports, "__esModule", { value: true });
exports.emit = emit;
const registry_1 = require("./registry");
async function emit(event, payload) {
    const plugins = registry_1.registry.enabledPlugins();
    if (plugins.length === 0)
        return;
    await Promise.all(plugins.map(async (plugin) => {
        const handler = plugin.module.hooks?.[event];
        if (!handler)
            return;
        try {
            // Cast: the registry's HookHandlerMap stores handlers keyed by event
            // name with concrete payload types, but Map iteration loses that link.
            await handler(payload, plugin.context);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            plugin.errors.push(`${event}: ${message}`);
            plugin.context.log.error(`Hook ${event} failed`, { error: message });
        }
    }));
}
