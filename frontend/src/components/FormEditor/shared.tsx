// Shared building blocks for editing FormField lists. Extracted from
// FormEditor so the Admin Settings page can reuse the exact same
// inputs/controls when editing the central Kontakt step or the Personen
// templates – without re-implementing a parallel UI.

import type {
  FieldType,
  FormSchema,
  FormStep,
  FormField,
  FieldCondition,
  PersonFieldOverrides,
  CalcOperand,
  CalcStep,
  CalculationFormat,
  CalculationField as CalculationFieldType,
  EmbedField as EmbedFieldType,
  FieldOption,
  OptionConfig,
} from '../../types/schema';
import { resolveOption } from '../../types/schema';
import { usePersonTemplates } from '../../hooks/usePersonTemplates';
import { listDialogs, type DialogRecord } from '../../lib/dialogsApi';

// ---------------------------------------------------------------------------
// Field type registry
// ---------------------------------------------------------------------------

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text', email: 'E-Mail', tel: 'Telefon', number: 'Zahl',
  textarea: 'Textfeld', date: 'Datum', select: 'Dropdown',
  radio: 'Radio-Auswahl', 'multi-select': 'Mehrfachauswahl',
  checkbox: 'Checkbox', file: 'Datei-Upload', repeater: 'Repeater',
  address: 'Adresse',
  'business-address': 'Geschäftsanschrift & Sitz',
  info: 'Hinweistext',
  person: 'Person',
  'natural-person': 'Natürliche Person',
  'legal-person': 'Juristische Person',
  calculation: 'Berechnungsfeld',
  embed: 'Anderen Dialog einbetten',
};

// Types the user can add via the editor's "+ Feld hinzufügen" toolbar.
// `business-address` is intentionally excluded – its logic is now part of
// the global juristische-Person template.
export const SIMPLE_TYPES: FieldType[] = [
  'text', 'email', 'tel', 'number', 'textarea', 'date', 'select', 'radio',
  'multi-select', 'checkbox', 'file', 'repeater', 'address', 'info',
  'calculation', 'person', 'natural-person', 'legal-person', 'embed',
];

export function slugify(str: string): string {
  return str.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'feld';
}

export function makeEmptyField(type: FieldType, label = 'Neues Feld'): FormField {
  const base = { id: slugify(label) + '_' + Date.now(), label, required: false };
  switch (type) {
    case 'text': case 'email': case 'tel':
      return { ...base, type, placeholder: '' };
    case 'number':
      return { ...base, type, placeholder: '', format: 'plain' as const, decimals: 2 };
    case 'textarea':
      return { ...base, type, placeholder: '', rows: 3 };
    case 'date':
      return { ...base, type };
    case 'select':
      return { ...base, type, options: ['Option 1', 'Option 2'], placeholder: 'Bitte wählen' };
    case 'radio':
      return { ...base, type, options: ['Option 1', 'Option 2'], layout: 'horizontal' as const };
    case 'multi-select':
      return { ...base, type, options: ['Option 1', 'Option 2'], layout: 'vertical' as const };
    case 'checkbox':
      return { ...base, type, checkboxLabel: 'Ich stimme zu' };
    case 'file':
      return { ...base, type, accept: '.pdf,.jpg,.jpeg,.png', maxSizeMB: 4, maxFiles: 5 };
    case 'repeater':
      return { ...base, type, countField: '', fields: [] };
    case 'address':
      return { ...base, type };
    case 'business-address':
      return { ...base, type, label: 'Geschäftsanschrift & Sitz' };
    case 'info':
      return { ...base, type, label: 'Hinweis', text: 'Hinweistext', tone: 'info' as const };
    case 'person':
      return { ...base, type, label: 'Person' };
    case 'natural-person':
      return { ...base, type, label: 'Natürliche Person' };
    case 'legal-person':
      return { ...base, type, label: 'Juristische Person' };
    case 'calculation':
      return {
        ...base,
        type,
        label: 'Berechnung',
        steps: [{ operand: { kind: 'const', value: 0 } }],
        format: 'plain' as const,
        decimals: 2,
      };
    case 'embed':
      return { ...base, type, label: 'Eingebetteter Dialog', dialogId: '' };
  }
}

// Collect all field IDs available for conditions (from current step and all
// previous steps). Used by the FieldConfigPanel. When more than one step
// exists, the step title is prefixed so the user can disambiguate.
// Field types whose value can be sensibly checked in a condition. Composite
// types (repeater, address, person, …) and presentational types (info, file,
// embed) are excluded because they don't expose a single primitive value at
// the top level.
const CONDITIONABLE_TYPES = new Set([
  'text',
  'email',
  'tel',
  'number',
  'textarea',
  'date',
  'select',
  'radio',
  'checkbox',
  'multi-select',
  'calculation',
]);

