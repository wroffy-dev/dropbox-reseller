export type StoredFile = {
  key: string;
  url: string;
  provider: 'local' | 's3' | 'r2';
  size: number;
  mimeType: string;
};

export interface StorageService {
  readonly provider: 'local' | 's3' | 'r2';
  put(input: {
    key: string;
    body: Buffer;
    mimeType: string;
  }): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}
