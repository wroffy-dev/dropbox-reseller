import 'server-only';
import { LocalStorage } from './local';
import { S3Storage } from './s3';
import type { StorageService } from './types';

export type { StorageService, StoredFile } from './types';

let instance: StorageService | null = null;

/** Resolves the configured storage driver. CMS code never branches on provider. */
export function storage(): StorageService {
  if (instance) return instance;
  const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
  if (provider === 's3') instance = new S3Storage('s3');
  else if (provider === 'r2') instance = new S3Storage('r2');
  else instance = new LocalStorage();
  return instance;
}

/** Test/reset hook. */
export function __resetStorage() {
  instance = null;
}
