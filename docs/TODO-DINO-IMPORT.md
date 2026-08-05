# ToDo für die DiNo-Seite — Repeater-Beteiligte im Dialogeingang

**Adressat:** Entwicklung des DiNo-Backends (Dialogeingang / Importbereich)
**Auslöser:** (1) Selbst angelegter Dialog mit einem Repeater „Veräußerer“ — im
Importbereich wurde die *Anzahl* der Veräußerer angezeigt, die Beteiligten
selbst waren aber nicht importierbar. (2) Erbschein: verschachtelter Repeater
(„Kind vom Kind“) und die als Einzelfelder erfasste verstorbene Person fehlten
im Import (siehe 2.4).
**Stand:** OpenFormulare, Branch `development`

### Umsetzungsstand auf der DiNo-Seite (Rückmeldung 2026-08-05)

Bereits umgesetzt und damit hier nur noch als Referenz: `_hint`-Konvention,
`parcels[]`, `context.appointment` → `LegalTransactionMeeting`, die Trennung
`description` (→ Remarks) / `clientMessage` (→ `relationship.data.notes`),
`rawData.attachments` sowie Freitext-Rollen mit Fallback und `ExternalRole`.

Offen sind nur noch:

| Punkt | Status |
|---|---|
| 2.1 `idLegalClientRole_hint` lesen (bevorzugt, Fallback `role`) | offen — läuft heute über `role`, inhaltsgleich, daher nicht dringend |
| 2.1 Rollen-Zuordnung Kundenlabel → interne Rolle konfigurierbar | offen — derzeit Dict + Keyword-Heuristik |
| 3.5 `GET /api/dino/forms` konsumieren | offen — eigenes Feature |

---

## 1. Ursache lag in OpenFormulare — dort behoben

Die Ursache war **nicht** DiNo. OpenFormulare hat für den Dialog
`legalClients: []` geliefert. Sichtbar blieb nur das Zählfeld
`anzahl_veraeusserer`, weil es als Skalar in `rawData`/`summary` steht —
daher das Bild „Anzahl da, Personen fehlen“.

Der Fehler saß in der generischen Beteiligten-Erkennung
(`backend/src/services/dinoMapper.ts`, `detectLegalClients`):

```ts
if (!val || typeof val !== 'object' || Array.isArray(val)) continue;  // ← Arrays übersprungen
```

Repeater kommen aus dem Frontend (`useFieldArray`) als **echtes JSON-Array**
`[{…},{…}]`. Die Erkennung prüfte nur die Objektform `{ "0": {…}, "1": {…} }`
und hat damit **jeden** Repeater verworfen.

Reproduktion vor dem Fix:

| Datenform des Repeaters | gelieferte `legalClients` |
|---|---|
| `[{…},{…}]` (Realfall aus dem Frontend) | **1** (nur Antragsteller) |
| `{ "0": {…}, "1": {…} }` | 2 |
| `immobilienkauf` (Standarddialog) | **0** |

Behoben durch `toRepeaterItems()`, das **beide** Formen normalisiert; genutzt
in `detectLegalClients`, `detectRealEstate` (Flurstücke) und
`getRepeaterItems`. Nach dem Fix liefern alle Dialoge — Standard *und*
selbst angelegte — vollständige `legalClients`.

**Konsequenz für DiNo: keine Code-Änderung nötig, damit der Kundenfall
funktioniert.** Ein erneuter Pull nach dem OF-Update reicht. Die Punkte unten
sind Robustheits- und Feature-Themen.

---

## 2. Bitte prüfen (Robustheit)

### 2.1 Rollen sind Freitext, nicht Enum

`role` trägt jetzt die im FormEditor vergebene **Repeater-Bezeichnung** des
Notars — bei fehlendem Schema eine aus dem Feld-Key abgeleitete Variante:

| Quelle | Beispielwert |
|---|---|
| Repeater-Label aus dem Dialog-Schema | `Veräußerer`, `Erwerber` |
| Fallback aus dem Feld-Key (kein Schema) | `Veraeusserer` |
| Bekannte Keys (`ROLE_LABELS`) | `Verkäufer`, `Käufer`, `Schenker`, … |

Seit dieser Version steht derselbe Wert zusätzlich als
**`idLegalClientRole_hint`** im Payload — nach derselben `_hint`-Konvention wie
`idGender_hint`/`idBusinessForm_hint`/`idLegalClientType_hint`. Damit ist im
Payload selbst sichtbar, dass der Wert **freier Text ist und in DiNo gegen die
Rollen-Referenz aufgelöst werden muss**. Das alte Feld `role` bleibt mit
identischem Inhalt erhalten, damit bestehende DiNo-Versionen unverändert
weiterlaufen.

