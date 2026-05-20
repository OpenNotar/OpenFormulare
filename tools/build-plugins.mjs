#!/usr/bin/env node
// Installiert + baut alle Plugin-Unterordner unter `plugins/`.
//
// Aufrufpfade:
//   - automatisch nach `npm install` im Repo-Root (postinstall-Hook)
//   - manuell via `npm run build:plugins`
//
// Verhalten:
//   - Überspringt Ordner ohne `package.json`
//   - Überspringt Ordner, in denen `dist/index.js` **neuer** ist als der
//     `src/`-Inhalt (Inkrement-Build), damit wiederholte `npm install`-Läufe
//     nicht unnötig kompilieren
//   - Setzt Exit-Code != 0 nur, wenn ein Plugin ALS ZIEL ausgewählt war und
//     beim Bauen gescheitert ist
//
// Opt-out: ENV `OPENFORMULARE_SKIP_PLUGIN_BUILD=1` überspringt alles. Im
// Docker-Image setzen wir das, weil der Multi-Stage-Build die Plugins
// ohnehin im Build-Layer baut.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.env.OPENFORMULARE_SKIP_PLUGIN_BUILD === '1') {
  console.log('[plugins] OPENFORMULARE_SKIP_PLUGIN_BUILD=1 – überspringe Plugin-Build.');
  process.exit(0);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginsDir = path.join(repoRoot, 'plugins');

if (!existsSync(pluginsDir)) {
  console.log(`[plugins] kein plugins/-Verzeichnis unter ${repoRoot} – nichts zu tun.`);
  process.exit(0);
}

const entries = readdirSync(pluginsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => path.join(pluginsDir, e.name))
  .filter((dir) => existsSync(path.join(dir, 'package.json')));

if (entries.length === 0) {
  console.log('[plugins] keine Plugin-Pakete unter plugins/ gefunden.');
  process.exit(0);
}

// Hilfsfunktion: Heuristik „dist neuer als src?" — wenn ja, kein Re-Build.
// Plugin-Autoren machen ihre Änderungen in src/; dist wird vom Plugin-eigenen
// `tsc` neu geschrieben. Wenn die größte mtime in src/ kleiner ist als die
// Eintry-Datei in dist/, ist nichts zu tun.
function distIsCurrent(pluginDir) {
  const dist = path.join(pluginDir, 'dist', 'index.js');
  if (!existsSync(dist)) return false;
  const distMtime = statSync(dist).mtimeMs;
  let newest = 0;
  function walk(p) {
    const s = statSync(p);
    if (s.isDirectory()) {
      for (const child of readdirSync(p)) walk(path.join(p, child));
    } else if (s.mtimeMs > newest) {
      newest = s.mtimeMs;
    }
  }
  const src = path.join(pluginDir, 'src');
  if (!existsSync(src)) return distMtime > 0;
  walk(src);
  return distMtime >= newest;
}

let hadFailure = false;

for (const dir of entries) {
  const name = path.basename(dir);
  if (distIsCurrent(dir)) {
    console.log(`[plugins] ${name}: dist/ ist aktuell – kein Rebuild nötig.`);
    continue;
  }

  console.log(`[plugins] ${name}: npm install`);
  const install = spawnSync('npm', ['install', '--silent', '--no-audit', '--no-fund'], {
    cwd: dir,
    stdio: 'inherit',
  });
  if (install.status !== 0) {
    console.error(`[plugins] ${name}: npm install fehlgeschlagen (Exit ${install.status}).`);
    hadFailure = true;
    continue;
  }

  console.log(`[plugins] ${name}: npm run build`);
  const build = spawnSync('npm', ['run', '--silent', 'build'], {
    cwd: dir,
    stdio: 'inherit',
  });
  if (build.status !== 0) {
    console.error(`[plugins] ${name}: build fehlgeschlagen (Exit ${build.status}).`);
    hadFailure = true;
    continue;
  }

  console.log(`[plugins] ${name}: ✓ gebaut.`);
}

if (hadFailure) {
  console.error(
    '[plugins] mindestens ein Plugin konnte nicht gebaut werden – bitte oben prüfen.',
  );
  process.exit(1);
}

console.log('[plugins] alle Plugins bereit.');
