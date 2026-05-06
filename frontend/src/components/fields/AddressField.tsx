import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { AddressField as AddressFieldType } from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { getNestedError } from './utils';

interface Props {
  field: AddressFieldType;
  prefix?: string;
}

const inputClass =
  'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-50';

interface SubFieldProps {
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
  defaultValue?: string;
  extraRules?: Record<string, unknown>;
}

function SubField({ name, label, placeholder, required, defaultValue, extraRules }: SubFieldProps) {
  const { register, formState: { errors } } = useFormContext();
  const error = getNestedError(errors, name);
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        defaultValue={defaultValue}
        className={inputClass}
        {...register(name, { required: required ? 'Pflichtfeld' : false, ...extraRules })}
      />
      {error && <p className="text-xs text-red-500">{error.message as string}</p>}
    </div>
  );
}

export function AddressField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const [showHelp, setShowHelp] = useState(false);
  if (!visible) return null;

  const base = prefix ? `${prefix}.${field.id}` : field.id;
  const req = !!field.required;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          {field.label}
          {req && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.helpText && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              ?
            </button>
            {showHelp && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowHelp(false)} />
                <div className="absolute left-0 top-6 z-20 w-64 bg-gray-800 text-white text-xs rounded-lg px-3 py-2.5 shadow-lg leading-relaxed">
                  {field.helpText}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <SubField name={`${base}.strasse`} label="Straße" placeholder="Musterstraße" required={req} />
        </div>
        <div className="w-24">
          <SubField name={`${base}.hausnummer`} label="Nr." placeholder="12a" required={req} />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="w-28">
          <SubField
            name={`${base}.plz`}
            label="PLZ"
            placeholder="12345"
            required={req}
            extraRules={{ validate: (v: string) => !v || /^\d{5}$/.test(v) || 'Ungültige PLZ' }}
          />
        </div>
        <div className="flex-1">
          <SubField name={`${base}.ort`} label="Ort" placeholder="Berlin" required={req} />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <SubField
            name={`${base}.land`}
            label="Land"
            placeholder="Deutschland"
            required={false}
            defaultValue="Deutschland"
          />
        </div>
      </div>
    </div>
  );
}
