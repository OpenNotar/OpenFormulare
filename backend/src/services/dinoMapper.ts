// Maps notar-dialog form submissions to DiNo data structures.
// Fields suffixed with _hint require a lookup in DiNo's reference tables (Gender, BusinessForm, etc.)
// since the integer IDs are not known at mapping time.

export interface DiNoAddress {
  raw: string;
  Street?: string;
  StreetNr?: string;
  Postcode?: string;
  City?: string;
}

export interface DiNoLegalClient {
  FirstName?: string;
  LastName: string;
  SurName?: string;        // Geburtsname
  Birthdate?: string;
  Birthplace?: string;
  TaxNumber?: string;
  Email?: string;
  PhoneNumber?: string;
  RegisterNumber?: string; // Handelsregisternummer (Juristische Person)

  idGender_hint: string;          // "Herr" | "Frau" | "Divers" | "Keine Angabe"
  idBusinessForm_hint: string;    // "Privatperson" | "GmbH" | "UG" | ...
  idLegalClientType_hint: string; // "Natürliche Person" | "Juristische Person"

  address?: DiNoAddress;

  _role: string;
  _extraData?: Record<string, unknown>;
}

export interface DiNoParcel {
  Flur?: string;
  Flurstueck?: string;
  Groesse?: number;
}

export interface DiNoRealEstate {
  Price?: number;
  LandRegister?: string;
  SheetLandRegister?: string;
  idCourt_hint?: string;
  Area?: number;
  isBuild?: boolean;
  address?: DiNoAddress;
  // Grundbuchblatt-zentrische Felder (DiNo #1108). Mandant kennt sie oft nicht
  // -> alle optional; die Objekt-Adresse ist der verlaessliche Primaeranker.
  Blattnummer?: string;   // = SheetLandRegister, aber semantisch als Blattnummer
  Gemarkung?: string;     // -> DiNo AdministrativeUnit (Gemarkung/Gemeinde)
  parcels?: DiNoParcel[]; // Flur/Flurstueck/Groesse -> DiNo Flurstueck am Blatt
  _objectType?: string;
  _usage?: string;
}

export interface DiNoMortgage {
  AmountMortgage?: number;
  _bank?: string;
}

export interface DiNoShareHolder {
  FirstName?: string;
  LastName: string;
  Birthdate?: string;
  Shares?: number;
  Deposit?: number;
  idGender_hint: string;
  address?: DiNoAddress;
}

export interface DiNoNewCompany {
  Company: string;
  idBusinessForm_hint: string;
  address?: DiNoAddress;
  RegisterNumber?: string;
  RegisterCourt?: string;
}

export interface DiNoAppointment {
  /** Status aus dem Dialog: "Bereits vereinbart" oder "Bitte Kontakt aufnehmen". */
  status?: string;
  /** Vom Mandanten angegebenes Datum/Uhrzeit (z. B. "12.06.2026 10:00"). */
  rawDate?: string;
  /** Falls parsebar: ISO-Form (YYYY-MM-DDTHH:MM) — DiNo legt damit direkt
   *  einen LegalTransactionMeeting an. */
  meetingAt?: string;
}

