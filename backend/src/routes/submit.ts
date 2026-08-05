import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { generatePdf } from '../services/pdf';
import { generateDocx } from '../services/docx';
import { sendEmail } from '../services/email';
import { mapToDiNo } from '../services/dinoMapper';
import { insertSubmission, insertSubmissionFiles } from '../db/submissions';
import { isDemoMode, getDispatchConfig, getEmailConfig } from '../services/runtimeMode';
import { emit as emitPluginEvent } from '../plugins/hookBus';
import { getDialog } from '../db/database';

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: parseInt(process.env.RATE_LIMIT_MAX ?? '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte in 15 Minuten erneut versuchen.' },
});

router.use(limiter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    // Obergrenze für die Anzahl: der DiNo-Pull liefert alle offenen
    // Einreichungen samt Base64-Anhängen in EINER Response — ohne Deckel
    // wächst die unbegrenzt.
    files: 20,
  },
});

const bodySchema = z.object({
  formType: z.string().min(1),
  data: z.string(),
  schema: z.string().optional(),
});

router.post('/', upload.array('files'), async (req, res) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.issues });
      return;
    }

    const { formType, data: dataStr, schema: schemaStr } = parsed.data;
    const primaryColor = process.env.PRIMARY_COLOR ?? '1a3a5c';
    const data = JSON.parse(dataStr) as Record<string, unknown>;
    const formSchema = schemaStr ? JSON.parse(schemaStr) : undefined;
    const files = (req.files as Express.Multer.File[]) || [];

    // Plugins get a chance to inspect / mutate the submission before any
    // side effects run (DB write, email, DiNo). Plugin errors do not block
    // the submission – they are logged + collected on the registry.
    const dialogRecord = getDialog(formType);
    if (dialogRecord) {
      await emitPluginEvent('dialog:beforeSubmit', {
        dialogId: formType,
        dialog: dialogRecord,
        submission: data,
      });
    }

    if (isDemoMode()) {
      // Demo mode: never persist, never email, never queue for DiNo.
      console.log(`[demo] submission for ${formType} discarded (no side effects)`);
      res.json({ success: true, demo: true });
      return;
    }

    const dispatch = getDispatchConfig();
    const emailCfg = getEmailConfig();

    if (!dispatch.dinoEnabled && !dispatch.emailEnabled) {
      res.status(500).json({
        error: 'Kein Übermittlungsmodus aktiv. Bitte DiNo oder E-Mail in den Admin-Einstellungen aktivieren.',
      });
      return;
    }
    if (dispatch.emailEnabled && !emailCfg.notarEmail) {
      res.status(500).json({ error: 'Notar-E-Mail nicht konfiguriert (Admin → Einstellungen → E-Mail).' });
      return;
    }

    // Schema mitgeben: liefert die Repeater-Labels, damit die Rolle der
    // Beteiligten der Bezeichnung aus dem FormEditor entspricht.
    const dinoMapping = mapToDiNo(formType, data, formSchema);

    // DiNo and Email are independent. If both are enabled they run in parallel.
    const tasks: Promise<unknown>[] = [];

    if (dispatch.dinoEnabled) {
      tasks.push(Promise.resolve().then(() => {
        const submission = insertSubmission(formType, data, dinoMapping);
        // Hochgeladene Dateien zusammen mit der Submission aufbewahren, damit
        // DiNo sie beim Pull mitbekommt (rawData.attachments). Bytes liegen
        // nur kurz in der DB und werden mit der Submission wieder geloescht.
        if (files.length > 0) {
          insertSubmissionFiles(
            submission.id,
            files.map((f) => ({
              fieldId: f.fieldname || null,
              fileName: f.originalname,
              contentType: f.mimetype || null,
              sizeBytes: f.size,
              dataBase64: f.buffer.toString('base64'),
            })),
          );
        }
      }));
    }

    if (dispatch.emailEnabled) {
      tasks.push((async () => {
        const needsPdf = dispatch.attachments.pdf;
        const needsDocx = dispatch.attachments.docx;
        const [pdfBuffer, docxBuffer] = await Promise.all([
          needsPdf ? generatePdf({ formType, data, primaryColor, formSchema, dinoEnabled: dispatch.dinoEnabled }) : Promise.resolve(Buffer.alloc(0)),
          needsDocx ? generateDocx({ formType, data, formSchema }) : Promise.resolve(undefined),
        ]);
        await sendEmail({
          formType,
          data,
          dinoMapping,
          pdfBuffer,
          docxBuffer,
          files,
          attachments: dispatch.attachments,
          config: emailCfg,
          formSchema,
        });
      })());
    }

    await Promise.all(tasks);

    if (dialogRecord) {
      await emitPluginEvent('dialog:submitted', {
        dialogId: formType,
        dialog: dialogRecord,
        submission: data,
        submittedAt: new Date().toISOString(),
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[submit]', err);
    res.status(500).json({ error: 'Interner Fehler beim Verarbeiten der Anfrage' });
  }
});

export default router;
