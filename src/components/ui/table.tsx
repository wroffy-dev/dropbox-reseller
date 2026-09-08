import * as React from 'react';
import { cn } from '@/lib/utils/cn';

/** Wrapper that keeps wide tables scrollable instead of breaking the layout. */
export function TableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('scroll-x -mx-4 sm:mx-0', className)} {...props} />;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn('w-full min-w-[40rem] border-collapse text-sm', className)} {...props} />
  );
}

export function Th({
  className,
  align = 'left',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-hairline bg-muted/[0.04] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  align = 'left',
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={cn(
        'border-b border-hairline px-3 py-3 align-middle text-content',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-muted/[0.03]', className)} {...props} />;
}
