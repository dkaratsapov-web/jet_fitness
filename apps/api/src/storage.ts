// Minimal S3 presigned-URL generator (AWS SigV4, query-string auth).
//
// We avoid the AWS SDK to keep the serverless bundle small and cold starts
// fast. Path-style URLs (endpoint/bucket/key) match how Yandex Object Storage
// is used elsewhere in this project. Only the `host` header is signed, so the
// browser can PUT/GET with any content-type.

import { createHash, createHmac } from 'node:crypto';
import { env } from './env.js';

const SERVICE = 's3';

export function isStorageConfigured(): boolean {
  return Boolean(env.s3.bucket && env.s3.accessKeyId && env.s3.secretAccessKey);
}

/**
 * Resolve a stored video reference into a playable URL. External links
 * (http/https, e.g. a YouTube URL) pass through unchanged; a bare object key
 * (our own uploads) becomes a short-lived presigned GET URL. Returns null when
 * there is nothing to show or storage isn't configured for an object key.
 */
export function videoViewUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (/^https?:\/\//i.test(ref)) return ref;
  return isStorageConfigured() ? presign('GET', ref, 3600) : null;
}

/** RFC3986 encoding (AWS-style). Optionally preserve "/" for path segments. */
function uriEncode(str: string, keepSlash = false): string {
  let out = '';
  for (const ch of Buffer.from(str, 'utf8').toString('binary')) {
    if (/[A-Za-z0-9_.~-]/.test(ch) || (keepSlash && ch === '/')) {
      out += ch;
    } else {
      out += '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return out;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso.slice(0, 15) + 'Z', dateStamp: iso.slice(0, 8) };
}

/**
 * Generate a presigned URL for a single object operation.
 * @param method  'PUT' to upload, 'GET' to download/view.
 * @param key     object key within the bucket.
 * @param expiresSeconds  URL validity window.
 */
export function presign(
  method: 'PUT' | 'GET',
  key: string,
  expiresSeconds = 900,
  now: Date = new Date(),
): string {
  const { endpoint, bucket, region, accessKeyId, secretAccessKey } = env.s3;
  const host = endpoint.replace(/^https?:\/\//, '');
  const { amzDate, dateStamp } = amzDates(now);
  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;

  const canonicalUri = `/${uriEncode(bucket)}/${uriEncode(key, true)}`;

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), SERVICE),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  return `${endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
