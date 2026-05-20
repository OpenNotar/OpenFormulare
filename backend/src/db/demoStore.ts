// In-memory dialog store for DEMO_MODE.
//
// Each demo session gets an isolated copy of the current dialogs (loaded
// from the real DB on first access). All mutations (create/update/delete/
// toggle) only affect that session's copy. Sessions are evicted after
// SESSION_TTL_MS of inactivity.
//
// This module deliberately mirrors the public surface of `database.ts` for
// the routes we expose, but never touches the encrypted SQLite store.

import type { DialogRecord, UpsertDialogInput } from './database';
import { listDialogs as listPersistedDialogs } from './database';
import { ensureKontaktStepAtEnd } from './sharedSteps';
import type { FormSchema } from './types/schema';
import { diffSchemas } from '../services/schemaDiff';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface DemoVersion {
  id: number;
  versionNumber: number;
  savedAt: string;
  schema: FormSchema;
}

interface DemoSessionState {
  dialogs: Map<string, DialogRecord>;
  versions: Map<string, DemoVersion[]>;
  versionCounter: number;
  lastSeen: number;
}

const sessions = new Map<string, DemoSessionState>();

function cloneDialog(dialog: DialogRecord): DialogRecord {
  return JSON.parse(JSON.stringify(dialog)) as DialogRecord;
}

function gcSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, state] of sessions) {
    if (state.lastSeen < cutoff) sessions.delete(id);
  }
}

function getOrCreateSession(sessionId: string): DemoSessionState {
  gcSessions();
  let state = sessions.get(sessionId);
  if (!state) {
    state = {
      dialogs: new Map(),
      versions: new Map(),
      versionCounter: 0,
      lastSeen: Date.now(),
    };
    for (const dialog of listPersistedDialogs()) {
      state.dialogs.set(dialog.id, cloneDialog(dialog));
    }
    sessions.set(sessionId, state);
  }
  state.lastSeen = Date.now();
  return state;
}

function normalize(input: UpsertDialogInput, fallbackActive = true): DialogRecord {
  const schema = ensureKontaktStepAtEnd({
    ...input,
    description: input.description ?? '',
    category: input.category ?? 'Allgemein',
    isActive: input.isActive ?? fallbackActive,
  });
  const now = new Date().toISOString();
  return {
    ...schema,
    description: schema.description ?? '',
    category: schema.category ?? 'Allgemein',
    isActive: schema.isActive ?? true,
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  } as DialogRecord;
}

function pushVersion(state: DemoSessionState, dialogId: string, schema: FormSchema) {
  state.versionCounter += 1;
  const list = state.versions.get(dialogId) ?? [];
  const versionNumber = list.length === 0 ? 1 : list[0].versionNumber + 1;
  list.unshift({
    id: state.versionCounter,
    versionNumber,
    savedAt: new Date().toISOString(),
    schema: JSON.parse(JSON.stringify(schema)) as FormSchema,
  });
  // cap at 20, same as the persistent store
  state.versions.set(dialogId, list.slice(0, 20));
}

// ---------------------------------------------------------------------------
// Public API (mirrors database.ts)
// ---------------------------------------------------------------------------

export function listDialogs(sessionId: string): DialogRecord[] {
  const state = getOrCreateSession(sessionId);
  return Array.from(state.dialogs.values())
    .map(cloneDialog)
    .sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));
}

export function getDialog(sessionId: string, id: string): DialogRecord | null {
  const state = getOrCreateSession(sessionId);
  const found = state.dialogs.get(id);
  return found ? cloneDialog(found) : null;
}

export function createDialog(sessionId: string, input: UpsertDialogInput): DialogRecord {
  const state = getOrCreateSession(sessionId);
  if (state.dialogs.has(input.id)) {
    throw new Error('Dialog mit dieser ID existiert bereits');
  }
  const dialog = normalize(input);
  state.dialogs.set(dialog.id, dialog);
  return cloneDialog(dialog);
}

export function updateDialog(
  sessionId: string,
  currentId: string,
  input: UpsertDialogInput,
): DialogRecord | null {
  const state = getOrCreateSession(sessionId);
  const existing = state.dialogs.get(currentId);
  if (!existing) return null;

  pushVersion(state, currentId, existing);

  const dialog = normalize(
    { ...input, isActive: input.isActive ?? existing.isActive },
    existing.isActive,
  );
  dialog.createdAt = existing.createdAt;
  dialog.isSystem = existing.isSystem;

  if (dialog.id !== currentId) state.dialogs.delete(currentId);
  state.dialogs.set(dialog.id, dialog);
  return cloneDialog(dialog);
}

export function deleteDialog(sessionId: string, id: string): boolean {
  const state = getOrCreateSession(sessionId);
  state.versions.delete(id);
  return state.dialogs.delete(id);
}

export function toggleDialogActive(sessionId: string, id: string): DialogRecord | null {
  const state = getOrCreateSession(sessionId);
  const existing = state.dialogs.get(id);
  if (!existing) return null;
  existing.isActive = !existing.isActive;
  existing.updatedAt = new Date().toISOString();
  return cloneDialog(existing);
}

export function toggleDialogUnlisted(sessionId: string, id: string): DialogRecord | null {
  const state = getOrCreateSession(sessionId);
  const existing = state.dialogs.get(id);
  if (!existing) return null;
  existing.unlisted = !existing.unlisted;
  existing.updatedAt = new Date().toISOString();
  return cloneDialog(existing);
}

export interface DemoVersionWithChanges {
  id: number;
  dialogId: string;
  versionNumber: number;
  savedAt: string;
  changes: string[];
}

export function listDialogVersionsWithDiff(
  sessionId: string,
  dialogId: string,
): DemoVersionWithChanges[] {
  const state = getOrCreateSession(sessionId);
  const list = state.versions.get(dialogId) ?? [];
  if (list.length === 0) return [];

  const current = state.dialogs.get(dialogId);
  return list.map((version, index) => {
    const after = index === 0 ? current : list[index - 1].schema;
    return {
      id: version.id,
      dialogId,
      versionNumber: version.versionNumber,
      savedAt: version.savedAt,
      changes: after ? diffSchemas(version.schema, after) : [],
    };
  });
}

export function getDialogVersion(
  sessionId: string,
  dialogId: string,
  versionId: number,
): { id: number; dialogId: string; versionNumber: number; savedAt: string; schema: FormSchema } | null {
  const state = getOrCreateSession(sessionId);
  const list = state.versions.get(dialogId) ?? [];
  const version = list.find((v) => v.id === versionId);
  if (!version) return null;
  return {
    id: version.id,
    dialogId,
    versionNumber: version.versionNumber,
    savedAt: version.savedAt,
    schema: JSON.parse(JSON.stringify(version.schema)) as FormSchema,
  };
}
