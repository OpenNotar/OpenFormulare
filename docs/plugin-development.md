# OpenFormulare – Plugin-Entwicklung

> Stand: Mai 2026 · Plugin-API v1 (mit `adminRoutes`, `core.sendEmail`,
> Setting-Typ `json` + `componentHint`, `PluginFieldType.formatValue`) ·
> Lizenz: MIT

OpenFormulare ist als Open-Source-Plattform für digitale Formulare und
Dialoge konzipiert. Ab Version 1.x ist das Tool über ein offizielles
Plugin-System erweiterbar – ohne den Kern verändern zu müssen.

Dieses Dokument richtet sich an Entwickler:innen, die eigene Plugins
schreiben oder bestehende Erweiterungen verstehen wollen.

---

## 1. Was ist ein OpenFormulare-Plugin?

Ein **Plugin** ist ein Node.js-Paket, das beim Start des Backends geladen
wird und Funktionalität ergänzt, ohne den OpenFormulare-Kern zu
modifizieren. Typische Anwendungen:

- Anbindung externer Systeme (CalDAV, CRM, Buchhaltung, …)
- Zusätzliche Bewertungsbögen (DiNo bleibt im Kern – externe
  Bewertungsmodule können aber als Plugin angebunden werden)
- Eigene Import-/Export-Formate
- Webhooks, die bei Dialog-Einreichung externe Dienste benachrichtigen
- Eigene Feld-Typen für den Dialog-Editor

Plugins werden **in-process** geladen: sie laufen im selben Node-Prozess
wie das Backend und haben Zugriff auf die offiziellen SDK-APIs. Der
Kern setzt darauf, dass Plugin-Autoren vertrauenswürdig sind. Ein
buggy Plugin reißt zwar nicht den Server mit (Hooks sind in try/catch
gekapselt), kann aber bewusst Schaden anrichten – Operator:innen sollten
nur geprüfte Plugins aktivieren.

Für strikt isolierte Drittanbieter-Erweiterungen ist ein zukünftiges
Webhook-basiertes Plugin-System geplant.

---

## 2. Plugin-Struktur

Ein Plugin lebt in einem eigenen Unterordner unter `plugins/`:

```
plugins/
└── <plugin-id>/
    ├── plugin.json      ← Manifest (Pflicht)
    ├── package.json     ← npm-Paket-Definition
    ├── tsconfig.json    ← TypeScript-Build-Konfiguration
    ├── src/
    │   └── index.ts     ← Quellcode
    └── dist/
        └── index.js     ← Kompilierter Entry-Point (von tsc erzeugt)
```

### `plugin.json` (Manifest)

```json
{
  "id": "my-plugin",
  "name": "Mein Plugin",
  "version": "1.0.0",
  "description": "Was das Plugin tut.",
  "author": "Mein Name",
  "homepage": "https://example.com/my-plugin",
  "main": "dist/index.js",
  "settings": [
    {
      "key": "apiToken",
      "label": "API-Token",
      "type": "password",
      "required": true
    }
  ]
}
```

| Feld          | Pflicht | Beschreibung                                                     |
|---------------|---------|------------------------------------------------------------------|
| `id`          | ja      | Eindeutige Kennung. Nur Kleinbuchstaben, Zahlen, Bindestriche.   |
| `name`        | ja      | Anzeigename in der Admin-UI.                                     |
| `version`     | ja      | SemVer.                                                          |
| `description` | nein    | Kurztext für die Admin-UI.                                       |
| `author`      | nein    | Autor:in / Organisation.                                         |
| `homepage`    | nein    | Link zum Repository / Marketing-Seite.                           |
| `main`        | nein    | Pfad zum kompilierten Entry. Default: `dist/index.js`.           |
| `settings`    | nein    | Liste der Konfigurationsfelder, siehe Abschnitt 5.               |

### Entry-Point (`src/index.ts`)

Das Plugin exportiert **default** ein Objekt der Form `PluginModule`:

