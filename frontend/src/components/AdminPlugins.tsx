import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useTheme } from '../hooks/useTheme';
import {
  callPluginAdminRoute,
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
      {pluginId === 'terminfindung' && (
        <CalendarConnectionTester
          values={values}
          onPickCalendar={(url) => setValues((s) => ({ ...s, calendarUrl: url }))}
        />
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
            ) : def.type === 'json' && def.componentHint === 'weekly-schedule' ? (
              <WeeklyScheduleEditor value={current} onChange={setVal} />
            ) : def.type === 'json' ? (
              <textarea
                rows={6}
                value={current}
                onChange={(e) => setVal(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-xs font-mono"
                placeholder="{}"
              />
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

// ---------------------------------------------------------------------------
// Wochenplan-Editor für Plugin-Settings mit componentHint="weekly-schedule".
// Persistiert ein JSON-Objekt der Form { monday: TimeBlock[], ... } als String.
// ---------------------------------------------------------------------------

interface TimeBlock {
  id: string;
  label: string;
  from: string;
  to: string;
  durationMinutes: number;
  bufferMinutes: number;
  calendarId: string;
}

type WeeklySchedule = Record<DayKey, TimeBlock[]>;

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const DAY_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<DayKey, string> = {
  monday: 'Montag',
  tuesday: 'Dienstag',
  wednesday: 'Mittwoch',
  thursday: 'Donnerstag',
  friday: 'Freitag',
  saturday: 'Samstag',
  sunday: 'Sonntag',
};

function emptySchedule(): WeeklySchedule {
  return {
    monday: [], tuesday: [], wednesday: [], thursday: [],
    friday: [], saturday: [], sunday: [],
  };
}

function parseSchedule(raw: string): WeeklySchedule {
  if (!raw) return emptySchedule();
  try {
    const parsed = JSON.parse(raw) as Partial<WeeklySchedule>;
    const out = emptySchedule();
    for (const day of DAY_KEYS) {
      const blocks = parsed[day];
      if (Array.isArray(blocks)) {
        out[day] = blocks
          .filter((b) => b && typeof b === 'object')
          .map((b) => ({
            id: typeof b.id === 'string' && b.id ? b.id : randomId(),
            label: typeof b.label === 'string' ? b.label : '',
            from: typeof b.from === 'string' ? b.from : '09:00',
            to: typeof b.to === 'string' ? b.to : '12:00',
            durationMinutes: Number(b.durationMinutes) > 0 ? Number(b.durationMinutes) : 30,
            bufferMinutes: Number(b.bufferMinutes) >= 0 ? Number(b.bufferMinutes) : 0,
            calendarId: typeof b.calendarId === 'string' && b.calendarId ? b.calendarId : 'default',
          }));
      }
    }
    return out;
  } catch {
    return emptySchedule();
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function WeeklyScheduleEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const schedule = useMemo(() => parseSchedule(value), [value]);

  function commit(next: WeeklySchedule) {
    onChange(JSON.stringify(next));
  }

  function addBlock(day: DayKey) {
    const next: WeeklySchedule = { ...schedule, [day]: [...schedule[day]] };
    next[day].push({
      id: randomId(),
      label: 'Neue Terminart',
      from: '09:00',
      to: '12:00',
      durationMinutes: 30,
      bufferMinutes: 0,
      calendarId: 'default',
    });
    commit(next);
  }

  function updateBlock(day: DayKey, idx: number, patch: Partial<TimeBlock>) {
    const next: WeeklySchedule = { ...schedule, [day]: [...schedule[day]] };
    next[day][idx] = { ...next[day][idx], ...patch };
    commit(next);
  }

  function removeBlock(day: DayKey, idx: number) {
    const next: WeeklySchedule = { ...schedule, [day]: schedule[day].filter((_, i) => i !== idx) };
    commit(next);
  }

  return (
    <div className="border border-gray-200 rounded-md divide-y divide-gray-200 bg-gray-50">
      {DAY_KEYS.map((day) => {
        const blocks = schedule[day];
        return (
          <div key={day} className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-800">{DAY_LABELS[day]}</h4>
              <button
                type="button"
                onClick={() => addBlock(day)}
                className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50"
              >
                + Terminart hinzufügen
              </button>
            </div>
            {blocks.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Keine Termine an diesem Tag.</p>
            ) : (
              <div className="space-y-2">
                {blocks.map((block, idx) => (
                  <div key={block.id} className="bg-white border border-gray-200 rounded p-2 grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-3">
                      <label className="block text-[11px] text-gray-600 mb-0.5">Bezeichnung</label>
                      <input
                        type="text"
                        value={block.label}
                        onChange={(e) => updateBlock(day, idx, { label: e.target.value })}
                        placeholder="z. B. Beurkundungen"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <label className="block text-[11px] text-gray-600 mb-0.5">Von</label>
                      <input
                        type="time"
                        value={block.from}
                        onChange={(e) => updateBlock(day, idx, { from: e.target.value })}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <label className="block text-[11px] text-gray-600 mb-0.5">Bis</label>
                      <input
                        type="time"
                        value={block.to}
                        onChange={(e) => updateBlock(day, idx, { to: e.target.value })}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-1">
                      <label className="block text-[11px] text-gray-600 mb-0.5">Dauer (Min)</label>
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={block.durationMinutes}
                        onChange={(e) => updateBlock(day, idx, { durationMinutes: Number(e.target.value) || 30 })}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-1">
                      <label className="block text-[11px] text-gray-600 mb-0.5">Puffer (Min)</label>
                      <input
                        type="number"
                        min={0}
                        step={5}
                        value={block.bufferMinutes}
                        onChange={(e) => updateBlock(day, idx, { bufferMinutes: Number(e.target.value) || 0 })}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-[11px] text-gray-600 mb-0.5">Kalender</label>
                      <input
                        type="text"
                        value={block.calendarId}
                        onChange={(e) => updateBlock(day, idx, { calendarId: e.target.value || 'default' })}
                        placeholder="default"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-1 flex md:justify-end">
                      <button
                        type="button"
                        onClick={() => removeBlock(day, idx)}
                        className="text-xs text-red-600 hover:text-red-800 underline"
                      >
                        Entfernen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-gray-500 px-3 py-2 bg-white">
        Die Kalender-ID „default" verweist auf den oben konfigurierten Hauptkalender. Weitere
        Kalender-IDs entsprechen den Einträgen aus „Zusätzliche Kalender".
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verbindungstest + Kalender-Auswahl für das Terminfindung-Plugin.
// Ruft POST /api/admin/plugins/terminfindung/ext/discover mit den aktuell im
// Form eingegebenen (noch nicht gespeicherten) Zugangsdaten auf und zeigt die
// vom Server zurückgemeldeten Kalender zur Auswahl an.
// ---------------------------------------------------------------------------

interface DiscoveredCalendar {
  url: string;
  displayName: string;
  color?: string;
}

interface DiscoverResponse {
  ok: boolean;
  calendars?: DiscoveredCalendar[];
  warnings?: string[];
  error?: string;
}

function CalendarConnectionTester({
  values,
  onPickCalendar,
}: {
  values: Record<string, string>;
  onPickCalendar: (url: string) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<DiscoverResponse | null>(null);

  const url = values.calendarUrl ?? '';
  const username = values.username ?? '';
  const password = values.password ?? '';
  const disabled = !url || !username || !password || testing;

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const response = await callPluginAdminRoute<DiscoverResponse>(
        'terminfindung',
        'discover',
        {
          method: 'POST',
          body: JSON.stringify({ url, username, password }),
        },
      );
      setResult(response);
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Verbindungstest fehlgeschlagen.',
      });
    } finally {
      setTesting(false);
    }
  }

  const calendars = result?.calendars ?? [];
  const isSelected = (calUrl: string) => normaliseUrl(calUrl) === normaliseUrl(url);

  return (
    <div className="border border-gray-200 rounded-md bg-blue-50/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold text-gray-800">Verbindung testen</h4>
          <p className="text-xs text-gray-600">
            Prüfen Sie, ob OpenFormulare mit den oben eingetragenen Zugangsdaten auf Ihren
            Kalender-Server zugreifen kann. Wenn unter der URL mehrere Kalender verfügbar sind,
            können Sie anschließend einen davon auswählen.
          </p>
        </div>
        <button
          type="button"
          onClick={runTest}
          disabled={disabled}
          className="bg-primary text-white px-3 py-1.5 text-sm rounded hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
        >
          {testing ? 'Wird getestet …' : 'Verbindung testen'}
        </button>
      </div>

      {!url || !username || !password ? (
        <p className="text-[11px] text-gray-500 italic">
          Bitte tragen Sie zuerst URL, Benutzername und Passwort ein.
        </p>
      ) : /^[•●]+$/.test(password) ? (
        <p className="text-[11px] text-gray-500 italic">
          Der Test verwendet das bereits gespeicherte Passwort. Tragen Sie ein
          neues ein, wenn Sie es ändern möchten.
        </p>
      ) : null}

      {result && result.ok === false && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-2 rounded">
          <strong>Verbindung fehlgeschlagen:</strong> {result.error || 'Unbekannter Fehler.'}
        </div>
      )}

      {result && result.ok === true && calendars.length > 0 && (
        <div className="space-y-2">
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-2 rounded">
            <strong>Verbindung erfolgreich.</strong>{' '}
            {calendars.length === 1
              ? 'Ein Kalender gefunden:'
              : `${calendars.length} Kalender gefunden. Wählen Sie aus, welcher als Standard-Kalender verwendet werden soll:`}
          </div>
          <ul className="space-y-1">
            {calendars.map((c) => (
              <li
                key={c.url}
                className={`flex items-center justify-between gap-2 bg-white border rounded px-2 py-1.5 ${
                  isSelected(c.url) ? 'border-primary ring-1 ring-primary' : 'border-gray-200'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {c.color && (
                      <span
                        className="inline-block w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: c.color }}
                      />
                    )}
                    <span className="text-sm font-medium truncate">{c.displayName}</span>
                  </div>
                  <code className="text-[11px] text-gray-500 break-all">{c.url}</code>
                </div>
                <button
                  type="button"
                  onClick={() => onPickCalendar(c.url)}
                  disabled={isSelected(c.url)}
                  className={`text-xs px-2 py-1 rounded border whitespace-nowrap ${
                    isSelected(c.url)
                      ? 'bg-primary text-white border-primary cursor-default'
                      : 'bg-white border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {isSelected(c.url) ? 'Ausgewählt' : 'Diesen verwenden'}
                </button>
              </li>
            ))}
          </ul>
          {result.warnings && result.warnings.length > 0 && (
            <ul className="text-[11px] text-amber-700 list-disc list-inside">
              {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function normaliseUrl(u: string): string {
  if (!u) return '';
  return u.endsWith('/') ? u : `${u}/`;
}