export interface DiNoMapping {
  _dialogType: string;
  _dialogTitle: string;
  legalTransaction: {
    LegalTransactionType_hint: string;
    Title: string;
  };
  legalClients: DiNoLegalClient[];
  realEstate?: DiNoRealEstate;
  mortgage?: DiNoMortgage;
  shareHolders?: DiNoShareHolder[];
  newCompany?: DiNoNewCompany;
  /** Aus dem Dialog uebermittelte Terminvereinbarung. */
  appointment?: DiNoAppointment;
  /** "Nachricht des Mandanten" — die optionale Schluss-Bemerkung des
   * Absenders (Feld `bemerkungen`, z. B. Mobilitaetseinschraenkungen). */
  clientMessage?: string;
  /** Vorgangsbeschreibung — der eigentliche Anliegen-Freitext (Feld
   * `beschreibung`). Wird in DiNo als Vorgangs-Bemerkung (Remarks) gesetzt. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIALOG_TITLES: Record<string, string> = {
  immobilienkauf: 'Immobilienkauf',
  purchase: 'Immobilienkauf',
  unternehmensgruendung: 'Unternehmensgründung',
  schenkung: 'Schenkung',
  unterschriftsbeglaubigung: 'Unterschriftsbeglaubigung',
  erbausschlagung: 'Erbausschlagung',
  erbschein: 'Erbschein',
  erbauseinandersetzung: 'Erbauseinandersetzung',
  testament: 'Testament',
  ehevertrag: 'Ehevertrag',
  scheidungsvereinbarung: 'Scheidungsvereinbarung',
  adoption: 'Adoption',
  vorsorgevollmacht: 'Vorsorgevollmacht',
  anteilskauf: 'Anteilskauf',
  handelsregister: 'Handelsregister',
  gbr: 'GbR-Gründung',
  verein: 'Vereinsgründung',
};

function buildAddress(obj: Record<string, unknown> | undefined): DiNoAddress | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const strasse = (obj.strasse as string) || '';
  const hausnummer = (obj.hausnummer as string) || '';
  const plz = (obj.plz as string) || '';
  const ort = (obj.ort as string) || '';
  if (!strasse && !plz && !ort) return undefined;
  const streetPart = [strasse, hausnummer].filter(Boolean).join(' ');
  const raw = [streetPart, [plz, ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { raw, Street: strasse || undefined, StreetNr: hausnummer || undefined, Postcode: plz || undefined, City: ort || undefined };
}

interface BusinessAddressValue {
  geschaeftsanschrift?: Record<string, unknown>;
  sitz?: Record<string, unknown>;
  gleich?: boolean;
}

// Picks the Geschäftsanschrift as the primary DiNo address. Sitz is exposed
// alongside in _extraData so downstream consumers can show both even when
// they differ.
function buildBusinessAddress(obj: BusinessAddressValue | undefined): {
  primary?: DiNoAddress;
  sitz?: DiNoAddress;
  gleich: boolean;
} {
  if (!obj || typeof obj !== 'object') return { gleich: true };
  const business = buildAddress(obj.geschaeftsanschrift);
  const gleich = obj.gleich === true;
  const sitzRaw = gleich ? obj.geschaeftsanschrift : obj.sitz;
  const sitz = buildAddress(sitzRaw);
  return { primary: business, sitz, gleich };
}

// Repeater-Items eines Keys. `countValue` ist der Rohwert des zugehoerigen
// `anzahl_*`-Feldes und wirkt nur als Obergrenze:
//   - nicht gesetzt        -> alle vorhandenen Einträge (kein stiller Verlust,
//                             wenn das Zaehlfeld fehlt oder umbenannt wurde)
//   - "Keine" / 0          -> keine Einträge (explizite Abwahl)
//   - Zahl n               -> die ersten n Einträge
// Formen siehe toRepeaterItems (Array *und* { "0": … }).
function getRepeaterItems(
  data: Record<string, unknown>,
  key: string,
  countValue: unknown,
): Record<string, unknown>[] {
  const items = toRepeaterItems(data[key]);
  if (countValue === undefined || countValue === null || countValue === '') return items;
  if (countValue === 'Keine') return [];
  return items.slice(0, parseCount(countValue));
}

function parseCount(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') { const n = parseInt(val, 10); return isNaN(n) ? 0 : n; }
  return 0;
}

const EXTRA_PERSON_KEYS = [
  'familienstand', 'ehevertrag', 'dolmetscher', 'dolmetscher_sprache',
  'pep', 'handelt_fuer_dritte', 'staatsangehoerigkeit', 'auslandsbeziehung',
  'kinder', 'anzahl_kinder', 'verwandt_mit_schenker', 'verwandtschaftsverhaeltnis',
  'handelt_fuer_sich', 'ausweis_art', 'ausweis_details', 'dritter_name',
  'vertretungsgrundlage', 'funktion',
  // Erbfall-relevante Angaben zur Person (Erbschein/Erbauseinandersetzung):
  // ohne diese steht das Sterbedatum nur in der Uebersicht, nicht an der
  // Person, zu der es gehoert.
  'sterbedatum', 'sterbeort', 'lebt', 'verwandtschaft', 'verwandtschaft_sonstiges',
  'vollmacht_vorhanden', 'hat_eigene_kinder',
];

function mapNatuerlichePerson(p: Record<string, unknown>, role: string): DiNoLegalClient {
  const extraData: Record<string, unknown> = {};
  for (const key of EXTRA_PERSON_KEYS) {
    if (p[key] !== undefined && p[key] !== '') extraData[key] = p[key];
  }
  return {
    FirstName: (p.vorname as string) || undefined,
    LastName: (p.nachname as string) || (p.vorname as string) || '',
    SurName: (p.geburtsname as string) || undefined,
    Birthdate: (p.geburtsdatum as string) || undefined,
    Birthplace: (p.geburtsort as string) || undefined,
    TaxNumber: (p.steuer_id as string) || undefined,
    Email: (p.email as string) || undefined,
    PhoneNumber: (p.telefon as string) || undefined,
    idGender_hint: (p.anrede as string) || 'Keine Angabe',
    idBusinessForm_hint: 'Privatperson',
    idLegalClientType_hint: 'Natürliche Person',
    address: buildAddress(p.adresse as Record<string, unknown>),
    _role: role,
    _extraData: Object.keys(extraData).length > 0 ? extraData : undefined,
  };
}

function mapJuristischePerson(p: Record<string, unknown>, role: string): DiNoLegalClient {
  // Repeater entries with the new compound field expose the company address
  // under `adresse_juristisch`. Fall back to legacy single-address layouts.
  const businessField = (p.adresse_juristisch as BusinessAddressValue | undefined);
  const business = buildBusinessAddress(businessField);
  const legacyAddress = buildAddress(p.adresse as Record<string, unknown>);

  const address = business.primary
    ?? legacyAddress
    ?? (p.jp_sitz ? { raw: p.jp_sitz as string, City: p.jp_sitz as string } : undefined);

  const extra: Record<string, unknown> = {
    registergericht: p.jp_registergericht,
    sitz: p.jp_sitz,
  };
  if (businessField) {
    extra.geschaeftsanschrift = business.primary;
    extra.adresse_sitz = business.sitz;
    extra.geschaeftsanschrift_und_sitz_gleich = business.gleich;
  }

  return {
    LastName: (p.firma as string) || (p.jp_firmenname as string) || (p.vorname as string) || '',
    idGender_hint: 'Keine Angabe',
    idBusinessForm_hint: (p.rechtsform as string) || (p.jp_rechtsform as string) || 'GmbH',
    idLegalClientType_hint: 'Juristische Person',
    Email: (p.jp_email as string) || undefined,
    PhoneNumber: (p.jp_telefon as string) || undefined,
    RegisterNumber: (p.jp_hrb as string) || (p.jp_handelsregisternummer as string) || undefined,
    address,
    _role: role,
    _extraData: extra,
  };
}

// Nur der Feldtyp `person` legt ein `typ`-Radio an. `legal-person` rendert
// ausschliesslich die Firmen-Felder — ohne Diskriminator. Ohne Formerkennung
// landet so eine juristische Person als natuerliche Person mit leerem Namen
// in DiNo (und faellt anschliessend als substanzlos heraus).
function looksLikeCompany(p: Record<string, unknown>): boolean {
  if (p.typ === 'Juristische Person') return true;
  if (p.typ === 'Natürliche Person') return false;
  const hasPersonName = !!((p.vorname as string)?.trim() || (p.nachname as string)?.trim());
  if (hasPersonName) return false;
  return !!((p.firma as string)?.trim() || (p.jp_firmenname as string)?.trim()
    || isFilledObject(p.adresse_juristisch));
}

function mapPerson(p: Record<string, unknown>, role: string): DiNoLegalClient {
  return looksLikeCompany(p) ? mapJuristischePerson(p, role) : mapNatuerlichePerson(p, role);
}

// ---------------------------------------------------------------------------
// Dialog-specific mappers
// ---------------------------------------------------------------------------

function mapUnternehmensgruendung(data: Record<string, unknown>): DiNoMapping {
  const clients: DiNoLegalClient[] = [];
  const shareHolders: DiNoShareHolder[] = [];
  const stammkapital = data.stammkapital ? Number(data.stammkapital) : undefined;

  for (const g of getRepeaterItems(data, 'gruender', data.anzahl_gruender)) {
    const anteil = g.anteil ? Number(g.anteil) : undefined;
    const isGF = g.geschaeftsfuehrer === 'Ja';
    const roles = isGF ? 'Gesellschafter / Geschäftsführer' : 'Gesellschafter';
    const client = mapPerson(g, roles);

    if (isGF) {
      client._extraData = { ...client._extraData, einzelvertretung: g.einzelvertretung, paragraph_181: g.paragraph_181 };
    }
    clients.push(client);

    if (g.typ !== 'Juristische Person') {
      shareHolders.push({
        FirstName: (g.vorname as string) || undefined,
        LastName: (g.nachname as string) || '',
        Birthdate: (g.geburtsdatum as string) || undefined,
        Shares: anteil,
        Deposit: stammkapital && anteil ? Math.round((stammkapital * anteil) / 100) : undefined,
        idGender_hint: (g.anrede as string) || 'Keine Angabe',
        address: buildAddress(g.adresse as Record<string, unknown>),
      });
    }
  }

  for (const gf of getRepeaterItems(data, 'externe_gf', data.anzahl_externe_gf)) {
    clients.push(mapNatuerlichePerson(gf, 'Geschäftsführer (extern)'));
  }

  const firmenname = (data.firmenname as string) || '';
  const businessAddress = buildBusinessAddress(data.adresse_gesellschaft as BusinessAddressValue | undefined);
  const newCompany: DiNoNewCompany = {
    Company: firmenname,
    idBusinessForm_hint: (data.rechtsform as string) || 'GmbH',
    address:
      businessAddress.primary
      ?? buildAddress(data.geschaeftsadresse as Record<string, unknown>)
      ?? (data.sitz ? { raw: data.sitz as string, City: data.sitz as string } : undefined),
  };

  return {
    _dialogType: 'unternehmensgruendung',
    _dialogTitle: 'Unternehmensgründung',
    legalTransaction: {
      LegalTransactionType_hint: 'Unternehmensgründung',
      Title: `Gründung ${firmenname || 'neue Gesellschaft'}`,
    },
    legalClients: clients,
    shareHolders,
    newCompany,
  };
}

// Mappt einen Step-Schritt mit natural-person-Container + dialog-spezifischen
// Top-Level-Extras (z. B. ehevertrag: data.erste_person plus flache Felder
// data.erste_person_beruf, data.erste_person_nettoeinkommen, …).
//
// Die Extras werden in `_extraData` gebündelt, sodass DiNo bzw. Empfänger
// alle dialog-spezifischen Zusatzinformationen pro Person finden können.
// Gibt null zurück, wenn weder Personen-Block noch irgendein Extra gesetzt
// ist (verhindert leere Slots in der Ausgabe).
function mapStepPersonWithExtras(
  data: Record<string, unknown>,
  prefix: string,
  role: string,
): DiNoLegalClient | null {
  const obj = data[prefix] as Record<string, unknown> | undefined;
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!k.startsWith(`${prefix}_`)) continue;
    if (v === undefined || v === null || v === '') continue;
    extras[k.slice(prefix.length + 1)] = v;
  }

  const hasPerson = obj && typeof obj === 'object'
    && ((obj.vorname as string)?.trim() || (obj.nachname as string)?.trim());
  if (!hasPerson && Object.keys(extras).length === 0) return null;

  const client = mapNatuerlichePerson(obj ?? {}, role);
  if (!client.FirstName?.trim() && !client.LastName?.trim()) return null;

  const merged: Record<string, unknown> = { ...(client._extraData ?? {}), ...extras };
  return {
    ...client,
    _extraData: Object.keys(merged).length > 0 ? merged : undefined,
  };
}

/**
 * "TT.MM.JJJJ HH:MM" → "YYYY-MM-DDTHH:MM" (Best-Effort).
 * Wenn Parsing scheitert, gibt es undefined zurück — der Empfaenger zeigt
 * dann nur den Roh-String als Hinweis an.
 */
function parseAppointmentDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const m = raw
    .trim()
    .match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ ,T]+(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const [, dd, mm, yyyy, hh, mi] = m;
  const pad = (s: string) => s.padStart(2, '0');
  return `${yyyy}-${pad(mm)}-${pad(dd)}T${pad(hh)}:${mi}`;
}

