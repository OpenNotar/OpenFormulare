import type { InfoField as InfoFieldType } from '../../types/schema';
import { useCondition } from '../../hooks/useCondition';
import { useInterpolated } from '../../hooks/useInterpolated';

interface Props {
  field: InfoFieldType;
  prefix?: string;
}

const TONE_CLASS: Record<NonNullable<InfoFieldType['tone']>, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
};

export function InfoField({ field, prefix }: Props) {
  const visible = useCondition(field.condition, prefix);
  const interpolatedText = useInterpolated(field.text) ?? field.text;
  const interpolatedLabel = useInterpolated(field.label) ?? field.label;
  if (!visible) return null;
  const cls = TONE_CLASS[field.tone ?? 'info'];
  return (
    <div className={`rounded-md border px-4 py-3 text-sm leading-relaxed ${cls}`} role="note">
      {interpolatedLabel && <p className="font-semibold mb-1">{interpolatedLabel}</p>}
      <p className="whitespace-pre-line">{interpolatedText}</p>
    </div>
  );
}
