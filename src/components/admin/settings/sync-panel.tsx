'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, CircleAlert, Copy, Info } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { syncCountryContent } from '@/lib/actions/country-sync';
import type { SyncResult, SyncLogEntry } from '@/lib/country/sync';
import { cn } from '@/lib/utils/cn';

/**
 * "Sync Content from <source>", on a destination market's screen.
 *
 * Preview first, by default. The preview takes the same decisions the real run
 * takes and writes nothing, so the counts shown above the button are the counts
 * that happen when it is pressed — which is the only way an administrator can
 * approve something they have actually seen.
 */
export function SyncPanel({
  sourceName,
  target,
  canSync,
}: {
  sourceName: string;
  target: { id: string; name: string; currency: string };
  canSync: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = React.useState<'ADD_MISSING' | 'UPDATE_EXISTING'>('ADD_MISSING');
  const [busy, setBusy] = React.useState<'preview' | 'run' | null>(null);
  const [preview, setPreview] = React.useState<SyncResult | null>(null);
  const [outcome, setOutcome] = React.useState<SyncResult | null>(null);

  async function run(previewOnly: boolean) {
    setBusy(previewOnly ? 'preview' : 'run');
    const result = await syncCountryContent({
      targetCountryId: target.id,
      mode,
      previewOnly,
    });
    setBusy(null);

    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    if (previewOnly) {
      setPreview(result.data ?? null);
      setOutcome(null);
      return;
    }
    setOutcome(result.data ?? null);
    setPreview(null);
    toast(result.message ?? 'Sync complete.');
    router.refresh();
  }

  const shown = outcome ?? preview;

  return (
    <Card className="mt-6">
      <CardHeader
        title={`Sync content from ${sourceName}`}
        description="Copies pages, their sections, product availability and market-specific forms. Everything arrives as a draft for review."
      />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-muted/[0.03] p-3 text-sm">
          <span className="font-medium text-content">{sourceName}</span>
          <ArrowRight className="h-4 w-4 text-muted" aria-hidden="true" />
          <span className="font-medium text-content">{target.name}</span>
          <span className="ml-auto text-xs text-muted">{sourceName} is never modified</span>
        </div>

        <div className="rounded-lg border border-hairline p-3 text-xs leading-relaxed text-muted">
          <p className="font-medium text-content">What is not copied</p>
          <p className="mt-1">
            Blog articles, categories and tags — the blog is written once and lives at the site root.
            Leads, form submissions and consent records. Staff, permissions and credentials.{' '}
            {sourceName}’s own company details and contact information.
          </p>
          <p className="mt-2">
            <strong className="font-medium text-content">Prices are not copied.</strong> Products
            arrive configured in {target.currency} with their prices empty, because converting a
            figure from one currency to another is a decision, not a copy.
          </p>
          <p className="mt-2">
            Product categories, brands and shared forms are the same records in every market
            already, so there is nothing to duplicate.
          </p>
        </div>

        <Field
          label="Mode"
          htmlFor="sync-mode"
          hint={
            mode === 'ADD_MISSING'
              ? 'Adds what this market does not have yet. Nothing already here is touched.'
              : 'Also refreshes previously imported content — but anything edited in this market since it was imported is reported as a conflict and left exactly as it is.'
          }
        >
          <Select
            id="sync-mode"
            value={mode}
            disabled={!canSync || busy !== null}
            onChange={(event) => {
              setMode(event.target.value as typeof mode);
              setPreview(null);
              setOutcome(null);
            }}
          >
            <option value="ADD_MISSING">Add missing content only</option>
            <option value="UPDATE_EXISTING">Update previously imported content</option>
          </Select>
        </Field>

        {shown ? <Summary result={shown} isPreview={!outcome} /> : null}

        {canSync ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => run(true)} disabled={busy !== null}>
              {busy === 'preview' ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Checking…
                </>
              ) : (
                'Preview changes'
              )}
            </Button>
            <Button onClick={() => run(false)} disabled={busy !== null}>
              {busy === 'run' ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Syncing…
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Sync content from {sourceName}
                </>
              )}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">
            You do not have permission to sync content between markets.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function Summary({ result, isPreview }: { result: SyncResult; isPreview: boolean }) {
  const localise = result.log.filter((entry) => (entry.localise?.length ?? 0) > 0);
  const conflicts = result.log.filter((entry) => entry.outcome === 'conflict');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            isPreview ? 'bg-brand/10 text-brand' : 'bg-emerald-50 text-emerald-700',
          )}
        >
          {isPreview ? (
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isPreview ? 'Preview — nothing written yet' : 'Done'}
        </span>
        <Count label="to create" value={result.created} done={!isPreview} doneLabel="created" />
        <Count label="to update" value={result.updated} done={!isPreview} doneLabel="updated" />
        <Count label="skipped" value={result.skipped} done doneLabel="skipped" />
        <Count label="conflicts" value={result.conflicts} done doneLabel="conflicts" warn />
        <Count label="failed" value={result.failed} done doneLabel="failed" warn />
      </div>

      {conflicts.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-50/60 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            Needs a decision
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {conflicts.map((entry, index) => (
              <li key={index}>
                <strong className="font-medium">{entry.label}</strong> — {entry.note}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-900/80">
            Nothing above was overwritten. Edit the local copy, or delete it and sync again.
          </p>
        </div>
      ) : null}

      {localise.length > 0 ? (
        <div className="rounded-lg border border-hairline p-3">
          <p className="text-sm font-medium text-content">Needs localising</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {localise.slice(0, 20).map((entry, index) => (
              <li key={index}>
                <strong className="font-medium text-content">{entry.label}</strong> —{' '}
                {entry.localise?.join('; ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="rounded-lg border border-hairline">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-content">
          Full log ({result.log.length} {result.log.length === 1 ? 'entry' : 'entries'})
        </summary>
        <ul className="max-h-72 space-y-1 overflow-y-auto px-3 pb-3 text-xs">
          {result.log.map((entry, index) => (
            <LogRow key={index} entry={entry} />
          ))}
        </ul>
      </details>
    </div>
  );
}

function LogRow({ entry }: { entry: SyncLogEntry }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 border-b border-hairline py-1 last:border-0">
      <span
        className={cn(
          'w-16 shrink-0 font-medium',
          entry.outcome === 'created' && 'text-emerald-700',
          entry.outcome === 'updated' && 'text-brand',
          entry.outcome === 'conflict' && 'text-amber-700',
          entry.outcome === 'failed' && 'text-red-700',
          entry.outcome === 'skipped' && 'text-muted',
        )}
      >
        {entry.outcome}
      </span>
      <span className="w-24 shrink-0 font-mono text-muted">{entry.entity.toLowerCase()}</span>
      <span className="min-w-0 flex-1 text-content">{entry.label}</span>
      {entry.note ? <span className="w-full text-muted sm:w-auto">{entry.note}</span> : null}
    </li>
  );
}

function Count({
  label,
  doneLabel,
  value,
  done,
  warn,
}: {
  label: string;
  doneLabel: string;
  value: number;
  done: boolean;
  warn?: boolean;
}) {
  if (value === 0 && warn) return null;
  return (
    <span className={cn('text-xs', warn && value > 0 ? 'font-medium text-amber-700' : 'text-muted')}>
      <strong className="font-semibold text-content">{value}</strong> {done ? doneLabel : label}
    </span>
  );
}
