'use client';

import * as React from 'react';
import { CheckCircle2, CircleAlert, Database, KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { Spinner } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import {
  inspectEnvironment,
  configureDatabase,
  finishInstallation,
  type EnvironmentReport,
  type InstallSummary,
} from '@/lib/actions/install';

/**
 * The setup wizard.
 *
 * Four steps, and each one only unlocks the next once the server has confirmed
 * it. Nothing is written until its own step passes, so a wrong connection
 * string is a message and a second attempt rather than a half-configured
 * installation that has to be redeployed to clear.
 *
 * ## What it deliberately never shows
 *
 * The generated secrets. They are written to the configuration file and are
 * never sent to the browser — an operator has no use for a key they will never
 * type, and a key rendered in a page is a key in a screenshot, a scroll buffer
 * and a browser history. The final step lists their *names*, so it is clear
 * they exist, and nothing more.
 */

type Step = 'environment' | 'database' | 'account' | 'done';

const STEPS: Array<{ id: Step; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'environment', label: 'Environment', icon: ShieldCheck },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'account', label: 'Administrator', icon: UserPlus },
  { id: 'done', label: 'Finish', icon: KeyRound },
];

export function SetupWizard({ siteOrigin }: { siteOrigin: string }) {
  const [step, setStep] = React.useState<Step>('environment');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [environment, setEnvironment] = React.useState<EnvironmentReport | null>(null);
  const [databaseUrl, setDatabaseUrl] = React.useState('');
  const [siteUrl, setSiteUrl] = React.useState(siteOrigin);
  const [adminName, setAdminName] = React.useState('');
  const [adminEmail, setAdminEmail] = React.useState('');
  const [adminPassword, setAdminPassword] = React.useState('');
  const [summary, setSummary] = React.useState<InstallSummary | null>(null);
  /** True when the chosen database already has accounts: a reconnection. */
  const [reconnecting, setReconnecting] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const result = await inspectEnvironment();
      if (result.ok) setEnvironment(result.data ?? null);
      else setError(result.error);
    })();
  }, []);

  async function run<T>(action: () => Promise<{ ok: boolean; error?: string; data?: T }>, next: Step) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.');
      return null;
    }
    setStep(next);
    return result.data ?? null;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="font-heading text-2xl font-semibold text-content">Set up your site</h1>
        <p className="mt-1 text-sm text-muted">
          A few details, and this copy is ready to use. Nothing is saved until each step succeeds.
        </p>
      </header>

      <ol className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Setup progress">
        {STEPS.map((entry, index) => {
          const position = STEPS.findIndex((candidate) => candidate.id === step);
          const state = index < position ? 'done' : index === position ? 'current' : 'todo';
          const Icon = entry.icon;
          return (
            <li key={entry.id} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border',
                  state === 'done' && 'border-emerald-300 bg-emerald-50 text-emerald-700',
                  state === 'current' && 'border-brand bg-brand/10 text-brand',
                  state === 'todo' && 'border-hairline text-muted',
                )}
              >
                {state === 'done' ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Icon className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <span className={cn(state === 'todo' ? 'text-muted' : 'font-medium text-content')}>
                {entry.label}
              </span>
            </li>
          );
        })}
      </ol>

      {error ? (
        <Alert tone="danger" title="That step did not finish" className="mb-6">
          <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{error}</p>
          <p className="mt-2 text-sm">
            Nothing was saved. Correct the problem above and try the step again.
          </p>
        </Alert>
      ) : null}

      {step === 'environment' ? (
        <Card>
          <CardHeader
            title="Checking this container"
            description="What the application can see about where it is running."
          />
          <CardBody className="space-y-4">
            {environment ? (
              <>
                <ul className="space-y-2">
                  {environment.checks.map((check) => (
                    <li key={check.label} className="flex gap-3 text-sm">
                      {check.ok ? (
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                          aria-hidden="true"
                        />
                      ) : (
                        <CircleAlert
                          className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                          aria-hidden="true"
                        />
                      )}
                      <span>
                        <strong className="font-medium text-content">{check.label}</strong>
                        <span className="block text-muted">{check.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                {environment.storedKeys.length > 0 ? (
                  <Alert tone="info">
                    A previous run already saved: {environment.storedKeys.join(', ')}. Those values
                    are kept.
                  </Alert>
                ) : null}

                <Button
                  onClick={() => setStep('database')}
                  disabled={!environment.ready || busy}
                >
                  Continue
                </Button>
                {!environment.ready ? (
                  <p className="text-sm text-muted">
                    Fix the item marked above, then reload this page.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                Checking…
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {step === 'database' ? (
        <Card>
          <CardHeader
            title="Connect a database"
            description="A PostgreSQL 16 database. The connection is tested and the tables created before anything is saved."
          />
          <CardBody className="space-y-4">
            <Field
              label="Connection string"
              htmlFor="database-url"
              required
              hint="postgresql://user:password@host:5432/database — this is stored on the server and is never shown again."
            >
              <Input
                id="database-url"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={databaseUrl}
                onChange={(event) => setDatabaseUrl(event.target.value)}
                placeholder="postgresql://…"
              />
            </Field>

            <div className="flex gap-2">
              <Button
                onClick={() =>
                  void run(async () => {
                    const result = await configureDatabase({ databaseUrl });
                    if (result.ok) setReconnecting(Boolean(result.data?.hasAccounts));
                    return result;
                  }, 'account')
                }
                disabled={busy || databaseUrl.trim().length === 0}
              >
                {busy ? (
                  <>
                    <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Testing and preparing…
                  </>
                ) : (
                  'Test and continue'
                )}
              </Button>
              <Button variant="outline" onClick={() => setStep('environment')} disabled={busy}>
                Back
              </Button>
            </div>
            <p className="text-xs text-muted">
              This creates the tables and the built-in roles. It never drops or resets anything that
              is already there.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {step === 'account' ? (
        <Card>
          <CardHeader
            title={reconnecting ? 'Reconnect this site' : 'Create the administrator'}
            description={
              reconnecting
                ? 'This database already has an account, so setup will reconnect to it rather than create another. Any missing security keys are generated now.'
                : 'The first and only account. Security keys are generated automatically at this step.'
            }
          />
          <CardBody className="space-y-4">
            {reconnecting ? (
              <Alert tone="info">
                Sign in with the account you already have. Setup will not create a new one, and will
                not change the existing password.
              </Alert>
            ) : null}
            <Field
              label="Site address"
              htmlFor="site-url"
              required
              hint="The full public address, used for links in emails and for sign-in."
            >
              <Input
                id="site-url"
                value={siteUrl}
                onChange={(event) => setSiteUrl(event.target.value)}
                placeholder="https://example.com"
              />
            </Field>
            {reconnecting ? null : (
              <>
            <Field label="Your name" htmlFor="admin-name" required>
              <Input
                id="admin-name"
                value={adminName}
                onChange={(event) => setAdminName(event.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field label="Email" htmlFor="admin-email" required>
              <Input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                autoComplete="username"
              />
            </Field>
            <Field
              label="Password"
              htmlFor="admin-password"
              required
              hint="At least 14 characters, with an uppercase letter, a lowercase letter, a number and a symbol."
            >
              <Input
                id="admin-password"
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
              </>
            )}

            <Button
              onClick={() =>
                void run(async () => {
                  const result = await finishInstallation({
                    siteUrl,
                    adminName,
                    adminEmail,
                    adminPassword,
                  });
                  if (result.ok) {
                    setSummary(result.data ?? null);
                    /*
                     * Straight to the sign-in screen, without waiting.
                     *
                     * The action has just closed the installer, and a Server
                     * Action re-renders the route it was called from — which is
                     * now a 404, because that is what `/install` answers once
                     * setup is done. Rendering a summary here would mean
                     * rendering it on a page that has already removed itself,
                     * and what the operator actually saw was the 404.
                     *
                     * `replace` rather than `assign`, so Back does not return to
                     * a wizard that no longer exists.
                     */
                    window.location.replace(result.data?.signInPath ?? '/');
                  }
                  return result;
                }, 'done')
              }
              disabled={busy || (!reconnecting && (!adminName || !adminEmail || !adminPassword))}
            >
              {busy ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Finishing…
                </>
              ) : (
                reconnecting ? 'Reconnect and finish' : 'Create account and finish'
              )}
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {step === 'done' && summary ? (
        <Card>
          <CardHeader
            title="Setup complete"
            description="The installer is now closed and will not open again."
          />
          <CardBody className="space-y-4">
            <ul className="space-y-2">
              {summary.checks.map((check) => (
                <li key={check.label} className="flex gap-3 text-sm">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  <span>
                    <strong className="font-medium text-content">{check.label}</strong>
                    <span className="block text-muted">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            <Alert tone="success" title="Saved on the server">
              {summary.storedKeys.join(', ')}. These are stored outside the web root and are never
              displayed — not here, not in the logs.
            </Alert>

            <a
              href={summary.signInPath}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand/90"
            >
              Sign in as {summary.adminEmail}
            </a>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
