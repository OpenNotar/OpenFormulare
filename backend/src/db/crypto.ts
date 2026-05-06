import crypto from 'crypto';
import type { FormSchema } from './types/schema';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  version: number;
}

function getPassword(): string {
  const password = process.env.DIALOG_DB_PASSWORD;
  if (!password) {
    throw new Error('DIALOG_DB_PASSWORD ist nicht gesetzt');
  }

  return password;
}

function getSalt(): string {
  return process.env.DIALOG_DB_SALT || 'notar-dialog-default-salt';
}

function getKey(): Buffer {
  return crypto.scryptSync(getPassword(), getSalt(), KEY_LENGTH);
}

export function encryptSchema(schema: FormSchema): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const plaintext = JSON.stringify(schema);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    version: 1,
  };
}

export function decryptSchema(payload: EncryptedPayload): FormSchema {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8')) as FormSchema;
}
