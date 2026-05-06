import { useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { FileField as FileFieldType } from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { FieldWrapper } from './FieldWrapper';

interface Props {
  field: FileFieldType;
  prefix?: string;
}

export function FileField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const { setValue, watch } = useFormContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  if (!visible) return null;

  const name = prefix ? `${prefix}.${field.id}` : field.id;
  const files: File[] = watch(name) ?? [];
  const maxFiles = field.maxFiles ?? 6;
  const maxBytes = (field.maxSizeMB ?? 4) * 1024 * 1024;

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const errors: string[] = [];
    const valid: File[] = [];

    Array.from(incoming).forEach((f) => {
      if (f.size > maxBytes) {
        errors.push(`${f.name}: zu groß (max. ${field.maxSizeMB ?? 4} MB)`);
      } else {
        valid.push(f);
      }
    });

    const combined = [...files, ...valid].slice(0, maxFiles);
    setValue(name, combined, { shouldValidate: true });

    if (errors.length) alert(errors.join('\n'));
  }

  function removeFile(index: number) {
    const updated = files.filter((_, i) => i !== index);
    setValue(name, updated, { shouldValidate: true });
  }

  return (
    <FieldWrapper label={field.label} required={field.required} helpText={field.helpText}>
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-primary bg-blue-50' : 'border-gray-300 hover:border-primary'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={field.accept}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <p className="text-sm text-gray-500">
          Dateien hier ablegen oder <span className="text-primary font-medium">klicken zum Auswählen</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {field.accept?.toUpperCase().replace(/\./g, '').replace(/,/g, ', ')} · max. {field.maxSizeMB ?? 4} MB · bis zu {maxFiles} Dateien
        </p>
      </div>

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-3 py-1.5 text-sm">
              <span className="truncate text-gray-700">{f.name}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="ml-2 text-gray-400 hover:text-red-500 shrink-0 text-xs"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </FieldWrapper>
  );
}
