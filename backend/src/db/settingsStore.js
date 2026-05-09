"use strict";
// In-memory per-session overrides for global settings, used when DEMO_MODE
// is active. Demo visitors can edit any admin setting without touching the
// real (encrypted) database — their changes live only inside their session
// state and are dropped after SESSION_TTL_MS of inactivity.
//
// Outside demo mode this module is unused.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDemoSetting = getDemoSetting;
exports.setDemoSetting = setDemoSetting;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const sessions = new Map();
function gcSessions() {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, state] of sessions) {
        if (state.lastSeen < cutoff)
            sessions.delete(id);
    }
}
function getOrCreate(sessionId) {
    gcSessions();
    let state = sessions.get(sessionId);
    if (!state) {
        state = { values: new Map(), lastSeen: Date.now() };
        sessions.set(sessionId, state);
    }
    state.lastSeen = Date.now();
    return state;
}
function getDemoSetting(sessionId, key) {
    const state = sessions.get(sessionId);
    if (!state)
        return undefined;
    state.lastSeen = Date.now();
    if (!state.values.has(key))
        return undefined;
    return state.values.get(key);
}
function setDemoSetting(sessionId, key, value) {
    const state = getOrCreate(sessionId);
    // Clone via JSON to detach from caller references.
    state.values.set(key, JSON.parse(JSON.stringify(value)));
}
