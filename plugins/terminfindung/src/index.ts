// Terminfindung-Plugin für OpenFormulare.
//
// v2 ersetzt das alte JSON-Buchungsfenster durch einen Wochenplan, der pro
// Wochentag mehrere Terminarten erlaubt — jede mit eigener Dauer, Pufferzeit
// und Kalender. Mandanten sehen nur freie Slots, belegte Zeiten und
// Pufferzeiten werden automatisch herausgerechnet. Beim Absenden des Dialogs
// legt der Hook den Termin im passenden CalDAV-Kalender an.
//
// Konfiguration über Admin → Plugins → Terminfindung:
//   - Hauptkalender (URL + Benutzer + Passwort) und optionale Zusatz-Kalender
//   - timezone (IANA)
//   - schedule: { monday: TimeBlock[], … } als JSON-String
//   - bookingHorizonDays, minLeadTimeMinutes
//   - summaryTemplate für den Termin-Titel im Kalender
//
// Öffentliche Routen:
//   GET /api/plugins/terminfindung/slots?from=…&to=…  →  freie Slots
//   POST /api/plugins/terminfindung/test              →  legt einen Test-Termin

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

interface TimeBlock {
  id: string;
  label: string;
  from: string; // "HH:mm"
  to: string;
  durationMinutes: number;
  bufferMinutes: number;
  calendarId: string;
}

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const DAY_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
// 0 = Sonntag, 1 = Montag, …, 6 = Samstag (entspricht Date.getDay()).
const DAY_TO_WEEKDAY: Record<DayKey, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

type WeeklySchedule = Record<DayKey, TimeBlock[]>;

interface PluginConfig {
  calendars: Record<string, CalendarProfile>;
  defaultCalendarId: string;
  timezone: string;
  schedule: WeeklySchedule;
  bookingHorizonDays: number;
  minLeadTimeMinutes: number;
  summaryTemplate: string;
}

const DEFAULT_CALENDAR_ID = 'default';

function emptySchedule(): WeeklySchedule {
  return {
    monday: [], tuesday: [], wednesday: [], thursday: [],
    friday: [], saturday: [], sunday: [],
  };
}

