"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultKontaktStep = getDefaultKontaktStep;
exports.getDefaultPersonTemplates = getDefaultPersonTemplates;
exports.getDefaultBranding = getDefaultBranding;
exports.ensureKontaktStepAtEnd = ensureKontaktStepAtEnd;
const settings_1 = require("./settings");
const legalForms_1 = require("./legalForms");
const DEFAULT_KONTAKT_STEP = {
    id: 'kontakt',
    title: 'Kontakt & Termin',
    fields: [
        { id: 'anfrager_vorname', type: 'text', label: 'Vorname', required: true, placeholder: 'Vorname' },
        { id: 'anfrager_nachname', type: 'text', label: 'Nachname', required: true, placeholder: 'Nachname' },
        { id: 'email', type: 'email', label: 'E-Mail-Adresse', required: true, placeholder: 'ihre@email.de' },
        { id: 'telefon', type: 'tel', label: 'Telefonnummer', required: true, placeholder: '+49 ...' },
        { id: 'postadresse', type: 'address', label: 'Postadresse (optional)', required: false },
        { id: 'email_einverstaendnis', type: 'checkbox', label: 'E-Mail-Einverständnis', required: true, checkboxLabel: 'Ich bin mit der unverschlüsselten Kommunikation per E-Mail einverstanden' },
        { id: 'auftrag', type: 'radio', label: 'Auftrag', required: true, layout: 'vertical', options: ['Ich beauftrage den Notar mit der Vorbereitung des Entwurfs', 'Ich möchte zunächst nur Informationen (noch kein Auftrag)'] },
        { id: 'termin_status', type: 'radio', label: 'Terminvereinbarung', required: true, layout: 'vertical', options: ['Bereits vereinbart', 'Bitte Kontakt aufnehmen'] },
        { id: 'termin_datum', type: 'text', label: 'Termindatum und -uhrzeit', required: true, placeholder: 'TT.MM.JJJJ HH:MM', condition: { fieldId: 'termin_status', operator: 'eq', value: 'Bereits vereinbart' } },
        { id: 'datenschutz', type: 'checkbox', label: 'Datenschutzerklärung', required: true, checkboxLabel: 'Ich habe die Datenschutzerklärung gelesen und stimme der Verarbeitung meiner Daten zu' },
        { id: 'aktenzeichen', type: 'text', label: 'Aktenzeichen (optional)', required: false, helpText: 'Falls bereits vorhanden' },
        { id: 'bemerkungen', type: 'textarea', label: 'Bemerkungen (optional)', required: false, rows: 4, placeholder: 'Sonstige Hinweise oder Anmerkungen für den Notar' },
    ],
};
const DEFAULT_NATURAL_PERSON_FIELDS = [
    { id: 'anrede', type: 'select', label: 'Anrede', options: ['Herr', 'Frau', 'Divers', 'Keine Angabe'], placeholder: 'Bitte wählen', required: false },
    { id: 'vorname', type: 'text', label: 'Vorname(n)', required: true },
    { id: 'nachname', type: 'text', label: 'Nachname', required: true },
    { id: 'geburtsname', type: 'text', label: 'Geburtsname (falls abweichend)', required: false },
    { id: 'geburtsdatum', type: 'date', label: 'Geburtsdatum', required: false },
    { id: 'geburtsort', type: 'text', label: 'Geburtsort', required: false },
    { id: 'staatsangehoerigkeit', type: 'text', label: 'Staatsangehörigkeit', required: false },
    { id: 'adresse', type: 'address', label: 'Anschrift', required: true },
    { id: 'email', type: 'email', label: 'E-Mail (optional)', required: false },
    { id: 'telefon', type: 'tel', label: 'Telefon (optional)', required: false },
];
const DEFAULT_LEGAL_PERSON_FIELDS = [
    { id: 'firma', type: 'text', label: 'Firma', required: true },
    {
        id: 'rechtsform',
        type: 'select',
        label: 'Rechtsform',
        required: false,
        options: [...legalForms_1.LEGAL_ENTITY_FORMS],
        placeholder: 'Bitte wählen',
    },
    {
        id: 'rechtsform_sonstiges',
        type: 'text',
        label: 'Sonstige Rechtsform',
        required: false,
        placeholder: 'Bitte angeben',
        condition: { fieldId: 'rechtsform', operator: 'eq', value: 'Sonstiges' },
    },
    { id: 'jp_registergericht', type: 'text', label: 'Registergericht', required: false },
    { id: 'jp_hrb', type: 'text', label: 'HRB-Nummer', required: false },
    {
        id: 'adresse_juristisch',
        type: 'business-address',
        label: 'Geschäftsanschrift & Sitz',
        required: true,
        helpText: 'Geschäftsanschrift und Sitz können abweichen. Wenn beide identisch sind, aktivieren Sie den Schieberegler.',
    },
    { id: 'jp_email', type: 'email', label: 'E-Mail (optional)', required: false },
    { id: 'jp_telefon', type: 'tel', label: 'Telefon (optional)', required: false },
];
const DEFAULT_BRANDING = {
    notarName: '',
    // Browser-Tab title template. Supported placeholder: {title}
    titleTemplate: '{title}',
    // PDF / Email primary colour, Hex without #.
    primaryColor: '1a3a5c',
    // Frontend theme colours (override env defaults if set).
    colors: {
        primary: '',
        primaryDark: '',
        accent: '',
    },
    // Favicon URL (data URI or absolute URL).
    faviconUrl: '',
    logoUrl: '',
};
function cloneStep(step) {
    return JSON.parse(JSON.stringify(step));
}
function getDefaultKontaktStep() {
    return cloneStep(DEFAULT_KONTAKT_STEP);
}
function getDefaultPersonTemplates() {
    return {
        natural: JSON.parse(JSON.stringify(DEFAULT_NATURAL_PERSON_FIELDS)),
        legal: JSON.parse(JSON.stringify(DEFAULT_LEGAL_PERSON_FIELDS)),
    };
}
function getDefaultBranding() {
    return JSON.parse(JSON.stringify(DEFAULT_BRANDING));
}
// Returns the currently active Kontakt-Step. Falls back to the default if no
// custom one has been configured. Reading from the settings table allows
// admins to centrally edit "Kontakt & Termin" — changes propagate to every
// dialog automatically because dialog records no longer store the step.
function getActiveKontaktStep() {
    const stored = (0, settings_1.getSetting)(settings_1.SETTING_KEYS.kontaktStep);
    if (stored && Array.isArray(stored.fields)) {
        return cloneStep({ ...stored, id: 'kontakt' });
    }
    return getDefaultKontaktStep();
}
function ensureKontaktStepAtEnd(schema) {
    const otherSteps = schema.steps.filter((step) => step.id !== 'kontakt');
    // Always append the active Kontakt template so changes via the admin
    // backend propagate automatically. Anything stored on the dialog itself
    // is discarded in favour of the central template.
    return {
        ...schema,
        steps: [...otherSteps, getActiveKontaktStep()],
    };
}