function extractAppointmentAndMessage(data: Record<string, unknown>): {
  appointment?: DiNoAppointment;
  clientMessage?: string;
  description?: string;
} {
  const status = (data.termin_status as string | undefined)?.trim();
  const rawDate = (data.termin_datum as string | undefined)?.trim();
  let appointment: DiNoAppointment | undefined;
  if (status || rawDate) {
    appointment = {
      status: status || undefined,
      rawDate: rawDate || undefined,
      meetingAt: parseAppointmentDate(rawDate),
    };
  }
  // Zwei konzeptionell getrennte Freitext-Felder, die NICHT vermischt werden
  // duerfen: `beschreibung` = Vorgangsbeschreibung (Anliegen), `bemerkungen`
  // = optionale Schluss-Bemerkung des Absenders ("Nachricht des Mandanten").
  const beschreibung = (data.beschreibung as string | undefined)?.trim();
  const bemerkungen = (data.bemerkungen as string | undefined)?.trim();
  return {
    appointment,
    clientMessage: bemerkungen || undefined,
    description: beschreibung || undefined,
  };
}

// ---------------------------------------------------------------------------
// Generische, dialog-agnostische Erkennung (Beteiligte + Immobilie)
//
// Statt pro Dialog-Slug einen eigenen Mapper zu pflegen (zerbrechlich: ein
// neuer/umbenannter Slug wie "purchase" fiel bisher in den Generic-Fallback
// und verlor Beteiligte + Immobilie), erkennen wir die DiNo-relevanten
// Elemente anhand der festen OF-Feldkonventionen — egal welcher Dialog.
// ---------------------------------------------------------------------------

