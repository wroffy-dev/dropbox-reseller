'use server';

import { createCaptchaChallenge, type CaptchaChallenge } from '@/lib/forms/captcha';
import { getPublicForm } from '@/lib/services/forms';

/**
 * Hands the browser a fresh question and its signed token.
 *
 * The runtime calls this on mount, and again whenever a challenge expires, so
 * the token is never baked into cached page HTML. It returns null when the
 * named form does not exist or does not use a CAPTCHA, which keeps a caller
 * from putting a pointless question in front of a visitor.
 */
export async function requestCaptchaChallenge(formSlug: string): Promise<CaptchaChallenge | null> {
  const form = await getPublicForm(formSlug);
  if (!form?.requireCaptcha) return null;
  return createCaptchaChallenge();
}
