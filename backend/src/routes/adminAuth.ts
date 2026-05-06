import { Router } from 'express';
import { z } from 'zod';
import {
  createAdminToken,
  getAdminPassword,
  getAdminUsername,
  requireAdminAuth,
} from '../auth/adminAuth';
import { isDemoMode } from '../services/runtimeMode';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post('/login', (req, res) => {
  if (isDemoMode()) {
    res.json({ token: 'demo', username: 'demo', demo: true });
    return;
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ungültige Login-Daten' });
    return;
  }

  const { username, password } = parsed.data;
  if (username !== getAdminUsername() || password !== getAdminPassword()) {
    res.status(401).json({ error: 'Benutzername oder Passwort ist falsch' });
    return;
  }

  res.json({
    token: createAdminToken(),
    username: getAdminUsername(),
  });
});

router.get('/me', requireAdminAuth, (req, res) => {
  res.json({ username: req.adminUser });
});

export default router;