// Rollen-Label je Repeater-Key; unbekannte Keys werden humanisiert. Die Rolle
// ist damit immer als Hint vorhanden (abgeleitet aus dem Repeater).
const ROLE_LABELS: Record<string, string> = {
  verkaeufer: 'Verkäufer', kaeufer: 'Käufer',
  veraeusserer: 'Veräußerer', erwerber: 'Erwerber',
  schenker: 'Schenker', beschenkte: 'Beschenkter',
  gruender: 'Gesellschafter', externe_gf: 'Geschäftsführer (extern)',
  unterzeichner: 'Unterzeichner', erblasser: 'Erblasser', erben: 'Erbe',
  vollmachtgeber: 'Vollmachtgeber', bevollmaechtigte: 'Bevollmächtigter',
  antragsteller: 'Antragsteller', beteiligte: 'Beteiligter',
  erste_person: 'Erste Person', zweite_person: 'Zweite Person',
  kinder: 'Kind', eigene_kinder: 'Eigenes Kind', ehegatten: 'Ehegatte',
  annehmende: 'Annehmende Person', anzunehmende: 'Anzunehmende Person',
  gesellschafter: 'Gesellschafter', prokuristen: 'Prokurist',
  eingesetzte_erben: 'Erbe',
};

function humanizeRole(key: string): string {
  const base = key.replace(/_/g, ' ').trim();
  if (!base) return 'Beteiligter';
  return base.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Feldnamen, die eine Person beschreiben.
//
// Repeater benennen ihre Felder nicht einheitlich: der `kinder`-Repeater nutzt
// `vorname`/`nachname`, der `ehegatten`-Repeater dagegen `ehegatte_vorname`/
// `ehegatte_nachname`. Wer nur die nackten Namen prueft, uebersieht die
// praefixierte Variante komplett — die Person zaehlt dann nicht als
// Beteiligter, obwohl sie im PDF steht.
const PERSON_FIELD_NAMES = [
  'anrede', 'vorname', 'vornamen', 'nachname', 'geburtsname',
  'geburtsdatum', 'geburtsort', 'sterbedatum', 'sterbeort',
  'staatsangehoerigkeit', 'steuer_id', 'email', 'telefon',
  'typ', 'firma', 'jp_firmenname', 'rechtsform', 'jp_rechtsform',
  'adresse', 'adresse_juristisch',
];

// Adressfelder heissen je Dialog anders (der Erbschein fuehrt den letzten
// Wohnsitz der verstorbenen Person als `letzter_aufenthalt`).
const ADDRESS_KEY_CANDIDATES = ['adresse', 'anschrift', 'letzter_aufenthalt', 'wohnsitz', 'wohnort'];

function isFilledObject(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.values(v as Record<string, unknown>).some((x) => x !== undefined && x !== null && x !== '');
}

// Legt praefixierte Personenfelder zusaetzlich unter ihrem nackten Namen ab
// (`ehegatte_vorname` -> `vorname`), damit Erkennung und Mapping unabhaengig
// von der Benennung im Dialog funktionieren. Vorhandene nackte Felder haben
// Vorrang und werden nie ueberschrieben.
function normalizePerson(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...item };

  for (const [key, val] of Object.entries(item)) {
    if (val === undefined || val === null || val === '') continue;
    const low = key.toLowerCase();
    for (const name of PERSON_FIELD_NAMES) {
      if (low === name || !low.endsWith(`_${name}`)) continue;
      const target = name === 'vornamen' ? 'vorname' : name;
      if (out[target] === undefined || out[target] === '') out[target] = val;
      break;
    }
  }
  if (!out.vorname && out.vornamen) out.vorname = out.vornamen;

  if (!isFilledObject(out.adresse)) {
    for (const cand of ADDRESS_KEY_CANDIDATES) {
      if (isFilledObject(out[cand])) { out.adresse = out[cand]; break; }
    }
  }
  return out;
}

