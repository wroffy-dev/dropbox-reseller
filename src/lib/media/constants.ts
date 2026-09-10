/**
 * Upload rules shared by the server validator and the browser's file picker.
 *
 * Deliberately free of `server-only` so the admin UI can offer exactly the
 * formats the server will accept — a picker that shows more than the server
 * allows just produces failed uploads. The server still re-checks everything;
 * nothing here is a substitute for validation.
 */

/** The only file types this installation accepts. */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'pdf'] as const;

/** `accept` for a file input: MIME types plus extensions, which some OS dialogs prefer. */
export const ACCEPT_ATTRIBUTE = [
  ...ALLOWED_MIME_TYPES,
  ...ALLOWED_EXTENSIONS.map((ext) => `.${ext}`),
].join(',');

/** Images only, for pickers that cannot use a document. */
export const ACCEPT_IMAGES = [
  ...ALLOWED_MIME_TYPES.filter((type) => type.startsWith('image/')),
  ...ALLOWED_EXTENSIONS.filter((ext) => ext !== 'pdf').map((ext) => `.${ext}`),
].join(',');

/** 150 KB. The ceiling for every upload. */
export const DEFAULT_MAX_UPLOAD_KB = 150;

export const UNSUPPORTED_TYPE_MESSAGE =
  'Only JPG, JPEG, WEBP, PNG, PDF, SVG and GIF files are allowed.';

export const TOO_LARGE_MESSAGE = 'File size must be 150 KB or less.';

/** "150 KB" — for hint text next to an upload control. */
export const MAX_UPLOAD_LABEL = `${DEFAULT_MAX_UPLOAD_KB} KB`;
