# Bootcamp registration

## Implemented scope

- `/bootcamps`: authenticated, explicitly linked active students, **21 or older at signing** using the Puerto Rico calendar. Missing DOB is collected once and saved to the roster on successful waiver submission. A known DOB cannot be overridden in the form.
- `/admin/bootcamps`: real, persistent event list and registration open/close controls. Activation, editing, and reports have separate routes (below), rather than stacking panels on the list. This is separate from the existing fictional admin console panels.
- Flow: begin registration → three mandatory read-and-sign sections → optional bootcamp employer letter → one ATH Móvil purchase of **$30 full payment** or **$15 deposit**.
- A verified deposit confirms registration and flags **$15 remaining**. The remainder is collected outside this checkout. There is no recurring charge, subsequent balance checkout, offline payment editor, or carryover to another event.
- The surrounding UI, accessibility labels, and errors remain available in English and Spanish through the shared translations. **Legal agreements and newly signed waiver PDFs are Spanish-only**, including when the interface is English. Optional employer letters still use the student's selected language. Historical signed documents retain their original language and bytes; do not translate them into a second signed document.

## Required setup before opening an event

1. Review the intended `DATABASE_URL`, then run `bun run db:migrate` through the existing controlled migration process. `0006_bootcamp_registration.sql` adds bootcamp tables, restrictive foreign keys, immutable evidence/association triggers, and unique registration/payment constraints. Builds do **not** migrate application databases.
2. Real student/admin Better Auth accounts and roster records are required. This feature does not create credentials or convert the demo roster into real students. Production student provisioning and invitation acceptance are not yet implemented.
3. **Student onboarding dependency:** the manual admin account-linking form and its server action have been removed. Existing one-to-one `bootcamp_accounts` associations remain necessary for student eligibility, registration/payment ownership, and private PDF access. Already-associated students can continue registering on the student side. Accounts without an association cannot register until a trusted onboarding flow establishes their roster identity; that replacement is not implemented yet. Matching emails or a submitted student ID must not automatically grant access.
4. Configure the existing private [Google Drive variables](google-drive.md): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `DRIVE_OAUTH_REFRESH_TOKEN`, `DRIVE_REPORTS_FOLDER_ID`. The configured app/account must be allowed to create and inspect its private files.
5. Resolve the protocol questions in [ATH Móvil integration notes](ath-bootcamps.md). Configure private `ATH_PUBLIC_TOKEN`, `ATH_PRIVATE_TOKEN`, and a **64-hex-character** `BOOTCAMP_PAYMENT_KEY` generated from 32 cryptographically random bytes. Retain that key securely: losing/changing it prevents decryption of outstanding payment capabilities.
6. Configure a private `BOOTCAMP_WORKER_SECRET` of at least 32 random characters and the recurring worker invocation below. Set `BOOTCAMP_PAYMENTS_ENABLED=true` **only after separately approved live merchant verification**. Merely having credentials or passing mock tests is not production certification.
7. On `/admin/bootcamps/activate`, enter the event title, venue, **one event date**, and **start/end times in 24-hour `HH:mm` format**. Both times are on that date; the end must be later than the start. All admin dates/times are Puerto Rico local time (`America/Puerto_Rico`, UTC−04:00). Check-in opens automatically **1 hour before the start**; registration closes automatically **12 hours before the start**, including on the preceding date when needed. These two calculated timestamps are displayed read-only, not entered by the admin. The activation form contains only event details: no legal-review section or approval checkbox, event list, or report. Saving generates the built-in Spanish sections on the server without approving them, then returns to the event list. Use **Edit event** to review all three sections and the legal warnings, explicitly approve and save them, then open registration from the list. Custom Spanish edits are optional, not a prerequisite for creating an event.

Registration activation requires configured backup, explicitly enabled/configured payments, and approved legal text. Configuration readiness is not an upstream health check. Outages still leave completed documents safe in PostgreSQL.

### Admin routes

| Route | Purpose |
| --- | --- |
| `/admin/bootcamps` | Event list, activation link, and registration open/close controls |
| `/admin/bootcamps/activate` | Event details-only setup |
| `/admin/bootcamps/[eventId]/edit` | Edit an existing event and review/approve its Spanish agreements |
| `/admin/bootcamps/[eventId]/report` | That event's registration report, private document links, backup retries, and payment reconciliation |
| `/admin/bootcamps/report?event=…&language=…` | Full-event CSV download, including each student's current Basic/Regular class |