```typescript
import type { PluginModule } from '@openformulare/plugin-sdk';

const plugin: PluginModule = {
  id: 'my-plugin',
  hooks: {
    'dialog:submitted': async (event, ctx) => {
      ctx.log.info('Dialog eingereicht', { dialogId: event.dialogId });
    },
  },
  routes: (router, ctx) => {
    router.get('/status', (_req, res) => {
      res.json({ ok: true });
    });
  },
  fieldTypes: [
    {
      id: 'rating-emoji',
      label: 'Emoji-Bewertung',
      behavior: 'select',
    },
  ],
  onActivate: (ctx) => {
    ctx.log.info('Plugin aktiviert');
  },
  onDeactivate: (ctx) => {
    ctx.log.info('Plugin deaktiviert');
  },
};

export default plugin;
```

> **Wichtig:** Der `@openformulare/plugin-sdk`-Import ist als
> `import type` nur zur Compile-Zeit nötig. Im kompilierten JS bleiben
> keine externen `require`s zurück. Das macht Plugins komplett
> selbstständig und unabhängig von der OpenFormulare-Code-Basis zur
> Laufzeit.

---

## 3. Plugin registrieren und verwalten

### Installation

1. Plugin-Verzeichnis nach `plugins/<plugin-id>/` kopieren oder per
   `git clone` einbinden.
2. Plugin bauen: `cd plugins/<plugin-id> && npm install && npm run build`
3. Backend neu starten. Beim Start scannt OpenFormulare das
   `plugins/`-Verzeichnis und legt für jedes gefundene Manifest einen
   Eintrag in der `plugins`-Tabelle an (Status: `enabled = false`).

### Aktivieren / Deaktivieren

In der Admin-UI unter **`/admin/plugins`**:

- Liste aller installierten Plugins
- Toggle-Button "Aktivieren" / "Deaktivieren"
- Settings-Formular pro Plugin (auto-generiert aus `manifest.settings`)
- Fehleranzeige, falls ein Plugin beim Laden Probleme hatte

Aktivierung läuft synchron über die Admin-API:

```
POST /api/admin/plugins/<plugin-id>/enable     (Authorization: Bearer …)
POST /api/admin/plugins/<plugin-id>/disable
```

Beim Aktivieren wird `onActivate(ctx)` ausgeführt, beim Deaktivieren
`onDeactivate(ctx)`. Beide Hooks sind optional.

### Dynamisch geladen oder muss man das Backend neustarten?

- **Aktivierung/Deaktivierung**: zur Laufzeit, kein Neustart nötig
- **Neue Plugin-Installation oder Code-Änderungen**: Backend-Neustart
- **Settings-Änderungen**: zur Laufzeit (Settings werden bei jedem
  Hook-Call frisch aus der DB gelesen)

---

## 4. Hooks / Events

OpenFormulare feuert bei zentralen Lifecycle-Punkten Events. Ein Plugin
kann auf jedes Event reagieren, indem es eine Funktion unter dem
entsprechenden Schlüssel in `hooks` definiert.

| Event                    | Wann                                                       | Payload (Auszug)                                |
|--------------------------|------------------------------------------------------------|-------------------------------------------------|
| `dialog:beforeSubmit`    | Direkt vor dem Speichern/Versenden einer Submission        | `dialogId`, `dialog`, `submission`              |
| `dialog:submitted`       | Nach erfolgreichem Versand (DiNo / E-Mail)                 | `dialogId`, `dialog`, `submission`, `submittedAt` |
| `rating:created`         | Wenn ein Bewertungsbogen abgegeben wird                    | `ratingId`, `templateId`, `context`             |
| `appointment:requested`  | Wenn ein Plugin/Modul einen Termin-Wunsch meldet           | `proposedAt`, `durationMinutes`, `participants` |
| `data:exported`          | Nach erfolgreichem Export (JSON, CSV, …)                   | `format`, `scope`, `resourceId`, `payloadBytes` |
| `data:imported`          | Nach erfolgreichem Import                                  | `format`, `scope`, `resourceId`, `payloadBytes` |

Hook-Handler haben die Signatur:

```typescript
type HookHandler<E> = (event: PluginEventMap[E], ctx: PluginContext) => void | Promise<void>;
```

### Wichtige Eigenschaften

- **Asynchron parallel**: Mehrere Plugins, die auf dasselbe Event
  reagieren, laufen gleichzeitig (`Promise.all`).
- **Fehlertolerant**: Wirft ein Plugin in einem Hook eine Exception, wird
  diese geloggt und im Admin-UI angezeigt – andere Plugins laufen weiter.
