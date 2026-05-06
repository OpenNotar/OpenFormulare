import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { isDemoMode } from '../services/runtimeMode';

const HEADER = 'x-demo-session-id';
const RESPONSE_HEADER = 'X-Demo-Session-Id';

function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{8,128}$/.test(value);
}

// Reads (or generates) a demo session id and attaches it to the request.
// Outside of demo mode this middleware is a no-op.
export function demoSession(req: Request, res: Response, next: NextFunction) {
  if (!isDemoMode()) {
    next();
    return;
  }

  const provided = req.headers[HEADER];
  const sessionId = isValidSessionId(provided) ? provided : crypto.randomUUID();

  req.demoSessionId = sessionId;
  res.setHeader(RESPONSE_HEADER, sessionId);
  res.setHeader('Access-Control-Expose-Headers', RESPONSE_HEADER);
  next();
}

// Use as a guard on routes that require a demo session id (e.g. all
// dialog mutations in demo mode). Always succeeds when demo mode is off.
export function requireDemoSession(req: Request, res: Response, next: NextFunction) {
  if (!isDemoMode()) {
    next();
    return;
  }
  if (!req.demoSessionId) {
    res.status(400).json({ error: 'Demo-Session konnte nicht ermittelt werden.' });
    return;
  }
  next();
}