The real routes use the Compact ledger layout: a single event table, a compact details editor, and a registration ledger. Activate is available for a new bootcamp; existing events expose Edit and Report instead, with editable dates/times. The report shows started versus confirmed counts, website payment totals, confirmed outstanding balances, and separate Basic/Regular coverage. Coverage measures started registrations against each class's report roster, not completed payment. Search, class buttons, and registration buttons filter only the displayed table; CSV exports the full event report. Document retry and payment reconciliation remain under Report tools.

Every page inherits the shared admin layout/sidebar/header, including direct visits and refreshes. Navigation uses real links, so browser back/forward does not depend on an in-memory editor selection. The activation and event-list loads do not fetch student reports. A malformed or missing event ID produces a localized 404 instead of falling back to another event. Old `/admin/bootcamps?event=…` report links redirect to the event-specific report.

Successful create/edit submissions redirect to the list. The creation action accepts event details only, ignoring browser-supplied IDs, approval, and legal text; it cannot update another event or silently approve agreements. The edit action requires its submitted ID to match the route, with the existing revision check. Report actions use the route's event ID, not a submitted ID. Existing authentication, same-origin checks, rate limits, private response headers, and activation safeguards remain in force.

### Schedule rules

The editor and server share `parseEventSchedule(eventDate, startTime, endTime)`. Admin saves require those three fields and derive `startsAt`, `endsAt`, `arrivalAt`, and `registrationClosesAt` on the server. Submitted values for the four derived timestamps cannot override the schedule; old forms without the new fields are rejected and must be reloaded. The 24-hour inputs use an explicit `HH:mm` format rather than a native time picker whose 12/24-hour display depends on device settings.

Existing stored events and signed documents are not migrated or rewritten. Editing an older multi-day event requires choosing a same-day end time; saving any event applies the fixed check-in/deadline offsets. If the editor's calculated schedule differs from the saved schedule, legal approval must be confirmed again. Historical document rendering still supports its saved date ranges and seconds.

### Legal text and event edits

The canonical source is the **user-provided Spanish legacy wording**, consolidated in `src/lib/bootcamp/legal-templates.ts` and exposed as `translations.es.bootcamp.waiver.legalText`. Its provenance is the original Masterminds `frontends/waiver/src/lib/legal-text.ts` and adult PDF template `apps/certificate-worker/internal/waiver/templates/adult.html`. It is not a newly invented agreement or a separate English translation. The adult version incorporates the weapons, parking/arrival, companion-area, belongings/loss, and waiver-signing clauses so the screen and PDF use the same terms. Paper delivery/carry-a-copy and guardian/minor instructions are omitted for this digital **21+** flow; there is no guardian bypass.

**Standard mode is automatic, not automatically approved.** `defaultLegalText` resolves the actual event's Puerto Rico date (or a historical snapshot's date range), venue, check-in opening time, latest arrival/event start time, and the **$30.00** price, **$15.00** deposit, and **$15.00** remaining balance. Times use 24-hour notation including seconds; check-in also includes its calendar date when it falls before the event's start day. `arrivalAt` opens check-in; `startsAt` is the event start and latest arrival, not a second check-in opening. There is no fixed August 1, 2026 date or legacy park name. The balance is handled by administration outside the website; the fixed Saturday/1600 no-show balance deadline is omitted without inventing a replacement deadline. The original absence/nonrefund provision remains.

All three sections—including promotional media authorization—are mandatory. The saved event's Spanish clauses are the exact text presented for signing, copied into the immutable waiver snapshot, and printed in the PDF without PDF-only legal additions. New waiver forms submit `language=es` even with an English interface; new English waiver previews/signatures are rejected. The PDF renderer still understands historical English snapshots.

The imported source deliberately retains **both** the media authorization's “irrevocable” wording and its exception for express written revocation. The administrator warning calls out this contradiction; the software does not interpret or reconcile it. The named releases for Masterminds Programa ASVAB, the United States Army, the Río Piedras recruitment office, and the Municipio de Bayamón remain, as does the Sra. Menéndez reference; only the event venue is substituted. Those entities may not fit every new venue. These explicit content decisions are **not lawyer approval or legal advice**: an authorized administrator must review the contradiction, named entities, refund terms and suitability before approving/opening each event.

