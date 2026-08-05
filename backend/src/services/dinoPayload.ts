import type { DiNoMapping, DiNoLegalClient, DiNoRealEstate, DiNoMortgage, DiNoShareHolder, DiNoNewCompany } from './dinoMapper';
import { getDialog } from '../db/database';

// Human-friendly payload für DiNo DialogInbox.
// DiNo entscheidet später über Mandanten-Dedup und LegalTransaction-Erstellung.

export interface PayloadAddress {
  raw?: string;
  Street?: string;
  StreetNr?: string;
  Postcode?: string;
  City?: string;
}

export interface PayloadClient {
  tempId: string;
  FirstName?: string;
  LastName: string;
  SurName?: string;
  Birthdate?: string;
  Birthplace?: string;
  TaxNumber?: string;
  Email?: string;
  PhoneNumber?: string;
  RegisterNumber?: string;
  idGender_hint: string;
  idBusinessForm_hint: string;
  idLegalClientType_hint: string;
  address?: PayloadAddress;
  /** Rolle als Klartext, wie im Dialog benannt (Feld-/Repeater-Label).
   *  Bleibt fuer bestehende DiNo-Versionen erhalten. */
  role: string;
  /** Dieselbe Rolle, benannt nach der `_hint`-Konvention: der Wert ist vom
   *  Notar frei vergebener Text und muss in DiNo gegen die Rollen-Referenz
   *  aufgeloest werden (siehe docs/TODO-DINO-IMPORT.md, Abschnitt 2.1). */
  idLegalClientRole_hint: string;
  extraData?: Record<string, unknown>;
}

export interface PayloadSummaryEntry {
  label: string;
  value: string;
}

export interface DiNoPayload {
  id: string;
  formType: string;
  dialogTitle: string;
  title: string;
  transactionTypeHint: string;
  submittedAt: string;
  pulledAt: string | null;
  legalClients: PayloadClient[];
  summary: PayloadSummaryEntry[];
  context?: {
    realEstate?: DiNoRealEstate;
    mortgage?: DiNoMortgage;
    shareHolders?: DiNoShareHolder[];
    newCompany?: DiNoNewCompany;
    appointment?: {
      status?: string;
      rawDate?: string;
      meetingAt?: string;
    };
    clientMessage?: string;
    description?: string;
  };
  rawData: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Friendly labels for raw form keys
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  // Allgemein
  anfrager_vorname: 'Anfrager – Vorname',
  anfrager_nachname: 'Anfrager – Nachname',
  anfrager_name: 'Anfrager',
  email: 'E-Mail',
  telefon: 'Telefon',
  postadresse: 'Postadresse',
  notiz: 'Notiz',
  bemerkungen: 'Bemerkungen',
  // Unterschriftsbeglaubigung
  anzahl_unterzeichner: 'Anzahl Unterzeichner',
  text_inhalt: 'Inhalt der Unterschrift',
  // Immobilienkauf
  anzahl_verkaeufer: 'Anzahl Verkäufer',
  anzahl_kaeufer: 'Anzahl Käufer',
  kaufpreis: 'Kaufpreis',
  objekt_adresse: 'Objektadresse',
  objekt_art: 'Objektart',
  nutzung: 'Nutzung',
  grundbuch_von: 'Grundbuch von',
  grundbuch_blatt: 'Grundbuchblatt',
  grundbuch_amtsgericht: 'Amtsgericht (Grundbuch)',
  grundstuecksflaeche: 'Grundstücksfläche',
  finanzierung: 'Finanzierung',
  finanzierungsbank: 'Finanzierungsbank',
  grundschuld_betrag: 'Grundschuldbetrag',
  // Unternehmensgründung
  firmenname: 'Firmenname',
  rechtsform: 'Rechtsform',
  geschaeftsadresse: 'Geschäftsadresse',
  stammkapital: 'Stammkapital',
  anzahl_gruender: 'Anzahl Gründer',
  anzahl_externe_gf: 'Anzahl externe Geschäftsführer',
  // Schenkung
  anzahl_schenker: 'Anzahl Schenker',
  anzahl_beschenkte: 'Anzahl Beschenkte',
  gegenstand_art: 'Art des Gegenstands',
  immobilie_wert: 'Wert der Immobilie',
  immobilie_adresse: 'Adresse der Immobilie',
  immobilie_art: 'Art der Immobilie',
  immobilie_nutzung: 'Nutzung der Immobilie',
};

const PARTICIPANT_KEYS = new Set([
  'verkaeufer', 'kaeufer', 'gruender', 'externe_gf',
  'schenker', 'beschenkte', 'unterzeichner', 'erblasser',
  'erben', 'antragsteller', 'ehegatten', 'eltern',
]);

function humanLabel(key: string): string {
  if (LABELS[key]) return LABELS[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'boolean') return val ? 'Ja' : 'Nein';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return val;
  return null;
}

