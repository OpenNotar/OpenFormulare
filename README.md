# OpenFormulare

Schema-getriebenes Formular-System für Notariate. Mehrstufige Dialoge zur
Erfassung von Verfahrensdaten, einbettbar per iframe in beliebige Websites.
Einreichungen können per E-Mail zugestellt **und/oder** für den Abruf durch
DiNo zwischengespeichert werden — beide Wege sind unabhängig voneinander
aktivierbar. Ein Demo-Modus erlaubt unverbindliche Vorführungen ohne reale
Seiteneffekte.

> **Verfügbar als fertiges Docker-Image:**
> [`opennotar/openformulare`](https://hub.docker.com/repository/docker/opennotar/openformulare).

---

## Schnellstart mit Docker

```bash
docker volume create openformulare-data
docker run -d --name openformulare \
  -p 3001:3001 \
  -e CORS_ORIGIN="https://kanzlei.example.de" \
  -v openformulare-data:/data \
  --restart unless-stopped \
  opennotar/openformulare:latest

# Initiales Admin-Passwort einsehen (nur beim ersten Start im Log):
docker logs openformulare 2>&1 | grep "Admin-Passwort"
```

Anschließend ist `http://<host>:3001` erreichbar — Frontend und Backend laufen
auf demselben Origin. Details siehe [Docker](#docker).

---

## Admin-Passwort setzen

Es gibt **zwei Wege**, das Admin-Passwort zu setzen — wähle den, der zu
deinem Deployment passt:

### Weg A: Eigenes Passwort beim Start vorgeben (empfohlen)

Übergebe `ADMIN_PASSWORD` (und ggf. `ADMIN_USERNAME`) als Umgebungsvariable:

```bash
# Docker
docker run -d --name openformulare \
  -p 3001:3001 \
  -e CORS_ORIGIN="https://kanzlei.example.de" \
  -e ADMIN_USERNAME="kanzlei-admin" \
  -e ADMIN_PASSWORD="MeinSicheresPasswort!" \
  -v openformulare-data:/data \
  --restart unless-stopped \
  opennotar/openformulare:latest
```

```yaml
# docker-compose.yml
services:
  openformulare:
    image: opennotar/openformulare:latest
    environment:
      ADMIN_USERNAME: kanzlei-admin
      ADMIN_PASSWORD: MeinSicheresPasswort!
      CORS_ORIGIN: https://kanzlei.example.de
    volumes:
      - openformulare-data:/data
```

Wird ein bereits gesetztes Passwort durch eine neue ENV-Variable
übersteuert, übernimmt der Container den neuen Wert beim nächsten Neustart
und persistiert ihn im Volume.

> **Tipp:** Statt das Passwort direkt in die Compose-Datei zu schreiben, lieber
> eine separate `.env`-Datei oder Docker-Secrets verwenden — niemals ins Git!

### Weg B: Passwort beim ersten Start automatisch generieren lassen

Setzt du **kein** `ADMIN_PASSWORD`, generiert der Container beim ersten
Start ein zufälliges, druckbares Passwort, persistiert es unter
`/data/.secrets/admin-password` (Permissions `600`) und gibt es **einmalig**
im Container-Log aus:

```text
[entrypoint] ===================================================
[entrypoint] Initiales Admin-Passwort generiert:
[entrypoint]   Benutzer:  admin
[entrypoint]   Passwort:  fG9k...sw23
[entrypoint] Bitte direkt nach dem ersten Login ändern oder über
[entrypoint] die Umgebungsvariable ADMIN_PASSWORD übersteuern.
[entrypoint] ===================================================
```

Auslesen:

```bash
docker logs openformulare 2>&1 | grep -A2 "Admin-Passwort generiert"
# oder:
docker exec openformulare cat /data/.secrets/admin-password
```

Spätere Container-Neustarts lesen dasselbe Passwort wieder aus dem Volume —
das Log bleibt dann ruhig.

### Passwort später ändern

- **Per ENV:** Container mit neuem `ADMIN_PASSWORD` starten — überschreibt
  die Datei im Volume.
- **Per Volume:** Den Inhalt von `/data/.secrets/admin-password` durch das
  neue Passwort ersetzen, Container neu starten.
- **Per UI:** _(in Vorbereitung – aktuell nur über die obigen Wege)_

Dieselben zwei Wege gelten auch für `ADMIN_SESSION_SECRET`,
`DIALOG_DB_PASSWORD` und `DIALOG_DB_SALT`: setzen oder vom Container beim
ersten Start generieren lassen.

---

## Voraussetzungen

Für das Docker-Image: **nur Docker** (≥ 24).

Für lokale Entwicklung:

- **Node.js** ≥ 20
- **npm** ≥ 10
- **Python** ≥ 3.9 (für yoyo-Migrationen)

---

## Installation (lokale Entwicklung)

```bash
git clone <repo-url>
cd openformulare

# Node-Abhängigkeiten installieren (Frontend + Backend)
npm install

# .env-Dateien anlegen und an die eigene Umgebung anpassen
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env

# Python-Abhängigkeiten für die Datenbank-Migrationen
cd backend
pip install -r requirements.txt

# Datenbank anlegen und Default-Dialoge importieren (einmalig)
npm run migrate
cd ..
```

`npm run migrate` muss nur beim ersten Setup und nach Datenbank-Schema-
Änderungen erneut ausgeführt werden.

---

## Konfiguration

OpenFormulare hat zwei Konfigurationsebenen:

1. **`.env` / Umgebungsvariablen** — Boot-Zeit-Konfiguration (Ports, Secrets,
   Demo-Mode, Datenbankpfad).
2. **Admin-Bereich** — Laufzeit-Konfiguration (Branding, SMTP, Mandanten-Mail-
   Vorlage, DiNo-Schlüssel, Versand-Optionen, Personen-Vorlagen, Kontakt-Step).
   Im Demo-Modus liegen Änderungen nur in der Session des Editors.

### Frontend (`frontend/.env`)

```env
# URL des Backends (für lokale Entwicklung; im Docker-Build leer → relative Pfade)
VITE_API_URL=http://localhost:3001
```

### Backend (`backend/.env`)

Nur die Boot-Variablen sind hier zu pflegen. Alles andere lebt im Admin-
Bereich:

```env
PORT=3001
CORS_ORIGIN=http://localhost:5173

# Demo-Modus:
#   true  = kein Admin-Login, alle Daten leben nur in der Session,
#           keine echten E-Mails, keine DiNo-Anbindung.
#   false = Produktivbetrieb.
DEMO_MODE=false

# Pfad zur verschlüsselten SQLite-Datenbank
SQLITE_PATH=./data/dialogs.sqlite

# Verschlüsselungsschlüssel & Salt – im Docker-Image automatisch generiert.
DIALOG_DB_PASSWORD=
DIALOG_DB_SALT=

# Admin-Zugangsdaten (siehe Abschnitt "Admin-Passwort setzen")
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=

# Primärfarbe für PDF-Header (Hex ohne #) – Branding ansonsten via Admin-UI
PRIMARY_COLOR=1a3a5c

# Rate-Limit für /api/submit (pro 15 min)
RATE_LIMIT_MAX=10
```

> SMTP-Server, Notar-E-Mail, Versandwege, DiNo-API-Key, Mandanten-E-Mail-
> Vorlage und HTML-Signatur werden nicht mehr in der `.env` gepflegt, sondern
> im **Admin-Bereich → Einstellungen**. Dort eingetragene Werte überschreiben
> jegliche Fallbacks aus der `.env`.

---

## Entwicklung

Lokale Entwicklung mit getrenntem Frontend (5173) und Backend (3001):

```bash
# Frontend (Vite, Port 5173)
npm run dev:frontend

# Backend (ts-node-dev, Port 3001)
npm run dev:backend
```

Frontend und Backend müssen gleichzeitig laufen. CORS ist im Backend für
`http://localhost:5173` voreingestellt.

---

## Produktions-Build (manuelles Deploy ohne Docker)

```bash
npm run build:frontend   # → frontend/dist/
npm run build:backend    # → backend/dist/
```

Die einfachste produktive Variante ist das Docker-Image (siehe oben). Für
manuelle Deployments:

```bash
# 1. Auf dem Server: Repository klonen, Build-Artefakte hochladen
cd /opt/openformulare
npm ci --omit=dev --workspaces

# 2. Python-venv und yoyo installieren (einmalig)
python3 -m venv /opt/openformulare/venv
/opt/openformulare/venv/bin/pip install -r backend/requirements.txt

# 3. Datenbank migrieren
PYTHON_BIN=/opt/openformulare/venv/bin/python3 npm run migrate --workspace=backend

# 4. Service starten (systemd-Unit)
systemctl start openformulare.service
```

Beispiel-`systemd`-Unit:

```ini
[Service]
WorkingDirectory=/opt/openformulare/backend
EnvironmentFile=/opt/openformulare/backend/.env
Environment=PYTHON_BIN=/opt/openformulare/venv/bin/python3
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
User=openformulare
```

Updates: neuen Build hochladen, `systemctl restart openformulare.service`.

---

## Architektur

```
openformulare/
├── frontend/   React 18 + Vite + Tailwind CSS
└── backend/    Express + SQLite (verschlüsselt) + Puppeteer + Nodemailer
```

**npm Workspaces** — ein `npm install` im Root installiert beide Pakete.

Persistente Daten liegen in einer **AES-256-GCM-verschlüsselten SQLite-Datei**.
Migrationen werden mit [yoyo-migrations](https://ollycope.com/software/yoyo)
(Python) verwaltet.

### Übermittlungswege

Pro Dialog-Einreichung können DiNo-Queue und E-Mail-Versand jeweils
unabhängig aktiviert sein. Beide Schalter werden über den **Admin-Bereich**
(Einstellungen → Versand) konfiguriert; die `.env` dient nur noch als
Erstbefüllung.

```
Browser (iframe)
  → POST /api/submit
    ├─→ SQLite (submissions-Tabelle)        // wenn DiNo aktiv
    └─→ Puppeteer → PDF / DOCX → Nodemailer  // wenn E-Mail aktiv
```

Welche Anhänge die Notar-E-Mail mitführt (PDF / DOCX / JSON / DiNo-Mapping),
wird ebenfalls im Admin-Bereich konfiguriert.

**Demo-Modus** (`DEMO_MODE=true`):

```
Browser (iframe)
  → POST /api/submit  →  no-op
```

Keine Datenbankzugriffe, keine PDFs, keine E-Mails, keine DiNo-Queue. Der
Admin-Bereich ist ohne Login erreichbar; jede Browser-Session arbeitet auf
einer eigenen In-Memory-Kopie der Default-Dialoge und -Settings, die nach 24 h
Inaktivität verfällt.

### Formular-Engine

Jeder Dialog ist ein **TypeScript-Schema** (`FormSchema`). Ein einziger
generischer `FormWizard` rendert alle Dialoge.

| Feldtyp                                    | Beschreibung                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `text`, `email`, `tel`                     | Einzeilige Eingabefelder                                                                                    |
| `number`                                   | Zahleneingabe mit konfigurierbarem Format (`plain`, `decimal`, `currency`)                                  |
| `textarea`                                 | Mehrzeiliger Text                                                                                           |
| `date`                                     | Datumsauswahl                                                                                               |
| `select`, `radio`, `multi-select`          | Auswahlfelder mit optionalen, konditionalen Optionen                                                        |
| `checkbox`                                 | Einzelne Checkbox mit eigener `checkboxLabel`                                                               |
| `file`                                     | Datei-Upload (PDF / Bilder), `accept` und `maxFiles` konfigurierbar                                         |
| `address`                                  | Adressblock (Straße, Hausnummer, PLZ, Ort)                                                                  |
| `business-address`                         | Geschäftsanschrift (vollständige Adresse) plus Sitz nur als Ort, Toggle "Sitz = Ort der Geschäftsanschrift" |
| `info`                                     | Rein anzeigender Hinweis-Text (`tone: info`/`warning`)                                                      |
| `repeater`                                 | Wiederholbare Feldgruppe (Personen, Listen) – mit `countField` für dynamische Anzahl                        |
| `person`, `natural-person`, `legal-person` | Verweis auf zentrale Personen-Vorlagen                                                                      |
| `calculation`                              | Aus anderen Feldern berechneter Wert                                                                        |
| `embed`                                    | Inlining eines anderen Dialogs                                                                              |

Alle Felder unterstützen **Sichtbarkeitsbedingungen** (`condition`) mit den
Operatoren `eq`, `neq`, `in`, `lt`, `gt`, `lte`, `gte`, `set`, `unset`,
`contains`, `notContains`. Bedingungen können auch auf Felder aus anderen
Schritten zeigen (`fieldRef`). Felder mit `clearWhenHidden: true` setzen
ihren Wert beim Ausblenden zurück.

#### Sitz juristischer Personen

`business-address` rendert zwei Felder:

- **Geschäftsanschrift** — vollständiger Adressblock (Straße, Hausnummer,
  PLZ, Ort, Land).
- **Sitz** — fachlich nur der **Ort** im Sinne des Registereintrags / der
  Satzung. Straße, Hausnummer und PLZ entfallen hier bewusst.

Per Toggle "Sitz entspricht dem Ort der Geschäftsanschrift" wird der
Sitz-Ort automatisch aus dem Ort der Geschäftsanschrift übernommen. Die
Datenstruktur bleibt rückwärtskompatibel: Sitz wird als `{ ort: string }`
gespeichert; ältere Datensätze mit `strasse`/`plz`/`land` werden beim ersten
Laden auf den reinen Ort reduziert. Diese Regel gilt für die globale
Personen-Vorlage **und** für alle Dialoge, die `business-address` direkt im
Schema verwenden.

---

## Docker

OpenFormulare wird als **Single-Container-Image** auf DockerHub
bereitgestellt:
[`opennotar/openformulare`](https://hub.docker.com/repository/docker/opennotar/openformulare).
Das Image enthält Frontend, Backend, Chromium für die PDF-Generierung sowie
die yoyo-Migrationen — keine zusätzlichen Services nötig.

### Schnellstart

```bash
docker volume create openformulare-data
docker run -d --name openformulare \
  -p 3001:3001 \
  -e CORS_ORIGIN="https://kanzlei.example.de" \
  -v openformulare-data:/data \
  --restart unless-stopped \
  opennotar/openformulare:latest
```

Beim ersten Start passiert automatisch:

1. Fehlende Secrets (`ADMIN_SESSION_SECRET`, `DIALOG_DB_PASSWORD`,
   `DIALOG_DB_SALT`, optional `ADMIN_PASSWORD`) werden zufällig generiert
   und in `/data/.secrets/` abgelegt.
2. yoyo-Migrationen werden gegen `/data/dialogs.sqlite` ausgeführt.
3. Default-Dialoge werden in die DB geseedet.
4. Der Express-Server startet auf Port `3001` und liefert das gebaute Frontend
   am gleichen Origin aus.

### docker-compose

Im Repository liegt eine [`docker-compose.yml`](docker-compose.yml):

```bash
CORS_ORIGIN="https://kanzlei.example.de" docker compose up -d
docker compose logs -f
```

### Eigenes Image bauen

```bash
docker build -t opennotar/openformulare:dev .
docker run --rm -p 3001:3001 -v openformulare-data:/data opennotar/openformulare:dev
```

In der `docker-compose.yml` einfach `image:` auskommentieren und `build: .`
aktivieren.

### DockerHub-Veröffentlichung

```bash
docker login
docker buildx build --platform linux/amd64,linux/arm64 \
  -t opennotar/openformulare:latest \
  -t opennotar/openformulare:1.0.0 \
  --push .
```

### Konfiguration im Image

Alles ist über Umgebungsvariablen steuerbar — sinnvolle Defaults sind im
Container vorbelegt:

| Variable               | Default                | Bedeutung                                                          |
| ---------------------- | ---------------------- | ------------------------------------------------------------------ |
| `CORS_ORIGIN`          | `*`                    | Öffentliche Zieldomain (z.B. `https://kanzlei.example.de`)         |
| `PORT`                 | `3001`                 | HTTP-Port innerhalb des Containers                                 |
| `DEMO_MODE`            | `false`                | Demo-Sandbox ohne Persistenz und ohne echte Übermittlung           |
| `ADMIN_USERNAME`       | `admin`                | Admin-Benutzer                                                     |
| `ADMIN_PASSWORD`       | _zufällig generiert_   | Admin-Passwort, beim ersten Start nur generiert wenn nicht gesetzt |
| `ADMIN_SESSION_SECRET` | _zufällig generiert_   | HMAC-Geheimnis für Admin-Sessions                                  |
| `DIALOG_DB_PASSWORD`   | _zufällig generiert_   | Schlüssel für die SQLite-Verschlüsselung                           |
| `DIALOG_DB_SALT`       | _zufällig generiert_   | Salt für die Schlüsselableitung                                    |
| `SQLITE_PATH`          | `/data/dialogs.sqlite` | Pfad zur DB innerhalb des Volumes                                  |
| `RATE_LIMIT_MAX`       | `10`                   | Max. Submissions pro 15 min und IP                                 |

Alle weiteren Laufzeit-Optionen (Branding, SMTP, Mandanten-Vorlage, DiNo,
Anhang-Auswahl) werden nach dem ersten Start im Admin-Bereich verwaltet.

### Persistenz & Updates

Alle veränderlichen Daten — verschlüsselte Dialog-DB plus generierte
Secrets — liegen unter `/data`. Solange dieses Volume erhalten bleibt, sind
Updates trivial:

```bash
docker pull opennotar/openformulare:latest
docker stop openformulare && docker rm openformulare
docker run -d --name openformulare \
  -p 3001:3001 \
  -e CORS_ORIGIN="https://kanzlei.example.de" \
  -v openformulare-data:/data \
  --restart unless-stopped \
  opennotar/openformulare:latest
```

Mit Compose: `docker compose pull && docker compose up -d`.

### Sicherheits-Hinweise

- Im Image sind **keine** Secrets eingebrannt — alles wird zur Laufzeit aus
  Umgebungsvariablen oder vom Volume gelesen.
- Der Container läuft als nicht-privilegierter Nutzer (`openformulare`).
- Hinter einem TLS-Reverse-Proxy betreiben (nginx, Caddy, Traefik), wenn
  öffentlich erreichbar.
- `CORS_ORIGIN` immer auf die konkrete Zieldomain einschränken — `*` ist nur
  für lokale Tests sinnvoll.
- Volume-Backups regelmäßig erstellen — die SQLite-Datei ist verschlüsselt;
  ohne den DB-Schlüssel im selben Volume sind Backups unbrauchbar.

---

## Verfügbare Formulare

| Route                        | Formular                               |
| ---------------------------- | -------------------------------------- |
| `/allgemeines-anliegen`      | Allgemeines Anliegen                   |
| `/adoption`                  | Adoption                               |
| `/anteilskauf`               | Anteilskauf (GmbH)                     |
| `/ehevertrag`                | Ehevertrag                             |
| `/erbauseinandersetzung`     | Erbauseinandersetzung                  |
| `/erbschein`                 | Erbschein                              |
| `/gbr`                       | GbR (Gesellschaft bürgerlichen Rechts) |
| `/handelsregister`           | Handelsregister                        |
| `/immobilienkauf`            | Immobilienkauf                         |
| `/scheidungsvereinbarung`    | Scheidungsfolgenvereinbarung           |
| `/schenkung`                 | Schenkung                              |
| `/testament`                 | Testament / Erbvertrag                 |
| `/unternehmensgruendung`     | Unternehmensgründung                   |
| `/unterschriftsbeglaubigung` | Unterschriftsbeglaubigung              |
| `/vorsorgevollmacht`         | General- & Vorsorgevollmacht           |

Eigene Dialoge können im Admin-Bereich ohne Code-Änderungen angelegt
werden.

### Seed-Struktur

Die ausgelieferten Default-Dialoge liegen in
`backend/src/db/seeds/`:

```
seeds/
├── default-dialogs.json      Sammel-Datei für die kleineren Dialoge
```

Beim Boot werden zuerst die Einträge aus `default-dialogs.json` geladen,
anschließend die einzelnen Dateien aus `dialogs/`. Bei gleicher `id` gewinnt
die Datei aus `dialogs/` — so lassen sich ausgelagerte Dialoge ohne Eingriff
in die Sammel-Datei pflegen. Neue Dateien in `dialogs/` werden automatisch
mit aufgenommen.

---

## iframe-Einbindung

```html
<iframe
  src="https://formulare.kanzlei-mustermann.de/immobilienkauf"
  width="100%"
  height="800"
  frameborder="0"
  style="border:none;"
></iframe>
```

Optional kann der Notar-Name per Query-Parameter überschrieben werden, falls
dieselbe Instanz mehrere Kanzleien bedient:

```
?notarName=Notare%20Mustermann%20%26%20Musterfrau
```

---

## Admin-Bereich

Erreichbar unter `/admin` (Login erforderlich; im Demo-Modus ohne Login).

| Bereich                           | Inhalt                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------- |
| Übersicht                         | Alle Dialoge mit Status (aktiv / inaktiv), Versionierung                          |
| Dialog-Editor                     | Schritte und Felder grafisch bearbeiten, Bedingungen, Optionen, Personen-Vorlagen |
| Einstellungen → Branding          | Notar-Name, Browser-Tab-Vorlage, Farben, Logo, Favicon                            |
| Einstellungen → Kontakt & Termin  | Globale Felder des Kontakt-Schritts                                               |
| Einstellungen → Personen-Vorlagen | Globale Vorlagen für natürliche / juristische Personen                            |
| Einstellungen → Versand           | DiNo / E-Mail aktivieren, Anhang-Auswahl (PDF / DOCX / JSON / DiNo-JSON)          |
| Einstellungen → E-Mail            | SMTP-Server, Absender, Notar-E-Mail, HTML-Signatur, Mandanten-Mail-Vorlage        |
| Einstellungen → DiNo              | API-Key, TTL für ungelesene Einreichungen                                         |

Sessions laufen nach 12 Stunden ab. SMTP-Passwort und DiNo-API-Key werden
beim Lesen aus der Admin-API maskiert (`••••••••`).

### Demo-Modus

Mit `DEMO_MODE=true` entfällt der Admin-Login; jeder Besucher gelangt direkt
in den Admin-Bereich. Eine Banner-Zeile macht den Modus oben im UI sichtbar.

Technische Garantien im Demo-Modus:

- **Pro-Sitzung-Speicher** — jede Browser-Session bekommt eine UUID
  (`X-Demo-Session-Id`, in `localStorage`), die einen isolierten In-Memory-
  Snapshot der Default-Dialoge und -Settings adressiert.
- **Keine Persistenz** — die SQLite-Datenbank wird nicht beschrieben.
  Sessions verfallen nach 24 h Inaktivität bzw. spätestens beim Neustart.
- **Keine Seiteneffekte** — `POST /api/submit` verwirft Einreichungen sofort.
  Es werden weder PDFs erzeugt noch E-Mails versendet noch DiNo-Datensätze
  angelegt.
- **DiNo-Pull deaktiviert** — `GET /api/dino/submissions` antwortet mit `503`.

---

## API-Endpunkte

### Öffentlich

| Method | Pfad                             | Beschreibung                                                 |
| ------ | -------------------------------- | ------------------------------------------------------------ |
| `GET`  | `/health`                        | Health-Check (`{ ok, demoMode, dinoEnabled, emailEnabled }`) |
| `GET`  | `/api/dialogs`                   | Liste aktiver Dialoge                                        |
| `GET`  | `/api/dialogs/:id`               | Schema eines Dialogs laden                                   |
| `POST` | `/api/submit`                    | Formular einreichen                                          |
| `GET`  | `/api/settings/branding`         | Branding (für FormWizard)                                    |
| `GET`  | `/api/settings/kontakt-step`     | Kontakt-Schritt (Defaults)                                   |
| `GET`  | `/api/settings/person-templates` | Personen-Vorlagen                                            |

`POST /api/submit` erwartet `multipart/form-data`:

| Feld       | Typ                     | Beschreibung                              |
| ---------- | ----------------------- | ----------------------------------------- |
| `formType` | string                  | ID des Formulars (z. B. `immobilienkauf`) |
| `data`     | string (JSON)           | Formulardaten                             |
| `schema`   | string (JSON, optional) | Inline-Schema für PDF-Generierung         |
| `files`    | File[]                  | Hochgeladene Dokumente                    |

### DiNo (`X-Api-Key`-Header erforderlich)

Aktiv, wenn DiNo im Admin-Bereich aktiviert ist. Im Demo-Modus deaktiviert
(`503`).

| Method   | Pfad                        | Beschreibung                                                   |
| -------- | --------------------------- | -------------------------------------------------------------- |
| `GET`    | `/api/dino/submissions`     | Alle offenen Einreichungen abrufen, Markierung als „abgerufen“ |
| `DELETE` | `/api/dino/submissions/:id` | Empfang bestätigen, Datensatz löschen                          |

Einreichungen werden beim Abruf mit `pulledAt` markiert. Nach `ttlHours`
Stunden (Standard: 72) werden sie beim nächsten Pull automatisch bereinigt.

### Admin (Bearer-Token erforderlich)

| Method      | Pfad                                   | Beschreibung                                |
| ----------- | -------------------------------------- | ------------------------------------------- |
| `POST`      | `/api/admin/auth/login`                | Anmelden, Token erhalten                    |
| `GET`       | `/api/admin/auth/verify`               | Token prüfen                                |
| `GET`       | `/api/admin/dialogs`                   | Alle Dialoge                                |
| `GET`       | `/api/admin/dialogs/:id`               | Einzelnen Dialog laden                      |
| `POST`      | `/api/admin/dialogs`                   | Neuen Dialog anlegen                        |
| `PUT`       | `/api/admin/dialogs/:id`               | Dialog aktualisieren                        |
| `PATCH`     | `/api/admin/dialogs/:id/active`        | Aktiv-Status umschalten                     |
| `DELETE`    | `/api/admin/dialogs/:id`               | Dialog löschen                              |
| `GET`/`PUT` | `/api/admin/settings/branding`         | Branding                                    |
| `GET`/`PUT` | `/api/admin/settings/kontakt-step`     | Kontakt-Schritt                             |
| `GET`/`PUT` | `/api/admin/settings/person-templates` | Personen-Vorlagen                           |
| `GET`/`PUT` | `/api/admin/settings/dispatch`         | Versand-Optionen                            |
| `GET`/`PUT` | `/api/admin/settings/email`            | SMTP, Absender, Signatur, Mandanten-Vorlage |
| `GET`/`PUT` | `/api/admin/settings/dino`             | DiNo-API-Key, TTL                           |
| `GET`       | `/api/admin/settings/runtime`          | Aktive Übermittlungswege                    |

---

## Datensicherheit

- **Formularschemata und Einreichungen** werden **AES-256-GCM-verschlüsselt**
  in der SQLite-Datenbank gespeichert (Schlüsselableitung via PBKDF2-SHA256).
- **Admin-Sessions** sind als HMAC-SHA256-signierte Tokens umgesetzt und
  laufen nach 12 h ab.
- **DiNo-Endpoint** ist durch einen API-Key gesichert.
- **SMTP-Passwort und DiNo-API-Key** werden in der Admin-API maskiert
  ausgeliefert; ein leeres bzw. maskiertes Feld beim Speichern erhält den
  bisherigen Wert.
- **Speicherbare Snapshots** (Form-Wizard „Speichern“-Funktion) sind
  password-protected (AES-256-GCM mit PBKDF2-SHA256, 200 000 Iterationen).
- Im Docker-Image **keine** eingebrannten Secrets. Generierte Secrets liegen
  unter `/data/.secrets/` mit Permissions `600`.

---

## Debug-Modus (SMTP)

In Admin-Bereich → Einstellungen → E-Mail kann **SMTP-Debug** aktiviert
werden. In diesem Modus wird kein E-Mail versandt — stattdessen werden alle
Daten (PDF, DOCX, JSON, DiNo-Mapping, Uploads) in
`backend/DebugDump/<timestamp>_<formType>/` abgelegt. Praktisch für
lokale Entwicklung ohne SMTP-Zugang.

---

## Lizenz

MIT License — © 2026 [OpenNotar UG (haftungsbeschränkt)](https://open-notar.de/)

Die Nutzung ist kostenlos, auch kommerziell. Bei Weitergabe oder
Veröffentlichung muss der Copyright-Hinweis erhalten bleiben. Siehe
[LICENSE](LICENSE).
