import { LANGUAGE_LABELS, type LanguageCode } from '../i18n';

interface LanguageSwitcherProps {
  // Languages available for this dialog (always includes 'de').
  available: LanguageCode[];
  active: LanguageCode;
  onChange: (code: LanguageCode) => void;
  className?: string;
}

// Compact language picker for the public dialog page. Hidden completely
// when only German is offered.
export function LanguageSwitcher({ available, active, onChange, className }: LanguageSwitcherProps) {
  if (available.length <= 1) return null;
  return (
    <label className={`inline-flex items-center gap-2 text-xs text-gray-600 ${className ?? ''}`}>
      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2M5 8c1 3 4 6 8 6M13 8s-1 3-5 8" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 21l4-10 4 10M14 17h6" />
      </svg>
      <select
        value={active}
        onChange={(e) => onChange(e.target.value as LanguageCode)}
        className="bg-transparent border border-gray-300 rounded-md py-1 pl-2 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {available.map((code) => (
          <option key={code} value={code}>
            {LANGUAGE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
