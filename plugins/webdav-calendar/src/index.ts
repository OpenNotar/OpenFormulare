// WebDAV-Kalender-Plugin für OpenFormulare.
//
// v1.1 fügt einen neuen Feld-Typ "Kalender" hinzu. Das Feld zeigt im Dialog
// einen Termin-Picker, der Slots aus konfigurierbaren Buchungsfenstern
// berechnet und mit dem CalDAV-Server abgleicht (belegte Zeiten werden
// ausgeblendet). Beim Absenden des Dialogs legt der bestehende Hook den
// Termin in dem ausgewählten Kalender an – analog zur Nextcloud-
// Terminfindung.
//
// Aufbau:
//   - Plugin-Settings definieren Standard-Kalender + zusätzliche Kalender.
//   - bookingWindows beschreibt erlaubte Zeitfenster (pro Wochentag, mit
//     optionalem Kalender-Bezug + optionalem Datumsbereich).
//   - /api/plugins/webdav-calendar/slots liefert die freien Slots.
//   - dialog:submitted-Hook erkennt Kalender-Feld(er) in der Schema-Definition
//     und legt für den dort gespeicherten Slot einen Termin an.

import type {
  DialogRecord,
  DialogSubmittedEvent,
  PluginContext,
  PluginModule,
} from '@openformulare/plugin-sdk';

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

interface CalendarProfile {
  id: string;
  label: string;
  url: string;
  username: string;
  password: string;
}

interface BookingWindow {
  weekdays: number[]; // 0=So .. 6=Sa
  from: string; // "HH:mm" in `timezone`
  to: string;
  slotMinutes: number;
  calendarId?: string;
  dateFrom?: string; // "YYYY-MM-DD" inclusive
  dateTo?: string; // "YYYY-MM-DD" inclusive
}

interface PluginConfig {
  calendars: Record<string, CalendarProfile>;
  defaultCalendarId: string;
  timezone: string;
  bookingWindows: BookingWindow[];
  bookingHorizonDays: number;
  minLeadTimeMinutes: number;
  legacy: {
    dateFieldId: string;
    timeFieldId?: string;
  };
  summaryTemplate: string;
}

const DEFAULT_CALENDAR_ID = 'default';

