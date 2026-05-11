// Generischer Termin-Picker für Plugin-bereitgestellte Kalender-Felder.
//
// Holt freie Slots vom konfigurierten Endpoint (Default:
// /api/plugins/terminfindung/slots), gruppiert sie nach Termin-Typ + Tag und
// zeigt einen kompakten Picker im Stil der Nextcloud-Terminfindung.
//
// Wert: JSON-String mit { start, end, calendarId, slotTypeId, slotTypeLabel }.

import { useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { FormField } from '../../types/schema';
import { FieldWrapper } from './FieldWrapper';
import { getNestedError } from './utils';

interface Slot {
  start: string;
  end: string;
  calendarId: string;
  slotTypeId: string;
  slotTypeLabel: string;
}

interface SlotsResponse {
  timezone: string;
  slots: Slot[];
}

interface SelectedSlot {
  start: string;
  end: string;
  calendarId: string;
  slotTypeId: string;
  slotTypeLabel: string;
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
  const selected = useMemo<SelectedSlot | null>(() => parseSelected(currentValue), [currentValue]);

  const props = (field as unknown as {
    slotsUrl?: string;
    label?: string;
  });
  // Im Vite-Dev läuft das Frontend auf Port 5173, das Backend auf 3001 — also
  // muss der relative Pfad mit VITE_API_URL präfixiert werden, sonst landet
  // der Request beim Vite-Server und der SPA-Fallback antwortet mit HTML
  // (was r.json() dann nicht parsen kann). Im Produktions-Image ist
  // VITE_API_URL leer und der relative Pfad zeigt korrekt auf denselben Origin.
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
  const rawSlotsUrl = props.slotsUrl || '/api/plugins/terminfindung/slots';
  const slotsUrl = rawSlotsUrl.startsWith('/') ? `${apiBase}${rawSlotsUrl}` : rawSlotsUrl;

  const [data, setData] = useState<SlotsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    register(name, { required: field.required ? 'Bitte wählen Sie einen Termin aus.' : false });
  }, [register, name, field.required]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(slotsUrl)
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
        const firstType = response.slots[0]?.slotTypeId ?? null;
        setSelectedTypeId(firstType);
        const firstSlotOfType = response.slots.find((s) => s.slotTypeId === firstType);
        setSelectedDate(firstSlotOfType ? localDay(firstSlotOfType.start, response.timezone) : null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoadError(err.message);
        setData(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slotsUrl]);

  const slotTypes = useMemo(() => {
    if (!data) return [] as Array<{ id: string; label: string; count: number }>;
    const map = new Map<string, { label: string; count: number }>();
    for (const s of data.slots) {
      const existing = map.get(s.slotTypeId);
      if (existing) existing.count += 1;
      else map.set(s.slotTypeId, { label: s.slotTypeLabel, count: 1 });
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, label: v.label, count: v.count }));
  }, [data]);

  const slotsByDay = useMemo(() => {
    if (!data || !selectedTypeId) return new Map<string, Slot[]>();
    const tz = data.timezone;
    const map = new Map<string, Slot[]>();
    for (const s of data.slots) {
      if (s.slotTypeId !== selectedTypeId) continue;
      const d = localDay(s.start, tz);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(s);
    }
    return map;
  }, [data, selectedTypeId]);

  const days = useMemo(() => Array.from(slotsByDay.keys()), [slotsByDay]);

  useEffect(() => {
    if (!data || !selectedTypeId) return;
    if (selectedDate && slotsByDay.has(selectedDate)) return;
    const firstDay = days[0] ?? null;
    setSelectedDate(firstDay);
  }, [data, selectedTypeId, slotsByDay, days, selectedDate]);

  function pickSlot(slot: Slot) {
    const payload: SelectedSlot = {
      start: slot.start,
      end: slot.end,
      calendarId: slot.calendarId,
      slotTypeId: slot.slotTypeId,
      slotTypeLabel: slot.slotTypeLabel,
    };
    setValue(name, JSON.stringify(payload), { shouldValidate: true, shouldDirty: true });
  }

  return (
    <FieldWrapper
      label={field.label || props.label || 'Termin auswählen'}
      required={field.required}
      helpText={field.helpText}
      error={error?.message as string}
    >
      <div className="space-y-3">
        {loading && <p className="text-xs text-gray-500">Verfügbare Termine werden geladen…</p>}
        {loadError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {loadError}
          </p>
        )}

        {!loading && !loadError && data && slotTypes.length === 0 && (
          <p className="text-sm text-gray-500">Aktuell sind keine Termine verfügbar.</p>
        )}

        {!loading && !loadError && data && slotTypes.length > 1 && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Terminart</p>
            <div className="flex flex-wrap gap-1">
              {slotTypes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTypeId(t.id);
                    setSelectedDate(null);
                  }}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    selectedTypeId === t.id
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && !loadError && data && slotTypes.length > 0 && days.length > 0 && (
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
                  const isSelected = selected?.start === slot.start && selected?.slotTypeId === slot.slotTypeId;
                  return (
                    <button
                      key={`${slot.slotTypeId}-${slot.start}`}
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

        {selected && data && (
          <div className="text-xs text-gray-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
            Ausgewählt: <strong>{formatFull(selected.start, data.timezone)}</strong>{' '}
            ({selected.slotTypeLabel})
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

function parseSelected(raw: string | undefined): SelectedSlot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SelectedSlot>;
    if (typeof parsed.start !== 'string' || typeof parsed.end !== 'string') return null;
    return {
      start: parsed.start,
      end: parsed.end,
      calendarId: parsed.calendarId ?? 'default',
      slotTypeId: parsed.slotTypeId ?? '',
      slotTypeLabel: parsed.slotTypeLabel ?? '',
    };
  } catch {
    return null;
  }
}

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