export function collectConditionFields(
  schema: FormSchema,
  stepIdx: number,
  skipFieldId?: string,
): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = [];
  const showPrefix = schema.steps.length > 1;
  for (let i = 0; i <= stepIdx; i++) {
    for (const f of schema.steps[i].fields) {
      if (f.id === skipFieldId) continue;
      if (CONDITIONABLE_TYPES.has(f.type)) {
        result.push({
          id: f.id,
          label: showPrefix ? `${schema.steps[i].title} › ${f.label}` : f.label,
        });
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// OptionsEditor – stable, top-level component used by select/radio fields
// to edit their option list. Defined OUTSIDE the FieldConfigPanel so its
// component identity stays the same across renders (otherwise React would
// unmount/remount the inputs on every keystroke and the user would lose
// focus after typing one character).
// ---------------------------------------------------------------------------

interface OptionsEditorProps {
  options: FieldOption[];
  onUpdate: (o: FieldOption[]) => void;
}

function OptionsEditor({ options, onUpdate }: OptionsEditorProps) {
  function updateAt(i: number, patch: Partial<OptionConfig> | string) {
    const next = [...options];
    if (typeof patch === 'string') {
      // string-form update: keep object form if it already had one
      const cur = next[i];
      if (typeof cur === 'string') next[i] = patch;
      else next[i] = { ...cur, value: patch };
    } else {
      const cur = resolveOption(next[i]);
      next[i] = { ...cur, ...patch };
    }
    onUpdate(next);
  }

  function toggleCondition(i: number) {
    const cur = resolveOption(options[i]);
    if (cur.condition) {
      // remove condition. If only `value` remains, downgrade to plain string.
      const { condition: _omit, ...rest } = cur;
      const next = [...options];
      next[i] = rest.label === undefined ? rest.value : rest;
      onUpdate(next);
    } else {
      const next = [...options];
      next[i] = { ...cur, condition: { fieldId: '', operator: 'eq', value: '' } };
      onUpdate(next);
    }
  }

  return (
    <div className="space-y-1.5">
      {options.map((rawOpt, i) => {
        const opt = resolveOption(rawOpt);
        const hasCondition = !!opt.condition;
        return (
          // The index is intentional: it pins the <input> to a stable slot in
          // the list. A content-derived key would change on every keystroke
          // (because the value is the key) and re-mount the input, throwing
          // focus away again.
          <div key={i} className="flex flex-col gap-1 border border-transparent rounded">
            <div className="flex gap-1">
              <input
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                value={opt.value}
                onChange={(e) => updateAt(i, e.target.value)}
              />
              <button
                type="button"
                onClick={() => toggleCondition(i)}
                title={hasCondition ? 'Bedingung entfernen' : 'Bedingung hinzufügen'}
                className={`px-1.5 text-xs rounded border ${hasCondition ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-400 hover:text-primary'}`}
                aria-label={`Bedingung für Option ${i + 1} ${hasCondition ? 'entfernen' : 'hinzufügen'}`}
              >
                {hasCondition ? '🔗' : '+?'}
              </button>
              <button
                type="button"
                onClick={() => onUpdate(options.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-500 px-1 text-xs"
                aria-label={`Option ${i + 1} entfernen`}
              >
                ✕
              </button>
            </div>
            {hasCondition && (
              <div className="flex gap-1 text-xs items-center pl-2">
                <span className="text-gray-500">nur wenn</span>
                <input
                  className="flex-1 border border-gray-300 rounded px-2 py-0.5 font-mono"
                  placeholder="feld_id"
                  value={opt.condition?.fieldId ?? ''}
                  onChange={(e) =>
                    updateAt(i, { condition: { ...(opt.condition as FieldCondition), fieldId: e.target.value } })
                  }
                />
                <select
                  className="border border-gray-300 rounded px-1 py-0.5"
                  value={opt.condition?.operator ?? 'eq'}
                  onChange={(e) =>
                    updateAt(i, { condition: { ...(opt.condition as FieldCondition), operator: e.target.value as FieldCondition['operator'] } })
                  }
                >
                  <option value="eq">=</option>
                  <option value="neq">≠</option>
                  <option value="in">in</option>
                  <option value="lt">&lt;</option>
                  <option value="lte">≤</option>
                  <option value="gt">&gt;</option>
                  <option value="gte">≥</option>
                  <option value="set">gesetzt</option>
                  <option value="unset">leer</option>
                </select>
                {!['set', 'unset'].includes(opt.condition?.operator ?? 'eq') && (
                  <input
                    className="flex-1 border border-gray-300 rounded px-2 py-0.5"
                    placeholder="Wert"
                    value={String(opt.condition?.value ?? '')}
                    onChange={(e) => {
                      const op = opt.condition?.operator ?? 'eq';
                      let val: string | string[] | number = e.target.value;
                      if (op === 'in') val = e.target.value.split(',').map((s) => s.trim());
                      else if (['lt', 'lte', 'gt', 'gte'].includes(op)) {
                        const n = Number(e.target.value);
                        val = Number.isFinite(n) ? n : e.target.value;
                      }
                      updateAt(i, { condition: { ...(opt.condition as FieldCondition), value: val } });
                    }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onUpdate([...options, `Option ${options.length + 1}`])}
        className="text-xs text-primary hover:underline"
      >
        + Option hinzufügen
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field config panel (right-hand pane)
// ---------------------------------------------------------------------------

export interface FieldConfigPanelProps {
  field: FormField;
  stepIdx: number;
  schema: FormSchema;
  onChange: (updated: FormField) => void;
  // Forwarded from FieldListEditor when configured – removes the listed
  // types from the type-change dropdown so the user can't recreate the
  // forbidden field via the type switcher.
  excludedTypes?: FieldType[];
}

export function FieldConfigPanel({ field, stepIdx, schema, onChange, excludedTypes }: FieldConfigPanelProps) {
  const f = field as unknown as Record<string, unknown>;
  const set = (key: string, value: unknown) => onChange({ ...field, [key]: value } as FormField);

  const conditionFields = collectConditionFields(schema, stepIdx, field.id);

  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';
  const inputClass = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <div className="space-y-4">
      {/* Type */}
      <div>
        <label className={labelClass}>Feldtyp</label>
        <select className={inputClass} value={field.type}
          onChange={(e) => onChange(makeEmptyField(e.target.value as FieldType, field.label))}>
          {SIMPLE_TYPES
            .filter((t) => !excludedTypes?.includes(t) || t === field.type)
            .map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
        </select>
      </div>

      {/* Label */}
      <div>
        <label className={labelClass}>Label</label>
        <input className={inputClass} value={field.label}
          onChange={(e) => {
            const newLabel = e.target.value;
            onChange({ ...field, label: newLabel } as FormField);
          }} />
      </div>

      {/* ID */}
      <div>
        <label className={labelClass}>Feld-ID <span className="font-normal text-gray-400">(technisch)</span></label>
        <input className={inputClass + ' font-mono text-xs'} value={field.id}
          onChange={(e) => set('id', e.target.value.replace(/\s+/g, '_').toLowerCase())} />
      </div>

      {/* Required */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={!!field.required}
          onChange={(e) => set('required', e.target.checked)}
          className="w-4 h-4 accent-primary" />
        <span className="text-sm text-gray-700">Pflichtfeld</span>
      </label>

      {/* Placeholder */}
      {['text', 'email', 'tel', 'number', 'textarea'].includes(field.type) && (
        <div>
          <label className={labelClass}>Platzhalter</label>
          <input className={inputClass} value={(f.placeholder as string) ?? ''}
            onChange={(e) => set('placeholder', e.target.value)} />
        </div>
      )}

      {/* Number-specific formatting */}
      {field.type === 'number' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Format</label>
              <select className={inputClass} value={(f.format as string) ?? 'plain'}
                onChange={(e) => set('format', e.target.value)}>
                <option value="plain">Ohne Einheit</option>
                <option value="euro">Euro (€)</option>
                <option value="percent">Prozent (%)</option>
                <option value="dm">Deutsche Mark (DM)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Nachkommastellen</label>
              <input
                type="number"
                min={0}
                max={6}
                className={inputClass}
                value={(f.decimals as number | undefined) ?? 2}
                onChange={(e) => set('decimals', Math.max(0, Math.min(6, parseInt(e.target.value, 10) || 0)))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Präfix (optional)</label>
              <input className={inputClass} value={(f.prefix as string) ?? ''}
                onChange={(e) => set('prefix', e.target.value || undefined)}
                placeholder="z. B. ≈ " />
            </div>
            <div>
              <label className={labelClass}>Suffix (optional)</label>
              <input className={inputClass} value={(f.suffix as string) ?? ''}
                onChange={(e) => set('suffix', e.target.value || undefined)}
                placeholder="überschreibt Format" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Min. Wert (optional)</label>
              <input
                type="number"
                step="any"
                className={inputClass}
                value={(f.min as number | undefined) ?? ''}
                onChange={(e) => set('min', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Max. Wert (optional)</label>
              <input
                type="number"
                step="any"
                className={inputClass}
                value={(f.max as number | undefined) ?? ''}
                onChange={(e) => set('max', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </div>
          </div>
        </>
      )}

      {/* Rows (textarea) */}
      {field.type === 'textarea' && (
        <div>
          <label className={labelClass}>Zeilen</label>
          <input type="number" min={2} max={12} className={inputClass} value={(f.rows as number) ?? 3}
            onChange={(e) => set('rows', parseInt(e.target.value, 10))} />
        </div>
      )}

      {/* Options (select / radio) */}
      {(field.type === 'select' || field.type === 'radio' || field.type === 'multi-select') && (
        <div>
          <label className={labelClass}>Optionen</label>
          <OptionsEditor options={(f.options as FieldOption[]) ?? []}
            onUpdate={(o) => set('options', o)} />
        </div>
      )}

      {/* Layout für radio/multi-select */}
      {(field.type === 'radio' || field.type === 'multi-select') && (
        <div>
          <label className={labelClass}>Layout</label>
          <select className={inputClass} value={(f.layout as string) ?? (field.type === 'radio' ? 'horizontal' : 'vertical')}
            onChange={(e) => set('layout', e.target.value)}>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertikal</option>
          </select>
        </div>
      )}

      {/* Placeholder for select */}
      {field.type === 'select' && (
        <div>
          <label className={labelClass}>Platzhalter (Dropdown)</label>
          <input className={inputClass} value={(f.placeholder as string) ?? ''}
            onChange={(e) => set('placeholder', e.target.value)} />
        </div>
      )}

      {/* Layout-Block ist weiter oben (gemeinsam für radio + multi-select) */}

      {/* Checkbox label */}
      {field.type === 'checkbox' && (
        <div>
          <label className={labelClass}>Checkbox-Beschriftung</label>
          <input className={inputClass} value={(f.checkboxLabel as string) ?? ''}
            onChange={(e) => set('checkboxLabel', e.target.value)} />
        </div>
      )}

      {/* File field */}
      {field.type === 'file' && (
        <>
          <div>
            <label className={labelClass}>Akzeptierte Dateitypen</label>
            <input className={inputClass} value={(f.accept as string) ?? ''}
              onChange={(e) => set('accept', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Max. Größe (MB)</label>
            <input type="number" min={1} className={inputClass} value={(f.maxSizeMB as number) ?? 4}
              onChange={(e) => set('maxSizeMB', parseInt(e.target.value, 10))} />
          </div>
          <div>
            <label className={labelClass}>Max. Anzahl Dateien</label>
            <input type="number" min={1} className={inputClass} value={(f.maxFiles as number) ?? 5}
              onChange={(e) => set('maxFiles', parseInt(e.target.value, 10))} />
          </div>
        </>
      )}

      {/* Repeater */}
      {field.type === 'repeater' && (
        <RepeaterConfigEditor
          field={field}
          schema={schema}
          stepIdx={stepIdx}
          onChange={(updated) => onChange(updated)}
        />
      )}

      {/* Info field */}
      {field.type === 'info' && (
        <>
          <div>
            <label className={labelClass}>Text</label>
            <textarea
              className={inputClass}
              rows={3}
              value={(f.text as string) ?? ''}
              onChange={(e) => set('text', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Stil</label>
            <select
              className={inputClass}
              value={(f.tone as string) ?? 'info'}
              onChange={(e) => set('tone', e.target.value)}
            >
              <option value="info">Information (blau)</option>
              <option value="warning">Hinweis / Warnung (gelb)</option>
              <option value="success">Bestätigung (grün)</option>
            </select>
          </div>
        </>
      )}

      {/* Person fields: per-template-field required override */}
      {(field.type === 'person' || field.type === 'natural-person' || field.type === 'legal-person') && (
        <PersonOverrideEditor
          fieldType={field.type}
          overrides={(f.fieldOverrides as PersonFieldOverrides | undefined)}
          onChange={(o) => set('fieldOverrides', o && Object.keys(o).length > 0 ? o : undefined)}
        />
      )}

      {/* Calculation field */}
      {field.type === 'calculation' && (
        <CalculationConfigEditor
          field={field as CalculationFieldType}
          schema={schema}
          stepIdx={stepIdx}
          onChange={(patch) => onChange({ ...field, ...patch } as FormField)}
        />
      )}

      {/* Embed field */}
      {field.type === 'embed' && (
        <EmbedConfigEditor
          field={field}
          currentDialogId={schema.id}
          onChange={(patch) => onChange({ ...field, ...patch } as FormField)}
        />
      )}

      {/* HelpText */}
      <div>
        <label className={labelClass}>Hilfetext <span className="font-normal text-gray-400">(optional)</span></label>
        <input className={inputClass} value={(f.helpText as string) ?? ''}
          onChange={(e) => set('helpText', e.target.value || undefined)} />
      </div>

      {/* Condition */}
      <div className="border-t border-gray-100 pt-4">
        <label className={labelClass}>Nur anzeigen wenn …</label>
        {conditionFields.length === 0 ? (
          <p className="text-xs text-gray-400">Keine bedingungsfähigen Felder verfügbar.</p>
        ) : (
          <div className="space-y-2">
            <select className={inputClass}
              value={(f.condition as FieldCondition | undefined)?.fieldId ?? ''}
              onChange={(e) => {
                if (!e.target.value) { set('condition', undefined); return; }
                set('condition', { fieldId: e.target.value, operator: 'eq', value: '' });
              }}>
              <option value="">— Keine Bedingung —</option>
              {conditionFields.map((cf) => <option key={cf.id} value={cf.id}>{cf.label}</option>)}
            </select>
            {(f.condition as FieldCondition | undefined)?.fieldId && (
              <div className="flex gap-2">
                <select className={inputClass}
                  value={(f.condition as FieldCondition).operator}
                  onChange={(e) => set('condition', { ...(f.condition as FieldCondition), operator: e.target.value as FieldCondition['operator'] })}>
                  <option value="eq">= gleich</option>
                  <option value="neq">≠ ungleich</option>
                  <option value="in">ist eines von (kommagetrennt)</option>
                  <option value="lt">&lt; kleiner als</option>
                  <option value="lte">≤ kleiner gleich</option>
                  <option value="gt">&gt; größer als</option>
                  <option value="gte">≥ größer gleich</option>
                  <option value="set">ist gesetzt (nicht leer / nicht 0)</option>
                  <option value="unset">ist leer / 0</option>
                </select>
                {!['set', 'unset'].includes((f.condition as FieldCondition).operator) && (
                  <input className={inputClass} placeholder="Wert"
                    value={String((f.condition as FieldCondition).value ?? '')}
                    onChange={(e) => {
                      const op = (f.condition as FieldCondition).operator;
                      let val: string | string[] | number = e.target.value;
                      if (op === 'in') {
                        val = e.target.value.split(',').map((s) => s.trim());
                      } else if (['lt', 'lte', 'gt', 'gte'].includes(op)) {
                        const n = Number(e.target.value);
                        val = Number.isFinite(n) ? n : e.target.value;
                      }
                      set('condition', { ...(f.condition as FieldCondition), value: val });
                    }} />
                )}
              </div>
            )}
            {/* clearWhenHidden toggle – only relevant when a condition exists. */}
            <label className="flex items-center gap-2 text-xs text-gray-700 mt-1.5 cursor-pointer">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-primary"
                checked={!!f.clearWhenHidden}
                onChange={(e) => set('clearWhenHidden', e.target.checked || undefined)}
              />
              Eingegebenen Wert verwerfen, wenn das Feld ausgeblendet wird
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldListEditor – the "single-step" experience.
//
// Renders a 2-column layout (field list + active field config) plus the
// "Feld hinzufügen" toolbar. Used both inside the FormEditor (per active
// step) and inside AdminSettings (Kontakt, Personen-Vorlagen).
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';

export interface FieldListEditorProps {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  // Used so condition selectors only see fields from the same list.
  fauxStepId?: string;
  // Disable the entire editor (e.g. demo mode).
  disabled?: boolean;
  // Optional banner above the list.
  banner?: React.ReactNode;
  // Field types that must not be addable in this editor instance. Used to
  // prevent self-referencing types inside the person-template editors – a
  // 'person' field inside the natural-person template would recurse.
  excludedTypes?: FieldType[];
  // 'split' (default): list left, config right. 'stacked': config rendered
  // below the list – used when this editor is embedded inside another
  // narrow panel (e.g. the repeater config block).
  layout?: 'split' | 'stacked';
}

export function FieldListEditor({ fields, onChange, fauxStepId = 'kontakt', disabled, banner, excludedTypes, layout = 'split' }: FieldListEditorProps) {
  const [activeFieldIdx, setActiveFieldIdx] = useState<number | null>(null);

  const fauxSchema: FormSchema = {
    id: 'editor-faux',
    title: 'Editor',
    steps: [{ id: fauxStepId, title: 'Felder', fields }],
  };

  function updateField(idx: number, updated: FormField) {
    onChange(fields.map((f, i) => (i === idx ? updated : f)));
  }

  function addField(type: FieldType) {
    if (disabled) return;
    const f = makeEmptyField(type);
    onChange([...fields, f]);
    setActiveFieldIdx(fields.length);
  }

  function removeField(idx: number) {
    if (disabled) return;
    onChange(fields.filter((_, i) => i !== idx));
    if (activeFieldIdx === idx) setActiveFieldIdx(null);
    else if (activeFieldIdx !== null && activeFieldIdx > idx) setActiveFieldIdx(activeFieldIdx - 1);
  }

  function moveField(idx: number, dir: -1 | 1) {
    if (disabled) return;
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
    setActiveFieldIdx(target);
  }

  const active = activeFieldIdx !== null ? fields[activeFieldIdx] : undefined;

  return (
    <div className={layout === 'stacked' ? 'flex flex-col gap-4' : 'grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4'}>
      {/* LEFT — Field list */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden flex flex-col">
        {banner}
        <div className="flex-1 p-4 space-y-2">
          {fields.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-12">
              Noch keine Felder. Unten ein Feld hinzufügen.
            </div>
          )}
          {fields.map((field, fi) => (
            <div key={field.id}
              onClick={() => setActiveFieldIdx(fi === activeFieldIdx ? null : fi)}
              className={`group flex items-center gap-3 bg-white border rounded-lg px-4 py-3 cursor-pointer transition-all ${fi === activeFieldIdx ? 'border-primary ring-1 ring-primary shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800 truncate">{field.label}</span>
                  {field.required && <span className="text-red-400 text-xs">*</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-400">{FIELD_TYPE_LABELS[field.type]}</span>
                  <span className="text-xs text-gray-300 font-mono">{field.id}</span>
                  {field.condition && <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded px-1">bedingt</span>}
                  {field.type === 'repeater' && (field as { countField?: string }).countField && (
                    <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5"
                      title="Wird durch dieses Anzahl-Feld gesteuert">
                      Anzahl: <code className="font-mono">{(field as { countField?: string }).countField}</code>
                    </span>
                  )}
                  {field.type === 'repeater' && (field as { personTemplate?: string }).personTemplate && (
                    <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5">
                      Vorlage: {(field as { personTemplate?: string }).personTemplate === 'natural' ? 'Natürlich'
                              : (field as { personTemplate?: string }).personTemplate === 'legal' ? 'Juristisch'
                              : 'Beide'}
                    </span>
                  )}
                </div>
              </div>
              {!disabled && (
                <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); moveField(fi, -1); }}
                    disabled={fi === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs">▲</button>
                  <button onClick={(e) => { e.stopPropagation(); moveField(fi, 1); }}
                    disabled={fi === fields.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs">▼</button>
                  <button onClick={(e) => { e.stopPropagation(); removeField(fi); }}
                    className="p-1 text-gray-400 hover:text-red-500 text-xs">✕</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {!disabled && (
          <div className="bg-white border-t border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-2">Feld hinzufügen:</p>
            <div className="flex flex-wrap gap-1.5">
              {SIMPLE_TYPES.filter((t) => !excludedTypes?.includes(t)).map((type) => (
                <button key={type} onClick={() => addField(type)}
                  className="text-xs px-2.5 py-1 border border-gray-300 rounded-full hover:border-primary hover:text-primary transition-colors">
                  + {FIELD_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT — Field config */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {active ? 'Feld konfigurieren' : 'Konfiguration'}
          </span>
        </div>
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {!active && (
            <p className="text-sm text-gray-400">
              Wählen Sie links ein Feld aus, um es hier zu bearbeiten.
            </p>
          )}
          {active && activeFieldIdx !== null && (
            <FieldConfigPanel
              field={active}
              stepIdx={0}
              schema={fauxSchema}
              onChange={(updated) => updateField(activeFieldIdx, updated)}
              excludedTypes={excludedTypes}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Re-export commonly-needed step helper.
export function makeEmptyStep(n: number): FormStep {
  return { id: `schritt_${n}`, title: `Schritt ${n}`, fields: [] };
}

// ---------------------------------------------------------------------------
// CalculationConfigEditor – lets the user describe the formula visually.
// The formula is a left-to-right list of (operator, operand) steps; each
// operand is either a number constant or a reference to another number
// field in the dialog.
// ---------------------------------------------------------------------------

interface CalculationConfigEditorProps {
  field: CalculationFieldType;
  schema: FormSchema;
  stepIdx: number;
  onChange: (patch: Partial<CalculationFieldType>) => void;
}

function CalculationConfigEditor({ field, schema, stepIdx, onChange }: CalculationConfigEditorProps) {
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';
  const inputClass = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

  // All number-ish fields available as operands – pulled from the same step
  // and earlier ones to keep the order intuitive.
  const numericFields: { id: string; label: string }[] = [];
  for (let i = 0; i <= stepIdx; i++) {
    for (const f of schema.steps[i].fields) {
      if (f.id === field.id) continue;
      if (f.type === 'number' || f.type === 'text' || f.type === 'calculation') {
        numericFields.push({
          id: f.id,
          label: schema.steps.length > 1 ? `${schema.steps[i].title} › ${f.label}` : f.label,
        });
      }
    }
  }

  const steps = field.steps ?? [];

  function updateStep(i: number, patch: Partial<CalcStep>) {
    const next = steps.map((s, j) => (i === j ? { ...s, ...patch } : s));
    onChange({ steps: next });
  }
  function updateOperand(i: number, patch: Partial<CalcOperand>) {
    const current = steps[i]?.operand ?? { kind: 'const', value: 0 };
    const merged = { ...current, ...patch } as CalcOperand;
    updateStep(i, { operand: merged });
  }
  function addStep() {
    onChange({ steps: [...steps, { operator: '+', operand: { kind: 'const', value: 0 } }] });
  }
  function removeStep(i: number) {
    onChange({ steps: steps.filter((_, j) => j !== i) });
  }
  function moveStep(i: number, dir: -1 | 1) {
    const target = i + dir;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[i], next[target]] = [next[target], next[i]];
    onChange({ steps: next });
  }

  function applyPreset(preset: 'percentShare' | 'eurToDm' | 'dmToEur') {
    if (preset === 'percentShare') {
      onChange({
        steps: [
          { operand: { kind: 'field', fieldId: '' } },
          { operator: '/', operand: { kind: 'field', fieldId: '' } },
          { operator: '*', operand: { kind: 'const', value: 100 } },
        ],
        format: 'percent', decimals: 2, asPercent: false, suffix: undefined, prefix: undefined,
      });
    } else if (preset === 'eurToDm') {
      onChange({
        steps: [
          { operand: { kind: 'field', fieldId: '' } },
          { operator: '*', operand: { kind: 'const', value: 1.95583 } },
        ],
        format: 'dm', decimals: 2, asPercent: false, suffix: undefined, prefix: undefined,
      });
    } else if (preset === 'dmToEur') {
      onChange({
        steps: [
          { operand: { kind: 'field', fieldId: '' } },
          { operator: '/', operand: { kind: 'const', value: 1.95583 } },
        ],
        format: 'euro', decimals: 2, asPercent: false, suffix: undefined, prefix: undefined,
      });
    }
  }

  return (
    <div className="border-t border-gray-100 pt-4 space-y-4">
      <div>
        <label className={labelClass}>Formel <span className="font-normal text-gray-400">(links → rechts ausgewertet, keine Klammerung)</span></label>

        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md p-2">
              {i === 0 ? (
                <span className="text-xs text-gray-400 w-8 text-center">Start</span>
              ) : (
                <select
                  className="border border-gray-300 rounded px-1.5 py-1 text-sm bg-white w-12 text-center"
                  value={s.operator ?? '+'}
                  onChange={(e) => updateStep(i, { operator: e.target.value as CalcStep['operator'] })}
                >
                  <option value="+">+</option>
                  <option value="-">−</option>
                  <option value="*">×</option>
                  <option value="/">÷</option>
                </select>
              )}

              <select
                className="border border-gray-300 rounded px-1.5 py-1 text-sm bg-white"
                value={s.operand.kind}
                onChange={(e) => {
                  const kind = e.target.value as 'const' | 'field';
                  updateOperand(i, kind === 'const' ? { kind: 'const', value: 0 } : { kind: 'field', fieldId: '' });
                }}
              >
                <option value="field">Feld</option>
                <option value="const">Wert</option>
              </select>

              {s.operand.kind === 'field' ? (
                <select
                  className="flex-1 border border-gray-300 rounded px-1.5 py-1 text-sm bg-white"
                  value={s.operand.fieldId ?? ''}
                  onChange={(e) => updateOperand(i, { kind: 'field', fieldId: e.target.value })}
                >
                  <option value="">— Feld wählen —</option>
                  {numericFields.map((nf) => (
                    <option key={nf.id} value={nf.id}>{nf.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  step="any"
                  className="flex-1 border border-gray-300 rounded px-1.5 py-1 text-sm bg-white"
                  value={s.operand.kind === 'const' ? s.operand.value : 0}
                  onChange={(e) => updateOperand(i, { kind: 'const', value: Number(e.target.value) || 0 })}
                />
              )}

              <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs">▲</button>
              <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs">▼</button>
              <button type="button" onClick={() => removeStep(i)}
                className="p-1 text-gray-400 hover:text-red-500 text-xs" disabled={steps.length <= 1}>✕</button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addStep}
          className="mt-2 text-xs text-primary hover:underline">+ Schritt hinzufügen</button>
      </div>

      {/* Presets */}
      <div>
        <label className={labelClass}>Vorlagen</label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => applyPreset('percentShare')}
            className="text-xs px-2.5 py-1 border border-gray-300 rounded-full hover:border-primary hover:text-primary transition-colors">
            Anteil in % (a ÷ b × 100)
          </button>
          <button type="button" onClick={() => applyPreset('eurToDm')}
            className="text-xs px-2.5 py-1 border border-gray-300 rounded-full hover:border-primary hover:text-primary transition-colors">
            EUR → DM
          </button>
          <button type="button" onClick={() => applyPreset('dmToEur')}
            className="text-xs px-2.5 py-1 border border-gray-300 rounded-full hover:border-primary hover:text-primary transition-colors">
            DM → EUR
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Vorlagen ersetzen die Formel. Felder müssen anschließend gewählt werden.
        </p>
      </div>

      {/* Formatting */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Format</label>
          <select
            className={inputClass}
            value={field.format ?? 'plain'}
            onChange={(e) => onChange({ format: e.target.value as CalculationFormat })}
          >
            <option value="plain">Ohne Einheit</option>
            <option value="euro">Euro (€)</option>
            <option value="percent">Prozent (%)</option>
            <option value="dm">Deutsche Mark (DM)</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Nachkommastellen</label>
          <input
            type="number"
            min={0}
            max={6}
            className={inputClass}
            value={field.decimals ?? 2}
            onChange={(e) => onChange({ decimals: Math.max(0, Math.min(6, parseInt(e.target.value, 10) || 0)) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Präfix (optional)</label>
          <input
            type="text"
            className={inputClass}
            value={field.prefix ?? ''}
            onChange={(e) => onChange({ prefix: e.target.value || undefined })}
            placeholder="z. B. ≈ "
          />
        </div>
        <div>
          <label className={labelClass}>Suffix (optional)</label>
          <input
            type="text"
            className={inputClass}
            value={field.suffix ?? ''}
            onChange={(e) => onChange({ suffix: e.target.value || undefined })}
            placeholder="überschreibt Format"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-primary"
          checked={!!field.asPercent}
          onChange={(e) => onChange({ asPercent: e.target.checked || undefined })}
        />
        <span className="text-sm text-gray-700">Ergebnis ×100 (z. B. wenn Formel ein Verhältnis liefert)</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-primary"
          checked={!!field.hideIfIncomplete}
          onChange={(e) => onChange({ hideIfIncomplete: e.target.checked || undefined })}
        />
        <span className="text-sm text-gray-700">Feld ausblenden, wenn Eingaben fehlen</span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RepeaterConfigEditor – the new repeater config UI. A repeater always
// pulls its inner fields from the global person template, with optional
// per-dialog `required` overrides, plus user-defined extra fields appended
// to every repeater entry.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// EmbedConfigEditor – pick another dialog to inline. Used by the
// Unterschriftsbeglaubigung's HR/VR sub-flow for example.
// ---------------------------------------------------------------------------

interface EmbedConfigEditorProps {
  field: EmbedFieldType;
  currentDialogId: string;
  onChange: (patch: Partial<EmbedFieldType>) => void;
}

function EmbedConfigEditor({ field, currentDialogId, onChange }: EmbedConfigEditorProps) {
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';
  const inputClass = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

  const [dialogs, setDialogs] = useState<DialogRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDialogs()
      .then((list) => {
        if (!cancelled) setDialogs(list.filter((d) => d.id !== currentDialogId));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => { cancelled = true; };
  }, [currentDialogId]);

  const stepIdsCsv = (field.stepIds ?? []).join(', ');

  return (
    <div className="border-t border-gray-100 pt-4 space-y-3">
      <div>
        <label className={labelClass}>Einzubettender Dialog</label>
        <select
          className={inputClass}
          value={field.dialogId}
          onChange={(e) => onChange({ dialogId: e.target.value })}
        >
          <option value="">— Dialog wählen —</option>
          {dialogs.map((d) => (
            <option key={d.id} value={d.id}>{d.title} ({d.id})</option>
          ))}
        </select>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        <p className="text-xs text-gray-500 mt-1">
          Die Felder des gewählten Dialogs werden hier inline angezeigt. Der
          Kontakt-Step wird automatisch ausgelassen, weil der umschließende
          Dialog bereits einen eigenen hat.
        </p>
      </div>
      <div>
        <label className={labelClass}>
          Optional: nur bestimmte Schritte
          <span className="font-normal text-gray-400"> (kommagetrennt, z. B. „gesellschaft, aenderungen")</span>
        </label>
        <input
          type="text"
          className={inputClass + ' font-mono text-xs'}
          value={stepIdsCsv}
          onChange={(e) => {
            const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
            onChange({ stepIds: list.length > 0 ? list : undefined });
          }}
          placeholder="leer = alle Schritte"
        />
      </div>
    </div>
  );
}

interface RepeaterConfigEditorProps {
  field: FormField & { type: 'repeater' };
  schema: FormSchema;
  stepIdx: number;
  onChange: (updated: FormField) => void;
}

function RepeaterConfigEditor({ field, schema, stepIdx, onChange }: RepeaterConfigEditorProps) {
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

  // Build the dropdown of available count fields from the same step and
  // earlier ones, so the user can see (and pick) the source clearly.
  const countCandidates: { id: string; label: string }[] = [];
  for (let i = 0; i <= stepIdx; i++) {
    for (const f of schema.steps[i].fields) {
      if (f.id === field.id) continue;
      if (f.type === 'radio' || f.type === 'select' || f.type === 'number') {
        countCandidates.push({
          id: f.id,
          label: schema.steps.length > 1 ? `${schema.steps[i].title} › ${f.label}` : f.label,
        });
      }
    }
  }
  const countLabel = countCandidates.find((c) => c.id === field.countField)?.label ?? null;

  const personTemplate = field.personTemplate;
  const fieldType: 'natural-person' | 'legal-person' | 'person' =
    personTemplate === 'natural' ? 'natural-person'
    : personTemplate === 'legal' ? 'legal-person'
    : 'person';

  return (
    <div className="space-y-4">
      {/* Count field – emphasised, with both name and human label */}
      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5">
        <p className="text-xs font-medium text-blue-900 mb-1.5">Anzahl wird gesteuert durch</p>
        <select
          className="w-full border border-blue-200 bg-white rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          value={field.countField ?? ''}
          onChange={(e) => onChange({ ...field, countField: e.target.value })}
        >
          <option value="">— Anzahl-Feld wählen —</option>
          {countCandidates.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        {field.countField && (
          <p className="text-xs text-blue-700 mt-1.5">
            <code className="font-mono bg-white border border-blue-200 px-1 rounded">{field.countField}</code>
            {countLabel ? <> – „{countLabel.split(' › ').pop()}"</> : null}
          </p>
        )}
      </div>

      {/* Personen-Vorlage – mandatory */}
      <div>
        <label className={labelClass}>Personen-Vorlage</label>
        <select
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          value={personTemplate ?? ''}
          onChange={(e) => onChange({ ...field, personTemplate: (e.target.value || undefined) as typeof field.personTemplate })}
        >
          <option value="">— Vorlage wählen —</option>
          <option value="natural">Natürliche Person</option>
          <option value="legal">Juristische Person</option>
          <option value="both">Beide (auswählbar via Typ-Radio)</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Die Felder kommen aus der globalen Vorlage (Admin → Einstellungen → Personen-Vorlagen).
        </p>
      </div>

      {/* Maximale Anzahl */}
      <div>
        <label className={labelClass}>Maximale Anzahl <span className="font-normal text-gray-400">(optional)</span></label>
        <div className="flex gap-2 items-center">
          <select
            className="border border-gray-300 rounded px-2 py-1.5 text-sm w-32"
            value={
              field.maxItems === undefined ? 'none'
              : typeof field.maxItems === 'number' ? 'number'
              : 'fieldRef'
            }
            onChange={(e) => {
              const mode = e.target.value;
              if (mode === 'none') onChange({ ...field, maxItems: undefined });
              else if (mode === 'number') onChange({ ...field, maxItems: 4 });
              else onChange({ ...field, maxItems: { fieldRef: '' } });
            }}
          >
            <option value="none">— keine —</option>
            <option value="number">fest</option>
            <option value="fieldRef">aus Feld</option>
          </select>
          {typeof field.maxItems === 'number' && (
            <input
              type="number"
              min={0}
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
              value={field.maxItems}
              onChange={(e) => onChange({ ...field, maxItems: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
          )}
          {field.maxItems && typeof field.maxItems === 'object' && 'fieldRef' in field.maxItems && (
            <input
              type="text"
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
              placeholder="feld_id oder /absolute_id"
              value={field.maxItems.fieldRef}
              onChange={(e) => onChange({ ...field, maxItems: { fieldRef: e.target.value } })}
            />
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Cap für die Anzahl der Einträge. „aus Feld" referenziert ein anderes Feld
          (z. B. <code className="font-mono">anzahl_kinder</code> für „darf nicht
          größer sein als die Gesamtzahl der Kinder").
        </p>
      </div>

      {/* Required overrides for the chosen template */}
      {personTemplate && (
        <PersonOverrideEditor
          fieldType={fieldType}
          overrides={field.fieldOverrides}
          onChange={(o) => onChange({ ...field, fieldOverrides: o && Object.keys(o).length > 0 ? o : undefined })}
        />
      )}

      {/* Extra fields */}
      {personTemplate && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-600 mb-1">Zusätzliche Felder</p>
          <p className="text-xs text-gray-500 mb-3">
            Diese Felder werden in jedem Repeater-Eintrag <strong>nach</strong> der Vorlage angezeigt.
          </p>
          <FieldListEditor
            fields={field.extraFields ?? []}
            onChange={(next) => onChange({ ...field, extraFields: next.length > 0 ? next : undefined })}
            fauxStepId={`${field.id}_extra`}
            layout="stacked"
            excludedTypes={['person', 'natural-person', 'legal-person', 'repeater']}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PersonOverrideEditor – lets the user toggle `required` per template field
// for a person-typed field, without forking the global template.
// ---------------------------------------------------------------------------

interface PersonOverrideEditorProps {
  fieldType: 'person' | 'natural-person' | 'legal-person';
  overrides: PersonFieldOverrides | undefined;
  onChange: (next: PersonFieldOverrides | undefined) => void;
}

function PersonOverrideEditor({ fieldType, overrides, onChange }: PersonOverrideEditorProps) {
  const { naturalTemplate, legalTemplate } = usePersonTemplates();

  const sections: { title: string; fields: FormField[] }[] = [];
  if (fieldType === 'natural-person' || fieldType === 'person') {
    sections.push({ title: 'Natürliche Person', fields: naturalTemplate ?? [] });
  }
  if (fieldType === 'legal-person' || fieldType === 'person') {
    sections.push({ title: 'Juristische Person', fields: legalTemplate ?? [] });
  }

  const noTemplate = sections.every((s) => s.fields.length === 0);

  function setRequired(fieldId: string, required: boolean | null) {
    const next: PersonFieldOverrides = { ...(overrides ?? {}) };
    if (required === null) {
      const entry = { ...(next[fieldId] ?? {}) };
      delete entry.required;
      if (Object.keys(entry).length === 0) delete next[fieldId];
      else next[fieldId] = entry;
    } else {
      next[fieldId] = { ...(next[fieldId] ?? {}), required };
    }
    onChange(Object.keys(next).length > 0 ? next : undefined);
  }

  return (
    <div className="border-t border-gray-100 pt-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Pflichtfeld-Übersteuerung</label>
        <p className="text-xs text-gray-500 mb-2">
          Die Felder kommen aus der globalen Vorlage. Hier kannst du je Feld festlegen, ob es in
          diesem Dialog Pflicht ist (Vorlage = Standard, ✓ = Pflicht, ✕ = optional).
        </p>
      </div>

      {noTemplate && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Keine Personen-Vorlage hinterlegt. Im Admin-Bereich unter <em>Einstellungen → Personen-Vorlagen</em> definieren.
        </div>
      )}

      {sections.map((section) => (
        section.fields.length > 0 && (
          <div key={section.title} className="rounded-md border border-gray-200 bg-gray-50">
            <p className="text-xs font-semibold text-gray-600 px-3 py-1.5 border-b border-gray-200 bg-white rounded-t-md">
              {section.title}
            </p>
            <ul className="divide-y divide-gray-200">
              {section.fields.map((tf) => {
                const override = overrides?.[tf.id]?.required;
                const templateRequired = !!tf.required;
                const effective = override === undefined ? templateRequired : override;
                return (
                  <li key={tf.id} className="px-3 py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{tf.label || tf.id}</p>
                      <p className="text-xs text-gray-400 font-mono">{tf.id}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setRequired(tf.id, null)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          override === undefined
                            ? 'border-primary text-primary bg-primary/5'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                        title="Vorlage übernehmen"
                      >
                        Vorlage
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequired(tf.id, true)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          override === true
                            ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                        title="Pflichtfeld erzwingen"
                      >
                        Pflicht
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequired(tf.id, false)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          override === false
                            ? 'border-gray-500 text-gray-700 bg-gray-100'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                        title="Optional erzwingen"
                      >
                        Optional
                      </button>
                    </div>
                    <span className={`text-xs w-3 text-center shrink-0 ${effective ? 'text-red-400' : 'text-gray-300'}`}>
                      {effective ? '*' : '·'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ))}
    </div>
  );
}
