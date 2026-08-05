// Benutzerverwaltung — nur für die Rolle `admin`.
//
// Zwei Sicherungen ziehen hier durchgängig:
//   1. Es muss immer mindestens ein AKTIVER Admin übrig bleiben. Sonst könnte
//      sich eine Instanz durch Löschen, Deaktivieren oder Degradieren des
//      letzten Admins dauerhaft aussperren.
//   2. Man kann die eigene Rolle nicht herabsetzen und sich nicht selbst
//      löschen oder deaktivieren — das ist der häufigste Weg in Variante 1.

import { Router } from 'express';
import { z } from 'zod';
import { requireAdminAuth, requireAdminRole } from '../auth/adminAuth';
import {
  ADMIN_ROLES,
  countActiveAdmins,
  createAdminUser,
  deleteAdminUser,
  getAdminUserById,
  listAdminUsers,
  updateAdminUser,
  validatePassword,
  validateUsername,
  type AdminRole,
} from '../db/adminUsers';
import { isDemoMode } from '../services/runtimeMode';

const router = Router();
router.use(requireAdminAuth, requireAdminRole);

function demoBlocked(res: import('express').Response): boolean {
  if (isDemoMode()) {
    res.status(400).json({ error: 'Im Demo-Modus nicht verfügbar.' });
    return true;
  }
  return false;
}

router.get('/', (_req, res) => {
  res.json({ users: listAdminUsers(), roles: ADMIN_ROLES });
});

const createSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  role: z.enum(['admin', 'moderator']),
  isActive: z.boolean().optional(),
});

router.post('/', (req, res) => {
  if (demoBlocked(res)) return;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Benutzername, Passwort und Rolle sind erforderlich.' });
    return;
  }

  const nameProblem = validateUsername(parsed.data.username);
  if (nameProblem) {
    res.status(400).json({ error: nameProblem });
    return;
  }
  const pwProblem = validatePassword(parsed.data.password);
  if (pwProblem) {
    res.status(400).json({ error: pwProblem });
    return;
  }

  const taken = listAdminUsers().some(
    (u) => u.username.toLowerCase() === parsed.data.username.trim().toLowerCase(),
  );
  if (taken) {
    res.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
    return;
  }

  const user = createAdminUser({
    username: parsed.data.username,
    password: parsed.data.password,
    role: parsed.data.role as AdminRole,
    isActive: parsed.data.isActive,
  });
  res.status(201).json(user);
});

const updateSchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  role: z.enum(['admin', 'moderator']).optional(),
  isActive: z.boolean().optional(),
});

router.put('/:id', (req, res) => {
  if (demoBlocked(res)) return;

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ungültige Eingabe' });
    return;
  }

  const target = getAdminUserById(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    return;
  }

  const isSelf = target.id === req.adminUserId;
  const { username, password, role, isActive } = parsed.data;

  if (isSelf && role !== undefined && role !== target.role) {
    res.status(400).json({ error: 'Die eigene Rolle kann nicht geändert werden.' });
    return;
  }
  if (isSelf && isActive === false) {
    res.status(400).json({ error: 'Das eigene Konto kann nicht deaktiviert werden.' });
    return;
  }

  // Letzten aktiven Admin schützen — sowohl gegen Degradieren als auch gegen
  // Deaktivieren.
  const losesAdmin =
    target.role === 'admin' &&
    target.isActive &&
    ((role !== undefined && role !== 'admin') || isActive === false);
  if (losesAdmin && countActiveAdmins() <= 1) {
    res.status(400).json({
      error: 'Es muss mindestens ein aktiver Administrator bestehen bleiben.',
    });
    return;
  }

  if (username !== undefined) {
    const nameProblem = validateUsername(username);
    if (nameProblem) {
      res.status(400).json({ error: nameProblem });
      return;
    }
    const taken = listAdminUsers().some(
      (u) => u.id !== target.id && u.username.toLowerCase() === username.trim().toLowerCase(),
    );
    if (taken) {
      res.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
      return;
    }
  }

  if (password !== undefined) {
    const pwProblem = validatePassword(password);
    if (pwProblem) {
      res.status(400).json({ error: pwProblem });
      return;
    }
  }

  const updated = updateAdminUser(target.id, { username, password, role, isActive });
  if (!updated) {
    res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    return;
  }
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (demoBlocked(res)) return;

  const target = getAdminUserById(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    return;
  }
  if (target.id === req.adminUserId) {
    res.status(400).json({ error: 'Das eigene Konto kann nicht gelöscht werden.' });
    return;
  }
  if (target.role === 'admin' && target.isActive && countActiveAdmins() <= 1) {
    res.status(400).json({
      error: 'Es muss mindestens ein aktiver Administrator bestehen bleiben.',
    });
    return;
  }

  deleteAdminUser(target.id);
  res.json({ success: true });
});

export default router;
