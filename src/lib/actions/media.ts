'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { storage } from '@/lib/storage';
import { recordAudit } from '@/lib/services/audit';
import {
  validateUpload,
  buildStorageKey,
  readImageDimensions,
  maxUploadBytes,
} from '@/lib/services/upload';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import type { MediaKind } from '@prisma/client';

export type MediaDto = {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  kind: MediaKind;
  size: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  title: string | null;
  createdAt: string;
};

function toDto(row: {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  kind: MediaKind;
  size: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  title: string | null;
  createdAt: Date;
}): MediaDto {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function uploadMedia(formData: FormData): Promise<ActionResult<MediaDto>> {
  try {
    const user = await authorize('media.upload');

    const file = formData.get('file');
    if (!(file instanceof File)) return failure('No file was received.');
    if (file.size > maxUploadBytes()) {
      return failure(`Files must be ${process.env.MAX_UPLOAD_MB || 12} MB or smaller.`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateUpload(file.type, buffer, buffer.byteLength);
    if (!validation.ok) return failure(validation.error);

    const key = buildStorageKey(file.name, validation.extension);
    const stored = await storage().put({ key, body: buffer, mimeType: validation.mimeType });
    const dimensions =
      validation.kind === 'IMAGE' ? readImageDimensions(buffer, validation.mimeType) : null;

    const media = await prisma.media.create({
      data: {
        filename: sanitizeText(file.name).slice(0, 200) || 'upload',
        storageKey: stored.key,
        url: stored.url,
        provider: stored.provider,
        mimeType: validation.mimeType,
        kind: validation.kind,
        size: buffer.byteLength,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        altText: sanitizeText(String(formData.get('altText') ?? '')) || null,
        title: sanitizeText(String(formData.get('title') ?? '')) || null,
        uploadedById: user.id,
      },
    });

    await recordAudit({
      actor: user,
      action: 'uploaded',
      entity: 'Media',
      entityId: media.id,
      summary: `Uploaded ${media.filename}`,
    });

    revalidatePath('/admin/media');
    return success(toDto(media), 'File uploaded.');
  } catch (error) {
    return toActionError(error);
  }
}

const metadataSchema = z.object({
  id: z.string().min(1),
  altText: z.string().max(300).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  caption: z.string().max(1000).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export async function updateMediaMetadata(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('media.edit');
    const data = metadataSchema.parse(input);

    await prisma.media.update({
      where: { id: data.id },
      data: {
        altText: data.altText ? sanitizeText(data.altText) : null,
        title: data.title ? sanitizeText(data.title) : null,
        caption: data.caption ? sanitizeText(data.caption) : null,
        description: data.description ? sanitizeText(data.description) : null,
      },
    });

    await recordAudit({ actor: user, action: 'updated', entity: 'Media', entityId: data.id });
    revalidatePath('/admin/media');
    return success(undefined, 'Details saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteMedia(mediaId: string): Promise<ActionResult> {
  try {
    const user = await authorize('media.delete');
    const media = await prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) return failure('That file no longer exists.');

    // Remove the object first; if that fails we keep the row so nothing is orphaned.
    try {
      await storage().delete(media.storageKey);
    } catch (error) {
      console.error('[media] storage delete failed', error);
    }

    await prisma.media.delete({ where: { id: mediaId } });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'Media',
      entityId: mediaId,
      summary: `Deleted ${media.filename}`,
    });

    revalidatePath('/admin/media');
    return success(undefined, 'File deleted.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function listMedia(input: {
  query?: string;
  kind?: MediaKind | 'ALL';
  cursor?: string;
  take?: number;
}): Promise<{ items: MediaDto[]; nextCursor: string | null }> {
  await authorize('media.view');

  const take = Math.min(input.take ?? 40, 100);
  const where = {
    deletedAt: null,
    ...(input.kind && input.kind !== 'ALL' ? { kind: input.kind } : {}),
    ...(input.query?.trim()
      ? {
          OR: [
            { filename: { contains: input.query.trim(), mode: 'insensitive' as const } },
            { title: { contains: input.query.trim(), mode: 'insensitive' as const } },
            { altText: { contains: input.query.trim(), mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const rows = await prisma.media.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      url: true,
      filename: true,
      mimeType: true,
      kind: true,
      size: true,
      width: true,
      height: true,
      altText: true,
      title: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > take;
  const items = (hasMore ? rows.slice(0, take) : rows).map(toDto);
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

export async function getMediaById(ids: string[]): Promise<MediaDto[]> {
  await authorize('media.view');
  const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) return [];
  const rows = await prisma.media.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: {
      id: true,
      url: true,
      filename: true,
      mimeType: true,
      kind: true,
      size: true,
      width: true,
      height: true,
      altText: true,
      title: true,
      createdAt: true,
    },
  });
  return rows.map(toDto);
}
