import type { FormSchema } from '../db/types/schema';

export function diffSchemas(prev: FormSchema, next: FormSchema): string[] {
  const changes: string[] = [];

  if (prev.title !== next.title) {
    changes.push(`Titel: „${prev.title}" → „${next.title}"`);
  }
  if ((prev.category ?? '') !== (next.category ?? '')) {
    changes.push(`Kategorie: „${prev.category ?? '—'}" → „${next.category ?? '—'}"`);
  }

  const prevSteps = new Map(prev.steps.map((s) => [s.id, s]));
  const nextSteps = new Map(next.steps.map((s) => [s.id, s]));

  for (const [id, step] of nextSteps) {
    const prevStep = prevSteps.get(id);
    if (!prevStep) {
      changes.push(`Schritt „${step.title}" hinzugefügt`);
      continue;
    }
    if (prevStep.title !== step.title) {
      changes.push(`Schritt umbenannt: „${prevStep.title}" → „${step.title}"`);
    }
    const prevFields = new Map(prevStep.fields.map((f) => [f.id, f]));
    const nextFields = new Map(step.fields.map((f) => [f.id, f]));
    for (const [fid, field] of nextFields) {
      if (!prevFields.has(fid)) {
        changes.push(`Feld „${field.label}" hinzugefügt (${step.title})`);
      } else if (JSON.stringify(prevFields.get(fid)) !== JSON.stringify(field)) {
        changes.push(`Feld „${field.label}" geändert (${step.title})`);
      }
    }
    for (const [fid, field] of prevFields) {
      if (!nextFields.has(fid)) {
        changes.push(`Feld „${field.label}" entfernt (${step.title})`);
      }
    }
  }

  for (const [id, step] of prevSteps) {
    if (!nextSteps.has(id)) {
      changes.push(`Schritt „${step.title}" entfernt`);
    }
  }

  return changes.length > 0 ? changes : ['Keine Änderungen erkannt'];
}
