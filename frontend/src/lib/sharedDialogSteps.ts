import type { FormSchema, FormStep } from '../types/schema';

// NOTE: the productive Kontakt-Step is centrally managed in the admin
// backend (settings.kontakt_step) and injected by the server when a
// dialog is loaded. The default below is only used as a fall-back inside
// the FormEditor preview. Changes to the central template apply to every
// dialog without touching the individual schemas.
export const defaultKontaktStep: FormStep = {
  id: 'kontakt',
  title: 'Kontakt & Termin',
  fields: [
    { id: 'anfrager_vorname', type: 'text', label: 'Vorname', required: true, placeholder: 'Vorname' },
    { id: 'anfrager_nachname', type: 'text', label: 'Nachname', required: true, placeholder: 'Nachname' },
    { id: 'email', type: 'email', label: 'E-Mail-Adresse', required: true, placeholder: 'ihre@email.de' },
    { id: 'telefon', type: 'tel', label: 'Telefonnummer', required: true, placeholder: '+49 ...' },
    { id: 'postadresse', type: 'address' as const, label: 'Postadresse (optional)', required: false },
    { id: 'email_einverstaendnis', type: 'checkbox', label: 'E-Mail-Einverständnis', required: true, checkboxLabel: 'Ich bin mit der unverschlüsselten Kommunikation per E-Mail einverstanden' },
    { id: 'auftrag', type: 'radio', label: 'Auftrag', required: true, layout: 'vertical', options: ['Ich beauftrage den Notar mit der Vorbereitung des Entwurfs', 'Ich möchte zunächst nur Informationen (noch kein Auftrag)'] },
    { id: 'termin_status', type: 'radio', label: 'Terminvereinbarung', required: true, layout: 'vertical', options: ['Bereits vereinbart', 'Bitte Kontakt aufnehmen'] },
    { id: 'termin_datum', type: 'text', label: 'Termindatum und -uhrzeit', required: true, placeholder: 'TT.MM.JJJJ HH:MM', condition: { fieldId: 'termin_status', operator: 'eq', value: 'Bereits vereinbart' } },
    { id: 'datenschutz', type: 'checkbox', label: 'Datenschutzerklärung', required: true, checkboxLabel: 'Ich habe die Datenschutzerklärung gelesen und stimme der Verarbeitung meiner Daten zu' },
    { id: 'aktenzeichen', type: 'text', label: 'Aktenzeichen (optional)', required: false, helpText: 'Falls bereits vorhanden' },
    { id: 'bemerkungen', type: 'textarea', label: 'Bemerkungen (optional)', required: false, rows: 4, placeholder: 'Sonstige Hinweise oder Anmerkungen für den Notar' },
  ],
};

function cloneStep(step: FormStep): FormStep {
  return JSON.parse(JSON.stringify(step)) as FormStep;
}

export function ensureKontaktStepAtEnd(schema: FormSchema): FormSchema {
  const kontaktSteps = schema.steps.filter((step) => step.id === 'kontakt');
  const otherSteps = schema.steps.filter((step) => step.id !== 'kontakt');
  const kontaktStep = kontaktSteps.length > 0
    ? cloneStep(kontaktSteps[kontaktSteps.length - 1])
    : cloneStep(defaultKontaktStep);

  return {
    ...schema,
    steps: [...otherSteps, kontaktStep],
  };
}
