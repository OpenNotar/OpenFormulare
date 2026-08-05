import { Router } from 'express';
import { z } from 'zod';
import { createAdminToken, requireAdminAuth } from '../auth/adminAuth';
import {
  authenticate,
  getAdminUserById,
  updateAdminUser,
  validatePassword,
  verifyPassword,
} from '../db/adminUsers';
import { getDatabase } from '../db/database';
import { isDemoMode } from '../services/runtimeMode';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post('/login', (req, res) => {
  if (isDemoMode()) {
    res.json({ token: 'demo', username: 'demo', role: 'admin', demo: true });
    return;
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ungültige Login-Daten' });
    return;
  }

  const { username, password } = parsed.data;
  const user = authenticate(username, password);
  if (!user) {
    res.status(401).json({ error: 'Benutzername oder Passwort ist falsch' });
    return;
  }

  res.json({
    token: createAdminToken(user),
    username: user.username,
    role: user.role,
  });
});

router.get('/me', requireAdminAuth, (req, res) => {
  res.json({ username: req.adminUser, role: req.adminRole ?? 'admin' });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

// Eigenes Passwort ändern — für jede Rolle erlaubt, aber nur für das eigene
// Konto und nur mit dem aktuellen Passwort als Nachweis.
router.post('/password', requireAdminAuth, (req, res) => {
  if (isDemoMode()) {
    res.status(400).json({ error: 'Im Demo-Modus nicht verfügbar.' });
    return;
  }

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Aktuelles und neues Passwort sind erforderlich.' });
    return;
  }

  const userId = req.adminUserId;
  const user = userId ? getAdminUserById(userId) : null;
  if (!user) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return;
  }

  const row = getDatabase()
    .prepare('SELECT password_hash FROM admin_users WHERE id = ?')
    .get(user.id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(parsed.data.currentPassword, row.password_hash)) {
    // Bewusst 400, nicht 401: die Sitzung ist gültig, nur die Eingabe im
    // Formular ist falsch. Ein 401 würde vom Client als abgelaufene Sitzung
    // gedeutet und den Benutzer wegen eines Tippfehlers abmelden.
    res.status(400).json({ error: 'Das aktuelle Passwort ist falsch.' });
    return;
  }

  const problem = validatePassword(parsed.data.newPassword);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }

  const updated = updateAdminUser(user.id, { password: parsed.data.newPassword });
  if (!updated) {
    res.status(500).json({ error: 'Passwort konnte nicht geändert werden.' });
    return;
  }

  // Der Passwortwechsel erhöht die token_version — das alte Token ist ab
  // jetzt ungültig, daher direkt ein frisches mitgeben.
  res.json({ token: createAdminToken(updated), username: updated.username, role: updated.role });
});

export default router;
