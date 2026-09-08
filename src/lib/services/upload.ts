import 'server-only';
import path from 'node:path';
import { randomToken } from '@/lib/utils/crypto';

export const ALLOWED_MIME: Record<string, { ext: string; kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'IMAGE' },
  'image/png': { ext: 'png', kind: 'IMAGE' },
  'image/webp': { ext: 'webp', kind: 'IMAGE' },
  'image/avif': { ext: 'avif', kind: 'IMAGE' },
  'image/gif': { ext: 'gif', kind: 'IMAGE' },
  'image/svg+xml': { ext: 'svg', kind: 'IMAGE' },
  'video/mp4': { ext: 'mp4', kind: 'VIDEO' },
  'video/webm': { ext: 'webm', kind: 'VIDEO' },
  'application/pdf': { ext: 'pdf', kind: 'DOCUMENT' },
  'application/msword': { ext: 'doc', kind: 'DOCUMENT' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: 'docx',
    kind: 'DOCUMENT',
  },
  'text/csv': { ext: 'csv', kind: 'DOCUMENT' },
};

/** Magic-byte signatures. A declared MIME type is never trusted on its own. */
const SIGNATURES: Array<{ mime: string; test: (buf: Buffer) => boolean }> = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { mime: 'image/gif', test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF' },
  {
    mime: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { mime: 'image/avif', test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
  { mime: 'video/mp4', test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 4).toString('ascii') === '%PDF' },
];

export function maxUploadBytes(): number {
  return Number(process.env.MAX_UPLOAD_MB || 12) * 1024 * 1024;
}

export type UploadValidation =
  | { ok: true; mimeType: string; kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; extension: string }
  | { ok: false; error: string };

export function validateUpload(declaredMime: string, buffer: Buffer, size: number): UploadValidation {
  if (size > maxUploadBytes()) {
    return { ok: false, error: `Files must be ${process.env.MAX_UPLOAD_MB || 12} MB or smaller.` };
  }
  if (size === 0) return { ok: false, error: 'That file is empty.' };

  const allowed = ALLOWED_MIME[declaredMime];
  if (!allowed) return { ok: false, error: `${declaredMime} files are not allowed.` };

  // SVG can carry script, so it is stored but never rendered through next/image
  // without an explicit sanitisation pass. Reject it outright here.
  if (declaredMime === 'image/svg+xml') {
    const head = buffer.subarray(0, 4096).toString('utf8').toLowerCase();
    if (head.includes('<script') || head.includes('javascript:') || head.includes('onload=')) {
      return { ok: false, error: 'That SVG contains script and cannot be uploaded.' };
    }
    return { ok: true, mimeType: declaredMime, kind: allowed.kind, extension: allowed.ext };
  }

  // Text-ish formats have no reliable signature; everything else must match.
  const needsSignature = SIGNATURES.some((s) => s.mime === declaredMime);
  if (needsSignature) {
    const matched = SIGNATURES.find((s) => s.test(buffer));
    if (!matched || (matched.mime !== declaredMime && !isCompatible(matched.mime, declaredMime))) {
      return { ok: false, error: 'That file’s contents do not match its type.' };
    }
  }

  return { ok: true, mimeType: declaredMime, kind: allowed.kind, extension: allowed.ext };
}

// mp4 and avif share the ISO-BMFF "ftyp" box.
function isCompatible(detected: string, declared: string): boolean {
  const isoBmff = ['image/avif', 'video/mp4'];
  return isoBmff.includes(detected) && isoBmff.includes(declared);
}

/** Namespaced, unguessable storage key. Never derived from user input alone. */
export function buildStorageKey(filename: string, extension: string): string {
  const base = path
    .basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file';
  const now = new Date();
  const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `${folder}/${base}-${randomToken(6)}.${extension}`;
}

/** Reads intrinsic dimensions from PNG/JPEG/GIF/WebP headers without a decoder. */
export function readImageDimensions(buffer: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === 'image/png' && buffer.length > 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mime === 'image/gif' && buffer.length > 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (mime === 'image/webp' && buffer.length > 30) {
      const format = buffer.subarray(12, 16).toString('ascii');
      if (format === 'VP8 ') {
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      }
      if (format === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (format === 'VP8X') {
        const width = 1 + (buffer.readUIntLE(24, 3) & 0xffffff);
        const height = 1 + (buffer.readUIntLE(27, 3) & 0xffffff);
        return { width, height };
      }
    }
    if (mime === 'image/jpeg') {
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1]!;
        // SOF0-SOF15, excluding DHT/JPG/DAC
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
    }
  } catch {
    return null;
  }
  return null;
}