```json
{ "tempId": "c1", "LastName": "Meier", "role": "Veräußerer",
  "idLegalClientRole_hint": "Veräußerer" }
```

**Die Beschriftung ist im OF-Dialog frei anpassbar** — sie ist das Label des
Repeaters bzw. des Personen-Feldes und wird im FormEditor bearbeitet. Ändert der
Notar „Veräußerer" in „Übergeber", kommt genau das im Hint an. Es gibt also
bewusst keine feste Werteliste, die DiNo erwarten könnte; die Zuordnung
Kundenlabel → interne Rolle gehört auf die DiNo-Seite und sollte dort
**konfigurierbar** sein.

`mapExternalRoleToInternal()` (`app/logic/DialogInbox/role_mapping.py`) fällt
bereits sauber auf `DEFAULT_ROLE` zurück
und behält das Original-Label als `ExternalRole` — **das passt so**.

Zu prüfen: `_isSellerRole()` in `app/logic/dialogInbox.py` matcht
`veräuß`/`veraeuss`/`verkäuf`/`eigentüm`. Beliebige Labels
(z. B. „Übergeber“, „Abgebende Partei“, „Noch-Eigentümer“) fallen durch und
damit auch die Eigentümerrecherche. **Vorschlag:** Rollen-Zuordnung im
DiNo-Admin konfigurierbar machen (Mapping Kundenlabel → interne Rolle),
statt die Heuristik immer weiter zu verlängern.

### 2.2 Beliebig viele Rollen pro Vorgang

Ein eigener Dialog kann mehr als zwei Beteiligten-Repeater haben und
Rollen frei benennen. Bitte sicherstellen, dass der Review-/Import-Flow
(`processInbox`) keine implizite Annahme „genau Verkäufer + Käufer“ trifft
und alle gelieferten Beteiligten anbietet.

### 2.3 Juristische Personen aus Repeatern

Repeater mit `personTemplate: 'both'` liefern pro Eintrag entweder eine
natürliche oder eine juristische Person, unterscheidbar an
`idLegalClientType_hint`. Bei juristischen Personen steht der Firmenname in
`LastName`, `FirstName` bleibt leer; Registerdaten liegen in
`RegisterNumber` und `extraData.registergericht`/`extraData.sitz`.

### 2.4 Beteiligte kommen jetzt aus *jeder* Darstellungsform

**Zweite Ausbaustufe (Erbschein-Fall).** Nach dem Repeater-Fix aus Abschnitt 1
fehlten weiterhin Beteiligte — die Erkennung sah nur die oberste Datenebene und
nur Objekte/Arrays. Konkret fehlten im Erbschein das *Enkelkind* und die
*verstorbene Person*. Ebenfalls in OpenFormulare behoben; für DiNo relevant ist
allein, dass `legalClients` jetzt **deutlich mehr Einträge** enthalten kann.

Erkannt werden nun:

| Darstellung im Dialog | Beispiel | Rolle im Payload |
|---|---|---|
| Repeater (jede Tiefe) | `kinder[].eigene_kinder[]` | `Kind`, `Eigenes Kind` |
| Repeater mit präfixierten Feldern | `ehegatte_vorname` | `Ehegatte` |
| `person` / `natural-person` / `legal-person` | eigenes Feld | Feld-Label |
| Einzelfelder im Schritt, ohne Präfix | `anrede`/`vorname`/`nachname` | **Schritt-Titel**, z. B. `Verstorbene Person` |
| Einzelfelder mit Präfix | `vater_vorname`, `mutter_vorname` | `Vater`, `Mutter` |
| Kontakt aus „Kontakt & Termin“ | `anfrager_*` | `Kontakt` bzw. `Antragsteller` |

Beispiel Erbschein (eine Einreichung, vorher 2 Beteiligte, jetzt 5):

```
c1 Antragsteller       Test a
c2 Kind                K 1
c3 Eigenes Kind        Kind vom Kind          ← verschachtelter Repeater
c4 Verstorbene Person  Döner Dönerstag        ← Einzelfelder im Schritt
c5 Kontakt             Daniel Kmiotek         ← Ansprechpartner
```

**Bitte auf DiNo-Seite beachten:**

1. **Der Ansprechpartner ist jetzt immer dabei.** Er trägt die Rolle
   `Kontakt`, wenn es weitere Beteiligte gibt, und `Antragsteller`, wenn er der
   einzige ist. Ist er namensgleich mit einem echten Beteiligten, liefert OF
   **keinen** Doppeleintrag, sondern ergänzt dort nur E-Mail/Telefon. Falls DiNo
   bisher selbst einen Kontakt aus `rawData` erzeugt hat: das würde jetzt
   doppeln.
