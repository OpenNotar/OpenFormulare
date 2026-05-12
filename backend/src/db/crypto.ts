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

// ---------------------------------------------------------------------------
// Generischer String-Cipher für Secrets (Plugin-Passwörter, SMTP-Passwort,
// DiNo-API-Key). Format eines verschlüsselten Tokens:
//
//   enc:v1:<iv-b64>:<tag-b64>:<ciphertext-b64>
//
// Beim Lesen erkennen Konsumenten via `isEncryptedToken(value)` ob sie einen
// verschlüsselten String vor sich haben — alte Plain-Text-Werte funktionieren
// weiterhin, werden aber bei der nächsten Schreib-Operation automatisch
// upgegradet (kein invasiver Migration-Job nötig).
// ---------------------------------------------------------------------------

const ENC_PREFIX = 'enc:v1:';

export function encryptString(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function isEncryptedToken(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

export function decryptString(token: string): string {
  if (!isEncryptedToken(token)) {
    throw new Error('decryptString: kein gültiges enc:v1-Token');
  }
  const parts = token.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('decryptString: ungültiges enc:v1-Format');
  }
  const [ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// Convenience: returns the decrypted value if token is encrypted, otherwise
// returns the value unchanged. Used by readers that want to support both
// legacy plain-text values and freshly-encrypted ones.
export function maybeDecryptString(value: string): string {
  if (!isEncryptedToken(value)) return value;
  try {
    return decryptString(value);
  } catch {
    // Wenn der Token kaputt ist (z. B. weil der DB-Key sich geändert hat),
    // liefern wir lieber leeren String als der App eine Crash-Behebung
    // aufzuzwingen. Der Caller kann dann eine Re-Konfiguration verlangen.
    return '';
  }
}