For optional custom wording, supply the three Spanish sections (`legal_es_agreement`, `legal_es_liability`, `legal_es_media`). `legalSource=standard` generates the clauses from validated event fields and ignores submitted manual legal strings. `legalSource=custom` (or a missing source for older callers) requires all three Spanish fields; English input cannot replace a missing Spanish section. Unknown sources are rejected. Custom input is trimmed and NFC-normalized once, then preserved rather than silently rewritten or having placeholders expanded. Administrators are responsible for updating any dates, times, venues or amounts embedded in custom text.

Storage retains the `LegalText.en`/`LegalText.es` shape for compatibility with immutable historical snapshots. For new standard or custom saves **both slots contain identical Spanish sections**; `en` is not an English translation. This does not migrate or overwrite existing signed documents. `usesDefaultLegalText` recognizes standard mode only when all three Spanish clauses match the generated wording exactly. It ignores a historical English translation and does not overwrite custom clauses. Saving an event in standard mode regenerates the clauses for its new dates/venue; saving custom mode preserves the submitted wording.

The PDF fonts support precomposed English/Spanish Latin and WinAnsi punctuation. Event validation rejects unsupported pasted characters (including internal tabs and nonbreaking hyphens) before an event can be approved/published; it does not silently rewrite legal wording.

Saving an event edit increments its revision and **closes registration** until an admin reopens it. Unsaved signatures cannot be attached to a changed revision or roster identity. Existing submitted waivers/letters are never replaced. Newly requested letters use the current schedule and check its revision again after database locking. Existing letters retain their original schedule; reissuing an already-completed letter is not supported in this release. Communicate rescheduling separately rather than treating an old PDF as newly issued.

## Documents, previews, and access

- The student scrolls each section to its end, acknowledges reading, and draws each signature. Pointer and keyboard drawing are supported. Server validation decodes bounded PNGs and checks visible ink; this is not proof of comprehension or legal identity.
- Preview/download before submission is **optional** and does not create a registration, completed document, backup, or payment. A server-authenticated preview proof binds the exact identity, content, signatures, and signing timestamp for up to 24 hours. An unchanged preview submitted with that proof becomes the **same PDF bytes**, not a newly dated rendering.
- Draft signatures live in page memory, not local storage. Changing signer details or the event revision invalidates them; a reload before submission requires re-signing. The waiver language stays Spanish regardless of interface language. Completed steps persist and resume from the server.
- Successful waiver submission atomically stores its snapshot, student information, validated signatures, exact PDF `bytea`, and SHA-256. An optional letter is stored similarly at its completion. No download or payment is required for storage/backup.
- Database-first persistence is followed by an immediate Drive backup attempt. Failures remain in a durable queue. The Drive file ID is reserved before upload, so a timeout followed by retry does not create another file. A conflict must match stored metadata, checksum, size, MIME type, and destination folder before it is accepted as saved.
- Student downloads read the saved bytes, never regenerate from edited event text. Only the owning linked account can download through the event's current end time, even after registration closes or the student's active status changes. Pending-payment documents are included. Admin downloads do not expire with the event.
- Closing/ending an event does not delete records or backups. There is no automatic retention deletion or public Drive sharing. Operational database/Drive access must protect these sensitive documents; backups do not replace an organizational retention/access policy.
- Backup status, attempts, reserved file ID, and sanitized failure category are durable. Already-saved Drive files are not continuously checked for later deletion by a Drive user.

## Background processing

Schedule an HTTPS **POST** to `/api/bootcamps/work` approximately once per minute, with:

```text
Authorization: Bearer <the private BOOTCAMP_WORKER_SECRET>
```

Store that header securely in the scheduler; never put the secret in a URL. No scheduler, deployment adapter, or hosted job is provisioned by this change. The worker handles up to three document jobs and three payment jobs per invocation; the two queues run independently. Configure a request execution budget of at least **300 seconds**, or use a scheduler/runtime appropriate to those bounded jobs. Multiple invocations are safe: durable leases and compare-and-set updates prevent conflicting work. Monitor failed worker calls, queue backlog, and admin backup/payment attention flags; increase invocation frequency if necessary for volume.

Do not run the worker by an un-awaited in-request background promise. Request/process restarts must not be relied on for fulfillment. The authenticated admin retry/reconcile buttons provide additional bounded batches; backoff/cooldowns still apply.

### ATH notifications

