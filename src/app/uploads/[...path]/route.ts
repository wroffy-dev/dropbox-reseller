import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { LocalStorage } from '@/lib/storage/local';

/**
 * Serves files uploaded to this machine's disk.
 *
 * Next's standalone server reads `public/` once, when it starts. A file written
 * there afterwards is invisible to it — which is every upload, since they are
 * written by the running server. The effect on a `STORAGE_PROVIDER=local`
 * deployment is that each new image 404s until the container is restarted, so
 * the media library looks broken and only S3/R2 appears to work.
 *
 * This route reads the file from disk per request, which is what a CMS needs
 * and what the static handler cannot do. S3 and R2 are unaffected: those URLs
 * are absolute and point at the bucket, so they never arrive here. Files that
 * predate a switch to object storage still serve, because this only ever asks
 * the disk.
 */

export const dynamic = 'force-dynamic';

/** Only what the uploader accepts. Anything else is downloaded, not rendered. */
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;
  const key = (segments ?? []).join('/');
  if (!key) return notFound();

  // The same traversal guard the writer uses, from the same place.
  const target = new LocalStorage().resolve(key);
  if (!target) return notFound();

  let info;
  try {
    info = await stat(target);
  } catch {
    return notFound();
  }
  if (!info.isFile()) return notFound();

  const extension = path.extname(target).toLowerCase();
  const contentType = CONTENT_TYPES[extension] ?? 'application/octet-stream';

  const stream = Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>;

  /*
   * Only the headers that depend on the file itself.
   *
   * nosniff, the sandboxing CSP, `Content-Disposition: inline` and the immutable
   * cache already come from the `/uploads/:path*` rule in next.config.mjs, and a
   * config header wins over one set here — so setting them again would only
   * create two sources of truth that can disagree.
   */
  return new Response(stream, {
    headers: {
      'content-type': contentType,
      'content-length': String(info.size),
      'last-modified': info.mtime.toUTCString(),
    },
  });
}
