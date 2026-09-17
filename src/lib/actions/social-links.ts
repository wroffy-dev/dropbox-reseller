'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { sanitizeText, safeUrl } from '@/lib/utils/sanitize';
import { SOCIAL_NETWORK_KEYS, defaultSocialLabel } from '@/lib/social/networks';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

const linkSchema = z.object({
  network: z.string().trim().refine((v) => SOCIAL_NETWORK_KEYS.includes(v as never), 'Unknown network'),
  label: z.string().trim().max(40).optional().nullable(),
  url: z.string().trim().min(1, 'A URL is required').max(500),
  isVisible: z.boolean().default(true),
});

const listSchema = z.object({ links: z.array(linkSchema).max(20) });

/**
 * Replaces the whole social list in one transaction.
 *
 * Rewriting rather than diffing keeps the admin's drag order authoritative,
 * exactly as `saveNavigationItems` does for menus — and the list is at most
 * twenty rows, so the cost is irrelevant.
 */
export async function saveSocialLinks(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('settings.manage');
    const parsed = listSchema.parse(input);

    // A link whose URL does not survive the href guard is dropped rather than
    // stored: a javascript: value must never reach the footer.
    const rows = parsed.links
      .map((link, index) => {
        const url = safeUrl(link.url);
        if (!url) return null;
        return {
          network: link.network,
          label: sanitizeText(link.label || defaultSocialLabel(link.network)).slice(0, 40),
          url,
          isVisible: link.isVisible,
          sortOrder: (index + 1) * 10,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length !== parsed.links.length) {
      return failure('One of those links is not a valid http(s) URL.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.socialLink.deleteMany({});
      if (rows.length > 0) await tx.socialLink.createMany({ data: rows });
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'SocialLink',
      entityId: 'all',
      summary: `Updated social links (${rows.length})`,
    });

    revalidatePath('/admin/settings');
    revalidatePath('/', 'layout');
    return success(undefined, 'Social links saved.');
  } catch (error) {
    return toActionError(error);
  }
}
