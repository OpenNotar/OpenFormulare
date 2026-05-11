import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { adminLogout, getAdminUsername } from '../lib/adminAuth';
import { getCachedRuntimeMode } from '../lib/runtimeMode';
import {
  exportAllDialogs,
  importDialogs,
  listAdminDialogs,
  removeDialog,
  toggleDialogActive,
  toggleDialogUnlisted,
  type DialogRecord,
} from '../lib/dialogsApi';
import type { FormSchema } from '../types/schema';

export function AdminDashboard() {
  useTheme();
  const navigate = useNavigate();
  const [dialogs, setDialogs] = useState<DialogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const adminUsername = getAdminUsername();
  const isDemo = getCachedRuntimeMode()?.demoMode === true;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listAdminDialogs()
      .then((items) => {
        if (!cancelled) {
          setDialogs(items);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () =>
      dialogs.filter((dialog) => {
        const text = `${dialog.title} ${dialog.description || ''} ${dialog.id}`.toLowerCase();
        return text.includes(search.toLowerCase());
      }),
    [dialogs, search],
  );

  async function handleDelete(dialog: DialogRecord) {
    if (!confirm(`„${dialog.title}" wirklich löschen?`)) {
      return;
    }

    try {
      await removeDialog(dialog.id);
      setDialogs((current) => current.filter((item) => item.id !== dialog.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dialog konnte nicht gelöscht werden.');
    }
  }

  async function handleToggle(dialog: DialogRecord) {
    try {
      const updated = await toggleDialogActive(dialog.id);
      setDialogs((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dialogstatus konnte nicht geändert werden.');
    }
  }

  async function handleToggleUnlisted(dialog: DialogRecord) {
    try {
      const updated = await toggleDialogUnlisted(dialog.id);
      setDialogs((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sichtbarkeit konnte nicht geändert werden.');
    }
  }

  function handleLogout() {
    adminLogout();
    navigate('/admin/login');
  }

  async function handleExport() {
    try {
      await exportAllDialogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export fehlgeschlagen.');
    }
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string) as FormSchema | FormSchema[];
        const schemas = Array.isArray(json) ? json : [json];
        const result = await importDialogs(schemas);
        const fresh = await listAdminDialogs();
        setDialogs(fresh);
        setError(null);
        alert(`${result.imported} Dialog(e) importiert.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Import fehlgeschlagen.');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-slate-900 text-white px-4 py-5">
        <div className="max-w-6xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Admin</p>
            <h1 className="text-2xl font-semibold">Dialog-Verwaltung</h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-300">{isDemo ? 'Demo-Sitzung' : (adminUsername || 'Angemeldet')}</span>
            <Link to="/admin/settings" className="px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors">
              Einstellungen
            </Link>
            <Link to="/admin/plugins" className="px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors">
              Plugins
            </Link>
            <Link to="/" className="px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors">
              Öffentliche Ansicht
            </Link>
            {!isDemo && (
              <button onClick={handleLogout} className="px-3 py-2 rounded-lg bg-white text-slate-900 hover:bg-slate-200 transition-colors">
                Abmelden
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <input
              type="text"
              placeholder="Dialoge durchsuchen …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full lg:max-w-xl border border-gray-300 rounded-lg px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              {!isDemo && (
                <>
                  <button
                    onClick={() => void handleExport()}
                    className="inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Exportieren
                  </button>
                  <label className="inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                    Importieren
                    <input type="file" accept=".json" className="hidden" onChange={handleImport} />
                  </label>
                </>
              )}
              <Link
                to="/admin/dialogs/new"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                Neuen Dialog erstellen
              </Link>
            </div>
          </div>
        </div>

        {error ? (
          <p className="text-center text-red-500 text-sm py-16">{error}</p>
        ) : loading ? (
          <p className="text-center text-gray-400 text-sm py-16">Dialoge werden geladen …</p>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-[1.5fr_1fr_120px_120px_260px] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <span>Dialog</span>
              <span>Kategorie</span>
              <span>Typ</span>
              <span>Status</span>
              <span>Aktionen</span>
            </div>
            {filtered.map((dialog) => (
              <div
                key={dialog.id}
                className="grid grid-cols-[1.5fr_1fr_120px_120px_260px] gap-4 px-5 py-4 items-center border-b border-gray-100 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{dialog.title}</p>
                  <p className="text-xs text-gray-400 font-mono">/{dialog.id}</p>
                </div>
                <span className="text-sm text-gray-600">
                  {dialog.categories && dialog.categories.length > 0
                    ? dialog.categories.join(', ')
                    : dialog.category || 'Allgemein'}
                </span>
                <span className="text-xs text-gray-500">
                  {dialog.isSystem ? 'Standard' : 'Eigen'}
                </span>
                <span className={`text-xs font-medium ${
                  dialog.isActive === false ? 'text-amber-600'
                  : dialog.unlisted ? 'text-blue-600'
                  : 'text-green-600'
                }`} title={
                  dialog.isActive === false ? 'Deaktiviert: nicht erreichbar'
                  : dialog.unlisted ? 'Versteckt: nur per Direkt-Link erreichbar, nicht in der Übersicht'
                  : 'Aktiv: in der öffentlichen Übersicht gelistet'
                }>
                  {dialog.isActive === false ? 'Deaktiviert'
                   : dialog.unlisted ? 'Versteckt'
                   : 'Aktiv'}
                </span>
                <div className="flex gap-2">
                  <Link
                    to={`/admin/dialogs/${dialog.id}/edit`}
                    className="text-xs font-medium text-gray-600 border border-gray-200 rounded px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    Bearbeiten
                  </Link>
                  <button
                    onClick={() => void handleToggle(dialog)}
                    className="text-xs font-medium text-gray-600 border border-gray-200 rounded px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    {dialog.isActive === false ? 'Aktivieren' : 'Deaktivieren'}
                  </button>
                  {dialog.isActive !== false && (
                    <button
                      onClick={() => void handleToggleUnlisted(dialog)}
                      title={dialog.unlisted
                        ? 'In der öffentlichen Übersicht wieder anzeigen'
                        : 'In der öffentlichen Übersicht verstecken (Direkt-Link bleibt aktiv)'}
                      className="text-xs font-medium text-gray-600 border border-gray-200 rounded px-3 py-2 hover:bg-gray-50 transition-colors"
                    >
                      {dialog.unlisted ? 'Anzeigen' : 'Verstecken'}
                    </button>
                  )}
                  <button
                    onClick={() => void handleDelete(dialog)}
                    className="text-xs font-medium text-red-500 border border-red-200 rounded px-3 py-2 hover:bg-red-50 transition-colors"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-16">Keine Dialoge gefunden.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
