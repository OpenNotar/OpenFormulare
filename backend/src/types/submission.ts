export interface SubmissionPayload {
  formType: string;
  notarEmail: string;
  primaryColor: string;
  data: Record<string, unknown>;
  files: Express.Multer.File[];
}
