// Generic Kalender-Picker für Plugin-bereitgestellte Termin-Felder.
//
// Holt freie Slots vom konfigurierten Endpoint (z. B.
// /api/plugins/webdav-calendar/slots), gruppiert sie nach Tag und zeigt
// einen kompakten Tag-/Zeit-Picker im Stil der Nextcloud-Terminfindung.
//
// Wert: ISO-UTC-String des gewählten Slots (z. B. "2026-05-12T09:30:00.000Z").

import { useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { FormField } from '../../types/schema';
import { FieldWrapper } from './FieldWrapper';
import { getNestedError } from './utils';

interface Slot {
  start: string;
  end: string;
  calendarId: string;
}

interface SlotsResponse {
  calendarId: string;
  calendarLabel: string;
  timezone: string;
  slots: Slot[];
}

interface CalendarOption {
  id: string;
  label: string;
}

interface Props {
  field: FormField;
  prefix?: string;
}

export function CalendarField({ field, prefix }: Props) {
  const { register, setValue, control, formState: { errors } } = useFormContext();
  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const error = getNestedError(errors, name);
  const currentValue = useWatch({ control, name }) as string | undefined;

  const props = (field as unknown as {
    slotsUrl?: string;
    calendarsUrl?: string;
    calendarId?: string;
    label?: string;
  });
  const slotsUrl = props.slotsUrl || '/api/plugins/webdav-calendar/slots';
  const calendarsUrl = props.calendarsUrl || '/api/plugins/webdav-calendar/calendars';

  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [calendarId, setCalendarId] = useState<string>(props.calendarId || 'default');
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Make the field part of the form's value graph (without rendering an input).
  // We register it so the form picks up validation + value, then write via setValue.
  useEffect(() => {
    register(name, { required: field.required ? 'Bitte einen Termin auswählen' : false });
  }, [register, name, field.required]);

  // Load calendar list once.
  useEffect(() => {
    let cancelled = false;
    fetch(calendarsUrl)
      .then((r) => (r.ok ? r.json() : []))
      .then((items: CalendarOption[]) => {
        if (cancelled) return;
        setCalendars(Array.isArray(items) ? items : []);
      })
      .catch(() => { if (!cancelled) setCalendars([]); });
    return () => { cancelled = true; };
  }, [calendarsUrl]);

  // Load slots whenever the calendar choice changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const url = `${slotsUrl}?calendarId=${encodeURIComponent(calendarId)}`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `Fehler ${r.status}`);
        }
        return r.json() as Promise<SlotsResponse>;
      })
      .then((response) => {
        if (cancelled) return;
        setData(response);
        // Default-Auswahl: erster Tag mit Slots
        const first = response.slots[0];
        if (first) setSelectedDate(localDay(first.start, response.timezone));
        else setSelectedDate(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoadError(err.message);
        setData(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slotsUrl, calendarId]);

  const slotsByDay = useMemo(() => {
    if (!data) return new Map<string, Slot[]>();
    const tz = data.timezone;
    const map = new Map<string, Slot[]>();
    for (const s of data.slots) {
      const d = localDay(s.start, tz);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(s);
    }
    return map;
  }, [data]);

  const days = useMemo(() => Array.from(slotsByDay.keys()), [slotsByDay]);

  function pickSlot(slot: Slot) {
    setValue(name, slot.start, { shouldValidate: true, shouldDirty: true });
  }

  return (
    <FieldWrapper
      label={field.label || props.label || 'Termin auswählen'}
      required={field.required}
      helpText={field.helpText}
      error={error?.message as string}
    >
      <div className="space-y-3">
        {calendars.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Kalender</label>
            <select
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              value={calendarId}
              onChange={(e) => {
                setCalendarId(e.target.value);
                setValue(name, '', { shouldValidate: false });
              }}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        {loading && <p className="text-xs text-gray-500">Verfügbare Termine werden geladen…</p>}
        {loadError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {loadError}
          </p>
        )}

        {!loading && !loadError && data && days.length === 0 && (
          <p className="text-sm text-gray-500">Aktuell keine Termine verfügbar.</p>
        )}

        {!loading && !loadError && data && days.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <p className="text-xs font-medium text-gray-700 mb-2">Verfügbare Tage</p>
              <div className="flex md:flex-col flex-wrap gap-1 max-h-72 md:max-h-96 overflow-y-auto pr-1">
                {days.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDate(d)}
                    className={`text-left px-2 py-1.5 rounded text-sm border transition-colors ${
                      selectedDate === d
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <span className="block font-medium">{formatDayLabel(d, data.timezone)}</span>
                    <span className="block text-[11px] opacity-75">
                      {slotsByDay.get(d)!.length} freie Slots
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs font-medium text-gray-700 mb-2">
                Verfügbare Uhrzeiten {selectedDate ? `am ${formatDayLabel(selectedDate, data.timezone)}` : ''}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 max-h-72 md:max-h-96 overflow-y-auto pr-1">
                {(selectedDate ? slotsByDay.get(selectedDate) ?? [] : []).map((slot) => {
                  const isSelected = currentValue === slot.start;
                  return (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => pickSlot(slot)}
                      className={`px-2 py-1.5 rounded text-sm border transition-colors ${
                        isSelected
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white border-gray-200 hover:border-primary hover:text-primary'
                      }`}
                    >
                      {formatTime(slot.start, data.timezone)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {currentValue && data && (
          <div className="text-xs text-gray-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
            Ausgewählt: <strong>{formatFull(currentValue, data.timezone)}</strong>{' '}
            <button
              type="button"
              className="ml-2 underline text-emerald-800"
              onClick={() => setValue(name, '', { shouldValidate: true, shouldDirty: true })}
            >
              ändern
            </button>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}

// ---------------------------------------------------------------------------
// Formatter (Browser-Lokale, mit der vom Backend gelieferten Zeitzone)
// ---------------------------------------------------------------------------

function localDay(iso: string, tz: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function formatDayLabel(isoDay: string, tz: string): string {
  // isoDay ist YYYY-MM-DD in tz; um lokal zu formatieren bauen wir Mittag UTC
  // und lassen Intl die Zone anwenden.
  const [y, m, d] = isoDay.split('-').map(Number);
  const ref = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: tz,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(ref);
}

function formatTime(iso: string, tz: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatFull(iso: string, tz: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: tz,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
