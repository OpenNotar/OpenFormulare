// Admin-Seite: Benutzerverwaltung.
//
// Zwei Bereiche:
//   1. „Mein Konto" — eigenes Passwort ändern. Für jede Rolle verfügbar und
//      der Weg, mit dem der Kunde die init-Zugangsdaten durch eigene ersetzt.
//   2. „Benutzer" — Konten anlegen, umbenennen, Rolle ändern, Passwort setzen,
//      deaktivieren, löschen. Nur für Administratoren.
//
// Die Absicherung liegt serverseitig (requireAdminRole); die Rolle hier
// steuert lediglich, was angeboten wird.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { getAdminUsername, isAdminRole, type AdminRole } from '../lib/adminAuth';
import { isSessionExpired } from '../lib/adminApi';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  changeOwnPassword,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  type AdminUser,
} from '../lib/usersApi';

const MIN_PASSWORD_LENGTH = 10;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function AdminUsers() {
  useTheme();
  const navigate = useNavigate();
  const isAdmin = isAdminRole();
  const ownUsername = getAdminUsername();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(isAdmin);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Eigenes Passwort
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');

  // Neuer Benutzer
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<AdminRole>('moderator');

  // Passwort eines anderen Benutzers setzen
  const [pwTarget, setPwTarget] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState('');

  // Umbenennen
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  async function reload() {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const result = await listUsers();
      setUsers(result.users);
      setError(null);
    } catch (e) {
      reportError(e, 'Benutzer konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    listUsers()
      .then((r) => { if (!cancelled) { setUsers(r.users); setLoading(false); } })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoading(false);
        if (isSessionExpired(e)) {
          navigate('/admin/login', { replace: true, state: { notice: (e as Error).message } });
          return;
        }
        setError(e instanceof Error ? e.message : 'Benutzer konnten nicht geladen werden.');
      });
    return () => { cancelled = true; };
  }, [isAdmin, navigate]);

  function report(message: string) {
    setInfo(message);
    setError(null);
  }
  // Abgelaufene/ungültige Sitzung ist kein Formularfehler: Der Benutzer wird
  // zur Anmeldung geschickt, statt eine Meldung zu sehen, die nach einem
  // falschen Passwort klingt.
  function reportError(e: unknown, fallback: string) {
    if (isSessionExpired(e)) {
      navigate('/admin/login', { replace: true, state: { notice: (e as Error).message } });
      return;
    }
    setError(e instanceof Error ? e.message : fallback);
    setInfo(null);
  }

  async function handleChangeOwnPassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== repeatPassword) {
      reportError(new Error('Die beiden neuen Passwörter stimmen nicht überein.'), '');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      reportError(new Error(`Das neue Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`), '');
      return;
    }
    setBusy('own-password');
    try {
      await changeOwnPassword(currentPassword, newPassword);
      report('Passwort erfolgreich geändert. Du bleibst hier angemeldet — andere Sitzungen dieses Kontos wurden abgemeldet.');
      setCurrentPassword('');
      setNewPassword('');
      setRepeatPassword('');
    } catch (e) {
      reportError(e, 'Passwort konnte nicht geändert werden.');
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy('create');
    try {
      const created = await createUser({
        username: newUsername,
        password: newUserPassword,
        role: newUserRole,
      });
      report(`Benutzer „${created.username}" wurde als ${ROLE_LABELS[created.role]} angelegt.`);
      setNewUsername('');
      setNewUserPassword('');
      setNewUserRole('moderator');
      setShowCreate(false);
      await reload();
    } catch (e) {
      reportError(e, 'Benutzer konnte nicht angelegt werden.');
    } finally {
      setBusy(null);
    }
  }

  async function handleRoleChange(user: AdminUser, role: AdminRole) {
    setBusy(user.id);
    try {
      await updateUser(user.id, { role });
      report(`„${user.username}" ist jetzt ${ROLE_LABELS[role]}.`);
      await reload();
    } catch (e) {
      reportError(e, 'Rolle konnte nicht geändert werden.');
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleActive(user: AdminUser) {
    setBusy(user.id);
    try {
      await updateUser(user.id, { isActive: !user.isActive });
      report(user.isActive
        ? `„${user.username}" wurde deaktiviert und abgemeldet.`
        : `„${user.username}" wurde wieder aktiviert.`);
      await reload();
    } catch (e) {
      reportError(e, 'Status konnte nicht geändert werden.');
    } finally {
      setBusy(null);
    }
  }

  async function handleSetPassword(user: AdminUser) {
    if (pwValue.length < MIN_PASSWORD_LENGTH) {
      reportError(new Error(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`), '');
      return;
    }
    setBusy(user.id);
    try {
      await updateUser(user.id, { password: pwValue });
      report(`Neues Passwort für „${user.username}" gesetzt. Bestehende Sitzungen wurden abgemeldet.`);
      setPwTarget(null);
      setPwValue('');
      await reload();
    } catch (e) {
      reportError(e, 'Passwort konnte nicht gesetzt werden.');
    } finally {
      setBusy(null);
    }
  }

  async function handleRename(user: AdminUser) {
    setBusy(user.id);
    try {
      const updated = await updateUser(user.id, { username: renameValue });
      report(`Benutzername geändert: „${user.username}" → „${updated.username}".`);
      setRenameTarget(null);
      setRenameValue('');
      await reload();
    } catch (e) {
      reportError(e, 'Benutzername konnte nicht geändert werden.');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(user: AdminUser) {
    if (!window.confirm(
      `Benutzer „${user.username}" endgültig löschen?\n\nDas Konto wird sofort abgemeldet und kann sich nicht mehr anmelden.`,
    )) return;
    setBusy(user.id);
    try {
      await deleteUser(user.id);
      report(`Benutzer „${user.username}" wurde gelöscht.`);
      await reload();
    } catch (e) {
      reportError(e, 'Benutzer konnte nicht gelöscht werden.');
    } finally {
      setBusy(null);
    }
  }

  const activeAdmins = users.filter((u) => u.role === 'admin' && u.isActive).length;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-slate-900 text-white px-4 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Admin</p>
            <h1 className="text-2xl font-semibold">Benutzer</h1>
            <p className="text-xs text-slate-400 mt-1">
              Angemeldet als {ownUsername ?? '—'} · {isAdmin ? 'Administrator' : 'Moderator'}
            </p>
          </div>
          <Link to="/admin" className="px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors text-sm">
            ← Zurück zur Übersicht
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {info && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 flex justify-between items-start">
            <span>{info}</span>
            <button onClick={() => setInfo(null)} className="text-emerald-500 hover:text-emerald-700">✕</button>
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex justify-between items-start">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* ---------------- Mein Konto ---------------- */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-800">Mein Konto</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Eigenes Passwort ändern. Mindestens {MIN_PASSWORD_LENGTH} Zeichen.
          </p>
          <form onSubmit={handleChangeOwnPassword} className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-gray-600">
              Aktuelles Passwort
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="text-xs text-gray-600">
              Neues Passwort
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="text-xs text-gray-600">
              Neues Passwort wiederholen
              <input
                type="password"
                autoComplete="new-password"
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
                required
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={busy === 'own-password'}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {busy === 'own-password' ? 'Wird gespeichert …' : 'Passwort ändern'}
              </button>
            </div>
          </form>
        </section>

        {!isAdmin && (
          <section className="bg-white border border-gray-200 rounded-2xl p-5">
            <p className="text-sm text-gray-600">
              Die Verwaltung weiterer Benutzer ist Administratoren vorbehalten.
            </p>
          </section>
        )}

        {/* ---------------- Benutzerliste ---------------- */}
        {isAdmin && (
          <section className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Benutzer</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {ROLE_LABELS.admin}: {ROLE_DESCRIPTIONS.admin}<br />
                  {ROLE_LABELS.moderator}: {ROLE_DESCRIPTIONS.moderator}
                </p>
              </div>
              <button
                onClick={() => setShowCreate((v) => !v)}
                className="shrink-0 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800"
              >
                {showCreate ? 'Abbrechen' : '+ Benutzer'}
              </button>
            </div>

            {showCreate && (
              <form onSubmit={handleCreate} className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-gray-600">
                  Benutzername
                  <input
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    required
                    autoComplete="off"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Passwort
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Rolle
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as AdminRole)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="moderator">{ROLE_LABELS.moderator}</option>
                    <option value="admin">{ROLE_LABELS.admin}</option>
                  </select>
                </label>
                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={busy === 'create'}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === 'create' ? 'Wird angelegt …' : 'Benutzer anlegen'}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <p className="mt-4 text-sm text-gray-400">Wird geladen …</p>
            ) : (
              <div className="mt-4 space-y-3">
                {users.map((user) => {
                  const isSelf = user.username === ownUsername;
                  const lastAdmin = user.role === 'admin' && user.isActive && activeAdmins <= 1;
                  const rowBusy = busy === user.id;
                  return (
                    <div
                      key={user.id}
                      className={`border rounded-xl p-4 ${user.isActive ? 'border-gray-200' : 'border-gray-200 bg-gray-50'}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-800">{user.username}</span>
                            {isSelf && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                das bist du
                              </span>
                            )}
                            {!user.isActive && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                deaktiviert
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Angelegt {formatDate(user.createdAt)} · Letzter Login {formatDate(user.lastLoginAt)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={user.role}
                            disabled={rowBusy || isSelf || lastAdmin}
                            onChange={(e) => handleRoleChange(user, e.target.value as AdminRole)}
                            title={
                              isSelf ? 'Die eigene Rolle kann nicht geändert werden.'
                                : lastAdmin ? 'Der letzte aktive Administrator kann nicht herabgesetzt werden.'
                                  : undefined
                            }
                            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            <option value="moderator">{ROLE_LABELS.moderator}</option>
                            <option value="admin">{ROLE_LABELS.admin}</option>
                          </select>

                          <button
                            onClick={() => { setPwTarget(pwTarget === user.id ? null : user.id); setPwValue(''); }}
                            disabled={rowBusy}
                            className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
                          >
                            Passwort
                          </button>

                          <button
                            onClick={() => { setRenameTarget(renameTarget === user.id ? null : user.id); setRenameValue(user.username); }}
                            disabled={rowBusy}
                            className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
                          >
                            Umbenennen
                          </button>

                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={rowBusy || isSelf || lastAdmin}
                            title={
                              isSelf ? 'Das eigene Konto kann nicht deaktiviert werden.'
                                : lastAdmin ? 'Der letzte aktive Administrator kann nicht deaktiviert werden.'
                                  : undefined
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
                          >
                            {user.isActive ? 'Deaktivieren' : 'Aktivieren'}
                          </button>

                          <button
                            onClick={() => handleDelete(user)}
                            disabled={rowBusy || isSelf || lastAdmin}
                            title={
                              isSelf ? 'Das eigene Konto kann nicht gelöscht werden.'
                                : lastAdmin ? 'Der letzte aktive Administrator kann nicht gelöscht werden.'
                                  : undefined
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 disabled:opacity-50 disabled:text-gray-400 disabled:border-gray-300"
                          >
                            Löschen
                          </button>
                        </div>
                      </div>

                      {pwTarget === user.id && (
                        <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-end gap-2">
                          <label className="text-xs text-gray-600 flex-1 min-w-[220px]">
                            Neues Passwort für „{user.username}"
                            <input
                              type="password"
                              value={pwValue}
                              onChange={(e) => setPwValue(e.target.value)}
                              autoComplete="new-password"
                              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </label>
                          <button
                            onClick={() => handleSetPassword(user)}
                            disabled={rowBusy}
                            className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50"
                          >
                            Setzen
                          </button>
                        </div>
                      )}

                      {renameTarget === user.id && (
                        <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-end gap-2">
                          <label className="text-xs text-gray-600 flex-1 min-w-[220px]">
                            Neuer Benutzername
                            <input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              autoComplete="off"
                              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </label>
                          <button
                            onClick={() => handleRename(user)}
                            disabled={rowBusy}
                            className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50"
                          >
                            Speichern
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-4 text-xs text-gray-500">
              Passwort-, Rollen- und Namensänderungen melden bestehende Sitzungen des Kontos ab.
              Wenn niemand mehr Zugang hat, hilft auf dem Server
              {' '}<code className="px-1 py-0.5 bg-gray-100 rounded">npm run admin:reset -- --username &lt;name&gt; --password &lt;passwort&gt;</code>.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