2. **Rollen sind weder eindeutig noch begrenzt.** Dieselbe Rolle kann mehrfach
   auftreten (`Kind`, `Kind`, `Kind`), und Rollen wie `Eigenes Kind` beschreiben
   ein Verhältnis zu einem *anderen* Beteiligten. Diese Hierarchie überträgt OF
   derzeit **nicht** — die Liste ist flach. Wenn DiNo die Abstammung braucht,
   bitte melden, dann ergänzt OF eine Eltern-Referenz (`_parentTempId`).
3. **Personen ohne Namen werden nicht geliefert.** Leere Repeater-Zeilen
   erzeugen keine Beteiligten mehr (vorher: Einträge mit leerem `LastName`).
4. **Juristische Personen ohne `typ`-Feld.** Nur der Feldtyp `person` erzeugt
   das Unterscheidungsfeld `typ`. Ein `legal-person`-Feld hat es nicht — OF
   erkennt die Firma jetzt an der Feldform. `idLegalClientType_hint` ist in
   beiden Fällen gesetzt und bleibt das verlässliche Kriterium.

### 2.5 Zusätzliche `extraData`-Schlüssel an der Person

Erbfall-Angaben hängen jetzt an der Person, zu der sie gehören, statt nur in der
Übersicht zu stehen: `sterbedatum`, `sterbeort`, `lebt`, `verwandtschaft`,
`verwandtschaft_sonstiges`, `vollmacht_vorhanden`, `hat_eigene_kinder`.

```json
{ "tempId": "c4", "role": "Verstorbene Person", "FirstName": "Döner", "LastName": "Dönerstag",
  "Birthdate": "1911-11-11", "Birthplace": "Göppingen",
  "extraData": { "staatsangehoerigkeit": "deztscg", "sterbedatum": "2026-08-04", "sterbeort": "Da und fort" } }
```

`extraData` ist ein offenes Objekt — bitte tolerant lesen (unbekannte Schlüssel
ignorieren, nicht validieren).

### 2.6 Standarddialoge nutzen jetzt Personen-Container

Die mitgelieferten Dialoge wurden auf Personen-Container (`natural-person`,
Repeater mit `personTemplate`) umgestellt, wo Personen vorher als Einzelfelder
modelliert waren. **Für DiNo ändert sich dadurch nichts** — `legalClients` sieht
identisch aus, die Rollen bleiben gleich benannt. Relevant ist nur, falls DiNo
irgendwo `rawData` direkt ausliest:

| Dialog | vorher in `rawData` | jetzt in `rawData` |
|---|---|---|
| erbschein, erbauseinandersetzung | `vorname`, `nachname`, `letzter_aufenthalt`, `sterbedatum`, … | `verstorbene_person.vorname`, `verstorbene_person.adresse`, `verstorbene_person.sterbedatum`, … |
| adoption | `vater_vorname`, `mutter_vorname`, `vater_lebt`, … | `vater.vorname`, `mutter.vorname`, `vater.lebt`, … |
| erbschein (Ehegatten) | `ehegatten[].ehegatte_vorname` | `ehegatten[].vorname` |

Die Umstellung greift nur bei **unveränderten** mitgelieferten Dialogen. Eigene
Dialoge des Notars und selbst bearbeitete Standarddialoge behalten ihre
Struktur; OF erkennt beide Formen. **Bereits eingereichte Vorgänge sind nicht
betroffen** — deren Zuordnung wird beim Absenden eingefroren und unverändert
ausgeliefert.

---

## 3. Neue Payload-Felder (bitte im Importbereich auswerten)

Alle optional und rückwärtskompatibel. Live-Sync: `GET /api/dino/submissions`.

### 3.1 `context.realEstate.parcels[]` — Flurstücke

```json
"realEstate": {
  "address":     { "raw": "Feldweg 7, 14467 Potsdam", "Street": "Feldweg", "StreetNr": "7", "Postcode": "14467", "City": "Potsdam" },
  "Blattnummer": "4711",
  "Gemarkung":   "Musterhausen",
  "idCourt_hint":"Amtsgericht Potsdam",
  "parcels": [ { "Flur": "3", "Flurstueck": "112/4", "Groesse": 540 } ]
}
```

Quelle sind Repeater (`flurstuecke`, `grundstuecke`, `flurstueck_liste`) oder
die flachen Felder `flur`/`flurstueck`. Passt auf das Grundbuchblatt aus
DiNo #1108. **Die Objekt-Adresse ist der verlässliche Primäranker** —
`Blattnummer`/`Gemarkung`/`parcels` sind Mandanten-Angaben und oft leer, sie
dürfen keine Pflichtfelder für den Import sein.

