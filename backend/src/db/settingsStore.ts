// In-memory per-session overrides for global settings, used when DEMO_MODE
// is active. Demo visitors can edit any admin setting without touching the
// real (encrypted) database — their changes live only inside their session
// state and are dropped after SESSION_TTL_MS of inactivity.
//
// Outside demo mode this module is unused.

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface SessionState {
  values: Map<string, unknown>;
  lastSeen: number;
}

const sessions = new Map<string, SessionState>();

function gcSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, state] of sessions) {
    if (state.lastSeen < cutoff) sessions.delete(id);
  }
}

function getOrCreate(sessionId: string): SessionState {
  gcSessions();
  let state = sessions.get(sessionId);
  if (!state) {
    state = { values: new Map(), lastSeen: Date.now() };
    sessions.set(sessionId, state);
  }
  state.lastSeen = Date.now();
  return state;
}

export function getDemoSetting<T>(sessionId: string, key: string): T | undefined {
  const state = sessions.get(sessionId);
  if (!state) return undefined;
  state.lastSeen = Date.now();
  if (!state.values.has(key)) return undefined;
  return state.values.get(key) as T;
}

export function setDemoSetting<T>(sessionId: string, key: string, value: T): void {
  const state = getOrCreate(sessionId);
  // Clone via JSON to detach from caller references.
  state.values.set(key, JSON.parse(JSON.stringify(value)) as T);
}
