# Multi-country architecture

One application, many storefronts. India is served from the site root and the
UAE from `/ae/`, each with its own pages, articles, menus, pricing, contact
details, SEO and leads — sharing one brand, one media library, one product
catalogue and one CMS.

Nothing in the code knows that India and the UAE are the two markets. Routing,
settings, pricing and SEO all read the `Country` table, so **adding Qatar is a
database row plus its content, not a deployment**. That property is the point of
the design, and [How to add a country](#how-to-add-a-country) is the checklist
that proves it.

---

## Contents

- [The model](#the-model)
- [How a URL resolves](#how-a-url-resolves)
- [Why India keeps the root](#why-india-keeps-the-root)
- [Database models](#database-models)
- [Pages](#pages)
- [Products](#products)
- [Blog](#blog)
- [Navigation](#navigation)
- [Country settings](#country-settings)
- [Forms, leads and popups](#forms-leads-and-popups)
- [Duplicating content between countries](#duplicating-content-between-countries)
- [SEO, canonicals and hreflang](#seo-canonicals-and-hreflang)
- [Caching and revalidation](#caching-and-revalidation)
- [Permissions](#permissions)
- [The admin country selector](#the-admin-country-selector)
- [Migration notes](#migration-notes)
- [Rehearsing the migration](#rehearsing-the-migration)
- [How to add a country](#how-to-add-a-country)
- [Opening a market from an existing one](#opening-a-market-from-an-existing-one)

---

## The model

A **country** is a storefront. It owns a URL prefix, a currency, a locale and a
set of content. Exactly one country is the **default**, it holds the empty
prefix, and it is served from `/`.

| | India | United Arab Emirates |
| --- | --- | --- |
| Code | `IN` | `AE` |
| URL prefix | *(empty)* | `ae` |
| Home page | `/` | `/ae` |
| A CMS page | `/dropbox-business` | `/ae/dropbox-business` |
| The blog | `/blog` | `/ae/blog` |
| An article | `/blog/guide` | `/ae/blog/guide` |
| A product | `/products/dropbox-business` | `/ae/products/dropbox-business` |
| Locale | `en-IN` | `en-AE` |
| Currency | INR ₹ | AED |

What is **per country**: pages and their sections, blog posts, navigation menus,
product availability and pricing, company contact details, SEO defaults,
organisation schema, leads and form submissions.

What stays **global**: the brand (logo, palette, typography, layout), the media
library, the product catalogue's identity (name, SKU, brand, category,
specification, imagery), page categories, blog categories and tags, brands,
staff accounts, roles and permissions.

A country is not a language. Content is written per market, in whatever language
that market uses; nothing is translated automatically and there is no i18n
message layer.

---

## How a URL resolves

Resolution is one pure function plus one database read, and lives in
`src/lib/country/`:

```
src/lib/country/
  types.ts       CountryContext, CountrySettingsView
  routing.ts     pure: countryPath, countryHref, splitCountryPath, localiseContent
  registry.ts    the Country rows, cached per request and for 60s in-process
  request.ts     the market of the current request
  settings.ts    country settings merged over the global ones
  switch.ts      where the public market switcher should send a visitor
  access.ts      which markets a staff account may work in
  admin.ts       which market the admin is currently editing
  revalidate.ts  cache invalidation for market-scoped content
```

For a request to `/ae/dropbox-business`:

1. Middleware forwards the path as `x-pathname` — it already did this before
   markets existed, so no new plumbing was needed and **no rewrite happens**.
   The prefix stays in the URL, which keeps client navigation, canonical URLs
   and the address bar honest.
2. `splitCountryPath` takes the first segment, `ae`. It is not a reserved
   segment, and an **active** country has that slug, so the UAE owns the request
   and the remaining path is `/dropbox-business`.
3. The route loads that market's page and renders it.

For `/dropbox-business` the first segment matches no country, so the default
market owns the whole path — which is why the original URLs are unchanged.

Reserved first segments can never be read as a market: `admin`, `api`, `_next`,
`auth`, `auth-wroffy` (the sign-in screen), `login`, `preview`, `uploads`,
`media`, `static`, `assets`, `health`, `ready`, and anything containing a dot
(so `robots.txt` and `sitemap.xml` are files, not markets). The country form
validates a new prefix against the same list, so a market cannot be created
that would shadow a system route.

**An inactive country is not a storefront.** Its prefix stops resolving, the
path falls through to the default market, and the page 404s. Its content is
untouched and comes back the moment it is reactivated.

### Routing, not route duplication

There is one public catch-all, `src/app/(public)/[[...slug]]/page.tsx`. It
resolves the market, classifies the remaining path (CMS page, blog archive,
article, category, tag, product) and renders the matching surface from
`src/app/(public)/_surfaces/`. The default market's own `/blog`, `/blog/[slug]`,
`/blog/category/[slug]`, `/blog/tag/[slug]` and `/products/[slug]` routes are
kept because Next matches them ahead of the catch-all — and they are thin
delegations to the very same surfaces. There is one implementation of each page,
not one per market.

---

## Why India keeps the root

India is the live site. Moving it to `/in/` would have changed every indexed
URL, every inbound link and every piece of lead attribution for a cosmetic gain.
So the default market keeps the root and takes no prefix, and
`countryHref(defaultCountry, href)` is the identity function — for India the
multi-country layer is a no-op that produces byte-identical HTML.

---

## Database models

```
Country                 one storefront: code, slug, locale, currency, isDefault, isActive
CountrySettings         per-market company identity, contact details, SEO defaults
ProductCountry          a product as sold in one market
ProductVariantCountry   a variant's price in one market (absent = the global price)
BlogCategoryCountry     per-market archive copy and SEO for a global category
UserCountry             which markets a staff account may work in (none = all)
```

Foreign keys added to existing models:

| Model | Column | Null? | Meaning |
| --- | --- | --- | --- |
| `Page` | `countryId` | required | the market that owns the page |
| `BlogPost` | `countryId` | required | the market that owns the article |
| `Navigation` | `countryId` | required | the market whose menus these are |
| `Lead` | `countryId` | required | the storefront that generated the lead |
| `FormSubmission` | `countryId` | optional | the storefront the form was on |
| `Form` | `countryId` | optional | **null = shared by every market** |
| `Popup` | `countryId` | optional | **null = shown in every market** |

Slug uniqueness moved from global to per market:

```prisma
// before                      // after
slug String @unique            slug String
                               @@unique([countryId, slug])
```

This applies to `Page`, `BlogPost` and `Navigation`, and is what lets India and
the UAE each own a page at `dropbox-business`.

`Product.slug` is still globally unique: the product is one product everywhere.

Indexes added for the queries the public site actually runs:
`(countryId)`, `(countryId, slug)` (as the unique), `(countryId, status,
publishedAt)`, `(productId, countryId)`, `(countryId, sortOrder)`,
`(countryId, isFeatured, featuredOrder)`, `(countryId, createdAt)` and
`(countryId, status)` on leads.

---

## Pages

A page belongs to exactly one country. Each country has its **own homepage**
(`slug = ""`), and the "is homepage" flag is enforced per market, so setting the
UAE homepage does not disturb India's.

A page that does not exist in a market **404s in that market**. It never falls
back to another market's content: that would serve the wrong prices, the wrong
contact details and the wrong legal copy to the wrong customer.

Redirects are tried against the full request path first (`/ae/old-plan`) and the
market-relative path second (`/old-plan`), so a market can own a redirect
outright while a redirect written once still applies wherever it is asked for.

### Links inside block content

Editors type plain paths into CTAs, buttons and rich text. Those are rewritten
into the market being rendered **once, at the render boundary**
(`localiseContent` in the section renderer), so no block component contains
market logic. External URLs, anchors, `mailto:`/`tel:`, system routes and paths
that already carry a prefix are left exactly as written — and for the default
market the payload is not walked at all.

---

## Products

The `Product` row is the **global master**: name, slug, SKU, brand, category,
shared specification, images. "Dropbox Business" is the same product in every
market.

`ProductCountry` holds everything that is genuinely local:

- `status` / `publishedAt` — whether it is sold there at all
- `currency`, `monthlyPrice`, `annualPrice`, `compareAtPrice`, `discountPercent`
- `priceSuffix`, `priceNote`, `shortDescription`, `description`
- `ctaLabel`, `ctaUrl`, `ctaFormId`
- `seoTitle`, `seoDescription`, `canonicalUrl`, `noIndex`, `ogImageId`
- `isFeatured`, `sortOrder`, `featuredOrder` — ordering is per market

Resolution rules, in `src/lib/services/products.ts`:

- **Copy falls back** to the master record, so a market that has nothing to say
  about a product still renders a complete page.
- **Money never falls back.** An empty AED price shows that market's price note,
  never India's rupee figure.
- **No market has a row → the product is not sold there.** That is deliberately
  different from being sold at no price.

Prices are always `Decimal` and always entered by an administrator. **Nothing
converts currency at render time** — a rate-derived price changes under the
visitor and cannot be quoted.

`ProductVariantCountry` overrides a variant's price in one market. No rows were
created during migration: an absent row means the variant sells at its global
price, which is exactly what it did before.

---

## Blog

Articles are per market, and the same slug may exist once per market — so
`/blog/dropbox-guide` and `/ae/blog/dropbox-guide` are two articles for two
audiences, which is what lets hreflang pair them.

Categories and tags stay **global**: one taxonomy tree, not one per market.
Category counts and archives are filtered to the market being viewed, so a
category holding only India articles does not advertise itself on the UAE
archive. `BlogCategoryCountry` gives a market its own archive heading,
description, canonical and robots directives when it wants them; with no row the
category renders its global values.

The blog's design, layout and sidebar (Blog → Design / Layout) are global — they
are brand, not market.

---

## Navigation

Menus belong to a market. The UAE header is not forced to mirror India's: each
market has its own header, footer and legal menus, built in the same navigation
manager, and the manager edits the market selected in the top bar.

Menu items that point at a page, product, article or category resolve to that
market's URL automatically; a hand-typed internal URL goes through
`countryHref`, which leaves external links, anchors and system routes alone.

---

## Country settings

`WebsiteSettings` stays **global** and keeps the brand: logo, favicon, colours,
typography, container widths, button styles, social profiles, tracking.

`CountrySettings` holds what is genuinely local: company and legal name, sales
and support phone, WhatsApp, sales and support email, address, city, region,
postal code, business hours, tax label and number, header CTA, sales CTA copy,
footer description, copyright line, and the market's SEO defaults and
organisation/LocalBusiness schema fields.

Every country field is optional and **falls back to the global value**. A market
nobody has configured renders exactly what the single-country site rendered,
which is why India's footer and structured data did not change when this landed.

Edit both under **Settings → Countries**.

---

## Forms, leads and popups

**Forms** are shared by default (`countryId` null) — every form built before
markets existed still works on every storefront. Setting a country restricts a
form to one market, for a local enquiry form with local fields.

**Leads and submissions** record the storefront they came from. The market is
taken from the request the visitor actually made, never from the submitted
payload, so country attribution cannot be forged and a form restricted to one
market cannot be submitted from another. Landing-page and article attribution
are resolved inside the submitting market, so a UAE lead is never attributed to
India's page of the same name.

Historical leads were backfilled to India by the migration.

**Popups** are shown everywhere by default; setting a country targets one
market. Page targeting is matched against market-relative slugs, so a popup
pinned to "pricing" fires on `/pricing` and `/ae/pricing` — and a popup pinned
to a specific *page* only fires on the page in its own market.

The lead list, pipeline, CRM dashboard and CSV export all filter by country,
defaulting to the market selected in the top bar with "All countries" one click
away. The export is additionally narrowed to the markets the user may see.

---

## Duplicating content between countries

**Pages → row menu → Duplicate to country**, and the same on a blog post.

What comes across: every section in order with its block type, content, design
settings and media references; the layout flags; the SEO fields as a starting
point; and the same slug, so the two markets' URLs line up and hreflang can pair
them.

What deliberately does not:

- **Publication.** The copy is always a `DRAFT`. A duplicate must be reviewed and
  localised before it can appear in search results as a second copy of another
  market's page.
- **Homepage status.** That is a decision for the target market to make.
- **The canonical URL.** A market canonicals to its own URL; inheriting the
  source's would point the copy at the other market's page.

An existing page or article at that URL in the target market is **never
overwritten silently**. The action refuses, names the clash, and replaces the
target only when the editor confirms it in a dialog that says what will be lost.

---

## SEO, canonicals and hreflang

Two rules are absolute:

1. **A market canonicals to its own URL.** `/ae/dropbox-business` canonicals to
   `https://domain.com/ae/dropbox-business`, never to India's page. They are
   different pages for different customers.
2. **hreflang is emitted only where the content is genuinely live.** The
   alternates come from a query for published, indexable content with that slug,
   so an annotation can never point at a draft, a missing page or a 404. A page
   that exists in one market alone gets no hreflang at all.

`x-default` points at the default market, and only when that market has the
content.

Everything else follows from the same helpers:

- `buildMetadata` takes the **market-relative** path and adds the prefix itself,
  so no caller can build a canonical for the wrong market.
- Structured data is per market: `Organization`/`LocalBusiness` uses that
  market's name, contact points, address and `areaServed`; `WebSite` uses its
  home page and locale; breadcrumbs, `Product` and `BlogPosting` all carry
  market-prefixed URLs.
- The **sitemap** covers every active market in one file, each URL with its own
  prefix, listing only published, non-`noindex` content. A new market appears
  automatically as soon as it has published content.
- **robots.txt** is unchanged: the disallow list is path-based and already
  covers `/admin`, `/api` and `/preview` for every market. The sign-in screen
  is deliberately absent from it — robots.txt is public, and it carries
  `noindex, nofollow` in its own metadata and in a response header instead.

---

## Caching and revalidation

Public routes are `force-dynamic` (the root layout reads the visitor's
tracking-consent cookie), so there is no static page cache to leak between
markets — and every market's URL is a different path anyway, so one market's
cached page cannot be served for another.

What did need care is **invalidation**: revalidating `/products/x` would leave
`/ae/products/x` stale. `src/lib/country/revalidate.ts` is the only place a path
to revalidate is built, and product mutations revalidate the product's URL in
every active market.

The `Country` table itself is cached per request with React `cache()` and for
60 seconds in-process; every mutation calls `invalidateCountryCache()`, so a new
or deactivated market takes effect immediately on the instance that changed it
and within a minute everywhere else.

---

## Permissions

Country access **narrows** what a role already permits and never widens it. An
India content editor still needs `pages.edit` to edit a page; country access
only decides which market's pages they can reach.

- No `UserCountry` rows means **every market** — which is what every account
  created before this existed has, so nothing changed for anyone.
- A super admin always has every market; the role exists so somebody can fix a
  misconfigured restriction.
- Every mutation validates the country it is about to write against the user's
  access (`assertCountryAccess` / `resolveActionCountry`), so a country id in a
  form body cannot reach a market the user cannot edit.

Set it on **Staff → a person → Country access**.

---

## The admin country selector

The top bar carries a country selector. CMS screens — pages, blog, navigation,
leads, pipeline, forms, popups, dashboards — operate inside the selected market;
truly global screens (media, users, roles, brands, product categories, website
design) are unaffected.

The selection is stored in a cookie, resolved **on the server** and handed to the
selector as a prop, so there is nothing for hydration to disagree about. The
cookie is a hint, never an authority: the resolved market is re-validated against
the user's access on every screen.

Lists that support it also accept `?country=<id>` or `?country=all` in the URL,
so a filtered view stays shareable and back/forward behaves.

---

## Migration notes

The migration is `prisma/migrations/20260914120000_multi_country`. It is written
for a **populated production database** and is staged so nothing is ever
enforced before the data exists:

1. Create `Country` and insert India (default, empty prefix) and the UAE.
2. Create `CountrySettings`, `UserCountry`, `ProductCountry`,
   `ProductVariantCountry`, `BlogCategoryCountry`.
3. Add every `countryId` column as **nullable**.
4. Backfill: every existing page, article, menu, lead and submission becomes
   India's. Every product gets a `ProductCountry` row for India carrying the
   price, status, ordering, copy, CTA and SEO already on the product row, so the
   public site renders identically the moment it starts reading
   `ProductCountry`. India's `CountrySettings` is seeded from the existing
   `WebsiteSettings` and `SeoSettings`.
5. Only then set `NOT NULL`, add the foreign keys, swap the global slug indexes
   for their `(countryId, slug)` equivalents and add the supporting indexes.

Every statement is idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`,
`EXCEPTION WHEN duplicate_object`), so a partial run can be repeated safely.

No row is deleted, no slug changes, no SEO field is lost and no redirect is
introduced. The only indexes dropped are the three global slug indexes that are
replaced in the same migration.

Content relations are `onDelete: Restrict`, so a country holding content cannot
be deleted by accident — deactivate it instead, which takes the storefront
offline without touching anything.

Backups are unaffected: they are `pg_dump -Fc` of the whole database, so the new
tables are included automatically.

---

## Rehearsing the migration

A migration that has only ever run against seed data has not really been tested.
Production carries soft-deleted rows with mangled slugs, nulls in columns the
code "always" writes, empty-string currencies, archived and scheduled content,
emoji in titles and nested slugs nobody would think to invent. Rehearse against
a copy of the real thing before touching production:

```bash
# 1. Take a dump of production (or use the newest file the backup system wrote).
pg_dump -Fc "$PRODUCTION_DATABASE_URL" -f production.dump

# 2. Restore it into a scratch database, migrate it, and check the result.
REHEARSAL_DATABASE_URL=postgresql://user@localhost:5432/rehearsal \
  npm run db:rehearse -- ./production.dump
```

`scripts/rehearse-migration.mjs` drops and recreates the scratch database,
restores the dump, runs `prisma migrate deploy`, and then asserts:

- exactly one default market, and it owns the site root (empty prefix);
- no rows lost from any content table;
- every page and article slug is **byte-identical** to before, so no URL moved;
- the global product rows are untouched, and every product's price, annual
  price, status, currency and featured flag landed in `ProductCountry`;
- every page, article, menu and lead belongs to the default market;
- the global settings were copied into the default market (and that none were
  invented when there were none to copy);
- forms and popups stayed shared;
- the global slug uniques are gone and the `(countryId, slug)` ones exist;
- `countryId` is `NOT NULL` everywhere it must be;
- `prisma migrate diff` reports **no drift** between the migrated database and
  `prisma/schema.prisma`.

It exits non-zero and prints the failing checks if any of that is untrue, so it
works as a deployment gate in CI as well as by hand. It refuses to run if
`REHEARSAL_DATABASE_URL` points at the same host and database as
`DATABASE_URL`, and it only ever writes to the scratch database — the dump file
and production are read-only to it.

Accepts a `pg_dump -Fc` archive (what this app's own backup system produces) or
a plain `.sql` file. If the dump already has every migration applied it says so
and exits 0 rather than pretending to have tested anything.

### From the deployed container

The script ships in the runtime image, which already has the PostgreSQL client
tools and the Prisma CLI, so a rehearsal against the real database needs nothing
installed. In Coolify, open the application's **Terminal** and run:

```bash
cd /app

# A libpq-safe copy of DATABASE_URL: psql rejects Prisma's ?schema=public.
BASE=$(node -e 'const u=new URL(process.env.DATABASE_URL);
  ["schema","connection_limit","pool_timeout","socket_timeout","pgbouncer"]
    .forEach(p => u.searchParams.delete(p)); console.log(u.toString())')

# 1. Dump production.
pg_dump -Fc "$BASE" -f /app/backups/pre-migration.dump

# 2. Create a scratch database on the same server and rehearse into it.
psql "$BASE" -c 'CREATE DATABASE rehearsal'
REHEARSAL_DATABASE_URL=$(node -e 'const u=new URL(process.argv[1]);
  u.pathname="/rehearsal"; console.log(u.toString())' "$BASE") \
  node scripts/rehearse-migration.mjs /app/backups/pre-migration.dump

# 3. Only if it reports every check passed:
psql "$BASE" -c 'DROP DATABASE rehearsal'
```

The database role in `DATABASE_URL` needs `CREATEDB` for step 2; if it does not
have it, create the scratch database from the PostgreSQL service's own terminal
instead. Step 2 adds a separate database alongside the live one — nothing writes
to the production database itself: `pg_dump` only reads it, and the script
refuses to start if the scratch URL names the same host and database as
`DATABASE_URL`.

---

## How to add a country

Adding Qatar needs **no code change and no deployment**.

1. **Settings → Countries → Add country.**
   - Name: `Qatar`
   - ISO code: `QA`
   - URL prefix: `qa`
   - Locale: `en-QA`
   - Currency: `QAR`, symbol `QAR`
   - Phone code: `+974`, time zone: `Asia/Qatar`
   - Leave **Default country** off; leave **Serve publicly** on (or off until the
     content is ready — an inactive market's prefix simply does not resolve).
2. **Fill in its settings** on the same screen: company name, sales phone,
   email, address, tax details, SEO defaults, organisation schema.
3. **Switch the top-bar country to Qatar.**
4. **Create its homepage** — a page with an empty slug — or use *Duplicate to
   country* on India's homepage and localise the draft.
5. **Build its menus** under Navigation: header, footer and legal.
6. **Price the products** it sells: each product's edit screen has a Qatar tab
   under Country pricing. A product with no Qatar row is simply not sold there.
7. **Add its articles**, or copy existing ones with *Copy to Qatar* and localise
   them.
8. **Publish.** `/qa/` starts serving, the sitemap picks it up, hreflang appears
   on pages that exist in more than one market, and the public market switcher
   offers it.

Checklist of what you should *not* have to do: write a route, add a redirect,
edit a component, change the middleware, run a migration or deploy.

Currencies are validated against `SUPPORTED_CURRENCIES` in
`src/lib/utils/money.ts` — the only code change a genuinely new currency needs is
adding its code and locale there.

---

## Opening a market from an existing one

Steps 4 to 7 above are the slow part, and a market is useless until they are
done: no home page means the prefix 404s, and the public switcher will not offer
a market a visitor cannot land in. `scripts/clone-market.mjs` does that filling
in one pass.

```bash
# See exactly what would be written. Nothing is.
node scripts/clone-market.mjs --from IN --to QA --dry-run

# Do it, with a starting price and the market switched on.
node scripts/clone-market.mjs --from IN --to QA --publish --rate 0.044 --activate
```

Every line of the plan says `create` or `replace`, so a market that already has
hand-written content cannot be overwritten without it showing in the dry run
first. Re-running is safe: writes are keyed on (country, slug), so a second run
updates the rows the first one made rather than adding a second copy.

It copies pages (with their sections and the home page flag), articles with
their tags, menus, product listings and the marketing and SEO copy. Internal
menu links are repointed at the new market's own pages — a copied menu that
still pointed at the source market's rows would walk every visitor straight out
of the market they are in.

Three things it will not do:

- **Invent a price.** `--rate` multiplies the source's prices as a starting
  point for someone to edit, and the run says so on every line. Without it, a
  listing that has a price is copied without one and held back as a draft rather
  than shown at nothing. A listing that is deliberately price-less — a "contact
  us" tier — copies across exactly as it stands, published. No exchange rate is
  ever fetched, and nothing converts at render time.
- **Copy contact details.** Phone numbers, addresses and tax identifiers belong
  to the market they were written for; a wrong number on a live storefront is
  worse than a blank one, which falls back to the global settings.
- **Inherit canonicals.** A market canonicals to its own URL.

`--activate` switches the market on, and refuses to when there is no published
home page to switch on to.

Afterwards the run prints what still needs a human: the contact details, the
prices, and the copy itself — text written for one market rarely fits another.

