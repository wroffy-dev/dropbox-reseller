import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageService, StoredFile } from './types';

/**
 * Filesystem-backed storage for development and single-container deployments.
 * The upload directory must be a mounted volume in production.
 */
export class LocalStorage implements StorageService {
  readonly provider = 'local' as const;

  constructor(private readonly dir: string = process.env.LOCAL_UPLOAD_DIR || 'public/uploads') {}

  private absolute(key: string): string {
    // Defence in depth: never allow a key to escape the upload directory.
    const safeKey = key.replace(/\\/g, '/').replace(/\.\.+/g, '').replace(/^\/+/, '');
    const root = path.resolve(process.cwd(), this.dir);
    const target = path.resolve(root, safeKey);
    if (!target.startsWith(root + path.sep) && target !== root) {
      throw new Error('Invalid storage key');
    }
    return target;
  }

  async put({ key, body, mimeType }: { key: string; body: Buffer; mimeType: string }): Promise<StoredFile> {
    const target = this.absolute(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return { key, url: this.publicUrl(key), provider: this.provider, size: body.byteLength, mimeType };
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.absolute(key));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
  }

  publicUrl(key: string): string {
    const base = this.dir.replace(/^public\/?/, '');
    return `/${[base, key].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
  }
}
