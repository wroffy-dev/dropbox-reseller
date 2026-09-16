'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { getCountryById, getDefaultCountry } from '@/lib/country/registry';
import { runCountrySync, type SyncResult } from '@/lib/country/sync';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import type { Prisma } from '@prisma/client';

const schema = z.object({
  targetCountryId: z.string().min(1),
  mode: z.enum(['ADD_MISSING', 'UPDATE_EXISTING']).default('ADD_MISSING'),
  previewOnly: z.coerce.boolean().default(false),
});

/** A run left behind by a killed container stops blocking after this. */
const STALE_RUN_MS = 15 * 60 * 1000;

/**
 * Copies the default market's content into another market.
 *
 * The source is always the default market, read from the database rather than
 * taken from the caller: "sync from India" is a statement about which market is
 * the root, and letting the browser name a source would make it a way to copy
 * any market over any other.
 *
 * Concurrency is held off by the run row itself. A second sync into the same
 * market while one is running would race the mapping table and could produce
 * the duplicate the mapping exists to prevent, so it is refused rather than
 * queued — the administrator can see the run in progress and wait for it.
 */
export async function syncCountryContent(input: unknown): Promise<ActionResult<SyncResult & { runId: string | null }>> {
  try {
    const user = await authorize('settings.manage');
    const { targetCountryId, mode, previewOnly } = schema.parse(input);

    const [source, target] = await Promise.all([
      getDefaultCountry(),
      getCountryById(targetCountryId),
    ]);
    if (!target) return failure('That country no longer exists.');
    if (target.id === source.id) {
      return failure(`${source.name} is the source market — there is nothing to copy into it.`);
    }

    // A preview writes nothing, so it neither takes the lock nor records a run.
    if (previewOnly) {
      const result = await runCountrySync({ source, target, mode, previewOnly: true });
      return success({ ...result, runId: null });
    }

    const running = await prisma.countrySyncRun.findFirst({
      where: {
        targetCountryId: target.id,
        status: 'RUNNING',
        startedAt: { gt: new Date(Date.now() - STALE_RUN_MS) },
      },
      select: { id: true, startedAt: true },
    });
    if (running) {
      return failure(
        `A sync into ${target.name} is already running. Wait for it to finish before starting another.`,
      );
    }

    const run = await prisma.countrySyncRun.create({
      data: {
        sourceCountryId: source.id,
        targetCountryId: target.id,
        mode,
        status: 'RUNNING',
        startedById: user.id,
      },
      select: { id: true },
    });

    try {
      const result = await runCountrySync({ source, target, mode, previewOnly: false });

      await prisma.countrySyncRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          createdCount: result.created,
          updatedCount: result.updated,
          skippedCount: result.skipped,
          conflictCount: result.conflicts,
          failedCount: result.failed,
          log: result.log as unknown as Prisma.InputJsonValue,
        },
      });

      await recordAudit({
        actor: user,
        action: 'created',
        entity: 'CountrySyncRun',
        entityId: run.id,
        summary: `Synced ${source.name} → ${target.name}: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.conflicts} conflicts`,
      });

      revalidatePath('/admin/settings/countries');
      return success(
        { ...result, runId: run.id },
        `${result.created} created, ${result.updated} updated, ${result.skipped} skipped${result.conflicts > 0 ? `, ${result.conflicts} need a decision` : ''}.`,
      );
    } catch (error) {
      /*
       * The run is marked failed rather than left RUNNING, so a retry is not
       * blocked by the attempt that failed. Whatever was created before the
       * failure keeps its mapping, which is what makes the retry pick up where
       * this stopped instead of duplicating it.
       */
      await prisma.countrySyncRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown error',
        },
      });
      throw error;
    }
  } catch (error) {
    return toActionError(error);
  }
}

/** The last few runs into one market, for the admin panel. */
export async function recentSyncRuns(targetCountryId: string) {
  await authorize('settings.manage');
  return prisma.countrySyncRun.findMany({
    where: { targetCountryId },
    orderBy: { startedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      mode: true,
      status: true,
      createdCount: true,
      updatedCount: true,
      skippedCount: true,
      conflictCount: true,
      failedCount: true,
      error: true,
      startedAt: true,
      finishedAt: true,
      startedBy: { select: { name: true } },
    },
  });
}
