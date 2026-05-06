import { useState } from 'react';
import { useInterpolated } from '../../hooks/useInterpolated';

interface Props {
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  children: React.ReactNode;
}

export function FieldWrapper({ label, required, helpText, error, children }: Props) {
  const [showHelp, setShowHelp] = useState(false);
  // Resolve `{feldId}` placeholders in label / helpText against the current
  // form state. Pure passthrough when no placeholders are present.
  const interpolatedLabel = useInterpolated(label) ?? label;
  const interpolatedHelp = useInterpolated(helpText);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          {interpolatedLabel}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {interpolatedHelp && (
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
                  {interpolatedHelp}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