- **Mutation**: Bei `dialog:beforeSubmit` darf das Plugin die
  `submission` direkt mutieren. Mutationen propagieren in den
  Persistenzpfad.
- **Reihenfolge**: Plugins werden in alphabetischer Reihenfolge ihrer
  ID aufgerufen. Verlasse dich nicht darauf – designe Plugins
  unabhängig.

---

## 5. Plugin-Einstellungen

Jedes Plugin kann eigene Konfigurationswerte definieren. Diese werden
in der `plugin_settings`-Tabelle (Schlüssel `plugin_id` + `key`) als
String gespeichert.

### Schema-Definition (`manifest.settings`)

```json
[
  {
    "key": "calendarUrl",
    "label": "Kalender-URL",
    "type": "url",
    "required": true,
    "description": "CalDAV-Endpoint, z. B. https://nextcloud.example.com/remote.php/dav/calendars/<user>/<cal>/"
  },
  {
    "key": "durationMinutes",
    "label": "Termin-Dauer",
    "type": "number",
    "default": 30,
    "min": 5,
    "max": 480
  },
  {
    "key": "active",
    "label": "Aktiv",
    "type": "boolean",
    "default": true
  }
]
```

Unterstützte `type`-Werte: `string`, `number`, `boolean`, `password`,
`url`, `select`, `json`. Bei `select` muss zusätzlich
`options: [{ value, label }]` gesetzt sein.

#### Strukturierte Settings (`type: "json"` + `componentHint`)

Für komplexe Konfigurationen (Listen, Maps, Wochenpläne) gibt es den
Typ `json`. Der gespeicherte Wert ist ein JSON-String, den die Admin-UI
optional über einen spezialisierten Editor rendert – gesteuert via
`componentHint`:

```json
{
  "key": "schedule",
  "label": "Wochenplan",
  "type": "json",
  "componentHint": "weekly-schedule",
  "description": "Definieren Sie pro Wochentag Terminarten mit Dauer und Pufferzeit."
}
```

Wird `componentHint` weggelassen, fällt die Admin-UI auf eine
JSON-Textarea zurück. Aktuell unterstützte Hints:

| Hint              | UI-Komponente                                                |
|-------------------|--------------------------------------------------------------|
| `weekly-schedule` | Tag-für-Tag-Editor mit beliebig vielen Zeitblöcken pro Tag (Bezeichnung, Von/Bis, Dauer, Pufferzeit, Kalender-ID). |

Weitere Hints können ohne Plugin-API-Bruch ergänzt werden; das Plugin
muss nur den Setting-Wert als JSON-String entgegennehmen können.

### Lesen und Schreiben

Im Plugin-Code:

```typescript
const apiToken = ctx.settings.get<string>('apiToken');
const all = ctx.settings.getAll(); // { apiToken: '...', durationMinutes: '30', ... }
ctx.settings.set('lastSync', new Date().toISOString());
```

Werte werden immer als String gespeichert. Plugin-Autoren sind dafür
verantwortlich, sie ggf. in Zahl/Bool zu casten.

### UI

Das Admin-UI unter `/admin/plugins` rendert pro Plugin automatisch ein
Formular auf Basis der Schema-Definition – keine Custom-React-Komponente
nötig.

---

## 6. Eigene Routen

Plugins können zwei Arten von HTTP-Routen registrieren:

### 6.1 Öffentliche Routen (`routes`)

```typescript
const plugin: PluginModule = {
  id: 'my-plugin',
  routes: (router, ctx) => {
    router.get('/status', (_req, res) => res.json({ ok: true }));
    router.post('/sync', async (req, res) => {
      // Plugin-spezifische Logik
      res.json({ synced: true });
    });
  },
};
```

Diese Routes werden unter `/api/plugins/<plugin-id>/...` gemountet
(nur wenn das Plugin aktiv ist). Die Authentifizierung übernimmt das
Plugin selbst – z. B. mit einem geteilten Geheimnis aus den Settings,
einem `X-Api-Key`-Header oder einer Signatur.

### 6.2 Admin-Routen (`adminRoutes`)

Für Operationen, die nur der Notar / Admin auslösen darf (z. B.
Verbindungstests vor dem Speichern, Discovery, Maintenance-Aktionen),
gibt es `adminRoutes`:

