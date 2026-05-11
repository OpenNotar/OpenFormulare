import nodemailer, { type SendMailOptions } from 'nodemailer';
import fs from 'fs';
import path from 'path';
import type { DiNoMapping } from './dinoMapper';
import { humanizeSubmission } from './submissionHumanizer';
import type { FormSchema } from '../db/types/schema';
import {
  getEmailConfig,
  type AttachmentSelection,
  type EmailConfig,
  DEFAULT_CLIENT_SUBJECT,
  DEFAULT_CLIENT_BODY,
} from './runtimeMode';

function createTransporter(cfg: EmailConfig) {
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  });
}

function formatAnfragerName(data: Record<string, unknown>): string | undefined {
  const vorname = (data.anfrager_vorname as string | undefined)?.trim();
  const nachname = (data.anfrager_nachname as string | undefined)?.trim();
  const combined = [vorname, nachname].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  const legacy = (data.anfrager_name as string | undefined)?.trim();
  return legacy || undefined;
}

const FORM_TITLES: Record<string, string> = {
  unterschriftsbeglaubigung: 'Unterschriftsbeglaubigung',
  unternehmensgruendung: 'Unternehmensgründung',
  immobilienkauf: 'Immobilienkauf',
  schenkung: 'Schenkung',
  testament: 'Testament / Erbvertrag',
};

interface EmailOptions {
  formType: string;
  data: Record<string, unknown>;
  dinoMapping: DiNoMapping;
  pdfBuffer: Buffer;
  docxBuffer?: Buffer;
  files: Express.Multer.File[];
  attachments: AttachmentSelection;
  config?: EmailConfig;
  // Optional Form-Schema — wenn vorhanden, wird der JSON-Anhang mit
  // menschenlesbaren Werten für Plugin-Felder angereichert (statt rohen
  // JSON-Payloads für Slot-Werte etc.).
  formSchema?: FormSchema;
}

interface TemplateContext {
  title: string;
  submittedBy: string;
  submittedAt: string;
  notarName: string;
  email: string;
  phone: string;
}

function renderTemplate(template: string, ctx: TemplateContext): string {
  const replace = (s: string, needle: string, value: string) => s.split(needle).join(value);
  let out = template;
  out = replace(out, '{title}', ctx.title);
  out = replace(out, '{submittedBy}', ctx.submittedBy);
  out = replace(out, '{submittedAt}', ctx.submittedAt);
  out = replace(out, '{notarName}', ctx.notarName);
  out = replace(out, '{email}', ctx.email);
  out = replace(out, '{phone}', ctx.phone);
  return out;
}

function appendSignature(html: string, signature: string): string {
  if (!signature.trim()) return html;
  return `${html}\n<div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-family:Arial,sans-serif;font-size:13px;color:#555">${signature}</div>`;
}

