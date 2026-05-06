// Side-effect hook: when a field becomes invisible due to its condition
// AND the field opted into `clearWhenHidden`, drop the value from the
// form state. Stops "Geister-Werte" from previously-visible inputs from
// leaking into the submission.

import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';

export function useClearWhenHidden(
  name: string,
  visible: boolean,
  enabled: boolean | undefined,
) {
  const { setValue, getValues } = useFormContext();
  useEffect(() => {
    if (!enabled || visible) return;
    const current = getValues(name);
    if (current === undefined) return;
    setValue(name, undefined, { shouldDirty: false, shouldValidate: false });
  }, [visible, enabled, name, setValue, getValues]);
}