```typescript
const plugin: PluginModule = {
  id: 'my-plugin',
  adminRoutes: (router, ctx) => {
    router.post('/probe', async (req, res) => {
      // wird automatisch durch requireAdminAuth geschützt
      const { token } = req.body as { token?: string };
      res.json({ ok: !!token });
    });
  },
};
```

Diese werden unter `/api/admin/plugins/<plugin-id>/ext/...` gemountet
und automatisch durch die Admin-Auth-Middleware geschützt. Plugins
müssen die Auth nicht selbst implementieren.

Vom Frontend aus aufrufen:

```typescript
import { callPluginAdminRoute } from '../lib/pluginsApi';
const response = await callPluginAdminRoute('my-plugin', 'probe', {
  method: 'POST',
  body: JSON.stringify({ token: 'abc' }),
});
```

---

## 6a. Core-Helper im `PluginContext`

Damit Plugins keine eigenen SMTP-, DB- oder Auth-Setups bauen müssen,
stellt der `ctx.core`-Namespace zentral konfigurierte Hilfsfunktionen
zur Verfügung. Sie nutzen die App-Settings aus dem Admin-Bereich –
Plugins erben deren Konfiguration automatisch.

| Methode                                | Zweck                                                                                     |
|----------------------------------------|-------------------------------------------------------------------------------------------|
| `getDialog(id)`                        | Einzelnen Dialog laden (entschlüsselt).                                                   |
| `listDialogs()`                        | Alle Dialoge auflisten.                                                                   |
| `getDialogSchema(id)`                  | Schema eines Dialogs laden (für externe Validierung etc.).                                |
| `sendEmail(opts)`                      | E-Mail über die zentralen SMTP-Settings versenden. Im SMTP-Debug-Modus nur Log.           |
| `getSenderEmail()` / `getSenderName()` | Konfigurierte Absender-Identität (für `ORGANIZER` in iCal-Einladungen, `From`-Felder, …). |

### Beispiel: E-Mail an Mandanten

```typescript
'dialog:submitted': async (event, ctx) => {
  const to = event.submission.email as string | undefined;
  if (!to) return;
  await ctx.core.sendEmail({
    to,
    subject: 'Vielen Dank für Ihre Anfrage',
    html: '<p>Wir melden uns in Kürze bei Ihnen.</p>',
    attachments: [
      { filename: 'info.pdf', content: pdfBuffer, contentType: 'application/pdf' },
    ],
  });
}
```

`sendEmail` setzt `From` automatisch aus den Admin-Settings; im
SMTP-Debug-Modus wird die Funktion erfolgreich aufgelöst, ohne dass
eine echte Mail verschickt wird (eine Log-Zeile dokumentiert den
Aufruf). So bleibt das Plugin testbar, ohne dass die SMTP-Konfiguration
geprüft werden muss.

> Weitere Core-Helper (z. B. `core.fetchExternal`, `core.signRequest`)
> werden ergänzt, sobald sie von mehr als einem Plugin gebraucht
> werden – ohne Plugin-API-Bruch.

---

## 7. Eigene Feld-Typen

Plugins können neue Feld-Typen für den Dialog-Editor registrieren:

```typescript
fieldTypes: [
  {
    id: 'iban',
    label: 'IBAN',
    description: 'Bankverbindung mit Validierung',
    behavior: 'text',
    defaultProps: { placeholder: 'DE…' },
  },
],
```

Im Frontend werden Plugin-Feld-Typen über die generische
`PluginField`-Komponente gerendert. Das `behavior`-Feld bestimmt das
HTML-Eingabe-Element (`text`, `number`, `textarea`, `select`,
`checkbox`, `date`).

> Für Feld-Typen mit komplett eigener React-UI ist in einer späteren
> Plugin-API-Version "Frontend Extensions via Module Federation" geplant.
> v1 deckt einfache, validierte Eingabe-Komponenten ab.

### Wert-Formatierung für PDF / DOCX / JSON (`formatValue`)

Plugin-Felder speichern ihren Wert oft als JSON-Blob (z. B. ein
Termin-Slot mit `start`, `end`, `calendarId`, `slotTypeLabel`). Damit
PDF, DOCX und der JSON-Anhang nicht den rohen Payload zeigen, kann der
Feld-Typ einen Server-seitigen Formatter mitliefern:

