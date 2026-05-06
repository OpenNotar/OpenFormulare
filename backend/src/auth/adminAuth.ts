import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { isDemoMode } from '../services/runtimeMode';

interface AdminTokenPayload {
  username: string;
  exp: number;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} nicht konfiguriert`);
  }

  return value;
}

export function getAdminUsername() {
  return requiredEnv('ADMIN_USERNAME');
}

export function getAdminPassword() {
  return requiredEnv('ADMIN_PASSWORD');
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

export function createAdminToken() {
  const payload: AdminTokenPayload = {
    username: getAdminUsername(),
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

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as AdminTokenPayload;

    if (payload.username !== getAdminUsername() || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  if (isDemoMode()) {
    // In demo mode every visitor is treated as their own isolated admin.
    // The demo session id (set by the demoSession middleware) doubles as
    // their identity so dialog locks remain per-session.
    req.adminUser = req.demoSessionId ? `demo:${req.demoSessionId}` : 'demo';
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
  next();
}
