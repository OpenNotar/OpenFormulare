"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSchema = encryptSchema;
exports.decryptSchema = decryptSchema;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
function getPassword() {
    const password = process.env.DIALOG_DB_PASSWORD;
    if (!password) {
        throw new Error('DIALOG_DB_PASSWORD ist nicht gesetzt');
    }
    return password;
}
function getSalt() {
    return process.env.DIALOG_DB_SALT || 'notar-dialog-default-salt';
}
function getKey() {
    return crypto_1.default.scryptSync(getPassword(), getSalt(), KEY_LENGTH);
}
function encryptSchema(schema) {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, getKey(), iv);
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
function decryptSchema(payload) {
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, getKey(), Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, 'base64')),
        decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
}
