import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useTheme } from '../hooks/useTheme';
import {
  getPluginSettings,
  listAdminPlugins,
  savePluginSettings,
  setPluginEnabled,
  type PluginAdminInfo,
} from '../lib/pluginsApi';

export function AdminPlugins() {
  useTheme();
  const [plugins, setPlugins] = useState<PluginAdminInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSettings, setOpenSettings] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAdminPlugins()
      .then((items) => {
        if (!cancelled) setPlugins(items);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    try {
      const items = await listAdminPlugins();
      setPlugins(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aktualisieren fehlgeschlagen');
    }
  }

  async function handleToggle(plugin: PluginAdminInfo) {
    try {
      await setPluginEnabled(plugin.id, !plugin.enabled);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Statusänderung fehlgeschlagen');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/admin" className="text-sm text-gray-500 hover:text-primary">← Admin-Dashboard</Link>
            <h1 className="text-2xl font-semibold mt-1">Plugins</h1>
            <p className="text-sm text-gray-500 mt-1">
              Externe Erweiterungen verwalten. Plugins werden beim Server-Start aus dem Verzeichnis
              <code className="mx-1 px-1 bg-gray-100 rounded">plugins/</code>geladen.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded mb-4">{error}</div>
        )}

        {loading && <p className="text-sm text-gray-500">Plugins werden geladen …</p>}

        {!loading && plugins.length === 0 && (
          <p className="text-sm text-gray-500">Keine Plugins installiert.</p>
        )}

        <ul className="space-y-3">
          {plugins.map((p) => (
            <li key={p.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-medium">{p.name}</h2>
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">v{p.version}</span>
                    <span className="text-xs text-gray-400 font-mono">{p.id}</span>
                    {p.enabled ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">aktiv</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">deaktiviert</span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-sm text-gray-600 mt-1">{p.description}</p>
                  )}
                  <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-3">
                    {p.author && <span>von <strong>{p.author}</strong></span>}
                    {p.homepage && (
                      <a href={p.homepage} target="_blank" rel="noreferrer" className="underline">
                        Homepage
                      </a>
                    )}
                    {p.hooks.length > 0 && (
                      <span>Hooks: {p.hooks.join(', ')}</span>
                    )}
                    {p.fieldTypes.length > 0 && (
                      <span>Feld-Typen: {p.fieldTypes.map((f) => f.id).join(', ')}</span>
                    )}
                    {p.hasRoutes && <span>eigene API-Routen</span>}
                  </div>
                  {p.errors.length > 0 && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                      <div className="font-medium mb-0.5">Fehler:</div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {p.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggle(p)}
                    className={`px-3 py-1.5 text-sm rounded ${p.enabled ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-primary text-white hover:opacity-90'}`}
                  >
                    {p.enabled ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                  {p.settings.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenSettings(openSettings === p.id ? null : p.id)}
                      className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                    >
                      {openSettings === p.id ? 'Einstellungen schließen' : 'Einstellungen'}
                    </button>
                  )}
                </div>
              </div>
              {openSettings === p.id && (
                <PluginSettingsForm pluginId={p.id} onSaved={() => refresh()} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PluginSettingsForm({ pluginId, onSaved }: { pluginId: string; onSaved: () => void }) {
  const [schema, setSchema] = useState<PluginAdminInfo['settings']>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPluginSettings(pluginId)
      .then((data) => {
        if (cancelled) return;
        setSchema(data.schema);
        setValues(data.values);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => { cancelled = true; };
  }, [pluginId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await savePluginSettings(pluginId, values);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 border-t border-gray-200 pt-4 space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-2 rounded">{error}</div>
      )}
      {schema.map((def) => {
        const current = values[def.key] ?? (def.default !== undefined ? String(def.default) : '');
        const setVal = (v: string) => setValues((s) => ({ ...s, [def.key]: v }));
        return (
          <div key={def.key} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              {def.label}{def.required ? ' *' : ''}
            </label>
            {def.type === 'boolean' ? (
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={current === 'true'}
                  onChange={(e) => setVal(e.target.checked ? 'true' : 'false')}
                />
                aktiv
              </label>
            ) : def.type === 'select' ? (
              <select
                value={current}
                onChange={(e) => setVal(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm"
              >
                <option value="">— bitte wählen —</option>
                {(def.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={def.type === 'password' ? 'password' : def.type === 'number' ? 'number' : 'text'}
                value={current}
                onChange={(e) => setVal(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            )}
            {def.description && (
              <p className="text-xs text-gray-500">{def.description}</p>
            )}
          </div>
        );
      })}
      <button
        type="submit"
        disabled={saving}
        className="bg-primary text-white px-3 py-1.5 text-sm rounded hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Speichern …' : 'Speichern'}
      </button>
    </form>
  );
}