function readConfig(ctx: PluginContext): PluginConfig | null {
  const all = ctx.settings.getAll();
  if (!all.calendarUrl || !all.username || !all.password) {
    ctx.log.warn('Terminfindung ist nicht vollständig konfiguriert.');
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
      ctx.log.warn('Konnte zusätzliche Kalender (Setting "calendars") nicht parsen.', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let schedule: WeeklySchedule = emptySchedule();
  if (all.schedule) {
    try {
      const parsed = JSON.parse(all.schedule) as Record<string, unknown>;
      for (const day of DAY_KEYS) {
        const blocks = parsed[day];
        if (Array.isArray(blocks)) {
          schedule[day] = (blocks as Array<Record<string, unknown>>)
            .filter((b) => !!b && typeof b === 'object')
            .map((b, idx) => ({
              id: typeof b.id === 'string' && b.id ? b.id : `${day}-${idx}`,
              label: typeof b.label === 'string' && b.label ? b.label : 'Termin',
              from: typeof b.from === 'string' ? b.from : '09:00',
              to: typeof b.to === 'string' ? b.to : '17:00',
              durationMinutes: Number(b.durationMinutes) > 0 ? Number(b.durationMinutes) : 30,
              bufferMinutes: Number(b.bufferMinutes) >= 0 ? Number(b.bufferMinutes) : 0,
              calendarId: typeof b.calendarId === 'string' && b.calendarId
                ? b.calendarId
                : DEFAULT_CALENDAR_ID,
            }))
            .filter((b) => parseHHMM(b.from) && parseHHMM(b.to));
        }
      }
    } catch (err) {
      ctx.log.warn('Konnte Wochenplan (Setting "schedule") nicht parsen.', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    calendars,
    defaultCalendarId: DEFAULT_CALENDAR_ID,
    timezone: all.timezone || 'Europe/Berlin',
    schedule,
    bookingHorizonDays: Number(all.bookingHorizonDays ?? '60') || 60,
    minLeadTimeMinutes: Number(all.minLeadTimeMinutes ?? '60') || 60,
    summaryTemplate: all.summaryTemplate || 'Termin: {dialogTitle}',
  };
}

// ---------------------------------------------------------------------------
// Zeitzonen-Helfer
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
// Zeitzone in einen UTC-Date-Wert um.
function localTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string,
): Date {
  const utcGuess = Date.UTC(year, monthIndex, day, hours, minutes, 0);
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

function weekdayInTimezone(d: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[fmt.format(d)] ?? d.getUTCDay();
}

function localDateString(d: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
}

function dayKeyForWeekday(weekday: number): DayKey | null {
  for (const day of DAY_KEYS) {
    if (DAY_TO_WEEKDAY[day] === weekday) return day;
  }
  return null;
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

// Setze TERMINFINDUNG_DEBUG=1 als ENV, um das rohe CalDAV-REPORT-Response
// inklusive geparster Busy-Intervalle ins Log zu schreiben. Hilfreich, wenn
// ein CalDAV-Server iCal/XML in unerwartetem Format liefert.
const DEBUG_DUMP = process.env.TERMINFINDUNG_DEBUG === '1';

async function fetchBusy(
  profile: CalendarProfile,
  from: Date,
  to: Date,
  fallbackTimezone: string,
): Promise<BusyInterval[]> {
  // <C:expand> lässt den CalDAV-Server wiederkehrende Termine (RRULE) auf
  // einzelne Instanzen im angefragten Zeitraum auflösen. Ohne expand würden
  // wir nur die Master-Instanz erhalten — alle weiteren Vorkommnisse eines
  // täglichen/wöchentlichen Blockers wären unsichtbar für die Slot-Berechnung
  // und damit fälschlich „frei". RFC 4791, §9.6.5: expandierte VEVENTs werden
  // mit UTC-Zeitstempeln zurückgeliefert.
  const body = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-data>
      <C:expand start="${caldavTime(from)}" end="${caldavTime(to)}" />
    </C:calendar-data>
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
  if (DEBUG_DUMP) {
    console.log('[terminfindung-debug] CalDAV REPORT response status', r.status);
    console.log('[terminfindung-debug] body (first 4000 chars):\n' + xml.slice(0, 4000));
  }
  const busy = extractBusyFromMultistatus(xml, fallbackTimezone);
  if (DEBUG_DUMP) {
    console.log('[terminfindung-debug] parsed busy intervals:',
      busy.map((b) => `${b.start.toISOString()} → ${b.end.toISOString()}`));
  }
  return busy;
}

function extractBusyFromMultistatus(xml: string, fallbackTimezone: string): BusyInterval[] {
  const intervals: BusyInterval[] = [];
  const calDataRe = /<[^:>]*:?calendar-data[^>]*>([\s\S]*?)<\/[^:>]*:?calendar-data>/g;
  let match: RegExpExecArray | null;
  while ((match = calDataRe.exec(xml))) {
    const ics = decodeXmlEntities(match[1]);
    intervals.push(...parseVEvents(ics, fallbackTimezone));
  }
  return intervals;
}

function decodeXmlEntities(s: string): string {
  // Reihenfolge ist wichtig: numerische Referenzen (auch hex) zuerst, dann
  // benannte Entities, &amp; ganz zum Schluss (sonst würden doppelt encodierte
  // Sequenzen wie &amp;lt; falsch aufgelöst).
  // Nextcloud-Sabre liefert ICS in <calendar-data> z. B. mit `&#13;` (CR) als
  // Zeilenende — ohne diese Decodierung scheitert der iCal-Parser an „rauschen"
  // hinter Property-Werten wie `DTSTART:20260518T110000Z&#13;`.
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function unfoldIcal(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '');
}

function parseVEvents(ics: string, fallbackTimezone: string): BusyInterval[] {
  const text = unfoldIcal(ics);
  const events: BusyInterval[] = [];
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  for (const block of blocks) {
    const end = block.indexOf('END:VEVENT');
    const body = end >= 0 ? block.slice(0, end) : block;
    const dtstart = parseICalDate(body, 'DTSTART', fallbackTimezone);
    const dtend = parseICalDate(body, 'DTEND', fallbackTimezone);
    if (!dtstart || !dtend) continue;
    events.push({ start: dtstart, end: dtend });
  }
  return events;
}

// Mapping verbreiteter Windows-Zeitzonen-IDs (Outlook/Exchange schreiben diese
// statt der IANA-Namen) auf ihre IANA-Entsprechungen. Wir mappen nur die
// europäischen + Welt-Hauptzonen, die in Notariats-Kalendern realistisch
// vorkommen. Unbekannte TZIDs fallen sauber auf die Plugin-Zeitzone zurück.
const WINDOWS_TZ_MAP: Record<string, string> = {
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Kiev',
  'GTB Standard Time': 'Europe/Bucharest',
  'Russian Standard Time': 'Europe/Moscow',
  'UTC': 'UTC',
};

function resolveTzid(tzid: string): string | null {
  const trimmed = tzid.trim();
  // Erst probieren: ist es bereits ein gültiger IANA-Name (Intl akzeptiert ihn)?
  try {
    // Konstruktor wirft bei unbekannter timeZone.
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return trimmed;
  } catch {
    /* fall through */
  }
  const mapped = WINDOWS_TZ_MAP[trimmed];
  if (mapped) return mapped;
  return null;
}

function parseICalDate(body: string, prop: string, fallbackTimezone: string): Date | null {
  // Properties können Parameter tragen: `DTSTART;TZID=Europe/Berlin:20260518T110000`.
  // Wir matchen Property → optionale Params → ":" → Value.
  const re = new RegExp(`${prop}([^:\\r\\n]*):([^\\r\\n]+)`);
  const m = re.exec(body);
  if (!m) return null;
  const params = m[1];
  const raw = m[2].trim();
  const tzidMatch = /TZID=([^;:]+)/.exec(params);
  const tzid = tzidMatch ? tzidMatch[1].trim() : null;

  // YYYYMMDDTHHmmssZ → UTC.
  const utc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw);
  if (utc) {
    return new Date(Date.UTC(+utc[1], +utc[2] - 1, +utc[3], +utc[4], +utc[5], +utc[6]));
  }
  // YYYYMMDDTHHmmss: entweder mit TZID-Param (zonenbehaftet) oder „floating".
  // Floating-Datetimes interpretieren wir in der vom Plugin konfigurierten
  // Zeitzone — das spiegelt die übliche Erwartung wider, dass Kalendereinträge
  // ohne TZID „lokal" sind. Windows-TZIDs (z. B. „W. Europe Standard Time")
  // werden über WINDOWS_TZ_MAP auf IANA übersetzt; unbekannte TZIDs fallen
  // auf die Plugin-Zeitzone zurück, statt den ganzen Slots-Request scheitern
  // zu lassen.
  const local = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(raw);
  if (local) {
    const tz = (tzid && resolveTzid(tzid)) || fallbackTimezone;
    return localTimeToUtc(+local[1], +local[2] - 1, +local[3], +local[4], +local[5], tz);
  }
  // YYYYMMDD → All-day. Behandeln wir als Mitternacht-UTC; reicht für
  // Overlap-Checks gegen zeitgebundene Slots an einem anderen Tag.
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
  slotTypeId: string;
  slotTypeLabel: string;
}

function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start < b.end && b.start < a.end;
}

interface BusyByCalendar {
  [calendarId: string]: BusyInterval[];
}

function computeSlots(
  cfg: PluginConfig,
  from: Date,
  to: Date,
  busyByCalendar: BusyByCalendar,
): FreeSlot[] {
  const slots: FreeSlot[] = [];
  const now = new Date();
  const minStart = new Date(now.getTime() + cfg.minLeadTimeMinutes * 60_000);
  const tz = cfg.timezone;

  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= to) {
    const dateStr = localDateString(cursor, tz);
    const weekday = weekdayInTimezone(cursor, tz);
    const dayKey = dayKeyForWeekday(weekday);
    if (!dayKey) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      continue;
    }
    const dayBlocks = cfg.schedule[dayKey];
    for (const block of dayBlocks) {
      const fromTime = parseHHMM(block.from);
      const toTime = parseHHMM(block.to);
      if (!fromTime || !toTime) continue;
      const [year, month, day] = dateStr.split('-').map(Number);
      const winStart = localTimeToUtc(year, month - 1, day, fromTime.h, fromTime.m, tz);
      const winEnd = localTimeToUtc(year, month - 1, day, toTime.h, toTime.m, tz);
      const stepMs = block.durationMinutes * 60_000;
      const bufferMs = block.bufferMinutes * 60_000;
      const calendarId = cfg.calendars[block.calendarId] ? block.calendarId : cfg.defaultCalendarId;
      const busy = busyByCalendar[calendarId] ?? [];

      let slotStart = new Date(winStart.getTime());
      while (slotStart.getTime() + stepMs <= winEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + stepMs);
        if (slotStart >= minStart && slotStart >= from && slotEnd <= to) {
          // Pufferzeit anwenden: ein Slot ist nur frei, wenn das Intervall
          // [start - buffer, end + buffer] keinen belegten Termin schneidet.
          const guardedStart = new Date(slotStart.getTime() - bufferMs);
          const guardedEnd = new Date(slotEnd.getTime() + bufferMs);
          const conflict = busy.some((b) => overlaps({ start: guardedStart, end: guardedEnd }, b));
          if (!conflict) {
            slots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              calendarId,
              slotTypeId: block.id,
              slotTypeLabel: block.label,
            });
          }
        }
        slotStart = new Date(slotStart.getTime() + stepMs);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  slots.sort((a, b) => a.start.localeCompare(b.start));
  return slots;
}

// Sammelt für die Berechnung alle Kalender, die im konfigurierten Wochenplan
// vorkommen — wir fragen jeden CalDAV-Server nur einmal pro Zeitfenster ab.
function calendarsUsedInRange(cfg: PluginConfig, from: Date, to: Date): string[] {
  const used = new Set<string>();
  const tz = cfg.timezone;
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= to) {
    const weekday = weekdayInTimezone(cursor, tz);
    const dayKey = dayKeyForWeekday(weekday);
    if (dayKey) {
      for (const block of cfg.schedule[dayKey]) {
        const id = cfg.calendars[block.calendarId] ? block.calendarId : cfg.defaultCalendarId;
        used.add(id);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Array.from(used);
}

// ---------------------------------------------------------------------------
// CalDAV-Discovery (Verbindung testen + Kalender finden)
// ---------------------------------------------------------------------------

interface DiscoveredCalendar {
  url: string;
  displayName: string;
  color?: string;
  supportsEvents: boolean;
}

interface DiscoveryInput {
  url: string;
  username: string;
  password: string;
}

interface DiscoveryResult {
  ok: true;
  calendars: DiscoveredCalendar[];
  warnings: string[];
}

function ensureTrailingSlash(u: string): string {
  return u.endsWith('/') ? u : `${u}/`;
}

function resolveHref(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

async function propfind(
  url: string,
  depth: '0' | '1',
  username: string,
  password: string,
  body: string,
): Promise<{ status: number; statusText: string; xml: string }> {
  const r = await fetch(url, {
    method: 'PROPFIND',
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: depth,
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    },
    body,
  });
  const xml = await r.text();
  return { status: r.status, statusText: r.statusText, xml };
}

const PROPFIND_BASIC = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:I="http://apple.com/ns/ical/">
  <D:prop>
    <D:resourcetype/>
    <D:displayname/>
    <D:current-user-principal/>
    <C:calendar-home-set/>
    <C:supported-calendar-component-set/>
    <I:calendar-color/>
  </D:prop>
</D:propfind>`;

const PROPFIND_PRINCIPAL = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal/>
  </D:prop>
</D:propfind>`;

const PROPFIND_HOMESET = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set/>
  </D:prop>
</D:propfind>`;

// Splits a DAV multistatus into its individual <response> blocks (whitespace
// and namespace prefixes tolerated). We parse with regex on purpose: pulling
// in a full XML parser bloats the plugin bundle for a one-shot discovery flow.
function splitResponses(xml: string): string[] {
  const out: string[] = [];
  const re = /<[^:>]*:?response[\s>][\s\S]*?<\/[^:>]*:?response>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[0]);
  return out;
}

function getHref(block: string): string | null {
  const m = /<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/.exec(block);
  return m ? m[1].trim() : null;
}

function getDisplayName(block: string): string | null {
  const m = /<[^:>]*:?displayname[^>]*>([\s\S]*?)<\/[^:>]*:?displayname>/.exec(block);
  return m ? decodeXmlEntities(m[1]).trim() : null;
}

function getColor(block: string): string | null {
  const m = /<[^:>]*:?calendar-color[^>]*>([\s\S]*?)<\/[^:>]*:?calendar-color>/.exec(block);
  return m ? m[1].trim() : null;
}

function isCalendarResource(block: string): boolean {
  return /<[^:>]*:?calendar[\s/>]/.test(
    (/<[^:>]*:?resourcetype[^>]*>([\s\S]*?)<\/[^:>]*:?resourcetype>/.exec(block) || ['', ''])[1],
  );
}

function supportsVEvents(block: string): boolean {
  const set = /<[^:>]*:?supported-calendar-component-set[^>]*>([\s\S]*?)<\/[^:>]*:?supported-calendar-component-set>/.exec(block);
  if (!set) return true; // assume yes if server didn't tell us
  return /name="VEVENT"/i.test(set[1]);
}

function extractInnerHref(xml: string, tagLocalName: string): string | null {
  // Find <…:tagLocalName>…<…:href>...</…:href>…</…:tagLocalName>.
  const tagRe = new RegExp(
    `<[^:>]*:?${tagLocalName}[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tagLocalName}>`,
  );
  const m = tagRe.exec(xml);
  if (!m) return null;
  const inner = m[1];
  const href = /<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/.exec(inner);
  return href ? href[1].trim() : null;
}

function calendarsFromMultistatus(xml: string, baseUrl: string): DiscoveredCalendar[] {
  const out: DiscoveredCalendar[] = [];
  const seen = new Set<string>();
  for (const block of splitResponses(xml)) {
    if (!isCalendarResource(block)) continue;
    if (!supportsVEvents(block)) continue;
    const href = getHref(block);
    if (!href) continue;
    const abs = ensureTrailingSlash(resolveHref(href, baseUrl));
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({
      url: abs,
      displayName: getDisplayName(block) || abs,
      color: getColor(block) || undefined,
      supportsEvents: true,
    });
  }
  return out;
}

async function discoverCalendars(input: DiscoveryInput): Promise<DiscoveryResult> {
  const { username, password } = input;
  const warnings: string[] = [];
  const rootUrl = ensureTrailingSlash(input.url.trim());

  // Strategy A: direct listing.
  const direct = await propfind(rootUrl, '1', username, password, PROPFIND_BASIC);
  if (direct.status === 401 || direct.status === 403) {
    throw new Error(`Authentifizierung fehlgeschlagen (HTTP ${direct.status}). Bitte prüfen Sie Benutzername und Passwort.`);
  }
  if (direct.status === 404) {
    throw new Error(`Die angegebene URL wurde nicht gefunden (HTTP 404). Bitte prüfen Sie die Adresse.`);
  }
  if (direct.status >= 500) {
    throw new Error(`Der Kalender-Server hat einen Fehler gemeldet (HTTP ${direct.status}). Versuchen Sie es später erneut.`);
  }
  if (direct.status === 207 || direct.status === 200) {
    const cals = calendarsFromMultistatus(direct.xml, rootUrl);
    if (cals.length > 0) return { ok: true, calendars: cals, warnings };
  } else if (direct.status !== 405) {
    // Some servers return 405 Method Not Allowed at certain levels; treat as
    // "try discovery instead". For anything else surface the status.
    warnings.push(`PROPFIND auf ${rootUrl} lieferte HTTP ${direct.status}.`);
  }

  // Strategy B: principal discovery.
  const principalRes = direct.status === 207 || direct.status === 200
    ? direct
    : await propfind(rootUrl, '0', username, password, PROPFIND_PRINCIPAL);
  if (principalRes.status !== 207 && principalRes.status !== 200) {
    throw new Error(`Konnte den Kalender-Server nicht auslesen (HTTP ${principalRes.status} ${principalRes.statusText}).`);
  }
  const principalHref = extractInnerHref(principalRes.xml, 'current-user-principal');
  if (!principalHref) {
    throw new Error('Es wurden keine Kalender gefunden, und der Server lieferte keine Principal-URL für die automatische Erkennung.');
  }
  const principalAbs = resolveHref(principalHref, rootUrl);

  // Strategy C: read calendar-home-set from the principal.
  const homeRes = await propfind(principalAbs, '0', username, password, PROPFIND_HOMESET);
  if (homeRes.status !== 207 && homeRes.status !== 200) {
    throw new Error(`Principal-Abfrage fehlgeschlagen (HTTP ${homeRes.status} ${homeRes.statusText}).`);
  }
  const homeHref = extractInnerHref(homeRes.xml, 'calendar-home-set');
  if (!homeHref) {
    throw new Error('Der Server liefert keine calendar-home-set – es konnten keine Kalender entdeckt werden.');
  }
  const homeAbs = ensureTrailingSlash(resolveHref(homeHref, principalAbs));

  // Strategy D: list calendars under calendar-home-set.
  const listRes = await propfind(homeAbs, '1', username, password, PROPFIND_BASIC);
  if (listRes.status !== 207 && listRes.status !== 200) {
    throw new Error(`Kalender-Liste konnte nicht geladen werden (HTTP ${listRes.status} ${listRes.statusText}).`);
  }
  const cals = calendarsFromMultistatus(listRes.xml, homeAbs);
  if (cals.length === 0) {
    throw new Error('Verbindung erfolgreich, aber unter diesem Konto wurden keine Kalender gefunden.');
  }
  return { ok: true, calendars: cals, warnings };
}

// ---------------------------------------------------------------------------
// iCal-Erzeugung + Upload
// ---------------------------------------------------------------------------

function escapeIcal(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

interface ICalAttendee {
  email: string;
  name?: string;
}

interface ICalOrganizer {
  email: string;
  name?: string;
}

function buildICal(opts: {
  uid: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  // Beim Versand als E-Mail-Anhang nutzen wir METHOD:REQUEST (Mail-Programme
  // erkennen das als Einladung). Beim CalDAV-PUT lassen wir METHOD weg.
  method?: 'REQUEST' | 'PUBLISH' | 'CANCEL';
  organizer?: ICalOrganizer;
  attendees?: ICalAttendee[];
}): string {
  const dtstamp = caldavTime(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpenFormulare//Terminfindung Plugin//DE',
  ];
  if (opts.method) {
    lines.push(`METHOD:${opts.method}`);
  }
  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${opts.uid}`);
  lines.push(`DTSTAMP:${dtstamp}`);
  lines.push(`DTSTART:${caldavTime(opts.start)}`);
  lines.push(`DTEND:${caldavTime(opts.end)}`);
  lines.push(`SUMMARY:${escapeIcal(opts.summary)}`);
  lines.push(`DESCRIPTION:${escapeIcal(opts.description)}`);
  if (opts.organizer) {
    const cn = opts.organizer.name ? `;CN=${escapeIcal(opts.organizer.name)}` : '';
    lines.push(`ORGANIZER${cn}:mailto:${opts.organizer.email}`);
  }
  for (const att of opts.attendees ?? []) {
    const cn = att.name ? `;CN=${escapeIcal(att.name)}` : '';
    lines.push(
      `ATTENDEE${cn};RSVP=TRUE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${att.email}`,
    );
  }
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
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
}

function findCalendarFields(dialog: DialogRecord): CalendarFieldRef[] {
  const refs: CalendarFieldRef[] = [];
  const steps = (dialog as unknown as {
    steps?: Array<{ fields?: Array<Record<string, unknown>> }>;
  }).steps;
  if (!Array.isArray(steps)) return refs;
  for (const step of steps) {
    if (!step?.fields) continue;
    walkFields(step.fields, refs);
  }
  return refs;
}

function walkFields(fields: Array<Record<string, unknown>>, out: CalendarFieldRef[]): void {
  for (const f of fields) {
    if (typeof f.id !== 'string') continue;
    if (f.type === 'terminfindung' || f.type === 'calendar') {
      out.push({ fieldId: f.id });
    }
    if (Array.isArray(f.fields)) {
      walkFields(f.fields as Array<Record<string, unknown>>, out);
    }
  }
}

// ---------------------------------------------------------------------------
// Hook: Termin anlegen, wenn Dialog abgeschickt wurde
// ---------------------------------------------------------------------------

interface SubmittedSlot {
  start: string;
  end: string;
  calendarId: string;
  slotTypeId: string;
  slotTypeLabel: string;
}

function parseSubmittedSlot(raw: unknown): SubmittedSlot | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SubmittedSlot>;
    if (typeof parsed.start !== 'string' || typeof parsed.end !== 'string') return null;
    return {
      start: parsed.start,
      end: parsed.end,
      calendarId: typeof parsed.calendarId === 'string' && parsed.calendarId
        ? parsed.calendarId
        : DEFAULT_CALENDAR_ID,
      slotTypeId: typeof parsed.slotTypeId === 'string' ? parsed.slotTypeId : '',
      slotTypeLabel: typeof parsed.slotTypeLabel === 'string' ? parsed.slotTypeLabel : '',
    };
  } catch {
    return null;
  }
}