### 3.2 `context.appointment` — Terminwunsch

```json
"appointment": { "status": "Bereits vereinbart", "rawDate": "12.06.2026 10:00", "meetingAt": "2026-06-12T10:00" }
```

`meetingAt` nur wenn parsebar → daraus direkt einen
`LegalTransactionMeeting` anlegen. Sonst `rawDate` als Hinweis anzeigen.

### 3.3 `context.description` und `context.clientMessage`

Zwei **getrennte** Freitexte, bitte nicht zusammenführen:

- `description` — Vorgangsbeschreibung (Anliegen) → Vorgangs-Bemerkung/`Remarks`
- `clientMessage` — Schluss-Bemerkung des Absenders (z. B.
  Mobilitätseinschränkung) → als „Nachricht des Mandanten“ anzeigen

### 3.4 `rawData.attachments[]` — hochgeladene Dateien

```json
"attachments": [ { "relPath": "files/ausweis.pdf", "fileName": "ausweis.pdf", "contentType": "application/pdf", "dataBase64": "…" } ]
```

Gedacht als Dokumente („Bereitgestellte Daten“) an der Relationship.

> ⚠️ **Größe beachten.** OF erlaubt 20 MB pro Datei ohne Limit für die Anzahl,
> Base64 kommt mit ~33 % Overhead obendrauf, und der Pull liefert **alle**
> offenen Einreichungen in *einer* Response. Bei mehreren Einreichungen mit
> Anhängen wird das schnell dreistellig in MB. Bitte auf DiNo-Seite mit
> Streaming/`stream=True` lesen und keine harte Response-Größengrenze setzen.
> Wenn das in der Praxis klemmt: bitte melden — dann liefert OF Attachments
> über einen separaten Endpoint pro Submission nach.

### 3.5 `GET /api/dino/forms` — Dialogliste

Neu. Liefert `{ count, forms: [{ id, title, description, category, isActive, isSystem, updatedAt }] }`
für die Konfiguration pro Dialog (Vorgangsart, Notar, Mitarbeiter, Auto-Import).

---

## 4. Testfälle

1. **Kundenfall:** eigener Dialog, Repeater `veraeusserer` (2 Einträge, einer
   davon juristische Person) + `erwerber` (1 Eintrag) → 3 Beteiligte mit
   Rollen `Veräußerer`/`Veräußerer`/`Erwerber` importierbar.
2. **Altform:** dieselbe Einreichung mit `{ "0": …, "1": … }` → identisches
   Ergebnis (Alt-Submissions in der DB, manuelle Datei-Importe).
3. **Standarddialoge:** `immobilienkauf`, `schenkung`, `ehevertrag`,
   `unterschriftsbeglaubigung`, `unternehmensgruendung` → Beteiligte
   vollständig, Rollen wie bisher.
4. **Ohne Repeater:** nur `anfrager_*` → genau ein Beteiligter
   `Antragsteller`.
5. **Unbekannte Rolle:** Repeater mit Label „Übergeber“ → Beteiligter wird
   importiert, Label bleibt als `ExternalRole` erhalten (siehe 2.1).
6. **Flurstücke:** Repeater mit 2 Flurstücken → beide am Grundbuchblatt.
7. **Anhänge:** Einreichung mit 3 PDFs → 3 Dokumente an der Relationship.
8. **Erbschein mit Enkelkind:** 1 Antragsteller, 1 Kind mit 1 eigenen Kind →
   5 Beteiligte inkl. `Eigenes Kind` und `Verstorbene Person` (siehe 2.4).
9. **Kontakt = Beteiligter:** `anfrager_*` namensgleich mit einem Käufer →
   genau **ein** Beteiligter, dessen E-Mail/Telefon gefüllt ist (kein Duplikat).
10. **Juristische Person ohne `typ`:** `legal-person`-Feld → Beteiligter mit
    `idLegalClientType_hint: "Juristische Person"`, Firmenname in `LastName`.
11. **Umbenannte Rolle:** Repeater-Label im FormEditor von „Veräußerer" auf
    „Übergeber" ändern → `idLegalClientRole_hint: "Übergeber"`, Beteiligter
    bleibt importierbar (siehe 2.1).

---

## 5. Abgrenzung

Im DiNo-Repository wurde bewusst **nichts geändert** — die Korrektur ist
vollständig in OpenFormulare erfolgt. Dieses Dokument beschreibt nur, was auf
der DiNo-Seite noch zu prüfen bzw. zusätzlich auswertbar ist.
