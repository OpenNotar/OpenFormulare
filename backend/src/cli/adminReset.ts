// =====================================================================
//  CLI: Admin-Benutzer anlegen oder zurücksetzen.
//
//  Der Wiederherstellungsweg, wenn niemand mehr ins Backend kommt. Läuft
//  direkt auf dem Server bzw. im Container und braucht keinen Login.
//
//    npm run admin:reset -- --username notar --password "neuesPasswort"
//        Existiert der Benutzer, wird sein Passwort gesetzt, die Rolle auf
//        admin gehoben und das Konto aktiviert. Sonst wird er neu angelegt.
//
//    npm run admin:reset -- --username notar --password "..." --role moderator
//        Rolle explizit setzen (admin | moderator).
//
//    npm run admin:reset -- --list
//        Alle Benutzer mit Rolle und Status auflisten.
//
//  Bestehende Sessions des betroffenen Benutzers werden dabei ungültig.
// =====================================================================

// .env laden wie der Server — die DB ist verschlüsselt (DIALOG_DB_PASSWORD).
// Muss vor dem Import der DB-Module stehen (CommonJS-Emit hält die Reihenfolge ein).
import 'dotenv/config';

// Der Seed-Sync ist hier nicht erwünscht; das CLI soll nur Benutzer anfassen.
process.env.OF_SKIP_STARTUP_SEED = '1';

import {
  createAdminUser,
  listAdminUsers,
  updateAdminUser,
  validatePassword,
  validateUsername,
  type AdminRole,
} from '../db/adminUsers';

function argValue(name: string): string | undefined {
  const prefixed = `--${name}`;
  const idx = process.argv.indexOf(prefixed);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const inline = process.argv.find((a) => a.startsWith(`${prefixed}=`));
  return inline ? inline.slice(prefixed.length + 1) : undefined;
}

function fail(message: string): never {
  console.error(`[admin:reset] ${message}`);
  process.exit(1);
}

try {
  if (process.argv.includes('--list')) {
    const users = listAdminUsers();
    if (users.length === 0) {
      console.log('[admin:reset] Es existiert noch kein Benutzer.');
    } else {
      console.log(`[admin:reset] ${users.length} Benutzer:`);
      for (const u of users) {
        console.log(
          `  ${u.username.padEnd(24)} ${u.role.padEnd(10)} ` +
            `${u.isActive ? 'aktiv' : 'deaktiviert'}` +
            `${u.lastLoginAt ? `  letzter Login: ${u.lastLoginAt}` : ''}`,
        );
      }
    }
    process.exit(0);
  }

  const username = argValue('username');
  const password = argValue('password');
  const roleArg = argValue('role') ?? 'admin';

  if (!username || !password) {
    fail(
      'Aufruf: npm run admin:reset -- --username <name> --password <passwort> [--role admin|moderator]\n' +
        '        npm run admin:reset -- --list',
    );
  }
  if (roleArg !== 'admin' && roleArg !== 'moderator') {
    fail(`Ungültige Rolle "${roleArg}". Erlaubt: admin, moderator`);
  }
  const role = roleArg as AdminRole;

  const nameProblem = validateUsername(username);
  if (nameProblem) fail(nameProblem);
  const pwProblem = validatePassword(password);
  if (pwProblem) fail(pwProblem);

  const existing = listAdminUsers().find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
  );

  if (existing) {
    updateAdminUser(existing.id, { password, role, isActive: true });
    console.log(
      `[admin:reset] Benutzer "${existing.username}" aktualisiert: Passwort gesetzt, ` +
        `Rolle "${role}", Konto aktiv. Bestehende Sessions sind ungültig.`,
    );
  } else {
    const user = createAdminUser({ username, password, role });
    console.log(`[admin:reset] Benutzer "${user.username}" mit Rolle "${role}" angelegt.`);
  }
  process.exit(0);
} catch (err) {
  console.error('[admin:reset] fehlgeschlagen:', err);
  process.exit(1);
}
