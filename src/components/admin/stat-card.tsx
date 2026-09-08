import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/format';

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: 'default' | 'brand' | 'success' | 'danger';
}) {
  const tones = {
    default: 'text-content',
    brand: 'text-brand',
    success: 'text-emerald-600',
    danger: 'text-red-600',
  } as const;

  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('mt-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl', tones[tone])}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </>
  );

  const className =
    'block rounded-xl border border-hairline bg-surface p-4 shadow-sm transition-shadow sm:p-5';

  if (href) {
    return (
      <Link href={href} className={cn(className, 'hover:shadow-md')}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
