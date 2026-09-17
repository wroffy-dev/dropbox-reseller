/**
 * The social networks a SocialLink row can point at.
 *
 * A row stores a `network` key rather than an icon name or a URL pattern, so
 * the icon, the default label and the expected host all stay in one place. An
 * unknown key (a row written before a network was removed, say) falls back to a
 * generic link icon rather than breaking the footer.
 */
export const SOCIAL_NETWORKS = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'x', label: 'X' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'github', label: 'GitHub' },
  { key: 'website', label: 'Website' },
] as const;

export type SocialNetworkKey = (typeof SOCIAL_NETWORKS)[number]['key'];

export const SOCIAL_NETWORK_KEYS = SOCIAL_NETWORKS.map((n) => n.key);

export function isSocialNetworkKey(value: string): value is SocialNetworkKey {
  return SOCIAL_NETWORK_KEYS.includes(value as SocialNetworkKey);
}

/** The name shown when an admin has not typed one of their own. */
export function defaultSocialLabel(network: string): string {
  return SOCIAL_NETWORKS.find((n) => n.key === network)?.label ?? 'Website';
}