```typescript
fieldTypes: [
  {
    id: 'iban',
    label: 'IBAN',
    formatValue: (value, _field, _ctx) => {
      if (typeof value !== 'string') return '';
      // Gruppierung in 4er-Blöcken zur Lesbarkeit.
      return value.replace(/(.{4})/g, '$1 ').trim();
    },
  },
],
```

Signatur:

```typescript
(value: unknown, field: { id, label, type }, ctx: PluginContext) => string
```

- Wird sowohl im PDF- und DOCX-Renderer aufgerufen, als auch beim
  Bauen des JSON-Anhangs (Submission → JSON).
- Bekommt den eigenen `PluginContext` mit, sodass der Formatter
  Settings lesen kann (z. B. Zeitzone, Locale) ohne globale Variablen.
- Wenn `formatValue` `null`/`undefined`/Fehler liefert, fallen die
  Renderer auf ihren Standard-Pfad (`String(value)`) zurück.
- Der Formatter wird **nicht** ans Frontend serialisiert — interaktive
  Darstellung im Wizard machen Sie in der React-Komponente (s. o.).

---

## 8. Beispielplugin: Terminfindung (CalDAV)

Das Plugin `terminfindung` (Plugin-Ordner `plugins/terminfindung/`,
vormals `webdav-calendar`) ist Erstanbieter und im Repository
mitgeliefert. Es demonstriert in einem geschlossenen Beispiel alle
v1-API-Mechanismen: eigene Feld-Typen, öffentliche und Admin-Routen,
strukturierte Settings (`type: json` mit `componentHint`), Hooks und
die Core-Helper für Mail-Versand.

### Was das Plugin kann

- Bindet einen **oder mehrere** CalDAV-Kalender an
  (Hauptkalender via Plugin-Settings, weitere als JSON-Liste).
- Definiert einen **Wochenplan**: pro Wochentag beliebig viele
  Terminarten (Bezeichnung, Von/Bis, Dauer, Pufferzeit, Kalender),
  konfiguriert in der Admin-UI über einen tag-basierten Editor
  (`componentHint: "weekly-schedule"`).
- Stellt den neuen Feld-Typ **Termin / Kalender** für den
  Dialog-Editor bereit. Mandanten sehen pro Terminart einen
  Tag-/Zeit-Picker.
- Liest via **CalDAV REPORT** mit `<C:expand>` alle bestehenden
  Termine im Buchungs-Horizont (Master-Definitionen + RRULE-Serien
  werden serverseitig expandiert) und zieht sie als belegte Zeiten
  ab. Pufferzeiten werden bidirektional berücksichtigt.
- Beim Absenden des Dialogs legt der `dialog:submitted`-Hook im
  passenden Kalender einen Termin an. Falls eine Mandanten-E-Mail
  vorliegt und SMTP konfiguriert ist, geht zusätzlich eine
  **iCal-Einladung** (`METHOD:REQUEST`) per E-Mail an den Mandanten.
- Bietet eine **Discovery-Funktion** in den Admin-Settings, mit der
  Notar:innen die CalDAV-URL testen und einen Kalender aus dem
  Server auswählen können – ohne ihre Credentials zu speichern.

### HTTP-Endpoints des Plugins

| Endpoint                                                              | Auth        | Funktion                                                |
|-----------------------------------------------------------------------|-------------|---------------------------------------------------------|
| `GET /api/plugins/terminfindung/slots?from=…&to=…`                    | öffentlich  | Freie Slots im Zeitraum, alle Terminarten kombiniert.   |
| `POST /api/plugins/terminfindung/test`                                | öffentlich  | Smoketest: legt morgen einen Test-Termin an.            |
| `POST /api/admin/plugins/terminfindung/ext/discover`                  | Admin-Auth  | Discovery: prüft Zugang, listet alle Kalender im Konto. |

Die Discovery-Route nimmt `{ url, username, password }` im Body
entgegen, persistiert nichts und liefert eine Liste aus
`{ url, displayName, color? }`. Sie wird vom „Verbindung testen"-
Button im Admin-UI aufgerufen.

### Plugin-Settings

