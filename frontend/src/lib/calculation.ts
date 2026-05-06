// Pure helpers for the `calculation` field type.
//
// The formula is a left-to-right sequence of (operator, operand) steps.
// No precedence, no parentheses – this keeps the editor a simple list and
// covers all required notarial use cases (Anteil = Nennbetrag / Stammkapital
// * 100, EUR ↔ DM, Summenprüfung etc.).

import type { CalcOperand, CalcStep, CalculationField } from '../types/schema';

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    if (v.trim() === '') return null;
    // Accept German decimal comma as well as plain dot notation.
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Resolve an operand to a concrete number, or null if a referenced field is
// empty / non-numeric.
function resolveOperand(
  operand: CalcOperand,
  resolveField: (fieldId: string) => unknown,
): number | null {
  if (operand.kind === 'const') {
    return Number.isFinite(operand.value) ? operand.value : null;
  }
  if (!operand.fieldId) return null;
  return toNumber(resolveField(operand.fieldId));
}

export interface EvaluationResult {
  // null when the formula could not be evaluated (missing input,
  // division by zero, etc.).
  value: number | null;
}

export function evaluateFormula(
  steps: CalcStep[],
  resolveField: (fieldId: string) => unknown,
): EvaluationResult {
  if (!steps || steps.length === 0) return { value: null };

  let acc: number | null = resolveOperand(steps[0].operand, resolveField);
  if (acc === null) return { value: null };

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    const right = resolveOperand(step.operand, resolveField);
    if (right === null) return { value: null };
    switch (step.operator) {
      case '+': acc = acc + right; break;
      case '-': acc = acc - right; break;
      case '*': acc = acc * right; break;
      case '/':
        if (right === 0) return { value: null };
        acc = acc / right;
        break;
      default:
        return { value: null };
    }
  }

  return { value: Number.isFinite(acc) ? acc : null };
}

export function formatResult(value: number | null, field: CalculationField): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  let v = value;
  if (field.asPercent) v = v * 100;

  const decimals = field.decimals ?? 2;
  const formatted = v.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  // Apply preset format. Suffix/prefix can still override per-field.
  let prefix = field.prefix ?? '';
  let suffix = field.suffix ?? '';
  if (!field.suffix) {
    switch (field.format) {
      case 'euro':    suffix = ' €'; break;
      case 'dm':      suffix = ' DM'; break;
      case 'percent': suffix = ' %'; break;
    }
  }

  return `${prefix}${formatted}${suffix}`;
}
