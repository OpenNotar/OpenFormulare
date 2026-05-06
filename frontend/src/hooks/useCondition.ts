import { useFormContext } from 'react-hook-form';
import type { FieldCondition, ConditionValue } from '../types/schema';

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readFromValues(values: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((obj, k) => {
    if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
    return undefined;
  }, values);
}

// Resolve the right-hand operand. Plain values are returned as-is; a
// `{ fieldRef: '...' }` reference is looked up against the form state.
// Field-refs starting with `/` are interpreted as absolute paths from the
// form root (useful inside repeaters when comparing to a top-level field).
// Otherwise the reference is relative to the current `prefix`.
function resolveValue(
  raw: ConditionValue,
  values: unknown,
  prefix?: string,
): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'fieldRef' in raw) {
    const ref = raw.fieldRef;
    if (ref.startsWith('/')) {
      return readFromValues(values, ref.slice(1));
    }
    const key = prefix ? `${prefix}.${ref}` : ref;
    return readFromValues(values, key);
  }
  return raw;
}

// Pure evaluator: takes a snapshot of form values and returns whether the
// condition matches. Exposed for callers that need to evaluate many
// conditions at once (e.g. filtering radio/select options) and don't want
// to spin up one `useCondition` hook per option.
export function evaluateCondition(
  condition: FieldCondition | undefined,
  allValues: unknown,
  prefix?: string,
): boolean {
  if (!condition) return true;

  const key = prefix
    ? `${prefix}.${condition.fieldId}`
    : condition.fieldId;
  const value = readFromValues(allValues, key);
  const right = resolveValue(condition.value, allValues, prefix);

  if (condition.operator === 'set' || condition.operator === 'unset') {
    const isSet =
      value !== undefined
      && value !== null
      && value !== ''
      && value !== 0
      && value !== '0'
      && value !== false
      && !(Array.isArray(value) && value.length === 0);
    return condition.operator === 'set' ? isSet : !isSet;
  }

  if (condition.operator === 'contains' || condition.operator === 'notContains') {
    const has = Array.isArray(value) && value.includes(right as never);
    return condition.operator === 'contains' ? has : !has;
  }

  switch (condition.operator) {
    case 'eq':
      return value === right;
    case 'neq':
      return value !== right;
    case 'in':
      return (
        Array.isArray(right) &&
        (right as unknown[]).includes(value as string)
      );
    case 'lt':
    case 'gt':
    case 'lte':
    case 'gte': {
      const a = toNumber(value);
      const b = toNumber(right as string | number);
      if (a === null || b === null) return false;
      switch (condition.operator) {
        case 'lt': return a < b;
        case 'gt': return a > b;
        case 'lte': return a <= b;
        case 'gte': return a >= b;
      }
      return false;
    }
    default:
      return true;
  }
}

export function useCondition(
  condition: FieldCondition | undefined,
  prefix?: string
): boolean {
  const { watch } = useFormContext();
  return evaluateCondition(condition, watch(), prefix);
}
