// Frontend mirror of the backend runtime mode (demo / dino / email).
//
// The flags are fetched from /health on app start. The demo session id is
// generated lazily when demo mode is detected and persisted in localStorage
// so the same browser keeps editing the same in-memory copy across reloads.

const apiUrl = import.meta.env.VITE_API_URL ?? '';
const SESSION_KEY = 'notar-demo-session-id';

export interface RuntimeMode {
  demoMode: boolean;
  dinoEnabled: boolean;
  emailEnabled: boolean;
}

let cached: RuntimeMode | null = null;
let inflight: Promise<RuntimeMode> | null = null;

export function getCachedRuntimeMode(): RuntimeMode | null {
  return cached;
}

export async function loadRuntimeMode(): Promise<RuntimeMode> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(`${apiUrl}/health`);
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
      const payload = (await res.json()) as Partial<RuntimeMode>;
      cached = {
        demoMode: payload.demoMode === true,
        dinoEnabled: payload.dinoEnabled === true,
        emailEnabled: payload.emailEnabled === true,
      };
      return cached;
    } catch {
      cached = { demoMode: false, dinoEnabled: false, emailEnabled: true };
      return cached;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function getDemoSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `demo-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function clearDemoSessionId() {
  localStorage.removeItem(SESSION_KEY);
}

// Returns headers to attach to API calls when demo mode is active. Safe to
// call before the runtime mode has loaded — it just returns an empty object.
export function getDemoHeaders(): Record<string, string> {
  if (!cached?.demoMode) return {};
  return { 'X-Demo-Session-Id': getDemoSessionId() };
}
