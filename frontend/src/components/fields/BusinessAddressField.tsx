import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { BusinessAddressField as BusinessAddressFieldType } from "../../types/schema";
import { useCondition } from "../../hooks/useCondition";
import { useI18n } from "../../i18n/context";
import { getNestedError } from "./utils";

interface Props {
  field: BusinessAddressFieldType;
  prefix?: string;
}

const inputClass =
  "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500";

interface SubFieldProps {
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
  disabled?: boolean;
  defaultValue?: string;
  extraRules?: Record<string, unknown>;
}

function SubField({
  name,
  label,
  placeholder,
  required,
  disabled,
  defaultValue,
  extraRules,
}: SubFieldProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const { t } = useI18n();
  const error = getNestedError(errors, name);
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        defaultValue={defaultValue}
        className={inputClass}
        disabled={disabled}
        {...register(name, {
          required: required && !disabled ? t('required') : false,
          ...extraRules,
        })}
      />
      {!disabled && error && (
        <p className="text-xs text-red-500">{error.message as string}</p>
      )}
    </div>
  );
}

interface AddressBlockProps {
  base: string;
  required: boolean;
  disabled?: boolean;
}

function AddressBlock({ base, required, disabled }: AddressBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <SubField
            name={`${base}.strasse`}
            label="Straße"
            placeholder="Musterstraße"
            required={required}
            disabled={disabled}
          />
        </div>
        <div className="w-24">
          <SubField
            name={`${base}.hausnummer`}
            label="Nr."
            placeholder="12a"
            required={required}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="w-28">
          <SubField
            name={`${base}.plz`}
            label="PLZ"
            placeholder="12345"
            required={required}
            disabled={disabled}
            extraRules={{
              validate: (v: string) =>
                !v || /^\d{5}$/.test(v) || "Ungültige PLZ",
            }}
          />
        </div>
        <div className="flex-1">
          <SubField
            name={`${base}.ort`}
            label="Ort"
            placeholder="Berlin"
            required={required}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <SubField
            name={`${base}.land`}
            label="Land"
            placeholder="Deutschland"
            required={false}
            disabled={disabled}
            defaultValue="Deutschland"
          />
        </div>
      </div>
    </div>
  );
}

export function BusinessAddressField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const [showHelp, setShowHelp] = useState(false);
  const {
    register,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext();
  const { t } = useI18n();

  const base = prefix ? `${prefix}.${field.id}` : field.id;
  const businessBase = `${base}.geschaeftsanschrift`;
  const sitzBase = `${base}.sitz`;
  const sitzOrtName = `${sitzBase}.ort`;
  const sameKey = `${base}.gleich`;

  // Default the toggle to true on first mount if no value is set yet,
  // and strip away any legacy address sub-fields on Sitz (street / number /
  // ZIP / country) that older versions stored — Sitz is now city-only.
  useEffect(() => {
    if (!visible) return;
    const current = getValues(sameKey);
    if (current === undefined) {
      setValue(sameKey, true, { shouldDirty: false });
    }
    const sitzVal = getValues(sitzBase) as Record<string, unknown> | undefined;
    if (sitzVal && typeof sitzVal === "object") {
      const hasLegacy = ["strasse", "hausnummer", "plz", "land"].some(
        (k) => k in sitzVal,
      );
      if (hasLegacy) {
        setValue(
          sitzBase,
          { ort: (sitzVal.ort as string) ?? "" },
          { shouldDirty: false },
        );
      }
    }
  }, [visible, sameKey, sitzBase, setValue, getValues]);

  // When the toggle is on, mirror only the city (Ort) of the
  // Geschäftsanschrift to Sitz. Sitz no longer carries street, ZIP, country.
  const same = useWatch({ name: sameKey }) as boolean | undefined;
  const businessOrt = useWatch({ name: `${businessBase}.ort` }) as
    | string
    | undefined;

  useEffect(() => {
    if (!visible || same !== true) return;
    setValue(
      sitzBase,
      { ort: businessOrt ?? "" },
      { shouldDirty: false, shouldValidate: false },
    );
  }, [visible, same, businessOrt, sitzBase, setValue]);

  if (!visible) return null;
  const req = !!field.required;
  const sitzDisabled = same === true;
  const sitzOrtError = getNestedError(errors, sitzOrtName);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-gray-700">
          {field.label || "Geschäftsanschrift & Sitz"}
        </span>
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
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowHelp(false)}
                />
                <div className="absolute left-0 top-6 z-20 w-64 bg-gray-800 text-white text-xs rounded-lg px-3 py-2.5 shadow-lg leading-relaxed">
                  {field.helpText}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Geschäftsanschrift – vollständige Adresse */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-gray-700">
          Geschäftsanschrift
          {req && <span className="text-red-500 ml-1">*</span>}
        </span>
        <AddressBlock base={businessBase} required={req} />
      </div>

      {/* Toggle: Sitz übernimmt den Ort der Geschäftsanschrift */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <span className="relative inline-flex">
          <input
            type="checkbox"
            className="peer sr-only"
            {...register(sameKey)}
          />
          <span className="w-10 h-6 rounded-full bg-gray-300 peer-checked:bg-primary transition-colors"></span>
          <span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"></span>
        </span>
        <span className="text-sm text-gray-700">
          Sitz entspricht dem Ort der Geschäftsanschrift
        </span>
      </label>

      {/* Sitz – ausschließlich Ort, keine Straße/PLZ/Hausnummer */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Sitz
          {req && <span className="text-red-500 ml-1">*</span>}
        </label>
        <input
          type="text"
          placeholder="z. B. Berlin"
          className={inputClass}
          disabled={sitzDisabled}
          {...register(sitzOrtName, {
            required: req && !sitzDisabled ? t('required') : false,
          })}
        />
        {!sitzDisabled && sitzOrtError && (
          <p className="text-xs text-red-500">
            {sitzOrtError.message as string}
          </p>
        )}
        <p className="text-xs text-gray-500">
          Der Sitz im Sinne des Registereintrags / der Satzung - die politische
          Gemeinde.
          {sitzDisabled &&
            " Wird automatisch vom Ort der Geschäftsanschrift übernommen."}
        </p>
      </div>
    </div>
  );
}
