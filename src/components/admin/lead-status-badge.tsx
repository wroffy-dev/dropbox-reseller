import type { LeadStatus } from '@prisma/client';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { LEAD_STATUS_LABELS, CONTENT_STATUS_LABELS } from '@/lib/crm/constants';

const TONES: Record<LeadStatus, BadgeTone> = {
  NEW: 'brand',
  CONTACTED: 'info',
  QUALIFIED: 'purple',
  PROPOSAL: 'warning',
  NEGOTIATION: 'warning',
  WON: 'success',
  LOST: 'danger',
  SPAM: 'neutral',
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={TONES[status]}>{LEAD_STATUS_LABELS[status] ?? status}</Badge>;
}

const CONTENT_TONES: Record<string, BadgeTone> = {
  PUBLISHED: 'success',
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  ARCHIVED: 'warning',
};

export function ContentStatusBadge({ status }: { status: string }) {
  const label = CONTENT_STATUS_LABELS[status] ?? status;
  return <Badge tone={CONTENT_TONES[status] ?? 'neutral'}>{label}</Badge>;
}
