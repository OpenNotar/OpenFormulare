// Admin-Seite: "Was ist neu?" + Seed-Diff-Übersicht.
//
// Zeigt Release-Notes für alle Versionen seit dem letzten "Gesehen"-Stand
// und listet alle Seed-Dialoge mit Status ("neu" / "aktualisiert" / "lokal
// verändert"). Notar kann einzelne Dialoge übernehmen (Import-Button) oder
// die Übersicht als gesehen markieren.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import {
  getOnboardingStatus,
  importSeedDialog,
  acknowledgeOnboarding,
  type OnboardingStatus,
  type SeedChangeEntry,
} from '../lib/onboardingApi';

export function AdminOnboarding() {
  useTheme();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // dialogId in flight
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOnboardingStatus()
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  async function reload() {
    try {
      setStatus(await getOnboardingStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    }
  }

  async function handleImport(entry: SeedChangeEntry) {
    if (entry.userModified && !window.confirm(
      `Der Dialog „${entry.title}" wurde lokal bearbeitet. Beim Import werden alle lokalen Änderungen überschrieben. Eine Sicherung wird automatisch in der Versionshistorie abgelegt.\n\nWirklich übernehmen?`,
    )) {
      return;
    }
    setBusy(entry.dialogId);
    setInfo(null);
    setError(null);
    try {
      await importSeedDialog(entry.dialogId);
      setInfo(`„${entry.title}" wurde aus dem Seed übernommen.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  }

  async function handleAcknowledge() {
    try {
      await acknowledgeOnboarding();
      setInfo('Als gesehen markiert. Der Banner verschwindet beim nächsten Laden.');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    }
  }

  if (error && !status) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }
  if (!status) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <p className="text-sm text-gray-400">Wird geladen …</p>
      </div>
    );
  }

  const newSeeds = status.seedChanges.filter((e) => e.status === 'new');
  const changedSeeds = status.seedChanges.filter((e) => e.status === 'changed');
  const unchangedCount = status.seedChanges.filter((e) => e.status === 'unchanged').length;
  const tombstonedCount = status.seedChanges.filter((e) => e.status === 'tombstoned').length;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-slate-900 text-white px-4 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Admin</p>
            <h1 className="text-2xl font-semibold">Update-Übersicht (v{status.currentVersion})</h1>
            <p className="text-xs text-slate-400 mt-1">
              Zuletzt bestätigte Version: v{status.seenVersion}
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

        {/* Auto-Sync-Ergebnis vom letzten Start (Transparenz) */}
        {status.lastAutoSync && (status.lastAutoSync.inserted > 0 || status.lastAutoSync.updated > 0) && (
          <section className="bg-emerald-50/40 border border-emerald-200 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚙️</span>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-gray-800">
                  Beim letzten Server-Start automatisch synchronisiert
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(status.lastAutoSync.at).toLocaleString('de-DE', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  {status.lastAutoSync.insertedIds.length > 0 && (
                    <div>
                      <span className="font-medium text-emerald-800">Neu angelegt ({status.lastAutoSync.insertedIds.length}):</span>{' '}
                      <span className="text-gray-700">{status.lastAutoSync.insertedIds.join(', ')}</span>
                    </div>
                  )}
                  {status.lastAutoSync.updatedIds.length > 0 && (
                    <div>
                      <span className="font-medium text-emerald-800">Aktualisiert ({status.lastAutoSync.updatedIds.length}):</span>{' '}
                      <span className="text-gray-700">{status.lastAutoSync.updatedIds.join(', ')}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Diese Dialoge waren nicht lokal verändert und wurden daher automatisch
                    auf den neuen Stand gebracht. Lokal modifizierte Dialoge erscheinen weiter
                    unten zur manuellen Bestätigung.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Release Notes */}
        {status.releaseNotes.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Was ist neu?</h2>
            <p className="text-xs text-gray-500 mb-4">
              Änderungen seit Version {status.seenVersion}
            </p>
            <div className="space-y-5">
              {status.releaseNotes.map((note) => (
                <div key={note.version} className="border-l-4 border-primary pl-4">
                  <div className="flex items-baseline gap-3 mb-2">
                    <h3 className="text-base font-semibold text-gray-800">v{note.version}</h3>
                    <span className="text-xs text-gray-400">{note.date}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-2">{note.title}</p>
                  <ul className="space-y-2">
                    {note.highlights.map((h, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-medium text-gray-700">{h.title}:</span>{' '}
                        <span className="text-gray-600">{h.body}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Seed Changes — neu */}
        {newSeeds.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Neue Dialoge im Seed ({newSeeds.length})
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Diese Dialoge sind in der mitgelieferten Standardsammlung neu, fehlen aber in Ihrer Instanz. Sie können sie einzeln übernehmen.
            </p>
            <ul className="divide-y divide-gray-100">
              {newSeeds.map((entry) => (
                <li key={entry.dialogId} className="py-3 flex items-center gap-3">
                  <span className="flex-1">
                    <span className="text-sm font-medium text-gray-800">{entry.title}</span>
                    <span className="ml-2 text-xs text-gray-400 font-mono">{entry.dialogId}</span>
                  </span>
                  <SeedActionButton
                    label="Anlegen"
                    busy={busy === entry.dialogId}
                    onClick={() => handleImport(entry)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Seed Changes — aktualisiert */}
        {changedSeeds.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Aktualisierte Dialoge ({changedSeeds.length})
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Die Standardsammlung enthält neuere Versionen dieser Dialoge (z. B. mit Icon oder Sprachen). Beim Übernehmen wird die aktuelle DB-Version automatisch im Versionsverlauf gesichert.
            </p>
            <ul className="divide-y divide-gray-100">
              {changedSeeds.map((entry) => (
                <li key={entry.dialogId} className="py-3 flex items-start gap-3">
                  <span className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{entry.title}</span>
                      <span className="text-xs text-gray-400 font-mono">{entry.dialogId}</span>
                      {entry.userModified && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          Lokal verändert
                        </span>
                      )}
                    </div>
                    {entry.summary && (
                      <p className="text-xs text-gray-500 mt-0.5">{entry.summary}</p>
                    )}
                  </span>
                  <SeedActionButton
                    label="Übernehmen"
                    danger={entry.userModified}
                    busy={busy === entry.dialogId}
                    onClick={() => handleImport(entry)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {newSeeds.length === 0 && changedSeeds.length === 0 && (
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
            <p className="text-sm text-gray-600">
              Alle Seed-Dialoge sind auf dem aktuellen Stand. 🎉
            </p>
          </section>
        )}

        {/* Stats */}
        <p className="text-xs text-gray-500 text-center">
          {unchangedCount} unverändert · {tombstonedCount} lokal gelöscht (nicht erneut importiert)
        </p>

        {/* Acknowledge */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => void handleAcknowledge()}
            className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-md transition-colors"
          >
            Als gesehen markieren
          </button>
        </div>
      </div>
    </div>
  );
}

function SeedActionButton({
  label, busy, danger, onClick,
}: { label: string; busy: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`shrink-0 text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-40 ${
        danger
          ? 'border border-amber-400 text-amber-700 hover:bg-amber-50'
          : 'border border-primary text-primary hover:bg-primary hover:text-white'
      }`}
    >
      {busy ? '…' : label}
    </button>
  );
}