// Feldtypen, die genau EINE Person enthalten (im Gegensatz zum Repeater).
const PERSON_CONTAINER_TYPES = new Set(['person', 'natural-person', 'legal-person', 'repeater']);

// Merkmale, an denen ein Objekt als Person erkannt wird.
//
// Eine Adresse allein zaehlt BEWUSST NICHT: ein Immobilien- oder
// Grundstuecks-Repeater hat ebenfalls ein `adresse`-Feld und landete sonst als
// namenloser Beteiligter in DiNo.
const PERSON_FIELDS = ['vorname', 'nachname', 'firma', 'jp_firmenname', 'typ', 'anrede'];
function looksLikePerson(o: unknown): boolean {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const p = normalizePerson(o as Record<string, unknown>);
  return PERSON_FIELDS.some((k) => p[k] !== undefined && p[k] !== '');
}

// Ein Beteiligter ohne Namen ist in DiNo nutzlos (entsteht z. B. aus einer
// angelegten, aber nicht gefuellten Repeater-Zeile) — eine Adresse allein macht
// daraus keinen brauchbaren Eintrag.
function hasSubstance(c: DiNoLegalClient): boolean {
  return !!(c.FirstName?.trim() || c.LastName?.trim());
}

// Normalisiert einen Repeater-Wert auf eine geordnete Item-Liste.
//
// Beide Formen muessen unterstuetzt werden:
//  - echtes Array `[{…}, {…}]` — so liefert es das Frontend (useFieldArray)
//    und so landet es via JSON.stringify in der DB. DAS ist der Normalfall.
//  - Objekt mit numerischen Keys `{ "0": {…}, "1": {…} }` — Altbestand sowie
//    Payloads aus externen Quellen (Plugins, Importe, API-Direktaufrufe).
//
// Wer nur eine der beiden Formen prueft, verliert stillschweigend alle
// Beteiligten — der Zaehler (`anzahl_*`) bleibt dabei sichtbar, weshalb der
// Fehler wie "Anzahl da, Personen fehlen" aussieht.
function toRepeaterItems(val: unknown): Record<string, unknown>[] {
  if (!val || typeof val !== 'object') return [];
  const raw = Array.isArray(val)
    ? val
    : Object.keys(val as Record<string, unknown>)
        .filter((k) => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => (val as Record<string, unknown>)[k]);
  return raw.filter((it): it is Record<string, unknown> =>
    !!it && typeof it === 'object' && !Array.isArray(it));
}

// Kontakt/Antragsteller aus den anfrager_*-Feldern (frueherer mapGeneric-Kern).
function buildContactClient(data: Record<string, unknown>): DiNoLegalClient | null {
  const vorname = (data.anfrager_vorname as string | undefined)?.trim();
  const nachname = (data.anfrager_nachname as string | undefined)?.trim();
  const firma = (data.anfrager_firma as string | undefined)?.trim();
  const legacyName = (data.anfrager_name as string | undefined)?.trim();
  if (!vorname && !nachname && !firma && !legacyName) return null;

  let firstName = vorname;
  let lastName = nachname;
  if (!firstName && !lastName && legacyName) {
    const parts = legacyName.split(/\s+/);
    firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : undefined;
    lastName = parts[parts.length - 1] || legacyName;
  }
  const isCompany = !!firma && !firstName && !lastName;
  return {
    FirstName: firstName || undefined,
    LastName: (isCompany ? firma : lastName || legacyName) || firma || '',
    Email: (data.email as string) || undefined,
    PhoneNumber: (data.telefon as string) || undefined,
    idGender_hint: 'Keine Angabe',
    idBusinessForm_hint: isCompany ? 'GmbH' : 'Privatperson',
    idLegalClientType_hint: isCompany ? 'Juristische Person' : 'Natürliche Person',
    address: buildAddress(data.postadresse as Record<string, unknown>),
    _role: 'Antragsteller',
  };
}