function readConfig(ctx: PluginContext): PluginConfig | null {
  const all = ctx.settings.getAll();
  if (!all.calendarUrl || !all.username || !all.password) {
    ctx.log.warn('WebDAV-Kalender ist nicht vollständig konfiguriert.');
    return null;
  }

  const calendars: Record<string, CalendarProfile> = {
    [DEFAULT_CALENDAR_ID]: {
      id: DEFAULT_CALENDAR_ID,
      label: 'Standard',
      url: all.calendarUrl.endsWith('/') ? all.calendarUrl : `${all.calendarUrl}/`,
      username: all.username,
      password: all.password,
    },
  };

  if (all.calendars) {
    try {
      const parsed = JSON.parse(all.calendars) as Array<Partial<CalendarProfile>>;
      for (const c of parsed) {
        if (!c.id || !c.url || !c.username || !c.password) continue;
        calendars[c.id] = {
          id: c.id,
          label: c.label || c.id,
          url: c.url.endsWith('/') ? c.url : `${c.url}/`,
          username: c.username,
          password: c.password,
        };
      }
    } catch (err) {
      ctx.log.warn('Konnte zusätzliche Kalender (Setting "calendars") nicht parsen', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let bookingWindows: BookingWindow[] = [];
  if (all.bookingWindows) {
    try {
      const parsed = JSON.parse(all.bookingWindows) as Array<Partial<BookingWindow>>;
      bookingWindows = parsed
        .filter(
          (w) =>
            Array.isArray(w.weekdays) &&
            typeof w.from === 'string' &&
            typeof w.to === 'string' &&
            typeof w.slotMinutes === 'number',
        )
        .map((w) => ({
          weekdays: w.weekdays as number[],
          from: w.from as string,
          to: w.to as string,
          slotMinutes: w.slotMinutes as number,
          calendarId: w.calendarId,
          dateFrom: w.dateFrom,
          dateTo: w.dateTo,
        }));
    } catch (err) {
      ctx.log.warn('Konnte Buchungsfenster nicht parsen', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (bookingWindows.length === 0) {
    bookingWindows = [
      { weekdays: [1, 2, 3, 4, 5], from: '09:00', to: '17:00', slotMinutes: 30 },
    ];
  }

  return {
    calendars,
    defaultCalendarId: DEFAULT_CALENDAR_ID,
    timezone: all.timezone || 'Europe/Berlin',
    bookingWindows,
    bookingHorizonDays: Number(all.bookingHorizonDays ?? '60') || 60,
    minLeadTimeMinutes: Number(all.minLeadTimeMinutes ?? '60') || 60,
    legacy: {
      dateFieldId: all.dateFieldId || 'termin_datum',
      timeFieldId: all.timeFieldId || undefined,
    },
    summaryTemplate: all.summaryTemplate || 'Termin: {dialogTitle}',
  };
}

// ---------------------------------------------------------------------------
// Zeitzonen-Helfer (wandelt "lokale Wanduhrzeit in TZ" → UTC-Instant um)
// ---------------------------------------------------------------------------

function parseHHMM(s: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

// Wandelt eine Wanduhrzeit (year/month/day/h/m) in der angegebenen IANA-
// Zeitzone in einen UTC-Date-Wert um. Funktioniert ohne externe Library:
// wir berechnen den Offset, indem wir Intl.DateTimeFormat das gleiche
// Wanduhr-Datum für UTC formatieren lassen und die Differenz auswerten.
function localTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string,
): Date {
  const utcGuess = Date.UTC(year, monthIndex, day, hours, minutes, 0);
  // Was zeigt utcGuess in der Ziel-Zeitzone als Wanduhr an?
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(utcGuess));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const localUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) === 24 ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  const offset = utcGuess - localUtc;
  return new Date(utcGuess + offset);
}

// Liefert den Wochentag (0=So..6=Sa) für ein Datum in einer Zeitzone.
function weekdayInTimezone(d: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[fmt.format(d)] ?? d.getUTCDay();
}

// Liefert das ISO-Datum (YYYY-MM-DD) eines Date-Wertes in der gegebenen
// Zeitzone.
function localDateString(d: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
}

// ---------------------------------------------------------------------------
// CalDAV REPORT für freie/belegte Zeiten
// ---------------------------------------------------------------------------

function basicAuth(profile: CalendarProfile): string {
  return Buffer.from(`${profile.username}:${profile.password}`).toString('base64');
}

function caldavTime(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

interface BusyInterval {
  start: Date;
  end: Date;
}

async function fetchBusy(
  profile: CalendarProfile,
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-data />
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${caldavTime(from)}" end="${caldavTime(to)}" />
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

  const r = await fetch(profile.url, {
    method: 'REPORT',
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1',
      Authorization: `Basic ${basicAuth(profile)}`,
    },
    body,
  });
  if (!r.ok) {
    throw new Error(`CalDAV REPORT failed: ${r.status} ${r.statusText}`);
  }
  const xml = await r.text();
  return extractBusyFromMultistatus(xml);
}

function extractBusyFromMultistatus(xml: string): BusyInterval[] {
  // Wir parsen das XML simpel: ziehen alle <calendar-data>-Blöcke und
  // suchen darin VEVENT-Komponenten.
  const intervals: BusyInterval[] = [];
  const calDataRe = /<[^:>]*:?calendar-data[^>]*>([\s\S]*?)<\/[^:>]*:?calendar-data>/g;
  let match: RegExpExecArray | null;
  while ((match = calDataRe.exec(xml))) {
    const ics = decodeXmlEntities(match[1]);
    intervals.push(...parseVEvents(ics));
  }
  return intervals;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function unfoldIcal(text: string): string {
  // RFC 5545: lange Zeilen werden mit \r\n + Whitespace fortgesetzt.
  return text.replace(/\r?\n[ \t]/g, '');
}

function parseVEvents(ics: string): BusyInterval[] {
  const text = unfoldIcal(ics);
  const events: BusyInterval[] = [];
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  for (const block of blocks) {
    const end = block.indexOf('END:VEVENT');
    const body = end >= 0 ? block.slice(0, end) : block;
    const dtstart = parseICalDate(body, 'DTSTART');
    const dtend = parseICalDate(body, 'DTEND');
    if (!dtstart || !dtend) continue;
    events.push({ start: dtstart, end: dtend });
  }
  return events;
}

function parseICalDate(body: string, prop: string): Date | null {
  const re = new RegExp(`${prop}[^:\\r\\n]*:([^\\r\\n]+)`);
  const m = re.exec(body);
  if (!m) return null;
  const raw = m[1].trim();
  // YYYYMMDDTHHmmssZ
  const utc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw);
  if (utc) {
    return new Date(
      Date.UTC(+utc[1], +utc[2] - 1, +utc[3], +utc[4], +utc[5], +utc[6]),
    );
  }
  // YYYYMMDDTHHmmss (floating, treat as UTC for our overlap check)
  const local = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(raw);
  if (local) {
    return new Date(
      Date.UTC(+local[1], +local[2] - 1, +local[3], +local[4], +local[5], +local[6]),
    );
  }
  // YYYYMMDD (all-day) → start of day UTC
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (dateOnly) {
    return new Date(Date.UTC(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Slot-Berechnung
// ---------------------------------------------------------------------------

interface FreeSlot {
  start: string; // ISO UTC
  end: string;
  calendarId: string;
}

function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start < b.end && b.start < a.end;
}

function computeSlots(
  cfg: PluginConfig,
  calendarId: string,
  from: Date,
  to: Date,
  busy: BusyInterval[],
): FreeSlot[] {
  const slots: FreeSlot[] = [];
  const now = new Date();
  const minStart = new Date(now.getTime() + cfg.minLeadTimeMinutes * 60_000);
  const tz = cfg.timezone;

  // Iteriere Tag für Tag (Datums-String in TZ, damit DST nicht reinpfuscht).
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= to) {
    const dateStr = localDateString(cursor, tz);
    const weekday = weekdayInTimezone(cursor, tz);
    for (const win of cfg.bookingWindows) {
      if (win.calendarId && win.calendarId !== calendarId) continue;
      if (!win.weekdays.includes(weekday)) continue;
      if (win.dateFrom && dateStr < win.dateFrom) continue;
      if (win.dateTo && dateStr > win.dateTo) continue;
      const fromTime = parseHHMM(win.from);
      const toTime = parseHHMM(win.to);
      if (!fromTime || !toTime) continue;
      const [year, month, day] = dateStr.split('-').map(Number);
      let slotStart = localTimeToUtc(year, month - 1, day, fromTime.h, fromTime.m, tz);
      const winEnd = localTimeToUtc(year, month - 1, day, toTime.h, toTime.m, tz);
      const stepMs = win.slotMinutes * 60_000;
      while (slotStart.getTime() + stepMs <= winEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + stepMs);
        if (slotStart < minStart) {
          slotStart = new Date(slotStart.getTime() + stepMs);
          continue;
        }
        const conflict = busy.some((b) => overlaps({ start: slotStart, end: slotEnd }, b));
        if (!conflict) {
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            calendarId,
          });
        }
        slotStart = new Date(slotStart.getTime() + stepMs);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return slots;
}

// ---------------------------------------------------------------------------
// iCal-Erzeugung + Upload
// ---------------------------------------------------------------------------

function escapeIcal(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function buildICal(opts: {
  uid: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
}): string {
  const dtstamp = caldavTime(new Date());
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpenFormulare//WebDAV Calendar Plugin//DE',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${caldavTime(opts.start)}`,
    `DTEND:${caldavTime(opts.end)}`,
    `SUMMARY:${escapeIcal(opts.summary)}`,
    `DESCRIPTION:${escapeIcal(opts.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

async function uploadEvent(profile: CalendarProfile, uid: string, ical: string): Promise<void> {
  const url = `${profile.url}${encodeURIComponent(uid)}.ics`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'If-None-Match': '*',
      Authorization: `Basic ${basicAuth(profile)}`,
    },
    body: ical,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`CalDAV PUT failed: ${r.status} ${r.statusText} – ${body.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Schema-Walker: findet Kalender-Felder im Dialog
// ---------------------------------------------------------------------------

interface CalendarFieldRef {
  fieldId: string;
  calendarId: string;
}

function findCalendarFields(dialog: DialogRecord, defaultCalendarId: string): CalendarFieldRef[] {
  const refs: CalendarFieldRef[] = [];
  const steps = (dialog as unknown as {
    steps?: Array<{ fields?: Array<Record<string, unknown>> }>;
  }).steps;
  if (!Array.isArray(steps)) return refs;
  for (const step of steps) {
    if (!step?.fields) continue;
    walkFields(step.fields, refs, defaultCalendarId);
  }
  return refs;
}

function walkFields(
  fields: Array<Record<string, unknown>>,
  out: CalendarFieldRef[],
  defaultCalendarId: string,
): void {
  for (const f of fields) {
    if (typeof f.id !== 'string') continue;
    if (f.type === 'webdav-calendar' || f.type === 'calendar') {
      const calendarId = typeof f.calendarId === 'string' ? f.calendarId : defaultCalendarId;
      out.push({ fieldId: f.id, calendarId });
    }
    if (Array.isArray(f.fields)) {
      walkFields(f.fields as Array<Record<string, unknown>>, out, defaultCalendarId);
    }
  }
}

// ---------------------------------------------------------------------------
// Hook: Termin anlegen, wenn Dialog abgeschickt wurde
// ---------------------------------------------------------------------------

async function handleSubmission(event: DialogSubmittedEvent, ctx: PluginContext): Promise<void> {
  const cfg = readConfig(ctx);
  if (!cfg) return;

  // Pfad 1: Dialog enthält ein Kalender-Feld → nutze den Slot direkt.
  const calendarFields = findCalendarFields(event.dialog, cfg.defaultCalendarId);
  if (calendarFields.length > 0) {
    for (const ref of calendarFields) {
      const raw = event.submission[ref.fieldId];
      if (typeof raw !== 'string' || !raw) continue;
      const profile = cfg.calendars[ref.calendarId] ?? cfg.calendars[cfg.defaultCalendarId];
      if (!profile) {
        ctx.log.warn('Unbekannter Kalender im Feld', { calendarId: ref.calendarId });
        continue;
      }
      try {
        const start = new Date(raw);
        if (Number.isNaN(start.getTime())) {
          ctx.log.warn('Ungültiger Slot-Wert', { value: raw });
          continue;
        }
        // Slot-Dauer: bestes Match aus Buchungsfenstern nehmen
        const slotMinutes = bestSlotMinutes(cfg, profile.id, start);
        const end = new Date(start.getTime() + slotMinutes * 60_000);
        const summary = cfg.summaryTemplate
          .replace('{dialogTitle}', event.dialog.title)
          .replace('{dialogId}', event.dialog.id)
          .replace('{participantName}', extractParticipant(event.submission));
        const uid = `openformulare-${event.dialog.id}-${start.getTime()}@openformulare`;
        const ical = buildICal({
          uid,
          summary,
          description: `Buchung über OpenFormulare-Dialog ${event.dialog.id}.`,
          start,
          end,
        });
        await uploadEvent(profile, uid, ical);
        ctx.log.info('CalDAV-Termin angelegt', { uid, summary, calendar: profile.id });
      } catch (err) {
        ctx.log.error('CalDAV-Upload fehlgeschlagen', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return;
  }

  // Pfad 2: Legacy – Datums- und Uhrzeit-Feld im Dialog.
  const dateRaw = event.submission[cfg.legacy.dateFieldId];
  if (typeof dateRaw !== 'string' || !dateRaw) {
    ctx.log.debug('Weder Kalender-Feld noch Legacy-Datum gesetzt – Plugin überspringt diesen Dialog.');
    return;
  }
  const timeRaw = cfg.legacy.timeFieldId
    ? (event.submission[cfg.legacy.timeFieldId] as string | undefined)
    : undefined;
  const parsed = legacyParseDateTime(dateRaw, timeRaw);
  if (!parsed) return;
  const profile = cfg.calendars[cfg.defaultCalendarId];
  if (!profile) return;
  const slotMinutes = bestSlotMinutes(cfg, profile.id, parsed.start);
  const end = parsed.allDay
    ? new Date(parsed.start.getTime() + 24 * 60 * 60_000)
    : new Date(parsed.start.getTime() + slotMinutes * 60_000);
  const uid = `openformulare-${event.dialog.id}-${parsed.start.getTime()}@openformulare`;
  const ical = buildICal({
    uid,
    summary: cfg.summaryTemplate
      .replace('{dialogTitle}', event.dialog.title)
      .replace('{dialogId}', event.dialog.id)
      .replace('{participantName}', extractParticipant(event.submission)),
    description: `Legacy-Buchung über OpenFormulare-Dialog ${event.dialog.id}.`,
    start: parsed.start,
    end,
  });
  try {
    await uploadEvent(profile, uid, ical);
    ctx.log.info('CalDAV-Termin (legacy) angelegt', { uid });
  } catch (err) {
    ctx.log.error('CalDAV-Upload fehlgeschlagen', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function bestSlotMinutes(cfg: PluginConfig, calendarId: string, start: Date): number {
  for (const win of cfg.bookingWindows) {
    if (win.calendarId && win.calendarId !== calendarId) continue;
    return win.slotMinutes;
  }
  return 30;
}

function extractParticipant(submission: Record<string, unknown>): string {
  const candidates = ['name', 'fullName', 'participantName', 'kontakt_name'];
  for (const key of candidates) {
    const v = submission[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function legacyParseDateTime(dateStr: string, timeStr?: string): { start: Date; allDay: boolean } | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!dateMatch) return null;
  const [, y, m, d] = dateMatch;
  if (timeStr) {
    const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr);
    if (tm) {
      return {
        start: new Date(`${y}-${m}-${d}T${pad(Number(tm[1]))}:${tm[2]}:00Z`),
        allDay: false,
      };
    }
  }
  return { start: new Date(`${y}-${m}-${d}T00:00:00Z`), allDay: true };
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

const plugin: PluginModule = {
  id: 'webdav-calendar',

  fieldTypes: [
    {
      id: 'webdav-calendar',
      label: 'Kalender / Termin',
      description:
        'Termin-Auswahl mit Live-Abgleich gegen einen CalDAV-Kalender. Belegte Zeiten werden ausgeblendet.',
      defaultProps: {
        label: 'Termin auswählen',
        slotsUrl: '/api/plugins/webdav-calendar/slots',
        calendarsUrl: '/api/plugins/webdav-calendar/calendars',
        calendarId: 'default',
      },
    },
  ],

  hooks: {
    'dialog:submitted': handleSubmission,
  },

  routes: (router, ctx) => {
    // GET /calendars – verfügbare Kalender (für Editor / Admin-UI)
    router.get('/calendars', (_req, res) => {
      const cfg = readConfig(ctx);
      if (!cfg) {
        res.status(503).json({ error: 'Plugin nicht konfiguriert' });
        return;
      }
      res.json(
        Object.values(cfg.calendars).map((c) => ({ id: c.id, label: c.label })),
      );
    });

    // GET /slots?calendarId=...&from=...&to=... – freie Slots
    router.get('/slots', async (req, res) => {
      const cfg = readConfig(ctx);
      if (!cfg) {
        res.status(503).json({ error: 'Plugin nicht konfiguriert' });
        return;
      }
      const calendarId = String(req.query.calendarId || cfg.defaultCalendarId);
      const profile = cfg.calendars[calendarId];
      if (!profile) {
        res.status(404).json({ error: `Kalender ${calendarId} unbekannt` });
        return;
      }
      const now = new Date();
      const fromQ = typeof req.query.from === 'string' ? new Date(req.query.from) : now;
      const horizonEnd = new Date(now.getTime() + cfg.bookingHorizonDays * 24 * 60 * 60_000);
      const toQ =
        typeof req.query.to === 'string' && req.query.to ? new Date(req.query.to) : horizonEnd;
      if (Number.isNaN(fromQ.getTime()) || Number.isNaN(toQ.getTime())) {
        res.status(400).json({ error: 'Ungültige from/to-Parameter' });
        return;
      }
      const queryFrom = fromQ < now ? now : fromQ;
      const queryTo = toQ > horizonEnd ? horizonEnd : toQ;
      try {
        const busy = await fetchBusy(profile, queryFrom, queryTo);
        const slots = computeSlots(cfg, calendarId, queryFrom, queryTo, busy);
        res.json({
          calendarId,
          calendarLabel: profile.label,
          timezone: cfg.timezone,
          slots,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'CalDAV-Abfrage fehlgeschlagen';
        ctx.log.error('Slot-Abfrage gescheitert', { error: message });
        res.status(502).json({ error: message });
      }
    });

    // POST /test – legt morgen einen Test-Termin an (Smoketest)
    router.post('/test', async (_req, res) => {
      const cfg = readConfig(ctx);
      if (!cfg) {
        res.status(400).json({ error: 'Plugin ist nicht vollständig konfiguriert' });
        return;
      }
      const profile = cfg.calendars[cfg.defaultCalendarId];
      const start = new Date(Date.now() + 24 * 60 * 60_000);
      const end = new Date(start.getTime() + 30 * 60_000);
      const uid = `openformulare-test-${Date.now()}@openformulare`;
      const ical = buildICal({
        uid,
        summary: 'OpenFormulare WebDAV-Test',
        description: 'Test-Termin, ausgelöst über /api/plugins/webdav-calendar/test.',
        start,
        end,
      });
      try {
        await uploadEvent(profile, uid, ical);
        res.json({ ok: true, uid });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'CalDAV-Upload fehlgeschlagen';
        res.status(500).json({ error: message });
      }
    });
  },

  onActivate: (ctx) => {
    ctx.log.info('WebDAV-Kalender-Plugin aktiviert (v1.1 mit Slot-Berechnung)');
  },
  onDeactivate: (ctx) => {
    ctx.log.info('WebDAV-Kalender-Plugin deaktiviert');
  },
};

export default plugin;
