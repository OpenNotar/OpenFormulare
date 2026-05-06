// Single source of truth for the list of common German legal entity types
// (Rechtsformen juristischer Personen / Personengesellschaften).
//
// Used by:
//   - the default `legal-person` template (jp_rechtsform select options)
//   - any future dialog that needs a comprehensive Rechtsform-Auswahl
//
// Order: alphabetical within each group. Keep "Sonstiges" last so a free
// text fallback is always available.

export const LEGAL_ENTITY_FORMS: readonly string[] = [
  // Kapitalgesellschaften
  'GmbH',
  'UG (haftungsbeschränkt)',
  'AG',
  'KGaA',
  'SE (Europäische Aktiengesellschaft)',
  // Personengesellschaften
  'GbR',
  'OHG',
  'KG',
  'GmbH & Co. KG',
  'PartG',
  'PartG mbB',
  // Einzelkaufmann
  'e.K.',
  // Vereine & Stiftungen
  'eG',
  'e.V.',
  'Stiftung',
  // Sonstiges
  'Sonstiges',
];
