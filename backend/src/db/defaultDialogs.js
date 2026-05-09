"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultDialogs = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
// NOTE: do NOT call `ensureKontaktStepAtEnd` here. That function reads from
// the settings table and would create a circular import (database.ts →
// defaultDialogs.ts → sharedSteps.ts → settings.ts → database.ts). The
// kontakt step is injected dynamically by `rowToDialog` in database.ts on
// every read, so seeding without it produces the same observable result.
const seedsDir = (0, path_1.join)(__dirname, 'seeds');
function loadJsonArray(file) {
    const raw = JSON.parse((0, fs_1.readFileSync)(file, 'utf-8'));
    return Array.isArray(raw) ? raw : [raw];
}
function loadDialogsFromDir(dir) {
    let entries = [];
    try {
        entries = (0, fs_1.readdirSync)(dir);
    }
    catch {
        return [];
    }
    const result = [];
    for (const entry of entries) {
        if (!entry.endsWith('.json'))
            continue;
        const full = (0, path_1.join)(dir, entry);
        if (!(0, fs_1.statSync)(full).isFile())
            continue;
        result.push(...loadJsonArray(full));
    }
    return result;
}
// 1. The legacy bundle (default-dialogs.json) for the bulk of dialogs.
// 2. Per-dialog files under seeds/dialogs/* for larger / more frequently
//    edited dialogs that benefit from being kept in their own file.
//    Files in this folder may contain a single dialog object or an array.
const bundled = loadJsonArray((0, path_1.join)(seedsDir, 'default-dialogs.json'));
const perDialog = loadDialogsFromDir((0, path_1.join)(seedsDir, 'dialogs'));
// Per-dialog files take precedence over identical IDs from the bundle, so an
// extracted dialog can be edited without touching the legacy bundle.
const merged = new Map();
for (const schema of [...bundled, ...perDialog]) {
    merged.set(schema.id, schema);
}
exports.defaultDialogs = Array.from(merged.values()).map((schema) => ({
    ...schema,
    isActive: true,
    isSystem: true,
}));