async function handleSubmission(event: DialogSubmittedEvent, ctx: PluginContext): Promise<void> {
  const cfg = readConfig(ctx);
  if (!cfg) return;

  const calendarFields = findCalendarFields(event.dialog);
  if (calendarFields.length === 0) {
    ctx.log.debug('Kein Termin-Feld im Dialog – Plugin überspringt diesen Dialog.');
    return;
  }

  const participantName = extractParticipant(event.submission);
  const participantEmail = extractParticipantEmail(event.submission);
  const organizerEmail = ctx.core.getSenderEmail();
  const organizerName = ctx.core.getSenderName() || 'Notariat';

  for (const ref of calendarFields) {
    const slot = parseSubmittedSlot(event.submission[ref.fieldId]);
    if (!slot) continue;
    const profile = cfg.calendars[slot.calendarId] ?? cfg.calendars[cfg.defaultCalendarId];
    if (!profile) {
      ctx.log.warn('Unbekannter Kalender im Termin-Feld', { calendarId: slot.calendarId });
      continue;
    }
    try {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        ctx.log.warn('Ungültiger Slot-Wert', { value: slot });
        continue;
      }
      const summary = cfg.summaryTemplate
        .replace('{dialogTitle}', event.dialog.title)
        .replace('{dialogId}', event.dialog.id)
        .replace('{participantName}', participantName)
        .replace('{slotTypeLabel}', slot.slotTypeLabel);
      const uid = `openformulare-${event.dialog.id}-${start.getTime()}@openformulare`;

      // Attendees + Organizer nur aufnehmen, wenn wir sowohl die Mandanten-
      // Mail als auch eine Absender-Adresse haben — RFC 5545 verlangt einen
      // ORGANIZER, sobald ATTENDEE gesetzt ist.
      const includeAttendees = !!(participantEmail && organizerEmail);
      const attendees: ICalAttendee[] = includeAttendees
        ? [{ email: participantEmail!, name: participantName || undefined }]
        : [];
      const organizer: ICalOrganizer | undefined = includeAttendees
        ? { email: organizerEmail!, name: organizerName }
        : undefined;

      // 1. CalDAV-PUT (ohne METHOD — der Server erhält die "internal" Sicht).
      const calDavIcal = buildICal({
        uid,
        summary,
        description: `Buchung über OpenFormulare-Dialog ${event.dialog.id} (${slot.slotTypeLabel}).`,
        start,
        end,
        organizer,
        attendees,
      });
      await uploadEvent(profile, uid, calDavIcal);
      ctx.log.info('CalDAV-Termin angelegt', { uid, summary, calendar: profile.id });

      // 2. E-Mail-Einladung an den Mandanten — nur wenn alles vorhanden ist
      //    UND der Hauptanwendungs-SMTP konfiguriert ist (sonst wirft sendEmail).
      if (includeAttendees) {
        const invitationIcal = buildICal({
          uid,
          summary,
          description: `Buchung über OpenFormulare-Dialog ${event.dialog.id} (${slot.slotTypeLabel}).`,
          start,
          end,
          method: 'REQUEST',
          organizer,
          attendees,
        });
        try {
          await ctx.core.sendEmail({
            to: participantEmail!,
            subject: `Terminbestätigung: ${summary}`,
            html: buildInvitationHtml({
              summary,
              start,
              end,
              timezone: cfg.timezone,
              organizerName,
              participantName,
              slotTypeLabel: slot.slotTypeLabel,
            }),
            attachments: [
              {
                filename: 'termin.ics',
                content: invitationIcal,
                contentType: 'text/calendar; method=REQUEST; charset=utf-8',
              },
            ],
          });
          ctx.log.info('Termin-Einladung an Mandanten versandt', {
            to: participantEmail,
            uid,
          });
        } catch (err) {
          // Versand-Fehler dürfen den Termin im Kalender nicht zurückrollen.
          ctx.log.error('Termin-Einladung konnte nicht versendet werden', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (participantEmail && !organizerEmail) {
        ctx.log.warn(
          'Keine Absender-Adresse konfiguriert – Termin-Einladung an Mandant nicht möglich.',
          { participantEmail },
        );
      }
    } catch (err) {
      ctx.log.error('CalDAV-Upload fehlgeschlagen', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function extractParticipant(submission: Record<string, unknown>): string {
  const candidates = ['name', 'fullName', 'participantName', 'kontakt_name'];
  for (const key of candidates) {
    const v = submission[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // Fallback: Vor- + Nachname aus den Standard-Kontakt-Feldern.
  const vor = (submission.anfrager_vorname as string | undefined)?.trim();
  const nach = (submission.anfrager_nachname as string | undefined)?.trim();
  const combined = [vor, nach].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  const legacy = (submission.anfrager_name as string | undefined)?.trim();
  return legacy || '';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractParticipantEmail(submission: Record<string, unknown>): string | null {
  // Erst die wahrscheinlichsten Standard-IDs probieren.
  const candidates = [
    'email',
    'kontakt_email',
    'mandant_email',
    'anfrager_email',
    'contactEmail',
    'mail',
  ];
  for (const key of candidates) {
    const v = submission[key];
    if (typeof v === 'string' && EMAIL_RE.test(v.trim())) return v.trim();
  }
  // Heuristik: irgendein Top-Level-Feld, das wie eine E-Mail aussieht und
  // dessen Key „mail" enthält. Macht das Plugin robust gegen abweichende
  // Field-IDs des Kontakt-Steps.
  for (const [key, val] of Object.entries(submission)) {
    if (typeof val !== 'string') continue;
    if (!key.toLowerCase().includes('mail')) continue;
    if (EMAIL_RE.test(val.trim())) return val.trim();
  }
  return null;
}

function buildInvitationHtml(opts: {
  summary: string;
  start: Date;
  end: Date;
  timezone: string;
  organizerName: string;
  participantName: string;
  slotTypeLabel: string;
}): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('de-DE', {
      timeZone: opts.timezone,
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px">
  <p>${opts.participantName ? `Sehr geehrte:r ${escapeHtml(opts.participantName)},` : 'Sehr geehrte Damen und Herren,'}</p>
  <p>vielen Dank für Ihre Anfrage. Wir bestätigen Ihnen hiermit den folgenden Termin:</p>
  <table style="border-collapse:collapse;margin:12px 0">
    <tr><td style="padding:4px 12px 4px 0;color:#666">Termin</td><td style="padding:4px 0"><strong>${fmt(opts.start)} Uhr</strong></td></tr>
    ${opts.slotTypeLabel ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Art</td><td style="padding:4px 0">${escapeHtml(opts.slotTypeLabel)}</td></tr>` : ''}
    <tr><td style="padding:4px 12px 4px 0;color:#666">Mit</td><td style="padding:4px 0">${escapeHtml(opts.organizerName)}</td></tr>
  </table>
  <p>Im Anhang finden Sie eine Kalender-Einladung (.ics), die Sie zu Ihrem Kalender hinzufügen können.</p>
  <p style="color:#888;font-size:12px;margin-top:24px">Sollte der Termin nicht passen, antworten Sie bitte auf diese E-Mail.</p>
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

const plugin: PluginModule = {
  id: 'terminfindung',

  fieldTypes: [
    {
      id: 'terminfindung',
      label: 'Termin / Kalender',
      description:
        'Termin-Auswahl mit Live-Abgleich gegen einen CalDAV-Kalender. Mandanten sehen nur freie Slots; Pufferzeiten und belegte Termine werden automatisch berücksichtigt.',
      defaultProps: {
        label: 'Termin auswählen',
        slotsUrl: '/api/plugins/terminfindung/slots',
      },
      // Wandelt den im Feld gespeicherten Slot-JSON in einen lesbaren Satz für
      // PDF, DOCX und JSON-Anhang. Beispiel: „Montag, 18.05.2026, 11:00–11:30 Uhr – Beurkundung".
      formatValue: (value, _field, ctx) => {
        if (typeof value !== 'string' || !value) return '';
        try {
          const parsed = JSON.parse(value) as {
            start?: string;
            end?: string;
            slotTypeLabel?: string;
          };
          if (typeof parsed.start !== 'string') return String(value);
          const start = new Date(parsed.start);
          const end = typeof parsed.end === 'string' ? new Date(parsed.end) : null;
          if (Number.isNaN(start.getTime())) return String(value);
          const tz = ctx.settings.get<string>('timezone') || 'Europe/Berlin';
          const dateStr = new Intl.DateTimeFormat('de-DE', {
            timeZone: tz,
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }).format(start);
          const timeFmt = new Intl.DateTimeFormat('de-DE', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
          });
          const startTime = timeFmt.format(start);
          const endTime = end && !Number.isNaN(end.getTime()) ? timeFmt.format(end) : null;
          const timeRange = endTime ? `${startTime}–${endTime} Uhr` : `${startTime} Uhr`;
          const typeSuffix = parsed.slotTypeLabel ? ` – ${parsed.slotTypeLabel}` : '';
          return `${dateStr}, ${timeRange}${typeSuffix}`;
        } catch {
          return String(value);
        }
      },
    },
  ],

  hooks: {
    'dialog:submitted': handleSubmission,
  },

  routes: (router, ctx) => {
    // GET /slots?from=ISO&to=ISO – alle freien Slots aller Terminarten.
    // Sicherheitsleitplanke: Es werden ausschließlich Kalenderdaten aus dem
    // tatsächlich benötigten Zeitraum (geklammert auf [now, now + horizon])
    // und nur von den Kalendern angefragt, die im Wochenplan auch wirklich
    // verwendet werden.
    router.get('/slots', async (req, res) => {
      const cfg = readConfig(ctx);
      if (!cfg) {
        res.status(503).json({ error: 'Plugin ist nicht konfiguriert.' });
        return;
      }
      const now = new Date();
      const horizonEnd = new Date(now.getTime() + cfg.bookingHorizonDays * 24 * 60 * 60_000);

      const fromQ = typeof req.query.from === 'string' && req.query.from ? new Date(req.query.from) : now;
      const toQ = typeof req.query.to === 'string' && req.query.to ? new Date(req.query.to) : horizonEnd;
      if (Number.isNaN(fromQ.getTime()) || Number.isNaN(toQ.getTime())) {
        res.status(400).json({ error: 'Ungültige from/to-Parameter.' });
        return;
      }
      const queryFrom = fromQ < now ? now : fromQ;
      const queryTo = toQ > horizonEnd ? horizonEnd : toQ;
      if (queryTo <= queryFrom) {
        res.json({ timezone: cfg.timezone, slots: [] });
        return;
      }

      const calendarIds = calendarsUsedInRange(cfg, queryFrom, queryTo);
      const busyByCalendar: BusyByCalendar = {};
      try {
        await Promise.all(
          calendarIds.map(async (id) => {
            const profile = cfg.calendars[id];
            if (!profile) return;
            busyByCalendar[id] = await fetchBusy(profile, queryFrom, queryTo, cfg.timezone);
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'CalDAV-Abfrage fehlgeschlagen.';
        ctx.log.error('Slot-Abfrage gescheitert', { error: message });
        res.status(502).json({ error: message });
        return;
      }

      const slots = computeSlots(cfg, queryFrom, queryTo, busyByCalendar);
      res.json({ timezone: cfg.timezone, slots });
    });

    // POST /test – legt morgen einen Test-Termin im Standard-Kalender an.
    router.post('/test', async (_req, res) => {
      const cfg = readConfig(ctx);
      if (!cfg) {
        res.status(400).json({ error: 'Plugin ist nicht vollständig konfiguriert.' });
        return;
      }
      const profile = cfg.calendars[cfg.defaultCalendarId];
      const start = new Date(Date.now() + 24 * 60 * 60_000);
      const end = new Date(start.getTime() + 30 * 60_000);
      const uid = `openformulare-test-${Date.now()}@openformulare`;
      const ical = buildICal({
        uid,
        summary: 'OpenFormulare Terminfindung-Test',
        description: 'Test-Termin, ausgelöst über /api/plugins/terminfindung/test.',
        start,
        end,
      });
      try {
        await uploadEvent(profile, uid, ical);
        res.json({ ok: true, uid });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'CalDAV-Upload fehlgeschlagen.';
        res.status(500).json({ error: message });
      }
    });
  },

  adminRoutes: (router) => {
    // POST /discover – Verbindung testen und verfügbare Kalender finden.
    // Body: { url, username, password }. Die Credentials werden nicht
    // persistiert; das Frontend reicht die noch-nicht-gespeicherten Form-Werte
    // ein, damit der Notar seine Konfiguration testen kann, bevor er sie
    // speichert. Geschützt durch requireAdminAuth (Mount-Pfad
    // /api/admin/plugins/terminfindung/ext).
    router.post('/discover', async (req, res) => {
      const body = (req.body || {}) as { url?: string; username?: string; password?: string };
      if (!body.url || !body.username || !body.password) {
        res.status(400).json({ ok: false, error: 'URL, Benutzername und Passwort sind erforderlich.' });
        return;
      }
      try {
        const result = await discoverCalendars({
          url: body.url,
          username: body.username,
          password: body.password,
        });
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Verbindungstest fehlgeschlagen.';
        res.json({ ok: false, error: message });
      }
    });
  },

  onActivate: (ctx) => {
    ctx.log.info('Terminfindung-Plugin aktiviert (v2.0 mit Wochenplan-Editor).');
  },
  onDeactivate: (ctx) => {
    ctx.log.info('Terminfindung-Plugin deaktiviert.');
  },
};

export default plugin;
