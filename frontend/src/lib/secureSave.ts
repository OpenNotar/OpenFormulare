// Password-protected save/load for form snapshots.
// Encryption: AES-GCM with a key derived via PBKDF2-SHA256 (200k iterations).
// Output is a JSON wrapper so the user can spot it as a notar-dialog file.

const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// Returns a Uint8Array backed by a fresh ArrayBuffer so the result satisfies
// the strict `BufferSource & { buffer: ArrayBuffer }` typing of WebCrypto.
function b64ToBuf(b64: string): Uint8Array {
  const s = atob(b64);
  const buf = new ArrayBuffer(s.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: BufferSource): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedSaveFile {
  app: 'openformulare';
  version: 2;
  formType: string;
  step: number;
  savedAt: string;
  salt: string;        // base64
  iv: string;          // base64
  ciphertext: string;  // base64
}

export async function encryptSnapshot(payload: unknown, password: string, formType: string, step: number): Promise<EncryptedSaveFile> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt);
  const plaintext = enc.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext);
  return {
    app: 'openformulare',
    version: 2,
    formType,
    step,
    savedAt: new Date().toISOString(),
    salt: bufToB64(salt),
    iv: bufToB64(iv),
    ciphertext: bufToB64(ciphertext),
  };
}

export async function decryptSnapshot(file: EncryptedSaveFile, password: string): Promise<unknown> {
  if (file?.app !== 'openformulare' || file.version !== 2) {
    throw new Error('Datei ist nicht im erwarteten Format.');
  }
  const salt = b64ToBuf(file.salt);
  const iv = b64ToBuf(file.iv);
  const ciphertext = b64ToBuf(file.ciphertext);
  const key = await deriveKey(password, salt as BufferSource);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext as BufferSource);
  } catch {
    throw new Error('Falsches Passwort oder beschädigte Datei.');
  }
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plaintext));
}

export function isLegacySaveFile(parsed: unknown): parsed is { formType: string; step: number; data: Record<string, unknown> } {
  return Boolean(
    parsed
      && typeof parsed === 'object'
      && (parsed as Record<string, unknown>).formType
      && (parsed as Record<string, unknown>).data,
  );
}