// Erkennt ALLE Beteiligten unabhaengig vom Dialog: personen-artige Repeater
// (Rolle aus dem Repeater-Label bzw. -Key), Step-Container erste_/zweite_person,
// sonst der Kontakt.
//
// `roleLabels` kommt aus dem Dialog-Schema (Repeater-`label`), damit ein
// selbst angelegter Repeater die vom Notar vergebene Bezeichnung als Rolle
// traegt ("Veräußerer") statt einer aus dem Key erratenen Variante.
function roleFor(key: string, roleLabels: Record<string, string>): string {
  return roleLabels[key] ?? ROLE_LABELS[key] ?? humanizeRole(key);
}

const STEP_PERSON_PREFIXES = ['erste_person', 'zweite_person'];

// Sammelt Beteiligte aus Repeatern und `person`-Containern — rekursiv.
//
// Die Rekursion ist der Kern: Repeater koennen Repeater enthalten (Erbschein:
// `kinder[].eigene_kinder[]` — das Enkelkind). Eine Schleife nur ueber die
// oberste Ebene findet das Kind, aber nie dessen Kind.
function collectFromContainer(
  container: Record<string, unknown>,
  roleLabels: Record<string, string>,
  out: DiNoLegalClient[],
  depth = 0,
): void {
  if (depth > 8) return; // Schutz vor absurd tief verschachtelten Payloads
  for (const [key, val] of Object.entries(container)) {
    if (key.startsWith('anzahl_') || key.startsWith('_')) continue;
    if (depth === 0 && STEP_PERSON_PREFIXES.includes(key)) continue; // separat behandelt
    if (!val || typeof val !== 'object') continue;

    const items = toRepeaterItems(val);
    if (items.length > 0) {
      const role = roleFor(key, roleLabels);
      for (const item of items) {
        if (looksLikePerson(item)) out.push(mapPerson(normalizePerson(item), role));
        collectFromContainer(item, roleLabels, out, depth + 1); // verschachtelte Repeater
      }
      continue;
    }

    // Einzelnes Personen-Objekt (Feldtyp `person`, natuerlich oder juristisch).
    if (looksLikePerson(val)) {
      out.push(mapPerson(normalizePerson(val as Record<string, unknown>), roleFor(key, roleLabels)));
    }
  }
}

// Personenfelder, die ohne Praefix direkt im Schritt stehen. Bewusst OHNE
// `email`/`telefon`: die gehoeren auf oberster Ebene zum Kontakt aus
// "Kontakt & Termin", nicht zur im Schritt beschriebenen Person.
const FLAT_PERSON_KEYS = new Set([
  'anrede', 'vorname', 'vornamen', 'nachname', 'geburtsname',
  'geburtsdatum', 'geburtsort', 'sterbedatum', 'sterbeort',
  'staatsangehoerigkeit', 'steuer_id', 'typ', 'firma', 'jp_firmenname',
  'rechtsform', ...ADDRESS_KEY_CANDIDATES,
]);

const NAME_PART_NAMES = ['vorname', 'vornamen', 'nachname'];

// Baut aus flachen Einzelfeldern ein Personen-Objekt.
// `prefix === ''` bedeutet: die Felder heissen blank `vorname`/`nachname`
// (Erbschein-Schritt "Verstorbene Person").
function flatPersonObject(container: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const person: Record<string, unknown> = {};
  const p = prefix ? `${prefix}_` : '';
  for (const [key, val] of Object.entries(container)) {
    if (Array.isArray(val)) continue; // Repeater gehoeren nicht in die Person
    const low = key.toLowerCase();
    if (prefix) {
      if (!low.startsWith(p)) continue;
      person[low.slice(p.length)] = val;
    } else {
      if (!FLAT_PERSON_KEYS.has(low)) continue;
      person[low] = val;
    }
  }
  return normalizePerson(person);
}

// Erkennt Personen, die als EINZELFELDER modelliert sind statt als
// `person`-Container: der Erbschein fuehrt die verstorbene Person als
// `anrede`/`vorname`/`nachname` direkt im Schritt, die Adoption Vater und
// Mutter als `vater_vorname`/`mutter_vorname`. Solche Personen wurden bisher
// nicht als Beteiligte uebermittelt, weil die Erkennung nur nach Objekten
// und Arrays gesucht hat.
function collectFlatPersons(
  data: Record<string, unknown>,
  roleLabels: Record<string, string>,
  flatRoles: Record<string, string>,
  out: DiNoLegalClient[],
): void {
  // Praefix -> gefundene Namensbestandteile
  const groups = new Map<string, Set<string>>();
  for (const [key, val] of Object.entries(data)) {
    if (typeof val !== 'string' || val.trim() === '') continue;
    const low = key.toLowerCase();
    for (const name of NAME_PART_NAMES) {
      const prefix = low === name ? '' : (low.endsWith(`_${name}`) ? low.slice(0, -(name.length + 1)) : null);
      if (prefix === null) continue;
      if (!groups.has(prefix)) groups.set(prefix, new Set());
      groups.get(prefix)!.add(name === 'vornamen' ? 'vorname' : name);
      break;
    }
  }

  // `anfrager` ist der Kontakt (eigener Pfad), erste_/zweite_person laufen
  // ueber mapStepPersonWithExtras — beide hier ueberspringen.
  const skip = new Set(['anfrager', ...STEP_PERSON_PREFIXES]);

  for (const [prefix, parts] of groups) {
    if (skip.has(prefix)) continue;
    if (!parts.has('vorname') && !parts.has('nachname')) continue;
    // Ist der Praefix selbst ein Repeater/Container, wurde er dort behandelt.
    if (prefix && data[prefix] && typeof data[prefix] === 'object') continue;

    const person = flatPersonObject(data, prefix);
    const role = prefix
      ? (roleLabels[prefix] ?? ROLE_LABELS[prefix] ?? humanizeRole(prefix))
      : (flatRoles[''] ?? 'Beteiligter');
    out.push(mapPerson(person, role));
  }
}

