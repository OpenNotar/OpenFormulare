import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { isDemoMode } from '../services/runtimeMode';
import { getAdminUserById, type AdminRole, type AdminUserRecord } from '../db/adminUsers';

interface AdminTokenPayload {
  /** Benutzer-ID aus `admin_users`. */
  uid: string;
  username: string;
  role: AdminRole;
  /** `token_version` des Benutzers zum Ausstellungszeitpunkt. Stimmt sie nicht
   *  mehr mit der DB überein (Passwort-/Rollenwechsel, Umbenennung,
   *  Deaktivierung), gilt das Token als ungültig. */
  tv: number;
  exp: number;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} nicht konfiguriert`);
  }

  return value;
}

function getSessionSecret() {
  return requiredEnv('ADMIN_SESSION_SECRET');
}

function signPayload(payload: string) {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('hex');
}

export function createAdminToken(user: AdminUserRecord) {
  const payload: AdminTokenPayload = {
    uid: user.id,
    username: user.username,
    role: user.role,
    tv: user.tokenVersion,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (actualBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  let payload: AdminTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as AdminTokenPayload;
  } catch {
    return null;
  }

  if (!payload?.uid || typeof payload.exp !== 'number' || payload.exp < Date.now()) {
    return null;
  }

  // Gegen die DB prüfen: gelöschte, deaktivierte oder inzwischen geänderte
  // Benutzer dürfen mit einem alten Token nicht weiterarbeiten.
  const user = getAdminUserById(payload.uid);
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
    return null;
  }

  // Name und Rolle immer aus der DB nehmen — das Token ist nur der Nachweis.
  return { ...payload, username: user.username, role: user.role };
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  if (isDemoMode()) {
    // In demo mode every visitor is treated as their own isolated admin.
    // The demo session id (set by the demoSession middleware) doubles as
    // their identity so dialog locks remain per-session.
    req.adminUser = req.demoSessionId ? `demo:${req.demoSessionId}` : 'demo';
    req.adminRole = 'admin';
    next();
    return;
  }

  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return;
  }

  const token = authorization.slice('Bearer '.length);
  const payload = verifyAdminToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Ungültige oder abgelaufene Anmeldung' });
    return;
  }

  req.adminUser = payload.username;
  req.adminUserId = payload.uid;
  req.adminRole = payload.role;
  next();
}

/**
 * Beschränkt eine Route auf die Rolle `admin`. Muss NACH `requireAdminAuth`
 * eingehängt werden.
 *
 * Rollen:
 *   admin     - alles, inkl. Einstellungen, Plugins, Benutzerverwaltung
 *   moderator - Dialoge und Übersetzungen
 */
export function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  if (req.adminRole !== 'admin') {
    res.status(403).json({
      error: 'Dafür fehlen die Rechte — dieser Bereich ist Administratoren vorbehalten.',
    });
    return;
  }
  next();
}
