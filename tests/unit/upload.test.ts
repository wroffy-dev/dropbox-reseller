import { describe, it, expect } from 'vitest';
import { validateUpload, buildStorageKey, readImageDimensions } from '@/lib/services/upload';

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x03, 0x20, // width  = 800
  0x00, 0x00, 0x02, 0x58, // height = 600
  0x08, 0x06, 0x00, 0x00, 0x00,
]);

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe('validateUpload', () => {
  it('accepts a PNG whose bytes match its declared type', () => {
    const result = validateUpload('image/png', PNG_HEADER, PNG_HEADER.byteLength);
    expect(result.ok).toBe(true);
    expect(result.ok && result.kind).toBe('IMAGE');
    expect(result.ok && result.extension).toBe('png');
  });

  it('rejects a disallowed MIME type', () => {
    const result = validateUpload('application/x-msdownload', PNG_HEADER, PNG_HEADER.byteLength);
    expect(result.ok).toBe(false);
  });

  it('rejects a file whose bytes contradict its declared type', () => {
    // Claims to be a PNG, actually carries a JPEG signature.
    const result = validateUpload('image/png', JPEG_HEADER, JPEG_HEADER.byteLength);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/do not match/i);
  });

  it('rejects an empty file', () => {
    expect(validateUpload('image/png', Buffer.alloc(0), 0).ok).toBe(false);
  });

  it('rejects a file over the size limit', () => {
    const oversize = Number(process.env.MAX_UPLOAD_MB || 12) * 1024 * 1024 + 1;
    const result = validateUpload('image/png', PNG_HEADER, oversize);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/smaller/i);
  });

  it('rejects an SVG containing script', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const result = validateUpload('image/svg+xml', svg, svg.byteLength);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/script/i);
  });

  it('accepts a plain SVG', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
    expect(validateUpload('image/svg+xml', svg, svg.byteLength).ok).toBe(true);
  });
});

describe('buildStorageKey', () => {
  it('namespaces by year and month and adds entropy', () => {
    const key = buildStorageKey('My Photo.PNG', 'png');
    expect(key).toMatch(/^\d{4}\/\d{2}\/my-photo-[0-9a-f]{12}\.png$/);
  });

  it('strips path traversal from the filename', () => {
    const key = buildStorageKey('../../etc/passwd', 'png');
    expect(key).not.toContain('..');
    expect(key).not.toContain('etc/passwd');
  });

  it('falls back to a default name when nothing usable remains', () => {
    expect(buildStorageKey('!!!.png', 'png')).toMatch(/file-[0-9a-f]{12}\.png$/);
  });
});

describe('readImageDimensions', () => {
  it('reads PNG dimensions from the header', () => {
    expect(readImageDimensions(PNG_HEADER, 'image/png')).toEqual({ width: 800, height: 600 });
  });

  it('returns null for a format it cannot parse', () => {
    expect(readImageDimensions(Buffer.from('not an image'), 'application/pdf')).toBeNull();
  });
});
