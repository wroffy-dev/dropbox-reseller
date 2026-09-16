# Changelog

All notable changes to this application. The version here is the **application
version** — see [VERSION_README.md](./VERSION_README.md) for what that is, how
to move it, and why it is not the same thing as a consent notice version.

This project uses [semantic versioning](https://semver.org): MAJOR.MINOR.PATCH.

---

## [1.1.0] — 2026-09-16

### Fixed

- **Public forms could not be submitted at all on a site with no consent notice
  published.** Every submission was rejected with *"That submission could not be
  read. Please try again."* on a correctly filled form. `getCurrentNotice`
  returns version `0` for the wording built into the application, which is the
  state of every deployment until an administrator publishes a notice — and
  nothing seeds one. The page sent that `0` back as the version it had shown,
  the submission schema required `1` or more, and because the consent object
  travels inside the submission envelope, rejecting one field failed the whole
  envelope. Version `0` is now `BUILT_IN_NOTICE_VERSION`, an explicit, valid
  version that every layer accepts and records; published notices still start at
  `1`, so the two can never be confused.

- **Tick boxes could be read as accepted when they were not.** Checkbox values
  went through `z.coerce.boolean()`, which reads the string `"false"` as `true`
  because it is a non-empty string. Ticks are now read only from the tokens a
  checkbox actually posts.

- **Publishing a country-specific consent notice deactivated every other
  market's.** "Current" was scoped by notice key alone, so publishing UAE
  wording silently left India — and every market falling back to the shared
  notice — with no live notice at all. It is now scoped by key *and* market.
  Version allocation retries when two administrators publish at once, instead of
  failing in front of whoever was second.

- **A failed submission could leave the submit button stuck.** An error that was
  not a rejected submission — a dropped connection, a deploy mid-request — left
  the promise rejected and `pending` never cleared, so the button read
  "Sending…" indefinitely with no error shown. Submission is now wrapped, with
  the pending state cleared in `finally`. Filled inputs are preserved either
  way.

- Publishing a notice now revalidates public pages, not just the admin screen.

### Changed

- **One consent tick box per public form**, replacing the separate enquiry,
  marketing and Terms boxes. The wording it covers is written out beneath it,
  and the label is editable per form in Admin → Forms → *a form* → Settings.
  Behind it, enquiry, marketing and Terms are still recorded **separately**:
  each is derived from the box being ticked **and** from that purpose actually
  appearing in what was displayed, so a purpose that was not on screen can never
  be recorded as agreed.

- **Marketing wording may be left empty.** Clearing it in Admin → Leads & CRM →
  Consent notice is a decision, not a gap: no form asks for marketing consent,
  nothing renders, and no blank line or empty container is left behind. The
  built-in wording applies only while no notice has been published, and never
  overrides an intentionally empty saved value. Offering marketing now requires
  both the form's setting **and** non-empty published wording.

- **Marketing can never ride on a required tick box.** A form whose tick box is
  mandatory (lawful basis Consent, or Terms acceptance required) cannot also
  offer marketing in it — that would make marketing a condition of getting a
  reply. Saving that combination is refused with a message naming the switch to
  change, and any form that already holds it has marketing dropped from display
  and recorded as not presented.

- The Leads consent panel and export distinguish marketing **not offered** from
  **offered and declined**, rather than flattening both to "no". New export
  columns: `marketing_state`, `consent_notice_scope`, `consent_label_shown`.

### Added

- **Admin → Settings → Application information**: application name, running
  version, release date and build commit, all read-only and compiled into the
  build.

- `npm run release -- patch|minor|major` — moves `package.json`,
  `package-lock.json`, `CHANGELOG.md` and `VERSION_README.md` together. It does
  not commit, tag, push or deploy.

- [VERSION_README.md](./VERSION_README.md) and this changelog.

### Database

Additive migration `20260916120000_combined_consent_checkbox`. Four nullable
columns, no backfill, no data rewritten:

- `Form.consentCombinedLabel`
- `ConsentRecord.marketingPresented`, `.displayedLabel`, `.noticeScope`

Existing consent records read "not recorded" for anything that did not exist
when they were written. Nothing is reinterpreted as having accepted the new
combined wording.

---

## [1.0.0]

Initial release: public site, CMS, CRM, multi-country routing, consent capture,
SEO and content sync.
