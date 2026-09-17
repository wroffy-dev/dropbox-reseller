# Installation

How a fresh copy of this application becomes a working one, and what the
installer does to itself afterwards.

---

## The short version

1. Deploy the image.
2. Open the site.
3. Fill in three screens: check the environment, connect a database, create
   your account.
4. The installer closes itself and never opens again.

No environment variables have to be set by hand, no secrets have to be
generated with `openssl`, and no admin password ever has to be put into a
platform's environment.

---

## What changed, and why

Before this existed, a first deployment meant knowing the variable names,
generating three secrets by hand, and setting `RUN_SEED=true` together with
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` so the container would create an
account on boot. The entrypoint's own log line said what was wrong with that:

> seed complete — set `RUN_SEED=false` and clear `SEED_ADMIN_PASSWORD`

A super admin's password, in the deployment's environment, until somebody
remembered to remove it. The wizard exists so that step does not.

That path still works and is still supported — see **Configuring on the
platform instead** below — but nothing requires it any more.

---

## The flow

```
Open the site
        ↓
Environment checks        can this container store configuration?
        ↓
Database                  connection tested → migrations applied → roles created
        ↓
Administrator             secrets generated → account created
        ↓
Final checks              secrets present, database reachable, account exists
        ↓
Installation locked       /install returns 404 from here on
        ↓
Sign in
```

Each step is verified before the next unlocks, and **nothing is written until
its own step has passed.** A wrong connection string is a message and another
attempt, not a half-configured installation that has to be redeployed to
clear.

---

## Where configuration lives

One JSON file, on the persistent volume:

```
/data/config/app-config.json      directory 0700, file 0600
```

It holds only what is needed *before* there is a database to read from: the
connection string and the three secrets. Everything else — site settings,
company details, markets — is rows in PostgreSQL, editable in the admin panel.

It is written atomically, through a temporary file and a rename, so a container
killed mid-write leaves the previous configuration intact rather than a
truncated file that boots into nothing.

**No value from it is ever logged.** The startup line, the wizard's final
screen and the audit entry all report key *names*.

### A platform variable always wins

A key already present in the environment is never overridden by this file. An
Azure Container Apps deployment that sets `DATABASE_URL` through secrets keeps
behaving exactly as it does today, and the file simply has nothing to
contribute.

It is also the way out: if a stored connection string is wrong and the wizard
has already closed, set the variable on the platform and it takes precedence,
without anyone having to edit a file inside a container.

---

## Configuring on the platform instead

Nothing here is compulsory. Set `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`,
`NEXT_PUBLIC_SITE_URL`, `ENCRYPTION_KEY` and `MFA_ENCRYPTION_KEY` as before and
the application starts configured. The wizard is offered only while there is
no database *and* no account — see **When the wizard is offered** below, which
is precisely why an existing deployment never sees it.

---

## When the wizard is offered

An installation counts as **done** when either:

- the stored configuration records an `installedAt` — what the wizard writes
  when it finishes; or
- a database is configured and already holds a user account.

The second test is what makes this safe to deploy to a running system. Every
installation that exists today was configured on the platform and has no
config file at all, and has users — so it is installed, and the wizard is
closed to it.

---

## Closing the installer

The installer is closed by a recorded state, not by deleting files.

That is deliberate. The wizard's routes are compiled into the server bundle,
so there are no loose files to delete at runtime. And `/app` is replaced
wholesale by the next image — so even a successful deletion would be undone by
the following deployment, quietly reopening the installer on a live site with
nobody watching for it.

A recorded state survives redeployment, applies to every replica at once, and
cannot be half-done.

Afterwards, `/install` answers with the site's own **404** — not a redirect and
not a 403, either of which would confirm to somebody probing a live site that
the path means something.

---

## What is cleared when it finishes

- The installation is marked complete.
- Setup-only credentials are removed from the stored configuration by name.
- What remains is exactly what the application needs to boot: the connection
  string and the secrets.

The administrator's password is not among them. It is hashed with bcrypt and
the plaintext is discarded — never written to the file, never logged, never
returned to the browser.

The generated secrets are never displayed either. The final screen lists their
names so it is clear they exist, and nothing more: a key rendered in a page is
a key in a screenshot, a scroll buffer and a browser history.

---

## If a step fails

The installer stays open, the configuration is untouched, and the screen says
which step failed and why. Correct it and run the step again.

Messages from the database step are redacted first: a PostgreSQL driver and
`prisma migrate` both quote the connection string, credentials included, in
their errors, and those errors are rendered in a browser.

---

## Securing the window before setup

There is an unavoidable gap between a fresh copy becoming reachable and
somebody completing setup, and whoever reaches it first creates the
administrator. This is true of every installer of this shape.

To close it, set `INSTALL_TOKEN` on the platform before the first deploy. Every
installer action then requires it, compared in constant time. Leave it unset
for the plain "deploy, open, configure" flow.

Otherwise: deploy and complete setup promptly, and do not publish the address
until you have.

---

## Files that are not reachable over HTTP

Worth stating plainly, because it is a common worry and the answer here is
structural rather than something to configure.

This is a Next.js standalone server, not a PHP document root. There is no web
server mapping URLs onto the filesystem. Only `public/` and routes that exist
in the build are served, so `app-config.json`, `.env`, backups and logs are not
addressable at all — there is no rule to add because there is no mapping to
restrict.

The two routes that *do* read from disk, `/media/:path*` and `/uploads/:path*`,
resolve every key through an allowlist inside the upload directory, which
refuses `..`, absolute paths, backslashes, null bytes and dotfiles.

---

## Redeploying an installed copy

The entrypoint reads the stored connection string on stdout — never as a
command-line argument, which would be visible in `ps` — and exports it, so
`prisma migrate deploy` runs for a wizard-installed copy exactly as it does for
a platform-configured one.

Without that, a new image carrying new migrations would leave a
wizard-installed copy pinned to the schema it was installed with.

---

## The volume

`/data/config` must be a persistent volume, like `/data/uploads`. On Azure
Container Apps that means an Azure Files share; in Compose or on a VPS, a named
volume.

Without one the wizard still runs, but its configuration is on a layer the next
deployment discards — and the copy would ask to be installed again. The first
environment check reports whether the directory is writable before anything
else is collected.
