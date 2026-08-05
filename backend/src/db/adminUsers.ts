// Benutzerverwaltung für den Admin-Bereich.
//
// Der Login läuft ausschliesslich über diese Tabelle. ADMIN_USERNAME /
// ADMIN_PASSWORD aus der .env sind nur noch der Startwert: existiert beim
// Start kein einziger Benutzer, wird daraus genau einer angelegt
// (`ensureInitialAdminUser`). Danach werden die .env-Werte ignoriert — der
// Kunde kann Benutzername und Passwort frei ändern, ohne dass ein zweites,
// unsichtbares Konto bestehen bleibt.
//
// Passwort-Vergessen wird nicht über die .env gelöst, sondern über das CLI
// `npm run admin:reset` (siehe src/cli/adminReset.ts).

import crypto from 'crypto';
import { getDatabase } from './database';

export type AdminRole = 'admin' | 'moderator';

export const ADMIN_ROLES: readonly AdminRole[] = ['admin', 'moderator'];

export interface AdminUserRecord {
  id: string;
  username: string;
  role: AdminRole;
  isActive: boolean;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
  role: AdminRole;
  is_active: number;
  token_version: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

function rowToRecord(row: AdminUserRow): AdminUserRecord {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    isActive: row.is_active === 1,
    tokenVersion: row.token_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

// ---------------------------------------------------------------------------
// Passwort-Hashing (scrypt aus der Node-Standardbibliothek — keine zusätzliche
// Abhängigkeit nötig). Format: scrypt$N$r$p$<salt-hex>$<hash-hex>
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p,
  });
  return [
    'scrypt', SCRYPT_N, SCRYPT_r, SCRYPT_p,
    salt.toString('hex'), hash.toString('hex'),
  ].join('$');
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'hex');
    expected = Buffer.from(parts[5], 'hex');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = crypto.scryptSync(password, salt, expected.length, { N, r, p });
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * Mindestanforderung an ein Passwort. Absichtlich schlicht gehalten
 * (Länge statt Zeichenklassen-Zwang) — erzwungene Sonderzeichen führen in der
 * Praxis zu notierten Passwörtern, nicht zu besseren.
 */
