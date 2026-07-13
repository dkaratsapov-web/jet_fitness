// AES-256-GCM field encryption for sensitive health data (spec §10).
// Format: "<iv b64>:<tag b64>:<ciphertext b64>". Key from HEALTH_ENCRYPTION_KEY
// (32 bytes, hex or base64). Encryption is only used when the health module is
// enabled, so a missing key simply keeps the module unavailable.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env.js';

function loadKey(): Buffer {
  const raw = env.healthEncryptionKey;
  if (!raw) throw new Error('HEALTH_ENCRYPTION_KEY is not set');
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('HEALTH_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return buf;
}

/** True when a usable 32-byte key is configured. */
export function isEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', loadKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decrypt(payload: string): string {
  const [ivB, tagB, ctB] = payload.split(':');
  if (!ivB || !tagB || !ctB) throw new Error('malformed ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
}