Register `/api/bootcamps/ath/webhook` as the HTTPS listener in ATH Business. See the official subscription steps in `ath-bootcamps.md`. The listener bounds requests, rate-limits/coalesces them, and only enqueues existing attempts. It never treats callback status, payer identity, or reported amount as proof of payment. Unknown and simulated notifications cannot grant credit.

Server reconciliation uses saved attempt IDs/amounts and merchant-authenticated verification. `CONFIRM` is approval, **not** payment. Authorization intent is recorded before debit, and completed provider transaction IDs are globally unique. Ambiguous creation/authorization blocks a new checkout; operators must investigate with ATH rather than blindly retrying a charge.

Current provider limitations remain explicit:

- No documented webhook signature or delivery/retry guarantee. The durable worker also checks pending payments independently of browser/webhook delivery.
- Refund notifications do not reliably identify the original payment. Run the admin event reconciliation sweep when investigating refunds; any verified positive refund is conservatively marked refunded and uncredited, not silently treated as fully paid. This is not a partial-refund accounting system.
- Cancelled attempts are terminal. A genuinely late settlement after cancellation requires merchant/operator investigation and potentially refunding a duplicate; no UI resolution or automatic second credit is provided.
- An attempt whose creation succeeded but whose response was lost may lack a recoverable ticket capability. It stays uncertain; documented metadata are correlation, not provider idempotency.

## Reports

Reports derive amounts from verified website transactions; no mutable paid counter is accepted from the browser. `$0` is unconfirmed, `$15` is confirmed with `$15` remaining, `$30` is confirmed/paid in full. Offline collections are intentionally not reflected.

The report includes **current active roster records even when they never started**, plus all students who started this event even if now inactive. DOB-unknown and under-21 students are marked separately from eligible students. Non-starter roster membership is not frozen historically; archive a CSV if a fixed historical roster denominator is needed. Eligibility uses the report date capped at the registration deadline. All document/payment joins and balances are event-specific.

CSV includes a UTF-8 BOM for Excel and escapes spreadsheet-formula values. It includes registration status, payment status/verification attention, website amount/remaining balance, and saved-document indicators. Admin document links and backup status remain on the event page.

## Local sample and design previews

Visit `/admin/bootcamps/mockups` (or **Choose a layout** on the event list) to compare three interactive designs: Event desk, Operations board, and Compact ledger. Each previews the list → activation → edit → report flow inside the shared admin shell. They read the student roster, mark `floor(roster.length / 2)` students as fictionally registered, and show illustrative full/deposit balances. Preview controls never mutate the database or call payment/document services; refreshing resets the preview.

Run `bun run db:seed:bootcamp` to create a persistent, closed `[DEMO] ASVAB intensive · November` event and started registrations for half of the fictional local roster. It uses the existing guarded local Compose target, requires the local admin and only `@example.test` students, and leaves existing roster records untouched. Reruns skip existing event/registration rows and refuse an opened/approved or renamed demo event. The report is `/admin/bootcamps/00000000-0000-4000-8000-00000000bc01/report`.

The seeded report deliberately has no signed waivers, documents, legal approval, or verified payments. Payment balances in the three mockups are demo-only—not transaction evidence. Production routes and their safeguards remain unchanged.

## Validation

Targeted regression checks:

```sh
bun test tests/bootcamp-validation.test.ts tests/bootcamp-legal.test.ts tests/bootcamp-pdf.test.ts
```

Broader checks and the separately managed disposable database suite:

```sh
bun test
bun run check
bun run db:check
bun run build
bun run db:test:up
bun run db:test
bun run db:test:down
```

The PostgreSQL suite uses only the guarded disposable loopback test target, never the development/production database. Legal regressions cover the real canonical templates, Puerto Rico token resolution, strict Spanish custom input, standard creation without legal inputs, regenerated event details, preserved custom clauses, and Spanish-only new waivers. PostgreSQL cases compare student-page legal data with the saved snapshot and extracted PDF legal text, then verify that rescheduling preserves the original saved bytes and hash while new signatures use the updated clauses. Historical English PDF rendering and bilingual optional letters remain covered. Tests also cover signature decoding, age boundaries, linkage/ownership, immutable evidence, Drive recovery, provider mocks, and real PostgreSQL registration/payment concurrency. Live ATH charges, live Drive uploads, and browser/device sign-off remain separate verification steps.