| Setting              | Typ      | Beschreibung                                                                                  |
|----------------------|----------|-----------------------------------------------------------------------------------------------|
| `calendarUrl`        | URL      | Hauptkalender oder CalDAV-Discovery-Root (Pflicht).                                           |
| `username`           | String   | CalDAV-User.                                                                                  |
| `password`           | Password | App-spezifisches Passwort.                                                                    |
| `calendars`          | JSON-Str | Optional: weitere Kalender als Array `[{id,label,url,username,password}]`.                    |
| `timezone`           | String   | IANA-Zeitzone (Default `Europe/Berlin`). Wird auch als Fallback für TZID-lose iCal-Events benutzt. |
| `schedule`           | JSON + `componentHint: weekly-schedule` | Wochenplan: pro Tag Liste von Terminarten. Schema siehe unten. |
| `bookingHorizonDays` | Zahl     | Wie weit in die Zukunft Buchungen erlaubt sind (Default 60).                                  |
| `minLeadTimeMinutes` | Zahl     | Mindest-Vorlauf eines Slots ab „jetzt" (Default 60).                                          |
| `summaryTemplate`    | String   | Termin-Titel-Vorlage. Platzhalter: `{dialogTitle}`, `{dialogId}`, `{participantName}`, `{slotTypeLabel}`. |

### `schedule`-Schema

```json
{
  "monday": [
    {
      "id": "abc12345",
      "label": "Beurkundungen",
      "from": "09:00",
      "to": "12:00",
      "durationMinutes": 30,
      "bufferMinutes": 15,
      "calendarId": "default"
    },
    {
      "id": "def67890",
      "label": "Beratungstermine",
      "from": "15:00",
      "to": "18:00",
      "durationMinutes": 45,
      "bufferMinutes": 10,
      "calendarId": "team"
    }
  ],
  "tuesday": [],
  "wednesday": [],
  "thursday": [],
  "friday": [],
  "saturday": [],
  "sunday": []
}
```

- Tageskeys: `monday … sunday` (alle sieben Tage müssen vorhanden sein,
  Wert kann ein leeres Array sein).
- `durationMinutes`: Termin-Dauer und Slot-Granularität.
- `bufferMinutes`: Pufferzeit, die vor und nach jedem geplanten Slot
  frei sein muss. Wirkt nur gegenüber bereits belegten Terminen –
  zwei freie Slots derselben Art berühren sich weiterhin.
- `calendarId`: ID aus dem Hauptkalender (`default`) oder dem
  `calendars`-Setting. Slots dieser Art werden gegen genau diesen
  Kalender abgeglichen und dort angelegt.

### Den Termin-Picker in einem Dialog nutzen

1. Plugin in der Admin-UI aktivieren, Verbindung testen, Kalender
   wählen, Wochenplan ausfüllen.
2. Im Dialog-Editor neues Feld vom Typ **Termin / Kalender** anlegen.
3. Veröffentlichen – der Mandant sieht im Dialog je nach Wochenplan
   eine Auswahl von Terminarten, Tagen und Uhrzeiten.
4. Nach dem Absenden:
   - Termin landet im konfigurierten CalDAV-Kalender (`ORGANIZER` =
     Notar, `ATTENDEE` = Mandant, falls E-Mail vorhanden).
   - Mandant erhält eine iCal-Einladung per E-Mail
     (`METHOD:REQUEST`), die er mit einem Klick in seinen eigenen
     Kalender übernehmen kann.

### Test ohne Submission

```bash
# Freie Slots der nächsten N Tage (N = bookingHorizonDays)
curl 'http://localhost:3001/api/plugins/terminfindung/slots'

# Slots in einem bestimmten Zeitraum
curl 'http://localhost:3001/api/plugins/terminfindung/slots?from=2026-05-18T00:00:00Z&to=2026-05-19T00:00:00Z'

# Test-Termin im Standard-Kalender
curl -X POST http://localhost:3001/api/plugins/terminfindung/test
```

Für tieferes Debugging: `TERMINFINDUNG_DEBUG=1` als ENV setzen – das
Plugin loggt dann die rohen CalDAV-Responses und die geparsten
Busy-Intervalle ins Backend-Log.

### Erweitern auf andere Kalender-Anbieter

