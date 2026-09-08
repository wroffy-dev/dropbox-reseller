'use server';

import { getPublicForm, type PublicForm } from '@/lib/services/forms';

/**
 * Returns a published form's public shape. Only active, non-deleted forms are
 * exposed, and no internal fields (notification emails, lead defaults) are
 * included in PublicForm.
 */
export async function fetchPublicForm(slug: string): Promise<PublicForm | null> {
  if (typeof slug !== 'string' || slug.length > 120) return null;
  return getPublicForm(slug);
}
