"use strict";
// Public re-exports for the plugin SDK. Plugin authors import from
// `@openformulare/plugin-sdk` (mapped to this file once a standalone npm
// package is published).
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPlugins = exports.deactivatePlugin = exports.activatePlugin = exports.pluginRegistry = exports.emitPluginEvent = exports.definePlugin = void 0;
var types_1 = require("./types");
Object.defineProperty(exports, "definePlugin", { enumerable: true, get: function () { return types_1.definePlugin; } });
var hookBus_1 = require("./hookBus");
Object.defineProperty(exports, "emitPluginEvent", { enumerable: true, get: function () { return hookBus_1.emit; } });
var registry_1 = require("./registry");
Object.defineProperty(exports, "pluginRegistry", { enumerable: true, get: function () { return registry_1.registry; } });
var loader_1 = require("./loader");
Object.defineProperty(exports, "activatePlugin", { enumerable: true, get: function () { return loader_1.activatePlugin; } });
Object.defineProperty(exports, "deactivatePlugin", { enumerable: true, get: function () { return loader_1.deactivatePlugin; } });
Object.defineProperty(exports, "loadPlugins", { enumerable: true, get: function () { return loader_1.loadPlugins; } });
