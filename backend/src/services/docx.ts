// DOCX generator. Mirrors the structure that the PDF service produces, but
// outputs a .docx file. Used as an additional email attachment so notaries
// can edit the submission directly in Word.

import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } from 'docx';

interface SchemaField {
  id: string;
  label: string;
  type: string;
  fields?: SchemaField[];
  countField?: string;
  condition?: { fieldId: string; operator: string; value: unknown };
}
interface SchemaStep { id: string; title: string; fields: SchemaField[]; }
interface FormSchema { id: string; title: string; steps: SchemaStep[]; }

interface DocxOptions {
  formType: string;
  data: Record<string, unknown>;
  formSchema?: FormSchema;
  title?: string;
}

function evaluateCondition(condition: SchemaField['condition'], data: Record<string, unknown>): boolean {
  if (!condition) return true;
  const value = data[condition.fieldId];
  switch (condition.operator) {
    case 'eq': return value === condition.value;
    case 'neq': return value !== condition.value;
    case 'in': return Array.isArray(condition.value) && (condition.value as unknown[]).includes(value);
    case 'lt': return Number(value) < Number(condition.value);
    case 'gt': return Number(value) > Number(condition.value);
    case 'lte': return Number(value) <= Number(condition.value);
    case 'gte': return Number(value) >= Number(condition.value);
    default: return true;
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '–';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.length === 0 ? '–' : value.map(formatValue).join(', ');
    const obj = value as Record<string, unknown>;
    if ('strasse' in obj || 'plz' in obj || 'ort' in obj) {
      const parts = [
        [obj.strasse, obj.hausnummer].filter(Boolean).join(' '),
        [obj.plz, obj.ort].filter(Boolean).join(' '),
        obj.land,
      ].filter(Boolean);
      return parts.join(', ') || '–';
    }
    if ('geschaeftsanschrift' in obj || 'sitz' in obj) {
      const ga = formatValue(obj.geschaeftsanschrift);
      const sitz = formatValue(obj.sitz);
      const same = obj.gleich === true;
      return same
        ? `Geschäftsanschrift & Sitz: ${ga}`
        : `Geschäftsanschrift: ${ga}\nSitz: ${sitz}`;
    }
    return JSON.stringify(obj);
  }
  return String(value);
}

function fieldRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        children: value.split('\n').map((line) => new Paragraph(line)),
      }),
    ],
  });
}

function renderField(field: SchemaField, data: Record<string, unknown>, rows: TableRow[]) {
  if (field.condition && !evaluateCondition(field.condition, data)) return;

  if (field.type === 'repeater') {
    const items = (data[field.id] as unknown[] | Record<string, unknown> | undefined);
    let entries: Record<string, unknown>[] = [];
    if (Array.isArray(items)) {
      entries = items as Record<string, unknown>[];
    } else if (items && typeof items === 'object') {
      // RHF stores arrays sometimes as numerically-keyed objects
      entries = Object.values(items) as Record<string, unknown>[];
    }
    if (entries.length === 0) {
      rows.push(fieldRow(field.label, '–'));
      return;
    }
    entries.forEach((entry, idx) => {
      rows.push(fieldRow(`${field.label} ${idx + 1}`, ''));
      for (const inner of field.fields ?? []) {
        renderField(inner, entry, rows);
      }
    });
    return;
  }

  if (field.type === 'info') return; // hint text, no data

  rows.push(fieldRow(field.label, formatValue(data[field.id])));
}

export async function generateDocx({ formType, data, formSchema, title }: DocxOptions): Promise<Buffer> {
  const docTitle = title ?? formSchema?.title ?? formType;
  const sections: Paragraph[] = [
    new Paragraph({
      text: docTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
    }),
    new Paragraph({
      children: [new TextRun({ text: `Eingegangen: ${new Date().toLocaleString('de-DE')}`, italics: true, color: '666666' })],
    }),
    new Paragraph({ text: '' }),
  ];

  const docChildren: (Paragraph | Table)[] = [...sections];

  if (formSchema) {
    for (const step of formSchema.steps) {
      docChildren.push(new Paragraph({ text: step.title, heading: HeadingLevel.HEADING_2 }));
      const rows: TableRow[] = [];
      for (const field of step.fields) {
        renderField(field, data, rows);
      }
      if (rows.length > 0) {
        docChildren.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      } else {
        docChildren.push(new Paragraph({ children: [new TextRun({ text: '(keine Angaben)', italics: true, color: '999999' })] }));
      }
      docChildren.push(new Paragraph({ text: '' }));
    }
  } else {
    const rows: TableRow[] = [];
    for (const [k, v] of Object.entries(data)) rows.push(fieldRow(k, formatValue(v)));
    docChildren.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  const doc = new Document({
    sections: [{ children: docChildren }],
  });

  return Packer.toBuffer(doc);
}