function buildSummary(rawData: Record<string, unknown>): PayloadSummaryEntry[] {
  const entries: PayloadSummaryEntry[] = [];
  for (const [key, value] of Object.entries(rawData)) {
    if (PARTICIPANT_KEYS.has(key)) continue;
    if (key.startsWith('_')) continue;
    if (value === null || value === undefined || value === '') continue;

    // Verschachtelte Objekte werden in den Summary nicht aufgenommen —
    // ihre Inhalte werden separat (z.B. als legalClients) verarbeitet.
    if (typeof value === 'object' && !Array.isArray(value)) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      // Arrays mit Objekten (Person-Repeater etc.) gehören nicht in eine
      // flache Key-Value-Liste. Deren Inhalte sind in legalClients oder
      // context aufgelöst.
      if (value.some((v) => typeof v === 'object' && v !== null)) continue;
      const joined = value
        .map((v) => formatValue(v))
        .filter((v): v is string => v !== null)
        .join(', ');
      if (joined) {
        entries.push({ label: humanLabel(key), value: joined });
      }
      continue;
    }

    const formatted = formatValue(value);
    if (formatted !== null) {
      entries.push({ label: humanLabel(key), value: formatted });
    }
  }
  return entries;
}

function convertClient(client: DiNoLegalClient, index: number): PayloadClient {
  const result: PayloadClient = {
    tempId: `c${index + 1}`,
    LastName: client.LastName,
    idGender_hint: client.idGender_hint,
    idBusinessForm_hint: client.idBusinessForm_hint,
    idLegalClientType_hint: client.idLegalClientType_hint,
    role: client._role,
    idLegalClientRole_hint: client._role,
  };
  if (client.FirstName) result.FirstName = client.FirstName;
  if (client.SurName) result.SurName = client.SurName;
  if (client.Birthdate) result.Birthdate = client.Birthdate;
  if (client.Birthplace) result.Birthplace = client.Birthplace;
  if (client.TaxNumber) result.TaxNumber = client.TaxNumber;
  if (client.Email) result.Email = client.Email;
  if (client.PhoneNumber) result.PhoneNumber = client.PhoneNumber;
  if (client.RegisterNumber) result.RegisterNumber = client.RegisterNumber;
  if (client.address) {
    result.address = {
      raw: client.address.raw,
      Street: client.address.Street,
      StreetNr: client.address.StreetNr,
      Postcode: client.address.Postcode,
      City: client.address.City,
    };
  }
  if (client._extraData) result.extraData = client._extraData;
  return result;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Vom Mandanten hochgeladene Datei, die DiNo beim Import als Dokument
 * ("Bereitgestellte Daten") an der Relationship anlegt. */
export interface DiNoAttachment {
  relPath: string;
  fileName: string;
  contentType?: string | null;
  dataBase64: string;
}

export function buildPayload(
  id: string,
  formType: string,
  submittedAt: string,
  pulledAt: string | null,
  rawData: Record<string, unknown>,
  mapping: DiNoMapping,
  attachments: DiNoAttachment[] = [],
): DiNoPayload {
  const legalClients = mapping.legalClients.map((c, i) => convertClient(c, i));

  const context: DiNoPayload['context'] = {};
  if (mapping.realEstate) context.realEstate = mapping.realEstate;
  if (mapping.mortgage) context.mortgage = mapping.mortgage;
  if (mapping.shareHolders && mapping.shareHolders.length > 0) context.shareHolders = mapping.shareHolders;
  if (mapping.newCompany) context.newCompany = mapping.newCompany;
  if (mapping.appointment) context.appointment = mapping.appointment;
  if (mapping.clientMessage) context.clientMessage = mapping.clientMessage;
  if (mapping.description) context.description = mapping.description;

  // DialogTitle bevorzugt aus der DB (FormSchema.title) — fällt sonst auf
  // das Mapping-Default zurück. Verhindert, dass DiNo den technischen
  // Slug (z. B. "allgemeines-anliegen") als Titel anzeigt.
  let dialogTitle = mapping._dialogTitle;
  try {
    const dialog = getDialog(formType);
    if (dialog && dialog.title) {
      dialogTitle = dialog.title;
    }
  } catch {
    // DB nicht erreichbar oder Dialog nicht gefunden → Default behalten.
  }

  // Hat das Mapping nur den technischen Slug als Vorgangstitel/Hint gesetzt
  // (generischer Dialog ohne spezifisches Mapping), den lesbaren
  // dialogTitle verwenden. Spezifische Titel (z. B. "Immobilienkauf – …")
  // bleiben unangetastet.
  const titleIsSlug = mapping.legalTransaction.Title === formType;
  const hintIsSlug =
    mapping.legalTransaction.LegalTransactionType_hint === formType;

  return {
    id,
    formType,
    dialogTitle,
    title: titleIsSlug ? dialogTitle : mapping.legalTransaction.Title,
    transactionTypeHint: hintIsSlug
      ? dialogTitle
      : mapping.legalTransaction.LegalTransactionType_hint,
    submittedAt,
    pulledAt,
    legalClients,
    summary: buildSummary(rawData),
    context: Object.keys(context).length > 0 ? context : undefined,
    // Attachments unter rawData.attachments — DiNo liest sie beim Dialog-
    // Import und legt sie als Dokumente an der Relationship an.
    rawData: attachments.length > 0 ? { ...rawData, attachments } : rawData,
  };
}