Der CalDAV-Layer ist im Plugin gekapselt (`fetchBusy()`, `uploadEvent()`,
`discoverCalendars()`). Für andere Anbieter (Google Calendar API,
Microsoft Graph, eigene HTTP-Schnittstellen) lassen sich diese
Funktionen in einem neuen Plugin oder einem Fork ersetzen, ohne dass
die Slot-Berechnung, der Wochenplan-Editor oder der Hook-Pfad
angepasst werden müssen.

---

## 9. Eigenes Plugin entwickeln – Schritt für Schritt

### a) Projekt anlegen

```bash
mkdir -p plugins/my-plugin/src
cd plugins/my-plugin
```

### b) `package.json`

```json
{
  "name": "openformulare-plugin-my-plugin",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0"
  }
}
```

### c) `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@openformulare/plugin-sdk": ["../../backend/src/plugins"]
    },
    "baseUrl": "."
  },
  "include": ["src/**/*"]
}
```

### d) `plugin.json`

Siehe Abschnitt 2.

### e) `src/index.ts`

```typescript
import type { PluginModule } from '@openformulare/plugin-sdk';

const plugin: PluginModule = {
  id: 'my-plugin',
  hooks: {
    'dialog:submitted': async (event, ctx) => {
      ctx.log.info('Hello from my-plugin', { dialogId: event.dialogId });
    },
  },
};

export default plugin;
```

### f) Bauen & Testen

```bash
npm install
npm run build
# Backend neu starten – Plugin erscheint unter /admin/plugins
```

### g) Plugin paketieren

Für andere Operator:innen:

```bash
tar -czf my-plugin-1.0.0.tgz plugins/my-plugin
```

Empfehlung: Plugin als eigenes Git-Repo veröffentlichen, sodass
andere Setups es per Submodule oder einfacher `git clone` einbinden
können.

---

## 10. Sicherheitshinweise

- Plugins laufen mit voller Backend-Berechtigung. Nur Plugins
  aktivieren, deren Code geprüft wurde.
- Settings vom Typ `password` werden in Klartext in der DB gespeichert
  (verschlüsselte Spalten sind eine geplante Erweiterung). Die DB
  selbst ist standardmäßig durch das `SQLITE_PATH`-Volume und das
  OS-Berechtigungsmodell geschützt.
- Hook-Handler sollten **idempotent** sein – z. B. werden bei einem
  erneuten Start abhängige externe Aufrufe (Webhooks, CalDAV-Inserts)
  unter Umständen wiederholt.
- Plugin-Routen unter `/api/plugins/<id>/...` (`routes`) haben
  **keine** vom Kern erzwungene Authentifizierung. Plugins, die
  sensible Endpoints bereitstellen, müssen das selbst tun.
- Plugin-Routen unter `/api/admin/plugins/<id>/ext/...` (`adminRoutes`)
  werden **automatisch** durch die Admin-Auth-Middleware geschützt.
  Nutzen Sie diese, wenn ein Endpunkt nur vom Notar/Admin (nicht vom
  Mandanten) ausgelöst werden soll.
- Core-Helper (`ctx.core.sendEmail`, `getSenderEmail`, …) nutzen die
  zentral konfigurierten App-Settings. Plugins, die diese aufrufen,
  müssen darauf vorbereitet sein, dass SMTP im SMTP-Debug-Modus
  läuft oder nicht konfiguriert ist – Fehler sauber loggen, nicht
  crashen.

---

## 11. Plugin-API-Versionierung

Die hier beschriebene API ist **v1**. Breaking Changes werden:

- in einer neuen Major-Version der OpenFormulare-Plugin-API gebündelt
- mindestens 6 Monate vor Release angekündigt
- mit Migration-Guide im `docs/`-Verzeichnis veröffentlicht

Die SDK-Typen sind im Repository unter
[`backend/src/plugins/types.ts`](../backend/src/plugins/types.ts)
dokumentiert.

---

## 12. Hilfe und Beiträge

- **Issues / Feature-Requests**: GitHub Issues im OpenFormulare-Repo
- **Plugin-Beispiele**: `plugins/`-Verzeichnis, beginnend mit
  `webdav-calendar`
- **Pull Requests** für die Plugin-API: bitte das Label
  `plugin-api` verwenden, damit das Core-Team frühzeitig drüberschaut.

Viel Erfolg beim Erweitern von OpenFormulare!
