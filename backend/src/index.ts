import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import adminAuthRouter from './routes/adminAuth';
import adminDialogsRouter from './routes/adminDialogs';
import { getDatabase } from './db/database';
import dialogsRouter from './routes/dialogs';
import submitRouter from './routes/submit';
import dinoRouter from './routes/dino';
import { adminRouter as settingsAdminRouter, publicRouter as settingsPublicRouter } from './routes/settings';
import { demoSession } from './middleware/demoSession';
import { isDemoMode, isDinoEnabled, isEmailEnabled } from './services/runtimeMode';

const app = express();
const port = parseInt(process.env.PORT || '3001', 10);

getDatabase();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['POST', 'GET', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Demo-Session-Id', 'X-Api-Key'],
  exposedHeaders: ['X-Demo-Session-Id'],
}));

app.use(express.json());
app.use(demoSession);

app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin/dialogs', adminDialogsRouter);
app.use('/api/admin/settings', settingsAdminRouter);
app.use('/api/dialogs', dialogsRouter);
app.use('/api/settings', settingsPublicRouter);
app.use('/api/submit', submitRouter);
app.use('/api/dino', dinoRouter);

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    demoMode: isDemoMode(),
    dinoEnabled: isDinoEnabled(req.demoSessionId),
    emailEnabled: isEmailEnabled(req.demoSessionId),
  });
});

// Serve the built frontend bundle when present. Used by the single-container
// Docker image; in dev the frontend runs separately via Vite.
const frontendDist = process.env.FRONTEND_DIST_DIR
  || path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist, { index: 'index.html', maxAge: '1h' }));
  // SPA fallback: every non-API GET falls through to index.html so client-side
  // routing (React Router) works on hard reload.
  app.get(/^\/(?!api\/|health\b|assets\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  console.log(`[server] Serving frontend from ${frontendDist}`);
} else {
  console.log(`[server] Frontend bundle not found at ${frontendDist} — running API-only`);
}

app.listen(port, () => {
  console.log(
    `Backend running on http://localhost:${port} ` +
      `[demo=${isDemoMode()} dino=${isDinoEnabled()} email=${isEmailEnabled()}]`,
  );
});