export const MIN_PASSWORD_LENGTH = 10;

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`;
  }
  return null;
}

export function validateUsername(username: string): string | null {
  const name = username.trim();
  if (name.length < 3) return 'Der Benutzername muss mindestens 3 Zeichen lang sein.';
  if (name.length > 64) return 'Der Benutzername darf höchstens 64 Zeichen lang sein.';
  if (!/^[A-Za-z0-9._@-]+$/.test(name)) {
    return 'Erlaubt sind Buchstaben, Zahlen sowie . _ @ und -';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export function listAdminUsers(): AdminUserRecord[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM admin_users ORDER BY username COLLATE NOCASE ASC')
    .all() as AdminUserRow[];
  return rows.map(rowToRecord);
}

export function getAdminUserById(id: string): AdminUserRecord | null {
  const row = getDatabase()
    .prepare('SELECT * FROM admin_users WHERE id = ?')
    .get(id) as AdminUserRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function countAdminUsers(): number {
  const row = getDatabase()
    .prepare('SELECT COUNT(*) AS c FROM admin_users')
    .get() as { c: number };
  return row.c;
}

/** Anzahl der AKTIVEN Benutzer mit Rolle `admin`. Schützt davor, dass sich
 *  die Instanz durch Löschen/Degradieren des letzten Admins aussperrt. */
export function countActiveAdmins(): number {
  const row = getDatabase()
    .prepare("SELECT COUNT(*) AS c FROM admin_users WHERE role = 'admin' AND is_active = 1")
    .get() as { c: number };
  return row.c;
}

// ---------------------------------------------------------------------------
// Authentifizierung
// ---------------------------------------------------------------------------

/**
 * Prüft Benutzername + Passwort. Gibt den Benutzer zurück oder null.
 * Deaktivierte Benutzer können sich nicht anmelden.
 */
export function authenticate(username: string, password: string): AdminUserRecord | null {
  const row = getDatabase()
    .prepare('SELECT * FROM admin_users WHERE username = ? COLLATE NOCASE')
    .get(username.trim()) as AdminUserRow | undefined;

  if (!row) {
    // Dummy-Verifikation, damit ein unbekannter Benutzername zeitlich nicht
    // von einem falschen Passwort zu unterscheiden ist.
    verifyPassword(password, hashPassword('dummy'));
    return null;
  }
  if (!verifyPassword(password, row.password_hash)) return null;
  if (row.is_active !== 1) return null;

  getDatabase()
    .prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?')
    .run(new Date().toISOString(), row.id);

  return rowToRecord(row);
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

export function createAdminUser(input: {
  username: string;
  password: string;
  role: AdminRole;
  isActive?: boolean;
}): AdminUserRecord {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  getDatabase()
    .prepare(`
      INSERT INTO admin_users
        (id, username, password_hash, role, is_active, token_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `)
    .run(
      id,
      input.username.trim(),
      hashPassword(input.password),
      input.role,
      input.isActive === false ? 0 : 1,
      now,
      now,
    );
  return getAdminUserById(id)!;
}

/**
 * Aktualisiert einen Benutzer. Jede sicherheitsrelevante Änderung
 * (Passwort, Rolle, Deaktivierung, Umbenennung) erhöht `token_version` und
 * macht damit bestehende Sessions dieses Benutzers ungültig.
 */
export function updateAdminUser(
  id: string,
  changes: { username?: string; password?: string; role?: AdminRole; isActive?: boolean },
): AdminUserRecord | null {
  const current = getAdminUserById(id);
  if (!current) return null;

  const sets: string[] = [];
  const values: unknown[] = [];
  let bumpToken = false;

  if (changes.username !== undefined && changes.username.trim() !== current.username) {
    sets.push('username = ?');
    values.push(changes.username.trim());
    bumpToken = true;
  }
  if (changes.password !== undefined) {
    sets.push('password_hash = ?');
    values.push(hashPassword(changes.password));
    bumpToken = true;
  }
  if (changes.role !== undefined && changes.role !== current.role) {
    sets.push('role = ?');
    values.push(changes.role);
    bumpToken = true;
  }
  if (changes.isActive !== undefined && changes.isActive !== current.isActive) {
    sets.push('is_active = ?');
    values.push(changes.isActive ? 1 : 0);
    bumpToken = true;
  }

  if (sets.length === 0) return current;

  if (bumpToken) sets.push('token_version = token_version + 1');
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  getDatabase()
    .prepare(`UPDATE admin_users SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);

  return getAdminUserById(id);
}

export function deleteAdminUser(id: string): boolean {
  const result = getDatabase().prepare('DELETE FROM admin_users WHERE id = ?').run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Initialer Benutzer
// ---------------------------------------------------------------------------

/**
 * Legt beim ersten Start den initialen Admin aus ADMIN_USERNAME /
 * ADMIN_PASSWORD an. Läuft NUR, wenn die Tabelle leer ist — ein bereits
 * umbenannter oder mit neuem Passwort versehener Benutzer wird also nie
 * wieder von der .env überschrieben.
 */
export function ensureInitialAdminUser(): AdminUserRecord | null {
  if (countAdminUsers() > 0) return null;

  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn(
      '[auth] Keine Benutzer vorhanden und ADMIN_USERNAME/ADMIN_PASSWORD nicht gesetzt — ' +
        'es kann sich niemand anmelden. Benutzer anlegen mit: npm run admin:reset -- --username <name> --password <passwort>',
    );
    return null;
  }

  const user = createAdminUser({ username, password, role: 'admin' });
  console.log(
    `[auth] Initialer Admin-Benutzer "${user.username}" aus der .env angelegt. ` +
      'Benutzername und Passwort können im Admin-Bereich unter „Benutzer" geändert werden; ' +
      'die .env-Werte werden ab jetzt ignoriert.',
  );
  return user;
}
