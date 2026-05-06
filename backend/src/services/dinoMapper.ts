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

export interface DiNoRealEstate {
  Price?: number;
  LandRegister?: string;
  SheetLandRegister?: string;
  idCourt_hint?: string;
  Area?: number;
  isBuild?: boolean;
  address?: DiNoAddress;
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIALOG_TITLES: Record<string, string> = {
  immobilienkauf: 'Immobilienkauf',
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

function parseAddress(raw: string): DiNoAddress {
  if (!raw?.trim()) return { raw: raw ?? '' };
  // "Musterstraße 12a, 12345 Berlin"
  const match = raw.match(/^(.+?)\s+(\d+[a-zA-Z]?),?\s*(\d{5})\s+(.+)$/);
  if (match) {
    return { raw, Street: match[1].trim(), StreetNr: match[2].trim(), Postcode: match[3].trim(), City: match[4].trim() };
  }
  return { raw };
}

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

// React Hook Form stores repeater items as { "0": {...}, "1": {...} }
function getRepeaterItems(data: Record<string, unknown>, key: string, count: number): Record<string, unknown>[] {
  const raw = data[key];
  if (!raw || typeof raw !== 'object') return [];
  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const item = (raw as Record<string, unknown>)[String(i)];
    if (item && typeof item === 'object') items.push(item as Record<string, unknown>);
  }
  return items;
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

function mapPerson(p: Record<string, unknown>, role: string): DiNoLegalClient {
  return p.typ === 'Juristische Person' ? mapJuristischePerson(p, role) : mapNatuerlichePerson(p, role);
}

// ---------------------------------------------------------------------------
// Dialog-specific mappers
// ---------------------------------------------------------------------------

function mapImmobilienkauf(data: Record<string, unknown>): DiNoMapping {
  const clients: DiNoLegalClient[] = [];

  for (const v of getRepeaterItems(data, 'verkaeufer', parseCount(data.anzahl_verkaeufer))) {
    clients.push(mapPerson(v, 'Verkäufer'));
  }
  for (const k of getRepeaterItems(data, 'kaeufer', parseCount(data.anzahl_kaeufer))) {
    clients.push(mapPerson(k, 'Käufer'));
  }

  const realEstate: DiNoRealEstate = {
    Price: data.kaufpreis ? Number(data.kaufpreis) : undefined,
    LandRegister: (data.grundbuch_von as string) || undefined,
    SheetLandRegister: (data.grundbuch_blatt as string) || undefined,
    idCourt_hint: (data.grundbuch_amtsgericht as string) || undefined,
    Area: data.grundstuecksflaeche ? Number(data.grundstuecksflaeche) : undefined,
    isBuild: data.objekt_art !== 'Unbebautes Grundstück',
    address: buildAddress(data.objekt_adresse as Record<string, unknown>),
    _objectType: (data.objekt_art as string) || undefined,
    _usage: (data.nutzung as string) || undefined,
  };

  let mortgage: DiNoMortgage | undefined;
  if (data.finanzierung === 'Bankfinanzierung' || data.finanzierung === 'Mischfinanzierung') {
    mortgage = {
      AmountMortgage: data.grundschuld_betrag ? Number(data.grundschuld_betrag) : undefined,
      _bank: (data.finanzierungsbank as string) || undefined,
    };
  }

  return {
    _dialogType: 'immobilienkauf',
    _dialogTitle: 'Immobilienkauf',
    legalTransaction: {
      LegalTransactionType_hint: 'Immobilienkauf',
      Title: `Immobilienkauf – ${data.objekt_adresse || 'Objekt unbekannt'}`,
    },
    legalClients: clients,
    realEstate,
    mortgage,
  };
}

function mapUnternehmensgruendung(data: Record<string, unknown>): DiNoMapping {
  const clients: DiNoLegalClient[] = [];
  const shareHolders: DiNoShareHolder[] = [];
  const stammkapital = data.stammkapital ? Number(data.stammkapital) : undefined;

  for (const g of getRepeaterItems(data, 'gruender', parseCount(data.anzahl_gruender))) {
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

  const numExterneGF = data.anzahl_externe_gf === 'Keine' ? 0 : parseCount(data.anzahl_externe_gf);
  for (const gf of getRepeaterItems(data, 'externe_gf', numExterneGF)) {
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

function mapSchenkung(data: Record<string, unknown>): DiNoMapping {
  const clients: DiNoLegalClient[] = [];

  for (const s of getRepeaterItems(data, 'schenker', parseCount(data.anzahl_schenker))) {
    clients.push(mapNatuerlichePerson(s, 'Schenker'));
  }
  for (const b of getRepeaterItems(data, 'beschenkte', parseCount(data.anzahl_beschenkte))) {
    clients.push(mapNatuerlichePerson(b, 'Beschenkter'));
  }

  let realEstate: DiNoRealEstate | undefined;
  if (data.gegenstand_art === 'Immobilie') {
    realEstate = {
      Price: data.immobilie_wert ? Number(data.immobilie_wert) : undefined,
      LandRegister: (data.grundbuch_von as string) || undefined,
      SheetLandRegister: (data.grundbuch_blatt as string) || undefined,
      idCourt_hint: (data.grundbuch_amtsgericht as string) || undefined,
      address: buildAddress(data.immobilie_adresse as Record<string, unknown>),
      _objectType: (data.immobilie_art as string) || undefined,
      _usage: (data.immobilie_nutzung as string) || undefined,
    };
  }

  return {
    _dialogType: 'schenkung',
    _dialogTitle: 'Schenkung',
    legalTransaction: {
      LegalTransactionType_hint: 'Schenkung',
      Title: `Schenkung – ${data.gegenstand_art || 'Gegenstand unbekannt'}`,
    },
    legalClients: clients,
    realEstate,
  };
}

function mapUnterschriftsbeglaubigung(data: Record<string, unknown>): DiNoMapping {
  const clients: DiNoLegalClient[] = [];

  for (const u of getRepeaterItems(data, 'unterzeichner', parseCount(data.anzahl_unterzeichner))) {
    clients.push(mapNatuerlichePerson(u, 'Unterzeichner'));
  }

  return {
    _dialogType: 'unterschriftsbeglaubigung',
    _dialogTitle: 'Unterschriftsbeglaubigung',
    legalTransaction: {
      LegalTransactionType_hint: 'Unterschriftsbeglaubigung',
      Title: `Unterschriftsbeglaubigung – ${data.text_inhalt || 'Dokument unbekannt'}`,
    },
    legalClients: clients,
  };
}

// Generic fallback: extracts the contact person as LegalClient
function mapGeneric(formType: string, data: Record<string, unknown>): DiNoMapping {
  const clients: DiNoLegalClient[] = [];

  const vorname = (data.anfrager_vorname as string | undefined)?.trim();
  const nachname = (data.anfrager_nachname as string | undefined)?.trim();
  const legacyName = (data.anfrager_name as string | undefined)?.trim();

  if (vorname || nachname || legacyName) {
    let firstName = vorname;
    let lastName = nachname;
    if (!firstName && !lastName && legacyName) {
      const parts = legacyName.split(/\s+/);
      firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : undefined;
      lastName = parts[parts.length - 1] || legacyName;
    }

    clients.push({
      FirstName: firstName || undefined,
      LastName: lastName || legacyName || '',
      Email: (data.email as string) || undefined,
      PhoneNumber: (data.telefon as string) || undefined,
      idGender_hint: 'Keine Angabe',
      idBusinessForm_hint: 'Privatperson',
      idLegalClientType_hint: 'Natürliche Person',
      address: buildAddress(data.postadresse as Record<string, unknown>),
      _role: 'Antragsteller',
    });
  }

  const title = DIALOG_TITLES[formType] ?? formType;
  return {
    _dialogType: formType,
    _dialogTitle: title,
    legalTransaction: { LegalTransactionType_hint: title, Title: title },
    legalClients: clients,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function mapToDiNo(formType: string, data: Record<string, unknown>): DiNoMapping {
  switch (formType) {
    case 'immobilienkauf':          return mapImmobilienkauf(data);
    case 'unternehmensgruendung':   return mapUnternehmensgruendung(data);
    case 'schenkung':               return mapSchenkung(data);
    case 'unterschriftsbeglaubigung': return mapUnterschriftsbeglaubigung(data);
    default:                        return mapGeneric(formType, data);
  }
}