export async function sendEmail({
  formType,
  data,
  dinoMapping,
  pdfBuffer,
  docxBuffer,
  files,
  attachments,
  config,
  formSchema,
}: EmailOptions): Promise<void> {
  const cfg = config ?? getEmailConfig();
  const title = FORM_TITLES[formType] ?? formType;
  const submittedBy = formatAnfragerName(data) || 'Unbekannt';
  const submittedAt = new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const fileStamp = Date.now();
  const to = cfg.notarEmail;

  const ctx: TemplateContext = {
    title,
    submittedBy,
    submittedAt,
    notarName: cfg.fromName || 'OpenFormulare',
    email: (data.email as string | undefined) ?? '',
    phone: (data.telefon as string | undefined) ?? '',
  };

  // Menschenlesbare Sicht der Submission: Plugin-Feldwerte werden durch ihren
  // Formatter-Output ersetzt (statt rohen JSON-Payloads im JSON-Anhang).
  const humanizedData = formSchema ? humanizeSubmission(data, formSchema) : data;

  if (cfg.smtpDebug) {
    const dumpDir = path.resolve(__dirname, '../../../DebugDump', `${fileStamp}_${formType}`);
    fs.mkdirSync(dumpDir, { recursive: true });

    fs.writeFileSync(path.join(dumpDir, 'form-data.json'), JSON.stringify(humanizedData, null, 2));
    fs.writeFileSync(path.join(dumpDir, 'dino-mapping.json'), JSON.stringify(dinoMapping, null, 2));
    if (attachments.pdf) {
      fs.writeFileSync(path.join(dumpDir, `${formType}.pdf`), pdfBuffer);
    }
    if (attachments.docx && docxBuffer) {
      fs.writeFileSync(path.join(dumpDir, `${formType}.docx`), docxBuffer);
    }
    files.forEach((file) => {
      fs.writeFileSync(path.join(dumpDir, file.originalname), file.buffer);
    });

    const applicantEmail = data.email as string | undefined;
    if (applicantEmail) {
      console.log(`[SMTP_DEBUG] Bestätigungs-Mail würde gesendet an: ${applicantEmail}`);
    }

    console.log(`[SMTP_DEBUG] Dump gespeichert: ${dumpDir}`);
    return;
  }

  if (!to) {
    throw new Error('NOTAR_EMAIL nicht konfiguriert');
  }

  const transporter = createTransporter(cfg);

  const attachmentList: NonNullable<SendMailOptions['attachments']> = [];
  if (attachments.pdf) {
    attachmentList.push({
      filename: `${formType}-${fileStamp}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    });
  }
  if (attachments.docx && docxBuffer) {
    attachmentList.push({
      filename: `${formType}-${fileStamp}.docx`,
      content: docxBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }
  if (attachments.json) {
    attachmentList.push({
      filename: `${formType}-${fileStamp}.json`,
      content: JSON.stringify(humanizedData, null, 2),
      contentType: 'application/json',
    });
  }
  if (attachments.dinoJson) {
    attachmentList.push({
      filename: `dino-mapping-${formType}-${fileStamp}.json`,
      content: JSON.stringify(dinoMapping, null, 2),
      contentType: 'application/json',
    });
  }
  files.forEach((file) => {
    attachmentList.push({
      filename: file.originalname,
      content: file.buffer,
      contentType: file.mimetype,
    });
  });

  const from = `"${cfg.fromName || 'OpenFormulare'}" <${cfg.fromEmail}>`;

  const notarBody = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px">
      <h2 style="color:#1a3a5c">Neue ${title}-Anfrage</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 0;color:#666;width:160px">Eingereicht von</td><td style="padding:6px 0;font-weight:600">${submittedBy}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Datum</td><td style="padding:6px 0">${submittedAt}</td></tr>
        ${data.email ? `<tr><td style="padding:6px 0;color:#666">E-Mail</td><td style="padding:6px 0"><a href="mailto:${data.email}">${data.email}</a></td></tr>` : ''}
        ${data.telefon ? `<tr><td style="padding:6px 0;color:#666">Telefon</td><td style="padding:6px 0">${data.telefon}</td></tr>` : ''}
      </table>
      <p style="margin-top:20px;color:#555">
        Die ausgewählten Anhänge sind dieser E-Mail beigefügt.
        ${files.length > 0 ? `<br/>Zusätzlich wurden <strong>${files.length}</strong> Dokument(e) hochgeladen.` : ''}
      </p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: `Neue Anfrage: ${title} von ${submittedBy}`,
    html: appendSignature(notarBody, cfg.htmlSignature),
    attachments: attachmentList,
  });

  // Confirmation to applicant (only if they provided an email).
  const applicantEmail = data.email as string | undefined;
  if (applicantEmail) {
    await sendConfirmation({
      to: applicantEmail,
      from,
      cfg,
      ctx,
    });
  }
}

interface ConfirmationOptions {
  to: string;
  from: string;
  cfg: EmailConfig;
  ctx: TemplateContext;
}

export async function sendConfirmation({ to, from, cfg, ctx }: ConfirmationOptions): Promise<void> {
  const transporter = createTransporter(cfg);
  const subjectTemplate = cfg.clientSubjectTemplate || DEFAULT_CLIENT_SUBJECT;
  const bodyTemplate = cfg.clientBodyTemplate || DEFAULT_CLIENT_BODY;

  await transporter.sendMail({
    from,
    to,
    subject: renderTemplate(subjectTemplate, ctx),
    html: appendSignature(renderTemplate(bodyTemplate, ctx), cfg.htmlSignature),
  });
}

// Generische E-Mail-Versand-Funktion für Plugins und andere Core-Komponenten.
// Nutzt die zentral konfigurierten SMTP-Settings; im SMTP-Debug-Modus wird
// nichts versendet, sondern ein Hinweis ins Log geschrieben.
export interface GenericMailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: SendMailOptions['attachments'];
  replyTo?: string;
}

export async function sendGenericMail(opts: GenericMailOptions): Promise<void> {
  const cfg = getEmailConfig();
  if (!cfg.fromEmail) {
    throw new Error('Kein Absender konfiguriert (Admin → E-Mail → Absender).');
  }
  if (cfg.smtpDebug) {
    console.log(
      `[SMTP_DEBUG] (sendGenericMail) Mail an ${opts.to} – Betreff: ${opts.subject}` +
        (opts.attachments?.length ? ` – Anhänge: ${opts.attachments.length}` : ''),
    );
    return;
  }
  if (!cfg.smtpHost) {
    throw new Error('Kein SMTP-Host konfiguriert (Admin → E-Mail).');
  }
  const transporter = createTransporter(cfg);
  const from = `"${cfg.fromName || 'OpenFormulare'}" <${cfg.fromEmail}>`;
  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
    replyTo: opts.replyTo,
  });
}

// Liefert die konfigurierte Absender-Adresse (oder null), z. B. damit Plugins
// einen sinnvollen ORGANIZER für iCal-Einladungen setzen können.
export function getConfiguredSenderEmail(): string | null {
  const cfg = getEmailConfig();
  return cfg.fromEmail || null;
}

export function getConfiguredSenderName(): string | null {
  const cfg = getEmailConfig();
  return cfg.fromName || null;
}
