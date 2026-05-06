import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { FormSchema } from './types/schema';

// NOTE: do NOT call `ensureKontaktStepAtEnd` here. That function reads from
// the settings table and would create a circular import (database.ts →
// defaultDialogs.ts → sharedSteps.ts → settings.ts → database.ts). The
// kontakt step is injected dynamically by `rowToDialog` in database.ts on
// every read, so seeding without it produces the same observable result.

const seedsDir = join(__dirname, 'seeds');

function loadJsonArray(file: string): FormSchema[] {
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as unknown;
  return Array.isArray(raw) ? (raw as FormSchema[]) : [raw as FormSchema];
}

function loadDialogsFromDir(dir: string): FormSchema[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const result: FormSchema[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const full = join(dir, entry);
    if (!statSync(full).isFile()) continue;
    result.push(...loadJsonArray(full));
  }
  return result;
}

// 1. The legacy bundle (default-dialogs.json) for the bulk of dialogs.
// 2. Per-dialog files under seeds/dialogs/* for larger / more frequently
//    edited dialogs that benefit from being kept in their own file.
//    Files in this folder may contain a single dialog object or an array.
const bundled = loadJsonArray(join(seedsDir, 'default-dialogs.json'));
const perDialog = loadDialogsFromDir(join(seedsDir, 'dialogs'));

// Per-dialog files take precedence over identical IDs from the bundle, so an
// extracted dialog can be edited without touching the legacy bundle.
const merged = new Map<string, FormSchema>();
for (const schema of [...bundled, ...perDialog]) {
  merged.set(schema.id, schema);
}

export const defaultDialogs: FormSchema[] = Array.from(merged.values()).map((schema) => ({
  ...schema,
  isActive: true,
  isSystem: true,
}));