function fullName(c: DiNoLegalClient): string {
  return `${c.FirstName ?? ''} ${c.LastName ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

function detectLegalClients(
  data: Record<string, unknown>,
  roleLabels: Record<string, string> = {},
  flatRoles: Record<string, string> = {},
): DiNoLegalClient[] {
  const out: DiNoLegalClient[] = [];

  collectFromContainer(data, roleLabels, out);
  collectFlatPersons(data, roleLabels, flatRoles, out);

  for (const prefix of STEP_PERSON_PREFIXES) {
    if (data[prefix] || Object.keys(data).some((k) => k.startsWith(`${prefix}_`))) {
      const c = mapStepPersonWithExtras(data, prefix, roleFor(prefix, roleLabels));
      if (c) out.push(c);
    }
  }

  return appendContact(out.filter(hasSubstance), data);
}

// Der Ansprechpartner aus "Kontakt & Termin" wird IMMER als Beteiligter
// uebermittelt — er ist der Mensch, den der Notar anruft. Ist er zugleich als
// Beteiligter erfasst (gleicher Name), werden dort nur seine Kontaktdaten
// ergaenzt, statt einen Doppeleintrag anzulegen.
function appendContact(
  clients: DiNoLegalClient[],
  data: Record<string, unknown>,
): DiNoLegalClient[] {
  const contact = buildContactClient(data);
  if (!contact || !hasSubstance(contact)) return clients;

  const existing = clients.find((c) => fullName(c) !== '' && fullName(c) === fullName(contact));
  if (existing) {
    existing.Email = existing.Email ?? contact.Email;
    existing.PhoneNumber = existing.PhoneNumber ?? contact.PhoneNumber;
    existing.address = existing.address ?? contact.address;
    return clients;
  }
  // Rolle "Antragsteller" nur, wenn er der einzige Beteiligte ist; sonst ist er
  // ein zusaetzlicher Kontakt neben den eigentlichen Beteiligten.
  return [...clients, clients.length === 0 ? contact : { ...contact, _role: 'Kontakt' }];
}

// Sammelt `id -> label` aller Repeater (und Personen-Container) des Dialog-
// Schemas, rekursiv ueber Steps und verschachtelte Felder. Nur zur Benennung
// der Rolle — die Erkennung selbst laeuft weiter rein datengetrieben, damit
// sie auch ohne mitgeliefertes Schema funktioniert.
function collectRoleLabels(schema: unknown): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!schema || typeof schema !== 'object') return labels;

  const walk = (fields: unknown) => {
    if (!Array.isArray(fields)) return;
    for (const f of fields) {
      if (!f || typeof f !== 'object') continue;
      const field = f as Record<string, unknown>;
      const id = field.id as string | undefined;
      const label = (field.label as string | undefined)?.trim();
      if (id && label && PERSON_CONTAINER_TYPES.has(field.type as string)) {
        labels[id] = label;
      }
      walk(field.fields);
      walk(field.extraFields);
    }
  };

  const steps = (schema as Record<string, unknown>).steps;
  if (Array.isArray(steps)) {
    for (const s of steps) {
      if (s && typeof s === 'object') walk((s as Record<string, unknown>).fields);
    }
  }
  return labels;
}

// Rolle fuer flache Personen-Gruppen ohne Praefix. Beste Bezeichnung ist der
// Titel des Schritts, in dem die Felder stehen ("Verstorbene Person") — aus dem
// Feldnamen `vorname` allein laesst sich keine Rolle ableiten.
function collectFlatPersonRoles(schema: unknown): Record<string, string> {
  const roles: Record<string, string> = {};
  const steps = (schema as Record<string, unknown> | null)?.steps;
  if (!Array.isArray(steps)) return roles;

  for (const s of steps) {
    if (!s || typeof s !== 'object') continue;
    const step = s as Record<string, unknown>;
    const title = (step.title as string | undefined)?.trim();
    if (!title || !Array.isArray(step.fields)) continue;
    for (const f of step.fields) {
      if (!f || typeof f !== 'object') continue;
      const id = ((f as Record<string, unknown>).id as string | undefined)?.toLowerCase();
      if (id && NAME_PART_NAMES.includes(id)) {
        roles[''] = title;
        break;
      }
    }
  }
  return roles;
}

function firstDefined(data: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = data[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// Erkennt Immobilie/Grundbuch unabhaengig vom Dialog. Adresse ist der
// Primaeranker; Blattnummer/Gemarkung/Flurstueck best-effort (Mandant kennt
// sie oft nicht). parcels[] fuettert das DiNo-Grundbuchblatt.
function detectRealEstate(data: Record<string, unknown>): DiNoRealEstate | undefined {
  const addressObj = firstDefined(data, ['objekt_adresse', 'immobilie_adresse', 'grundstueck_adresse']);
  const address = buildAddress(addressObj as Record<string, unknown>);
  const blatt = firstDefined(data, ['grundbuch_blatt']) as string | undefined;
  const court = firstDefined(data, ['grundbuch_amtsgericht']) as string | undefined;
  const gemarkung = firstDefined(data, ['gemarkung', 'grundbuch_von']) as string | undefined;
  const objArt = firstDefined(data, ['objekt_art', 'immobilie_art']) as string | undefined;
  const usage = firstDefined(data, ['nutzung', 'immobilie_nutzung']) as string | undefined;
  const price = firstDefined(data, ['kaufpreis', 'immobilie_wert']);
  const area = firstDefined(data, ['grundstuecksflaeche']);

  // Flurstuecke: Repeater (flurstuecke/grundstuecke) ODER flache Top-Level-
  // Felder flur/flurstueck.
  const parcels: DiNoParcel[] = [];
  let repeaterFound = false;
  for (const rkey of ['flurstuecke', 'grundstuecke', 'flurstueck_liste']) {
    for (const it of toRepeaterItems(data[rkey])) {
      repeaterFound = true;
      const groesse = it.groesse ?? it.flaeche;
      parcels.push({
        Flur: (it.flur as string) || undefined,
        Flurstueck: (it.flurstueck as string) || (it.flurstuecksnummer as string) || undefined,
        Groesse: groesse != null && groesse !== '' ? Number(groesse) : undefined,
      });
    }
  }
  if (!repeaterFound && (data.flur || data.flurstueck)) {
    parcels.push({
      Flur: (data.flur as string) || undefined,
      Flurstueck: (data.flurstueck as string) || undefined,
      Groesse: area != null && area !== '' ? Number(area) : undefined,
    });
  }

  const hasSignal = !!(address || blatt || court || gemarkung || objArt || parcels.length || area);
  if (!hasSignal) return undefined;

  return {
    Price: price != null && price !== '' ? Number(price) : undefined,
    Blattnummer: blatt || undefined,
    idCourt_hint: court || undefined,
    Gemarkung: gemarkung || undefined,
    LandRegister: gemarkung || undefined,   // "Grundbuch von X" (Alt-Kompat.)
    SheetLandRegister: blatt || undefined,
    Area: area != null && area !== '' ? Number(area) : undefined,
    isBuild: objArt ? objArt !== 'Unbebautes Grundstück' : undefined,
    address,
    parcels: parcels.length ? parcels : undefined,
    _objectType: objArt || undefined,
    _usage: usage || undefined,
  };
}

function detectMortgage(data: Record<string, unknown>): DiNoMortgage | undefined {
  const fin = data.finanzierung as string | undefined;
  if (fin === 'Bankfinanzierung' || fin === 'Mischfinanzierung') {
    return {
      AmountMortgage: data.grundschuld_betrag ? Number(data.grundschuld_betrag) : undefined,
      _bank: (data.finanzierungsbank as string) || undefined,
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * @param schema Optionales Dialog-Schema. Wird nur genutzt, um Rollen aus den
 *   Repeater-Labels zu benennen; ohne Schema bleibt das Mapping vollstaendig,
 *   die Rollen werden dann aus den Feld-Keys abgeleitet.
 */
export function mapToDiNo(
  formType: string,
  data: Record<string, unknown>,
  schema?: unknown,
): DiNoMapping {
  const title = DIALOG_TITLES[formType] ?? humanizeRole(formType);
  const roleLabels = collectRoleLabels(schema);

  // Unternehmensgruendung braucht Spezialstruktur (Gesellschafter/Firma) —
  // ALLE anderen Dialoge (inkl. purchase/immobilienkauf/schenkung/custom)
  // laufen dialog-agnostisch ueber detectLegalClients + detectRealEstate.
  if (formType === 'unternehmensgruendung') {
    const mapping = mapUnternehmensgruendung(data);
    const extra = extractAppointmentAndMessage(data);
    return {
      ...mapping,
      legalClients: appendContact(mapping.legalClients.filter(hasSubstance), data),
      appointment: mapping.appointment ?? extra.appointment,
      clientMessage: mapping.clientMessage ?? extra.clientMessage,
      description: mapping.description ?? extra.description,
    };
  }

  const legalClients = detectLegalClients(data, roleLabels, collectFlatPersonRoles(schema));
  const realEstate = detectRealEstate(data);
  const mortgage = detectMortgage(data);
  const extra = extractAppointmentAndMessage(data);

  return {
    _dialogType: formType,
    _dialogTitle: title,
    legalTransaction: {
      LegalTransactionType_hint: title,
      Title: realEstate?.address?.raw ? `${title} – ${realEstate.address.raw}` : title,
    },
    legalClients,
    realEstate,
    mortgage,
    appointment: extra.appointment,
    clientMessage: extra.clientMessage,
    description: extra.description,
  };
}
