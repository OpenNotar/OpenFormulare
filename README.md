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

> **Wichtig:** `ADMIN_USERNAME` und `ADMIN_PASSWORD` wirken **nur beim
> allerersten Start**. Sie legen genau einen Benutzer in der Datenbank an;
> danach werden sie ignoriert. Wer sie später ändert, ändert damit **nicht**
> das Login — dafür ist die Benutzerverwaltung im Admin-Bereich zuständig
> (siehe [Benutzer und Rollen](#benutzer-und-rollen)). So bleibt ein im
> Admin-Bereich gesetztes Passwort auch dann gültig, wenn in der Compose-Datei
> noch der alte Wert steht.

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

- **Per UI (der normale Weg):** Admin-Bereich → **Benutzer** → „Mein Konto".
  Dort lassen sich Benutzername und Passwort frei ändern — genau dafür ist die
  Benutzerverwaltung da, damit sich niemand die generierten init-Zugangsdaten
  merken muss.
- **Per CLI (wenn niemand mehr hineinkommt):**

  ```bash
  docker exec openformulare npm run admin:reset -- \
    --username kanzlei-admin --password "NeuesPasswort"
  ```

- **Nicht per ENV:** ein geändertes `ADMIN_PASSWORD` bleibt nach dem ersten
  Start wirkungslos (siehe Hinweis oben).

Für `ADMIN_SESSION_SECRET`, `DIALOG_DB_PASSWORD` und `DIALOG_DB_SALT` gelten
weiterhin beide Wege: selbst setzen oder vom Container beim ersten Start
generieren lassen.

---

## Benutzer und Rollen

Der Admin-Bereich kennt mehrere Benutzer mit zwei Rollen:

| Rolle | Darf |
|---|---|
| **Administrator** | alles — Dialoge, Einstellungen, Plugins, Bewertungen, Update-Übersicht und Benutzerverwaltung |
| **Moderator** | Dialoge anlegen/bearbeiten/löschen und Übersetzungen pflegen — **keine** Einstellungen, Plugins oder Benutzer |

Verwaltet wird das unter **Admin → Benutzer**: Konten anlegen, umbenennen,
Rolle wechseln, Passwort setzen, deaktivieren oder löschen. Jeder Benutzer —
auch ein Moderator — kann sein eigenes Passwort unter „Mein Konto" ändern.

Die Rechte werden serverseitig durchgesetzt; die Oberfläche blendet lediglich
aus, was die jeweilige Rolle ohnehin nicht darf.

**Sicherungen**, damit sich eine Instanz nicht aussperrt:

- Es muss immer mindestens ein **aktiver Administrator** übrig bleiben.
- Das eigene Konto kann nicht gelöscht, deaktiviert oder herabgestuft werden.
- Passwort-, Rollen- und Namensänderungen melden bestehende Sitzungen des
  betroffenen Kontos sofort ab.

Passwörter werden mit **scrypt** und pro Benutzer eigenem Salt gespeichert.

### Aussperrung beheben — `npm run admin:reset`

```bash
# Alle Benutzer mit Rolle und Status anzeigen
npm run admin:reset -- --list

# Passwort setzen (Benutzer wird angelegt, falls nicht vorhanden;
# Rolle wird auf admin gehoben und das Konto aktiviert)
npm run admin:reset -- --username kanzlei-admin --password "NeuesPasswort"

# Mit expliziter Rolle
npm run admin:reset -- --username kollegin --password "..." --role moderator
```

Voraussetzung: `npm run build` (das CLI läuft aus `dist/`). Im Container:

```bash
docker exec <container> npm run admin:reset -- --list
```

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

# Node-Abhängigkeiten installieren (Frontend + Backend). Der postinstall-Hook
# baut anschließend automatisch alle Plugins unter plugins/ — wer das nicht
# möchte (z. B. in CI), kann den Build mit `OPENFORMULARE_SKIP_PLUGIN_BUILD=1`
# überspringen und später manuell mit `npm run build:plugins` nachholen.
npm install

# .env-Dateien anlegen und an die eigene Umgebung anpassen
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env

# Python-Abhängigkeiten für die Datenbank-Migrationen
cd backend
mkdir data/
pip install -r requirements.txt

# Datenbank anlegen und Default-Dialoge importieren (einmalig)
npm run migrate
cd ..
```

`npm run migrate` muss nur beim ersten Setup und nach Datenbank-Schema-
Änderungen erneut ausgeführt werden.

Wenn Sie ein Plugin aktiv weiterentwickeln und nur dieses neu bauen
möchten, reicht `cd plugins/<plugin-id> && npm run build`. Ein
`npm run build:plugins` im Root baut alle Plugins auf einmal (überspringt
automatisch solche, deren `dist/` aktueller ist als `src/`).

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
├── backend/    Express + SQLite (verschlüsselt) + Puppeteer + Nodemailer
└── plugins/    Eigenständige Erweiterungen (Hooks, Routen, Feld-Typen)
```

**npm Workspaces** — ein `npm install` im Root installiert beide Pakete.
Der `postinstall`-Hook baut anschließend automatisch alle Plugins unter
`plugins/`.

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
| `stars`, `scale`, `yesno`                  | Bewertungs-Felder (Sterne, Skala, Ja/Nein) — z. B. für Mandanten-Feedback nach der Beurkundung              |
| _Plugin-Felder_                            | Zusätzliche Feld-Typen, die aktive Plugins registrieren (z. B. **Termin / Kalender** vom Terminfindung-Plugin) |

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

### Seed-Sync (Updates für bestehende Instanzen)

Der Seed läuft **bei jedem Start** als idempotenter Sync — nicht nur einmal
auf leerer DB. So bekommen auch bestehende Notar-Instanzen neue und
aktualisierte Default-Dialoge, **ohne** dass eigene Anpassungen verloren
gehen:

| Zustand des Dialogs in der DB                              | Verhalten beim Sync          |
|------------------------------------------------------------|------------------------------|
| Default-Dialog fehlt (und ist nicht gelöscht-getombstoned) | wird eingefügt               |
| Default-Dialog vorhanden, **unverändert**                  | wird auf neueste Version aktualisiert |
| Default-Dialog **vom Notar bearbeitet**                    | bleibt unangetastet          |
| Eigener Dialog (`is_system = 0`)                           | bleibt unangetastet          |
| Vom Notar **gelöschter** Default-Dialog                    | bleibt gelöscht (Tombstone)  |

„Unverändert" = `updated_at == created_at` **und** keine Einträge in
`dialog_versions` (jede Bearbeitung — inkl. Aktiv-/Sichtbarkeits-Toggle —
markiert den Dialog als verändert). Die `settings`-Tabelle wird vom Seed
**nie** angefasst.

### Dialoge manuell neu einspielen — `npm run seed:dialogs`

```bash
# Idempotenter Sync (wie beim Start) — sicher, schützt Anpassungen:
npm run seed:dialogs

# KOMPLETT neu einspielen: die Default-Dialoge löschen und frisch aus dem
# Seed setzen. Für Notare, bei denen es keine Anpassungen gab/geben soll:
npm run seed:dialogs -- --force
```

`--force` arbeitet über die **ID-Liste des Seeds**, nicht über die Spalte
`is_system` (die in gewachsenen Instanzen unzuverlässig ist). Damit gilt
verlässlich: getroffen wird ausschließlich, was auch im Seed steht — jeder
eigene Dialog bleibt erhalten, selbst wenn sein `is_system`-Flag falsch ist.
Betroffen sind neben dem Schema auch die **Versionshistorie** und die
**Übersetzungen** der Default-Dialoge; die mitgelieferten Sprachpakete werden
direkt wieder eingespielt, eigene Übersetzungen der Default-Dialoge sind
danach weg. `settings` und eigene Dialoge werden **nie** angefasst.

Voraussetzung: `npm run build` (das CLI läuft aus `dist/`). Im laufenden
Container z. B.:

```bash
docker exec <container> npm run seed:dialogs -- --force
```

---

## Plugins

OpenFormulare ist ab Version 1.x über ein offizielles Plugin-System
erweiterbar — ohne den Kern verändern zu müssen. Plugins können Hooks
für Submission- und Bewertungs-Events anbieten, eigene HTTP-Routen
(öffentlich oder Admin-auth-geschützt), eigene Feld-Typen für den
Dialog-Editor und strukturierte Einstellungs-Schemata, die im
Admin-Bereich automatisch zu Formularen werden.

Plugins liegen unter `plugins/<plugin-id>/` als eigenständige
npm-Pakete und werden beim Backend-Start eingelesen. Beim ersten
`npm install` im Repo-Root werden sie automatisch gebaut
(`postinstall`-Hook); ein expliziter Re-Build aller Plugins geht über
`npm run build:plugins`.

**Mitgeliefertes Beispiel-Plugin: `terminfindung`** — eine CalDAV-basierte
Online-Terminbuchung:

- Pro Wochentag mehrere Terminarten (Bezeichnung, Dauer, Pufferzeit,
  Zielkalender) — konfigurierbar über einen tag-basierten Editor in
  den Plugin-Einstellungen
- Mandanten sehen pro Terminart einen Tag-/Zeit-Picker, der gegen den
  konfigurierten CalDAV-Server abgleicht. Bereits belegte Termine
  (auch wiederkehrende Serien) und Pufferzeiten werden automatisch
  herausgerechnet
- Beim Absenden des Dialogs legt das Plugin den Termin im passenden
  Kalender an und verschickt — falls der Mandant eine E-Mail-Adresse
  hinterlegt hat — eine iCal-Einladung (`METHOD:REQUEST`) per E-Mail
- Discovery-Funktion im Admin-Bereich: CalDAV-URL eingeben → Plugin
  testet Zugang und listet alle Kalender des Kontos zur Auswahl

Sicherheits-Aspekte:

- Plugins laufen **in-process** mit voller Backend-Berechtigung. Nur
  geprüfte Plugins aktivieren.
- Plugin-Einstellungen vom Typ `password` werden **AES-256-GCM-
  verschlüsselt** persistiert (gleicher Schlüssel wie die Dialog-
  Verschlüsselung).
- Plugin-Routen unter `/api/admin/plugins/<id>/ext/...` sind
  automatisch durch die Admin-Auth-Middleware geschützt. Öffentliche
  Routen unter `/api/plugins/<id>/...` müssen ihre Auth selbst
  implementieren.

Detaillierte Entwickler-Doku: [`docs/plugin-development.md`](docs/plugin-development.md).

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

| Bereich                           | Inhalt                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Übersicht                         | Alle Dialoge mit Status (**aktiv** / **versteckt** / **deaktiviert**), Versionierung                                  |
| Dialog-Editor                     | Schritte und Felder grafisch bearbeiten, Bedingungen, Optionen, Personen-Vorlagen, Plugin-Feld-Typen                  |
| Plugins                           | Installierte Plugins aktivieren/deaktivieren, Plugin-Einstellungen verwalten, Verbindungstests starten                |
| Einstellungen → Branding          | Notar-Name, Browser-Tab-Vorlage, Farben, Logo, Favicon                                                                |
| Einstellungen → Kontakt & Termin  | Globale Felder des Kontakt-Schritts                                                                                   |
| Einstellungen → Personen-Vorlagen | Globale Vorlagen für natürliche / juristische Personen                                                                |
| Einstellungen → Versand           | DiNo / E-Mail aktivieren, Anhang-Auswahl (PDF / DOCX / JSON / DiNo-JSON)                                              |
| Einstellungen → E-Mail            | SMTP-Server, Absender, Notar-E-Mail, HTML-Signatur, Mandanten-Mail-Vorlage                                            |
| Einstellungen → DiNo              | API-Key, TTL für ungelesene Einreichungen                                                                             |

**Dialog-Sichtbarkeit** ist dreistufig:

- **Aktiv** — in der öffentlichen Übersicht für Mandanten gelistet, per
  Direkt-Link erreichbar.
- **Versteckt** — NICHT in der Übersicht, aber per Direkt-Link bzw.
  iframe-Embed erreichbar. Praktisch für gezielt verteilte Dialoge
  (individuelle Verfahren, Pilot-Formulare).
- **Deaktiviert** — komplett aus.

Sessions laufen nach 12 Stunden ab. SMTP-Passwort, DiNo-API-Key und
Plugin-`password`-Settings werden beim Lesen aus der Admin-API maskiert
(`••••••••`) und in der DB AES-256-GCM-verschlüsselt persistiert.

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

| Method      | Pfad                                                | Beschreibung                                                          |
| ----------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| `POST`      | `/api/admin/auth/login`                             | Anmelden, Token erhalten                                              |
| `GET`       | `/api/admin/auth/verify`                            | Token prüfen                                                          |
| `GET`       | `/api/admin/dialogs`                                | Alle Dialoge                                                          |
| `GET`       | `/api/admin/dialogs/:id`                            | Einzelnen Dialog laden                                                |
| `POST`      | `/api/dialogs`                                      | Neuen Dialog anlegen (Admin-Auth-Header erforderlich)                 |
| `PUT`       | `/api/dialogs/:id`                                  | Dialog aktualisieren                                                  |
| `PATCH`     | `/api/dialogs/:id/toggle-active`                    | Aktiv-Status umschalten                                               |
| `PATCH`     | `/api/dialogs/:id/toggle-unlisted`                  | „Versteckt"-Status umschalten (nur per Direkt-Link erreichbar)        |
| `DELETE`    | `/api/dialogs/:id`                                  | Dialog löschen                                                        |
| `GET`/`PUT` | `/api/admin/settings/branding`                      | Branding                                                              |
| `GET`/`PUT` | `/api/admin/settings/kontakt-step`                  | Kontakt-Schritt                                                       |
| `GET`/`PUT` | `/api/admin/settings/person-templates`              | Personen-Vorlagen                                                     |
| `GET`/`PUT` | `/api/admin/settings/dispatch`                      | Versand-Optionen                                                      |
| `GET`/`PUT` | `/api/admin/settings/email`                         | SMTP, Absender, Signatur, Mandanten-Vorlage                           |
| `GET`/`PUT` | `/api/admin/settings/dino`                          | DiNo-API-Key, TTL                                                     |
| `GET`       | `/api/admin/settings/runtime`                       | Aktive Übermittlungswege                                              |
| `GET`       | `/api/admin/plugins`                                | Installierte Plugins inkl. Status, Schema und Fehlern                 |
| `POST`      | `/api/admin/plugins/:id/enable` / `/disable`        | Plugin aktivieren / deaktivieren                                      |
| `GET`/`PUT` | `/api/admin/plugins/:id/settings`                   | Plugin-Settings lesen / speichern (Passwörter automatisch maskiert)   |
| `GET`       | `/api/admin/plugins/_field-types`                   | Vom aktiven Plugin registrierte Feld-Typen (für den Dialog-Editor)    |
| `*`         | `/api/admin/plugins/:id/ext/...`                    | Plugin-eigene Admin-Routen (z. B. Verbindungstest), auth-geschützt    |

### Plugins (öffentliche Routen)

Wenn ein aktives Plugin eigene öffentliche Routen registriert, werden
diese unter `/api/plugins/<plugin-id>/...` gemountet. Die Authentifizierung
liegt beim Plugin selbst. Beispiel aus `terminfindung`:

| Method | Pfad                                                            | Funktion                                              |
| ------ | --------------------------------------------------------------- | ----------------------------------------------------- |
| `GET`  | `/api/plugins/terminfindung/slots?from=…&to=…`                  | Freie Slots im konfigurierten Buchungs-Horizont       |
| `POST` | `/api/plugins/terminfindung/test`                               | Smoketest: legt morgen einen Test-Termin an           |

---

## Datensicherheit

- **Formularschemata und Einreichungen** werden **AES-256-GCM-verschlüsselt**
  in der SQLite-Datenbank gespeichert (Schlüsselableitung via `scrypt` aus
  `DIALOG_DB_PASSWORD` + `DIALOG_DB_SALT`).
- **Admin-Sessions** sind als HMAC-SHA256-signierte Tokens umgesetzt und
  laufen nach 12 h ab.
- **DiNo-Endpoint** ist durch einen API-Key gesichert.
- **SMTP-Passwort, DiNo-API-Key und Plugin-Passwörter** werden mit demselben
  AES-256-GCM-Schlüssel verschlüsselt persistiert (Token-Format
  `enc:v1:<iv>:<tag>:<ciphertext>`). In der Admin-API werden sie maskiert
  ausgeliefert; ein leeres bzw. maskiertes Feld beim Speichern erhält den
  bisherigen Wert. Plain-Text-Werte aus früheren Versionen funktionieren
  weiter und werden beim nächsten Save automatisch verschlüsselt.
- **Speicherbare Snapshots** (Form-Wizard „Speichern“-Funktion) sind
  password-protected (AES-256-GCM mit PBKDF2-SHA256, 200 000 Iterationen).
- Im Docker-Image **keine** eingebrannten Secrets. Generierte Secrets liegen
  unter `/data/.secrets/` mit Permissions `600`.
- **Plugins** laufen mit voller Backend-Berechtigung — entsprechend sollten
  Operator:innen nur geprüfte Plugins aktivieren.

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
