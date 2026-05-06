import type { FieldErrors } from 'react-hook-form';

export function getNestedError(errors: FieldErrors, path: string): { message?: string } | undefined {
  return path.split('.').reduce((obj: unknown, key) => {
    if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key];
    return undefined;
  }, errors) as { message?: string } | undefined;
}
