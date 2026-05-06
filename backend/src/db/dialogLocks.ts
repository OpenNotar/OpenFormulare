// In-memory dialog lock store. A lock expires after LOCK_TTL_MS of inactivity.
// Cleared on server restart, which is acceptable (no data loss).

const LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface Lock {
  owner: string;
  acquiredAt: string;
  lastActivityAt: number;
}

const locks = new Map<string, Lock>();

function isExpired(lock: Lock): boolean {
  return Date.now() - lock.lastActivityAt > LOCK_TTL_MS;
}

export interface LockInfo {
  lockedBy: string; // masked token (last 6 chars)
  acquiredAt: string;
}

/** Returns the current lock info if the dialog is locked by someone else. */
export function getLock(dialogId: string, owner: string): LockInfo | null {
  const lock = locks.get(dialogId);
  if (!lock || isExpired(lock)) {
    locks.delete(dialogId);
    return null;
  }
  if (lock.owner === owner) return null;
  return { lockedBy: lock.owner, acquiredAt: lock.acquiredAt };
}

/** Acquires or refreshes the lock. Returns false if locked by someone else. */
export function acquireLock(dialogId: string, owner: string): boolean {
  const existing = locks.get(dialogId);
  if (existing && !isExpired(existing) && existing.owner !== owner) return false;
  locks.set(dialogId, { owner, acquiredAt: new Date().toISOString(), lastActivityAt: Date.now() });
  return true;
}

/** Releases the lock. Only the owner can release it. */
export function releaseLock(dialogId: string, owner: string): void {
  const lock = locks.get(dialogId);
  if (lock && lock.owner === owner) locks.delete(dialogId);
}
