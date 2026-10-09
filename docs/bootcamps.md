# Bootcamp registration

## Implemented scope

- `/bootcamps`: authenticated students associated through canonical `student_accounts`, with `students.status='active'`, **21 or older at signing** using the Puerto Rico calendar. Missing DOB is collected once and saved on successful waiver submission; a known DOB cannot be overridden. Imported invited accounts use the same association, but cannot register until enrollment activates the profile.
- `/admin/bootcamps`: persistent event list/open-close controls, with separate activation/edit/report routes. These real operations are distinct from the root-console's local payment/grade-report demos.
- Flow: begin registration → three mandatory read-and-sign sections → optional bootcamp employer letter → one ATH Móvil purchase of **$30 full payment** or **$15 deposit**.
- A verified deposit confirms registration and flags **$15 remaining**. The remainder is collected outside this checkout. There is no recurring charge, subsequent balance checkout, offline payment editor, or carryover to another event.
- The surrounding UI, accessibility labels, and errors remain available in English and Spanish through the shared translations. **Legal agreements and newly signed waiver PDFs are Spanish-only**, including when the interface is English. Optional employer letters still use the student's selected language. Historical signed documents retain their original language and bytes; do not translate them into a second signed document.

## Required setup before opening an event

1. Review the intended `DATABASE_URL`, then run `bun run db:migrate` through the existing controlled migration process. `0006_bootcamp_registration.sql` adds bootcamp tables, restrictive foreign keys, immutable evidence/association triggers, and unique registration/payment constraints. Builds do **not** migrate application databases.
2. Real Better Auth accounts and roster records are required. [Admin intake/invitations](student-import.md) provisions student identities and completes enrollment; roster seeds alone do not create credentials. Production-admin provisioning remains separate.
3. `student_accounts` is the single one-to-one identity owner for enrollment, eligibility, registration/payment ownership, and private PDFs. Apply the `0011` identity and `0012` status-only migrations with the matching application; [schema migration safety](database-schema.md#identity-and-lifecycle-cutover) owns their conflict/provenance rules. There is no manual link/reassociation form or second bootcamp link. Matching emails or browser-selected student IDs never grant access.
4. Configure the existing private [Google Drive variables](google-drive.md): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `DRIVE_OAUTH_REFRESH_TOKEN`, `DRIVE_REPORTS_FOLDER_ID`. The configured app/account must be allowed to create and inspect its private files.
5. Resolve the protocol questions in [ATH Móvil integration notes](ath-bootcamps.md). Configure private `ATH_PUBLIC_TOKEN`, `ATH_PRIVATE_TOKEN`, and a **64-hex-character** `BOOTCAMP_PAYMENT_KEY` generated from 32 cryptographically random bytes. Retain that key securely: losing/changing it prevents decryption of outstanding payment capabilities.
6. Configure a private `BOOTCAMP_WORKER_SECRET` of at least 32 random characters and the recurring worker invocation below. Set `BOOTCAMP_PAYMENTS_ENABLED=true` **only after separately approved live merchant verification**. Merely having credentials or passing mock tests is not production certification.
7. On `/admin/bootcamps/activate`, enter the event title, venue, **one event date**, and **start/end times in 24-hour `HH:mm` format**. Both times are on that date; the end must be later than the start. All admin dates/times are Puerto Rico local time (`America/Puerto_Rico`, UTC−04:00). Check-in opens automatically **1 hour before the start**; registration closes automatically **12 hours before the start**, including on the preceding date when needed. These two calculated timestamps are displayed read-only, not entered by the admin. The activation form accepts only event details and includes a read-only standard agreement preview: no legal editing or approval checkbox, event list, or report. Activation generates the built-in Spanish sections on the server, **opens registration immediately**, and returns to the event list. There is no separate legal approval or custom-wording step.

Activation and reopening require configured backup, explicitly enabled/configured payments, and a registration deadline still in the future. At most **one event** can have `registrationOpen=true`; a second activation or reopening returns the localized `activeEvent` error (`bootcamp.errors.activeEvent` in both interface languages). Expired open rows are closed transactionally before activation/reopening, so they cannot block the next event. Configuration readiness is not an upstream health check. Outages still leave completed documents safe in PostgreSQL.

### Database migration safety

`0009_bootcamp_single_active_event.sql` follows the existing transactional Drizzle migration process; its generated journal entry and schema snapshot are included. It locks `bootcamp_events`, closes expired open rows, and aborts with an actionable error if more than one future event remains open. Resolve that conflict deliberately by closing all but one event, then rerun `bun run db:migrate`. An aborted migration rolls back the expired-row cleanup too. No event, registration, signed snapshot, PDF, or payment is deleted.

The migration removes `legal_approved`, `approved_by`, and their approval constraint/foreign key, then adds the partial unique index `bootcamp_event_single_open` on `registration_open WHERE registration_open`. This enforces the invariant for concurrent requests and direct database writes, not just UI controls. Closing one event allows another to activate/reopen. Only violations of this named index become `activeEvent`; unrelated database failures retain their normal error handling. Apply the migration together with the updated backend/UI; older binaries still expect the removed columns. Builds do not apply migrations, and this change does not migrate production automatically.

Identity/status cutover preserves legal/payment history and legacy link provenance; canonical restrictive associations remain intentional. Do not deploy this application against the old identity/lifecycle schema or silently resolve conflicting records.

### Admin routes

| Route | Purpose |
| --- | --- |
| `/admin/bootcamps` | Event list, activation link, and registration open/close controls |
| `/admin/bootcamps/activate` | Event details-only setup |
| `/admin/bootcamps/[eventId]/edit` | Edit an existing event; regenerate its standard Spanish agreements |
| `/admin/bootcamps/[eventId]/report` | That event's registration report, private document links, backup retries, and payment reconciliation |
| `/admin/bootcamps/report?event=…&language=…` | Full-event CSV download, including each student's current Basic/Regular class |

The real routes use the Compact ledger layout: a single event table, a compact details editor, and a registration ledger. Activate is available for a new bootcamp; existing events expose Edit and Report instead, with editable dates/times. The report shows started versus confirmed counts, website payment totals, confirmed outstanding balances, and separate Basic/Regular coverage. Coverage measures started registrations against each class's report roster, not completed payment. Search, class buttons, and registration buttons filter only the displayed table; CSV exports the full event report. Document retry and payment reconciliation remain under Report tools.

Authenticated pages inherit `AdminShell` on direct visits/refreshes; anonymous admin sign-in is separate, and `/bootcamps` inherits `StudentShell`. Navigation uses real links. Activation/list loads do not fetch student reports; edit GET reads the database without assembling provider services. Malformed/missing route or CSV query event IDs return localized 404/private-no-store, not a fallback event. Old `/admin/bootcamps?event=…` report links still redirect.

Successful activation/edit redirects to the list. Activation accepts event details only and uses server-derived `paymentEnabled && driveEnabled`; supplied IDs/approval/legal text cannot change another event or readiness. `updateEvent(db, eventId, form)` owns edits: submitted ID must equal the route ID, revision compare-and-set rejects stale forms, and both old/new cutoff checks remain. The HTTP action is still named `saveEvent`; there is no service create branch. Report actions use route event IDs, not hidden overrides.

### Guarded HTTP form actions

`src/lib/server/bootcamp/http.ts` owns `bootcampAction(role, work, onSuccess?)`. Work receives `{ services, viewerId, form, params }`; role is exactly `admin` or `student`. Order is private/no-store header → verified session/role gate **outside failure conversion** → exact Origin → services → database-backed request limit → bounded form read → service work. Missing viewer is `401`, wrong role `403`; body/dependencies are untouched by denied auth. Feature failures use localized action results; success redirects run outside that conversion.

Buckets are `bootcamp:${role}:${viewerId}` over 60 seconds: admin **30 requests / 400,000 body bytes**, student **20 / 2,300,000**. Form MIME/parse/read/cancel/overflow errors remain `invalid`. `requireAdminEvent` also guards CSV IDs before report queries. Worker, webhook, PDF-preview, document, and report-download gates stay distinct rather than inheriting form-action policy.

### Submission feedback and authoritative refresh

`ActionForm` owns feedback for each enhanced submission. It clears its prior result while pending, displays local failure without applying/reloading `page.form`, and awaits `refreshAll()` before success callbacks or payment unlock. A fulfilled refresh is still rejected if `page.error` is set: SvelteKit may resolve after rendering a failed load. Redirects alone use `update({ reset: false })`. Transport/error-result/refresh failures and a thrown `beforeSubmit` become unavailable/onFailure; a false pre-submit result cancels silently. Pending resets in `finally`. A load failure may render the shared error page instead of keeping the form visible.

Each page retains native `page.form` feedback for initial/no-JavaScript POSTs, then suppresses that fallback after the next enhanced submit; hydration alone does not hide it and refresh does not resurrect it. A form has one current submission result, not duplicate SSR/enhanced alerts. Independent forms may retain separate outcomes—there is no global feedback queue. Unsuccessful/uncertain payment checks keep the submission lock; only successful authoritative refresh can unlock it.

### Schedule rules

The editor and server share `parseEventSchedule(eventDate, startTime, endTime)`. Admin saves require those three fields and derive `startsAt`, `endsAt`, `arrivalAt`, and `registrationClosesAt` on the server. Submitted values for the four derived timestamps cannot override the schedule; old forms without the new fields are rejected and must be reloaded. The 24-hour inputs use an explicit `HH:mm` format rather than a native time picker whose 12/24-hour display depends on device settings.

Existing stored schedules, legal text and signed documents are not rewritten by the migration. Editing an older multi-day event requires choosing a same-day end time; saving any event applies the fixed check-in/deadline offsets. Every save regenerates the standard legal text from the validated schedule and venue. Historical document rendering still supports its saved date ranges and seconds.

### Legal text and event edits

The canonical source is the **user-provided Spanish legacy wording** in `src/lib/bootcamp/legal-templates.ts`; `legal.ts` imports `spanishBootcampLegal` directly, with no translation-dictionary mirrors. Provenance is the original Masterminds `frontends/waiver/src/lib/legal-text.ts` and adult PDF template `apps/certificate-worker/internal/waiver/templates/adult.html`. This is not a newly invented agreement or English translation. The adult version includes weapons, parking/arrival, companion-area, belongings/loss, and waiver-signing clauses so screen/PDF terms match. Paper delivery/carry-a-copy and guardian/minor instructions are omitted for this digital **21+** flow; no guardian bypass.

**The standard template is the only legal-text source for activation and editing.** `defaultLegalText` resolves the actual event's Puerto Rico date (or a historical snapshot's date range), venue, check-in opening time, latest arrival/event start time, and the **$30.00** price, **$15.00** deposit, and **$15.00** remaining balance. Times use 24-hour notation including seconds; check-in also includes its calendar date when it falls before the event's start day. `arrivalAt` opens check-in; `startsAt` is the event start and latest arrival, not a second check-in opening. There is no fixed August 1, 2026 date or legacy park name. The balance is handled by administration outside the website; the fixed Saturday/1600 no-show balance deadline is omitted without inventing a replacement deadline. The original absence/nonrefund provision remains.

All three sections—including promotional media authorization—are mandatory. The saved event's Spanish clauses are the exact text presented for signing, copied into the immutable waiver snapshot, and printed in the PDF without PDF-only legal additions. New waiver forms submit `language=es` even with an English interface; new English waiver previews/signatures are rejected. The PDF renderer still understands historical English snapshots.

The imported source deliberately retains **both** the media authorization's “irrevocable” wording and its exception for express written revocation. The software does not interpret or reconcile this contradiction. The named releases for Masterminds Programa ASVAB, the United States Army, the Río Piedras recruitment office, and the Municipio de Bayamón remain, as does the Sra. Menéndez reference; only the event venue is substituted. Those entities may not fit every new venue. These explicit content decisions are **not lawyer approval or legal advice**: an authorized administrator must review the contradiction, named entities, refund terms and suitability before activating each event. The software stores no administrator legal-approval boolean or approver identity.

The server always calls `defaultLegalText` with validated event fields. Browser-supplied `legalSource`, manual legal sections, `legalApproved`, and `approvedBy` are ignored; they cannot replace the standard clauses or establish an approval state. The wording is constant apart from the template's event-specific substitutions.

Storage retains the `LegalText.en`/`LegalText.es` shape for compatibility with immutable historical snapshots. For all new saves **both slots contain identical Spanish sections**; `en` is not an English translation. Editing a legacy event also replaces its event-level custom wording with the standard template. This does not migrate or overwrite existing signed documents or registration waiver snapshots.

The PDF fonts support precomposed English/Spanish Latin and WinAnsi punctuation. Event validation rejects unsupported pasted characters (including internal tabs and nonbreaking hyphens) before an event can be saved/activated; it does not silently rewrite legal wording.

Saving an event edit increments its revision and **preserves its existing open/closed state**, unless either the previous or newly calculated 12-hour cutoff has passed, in which case registration closes. Moving an expired event into the future never implicitly reopens it; reopening is a separate readiness-checked action. Unsaved signatures cannot be attached to a changed revision or roster identity. Existing submitted waivers/letters are never replaced. Newly requested letters use the current schedule and check its revision again after database locking. Existing letters retain their original schedule; reissuing an already-completed letter is not supported in this release. Communicate rescheduling separately rather than treating an old PDF as newly issued.

## Documents, previews, and access

- The student scrolls each section to its end, acknowledges reading, and draws each signature. Pointer and keyboard drawing are supported. Server validation decodes bounded PNGs and checks visible ink; this is not proof of comprehension or legal identity.
- Optional preview/download uses `registration.previewDocument(userId, form): Promise<{ pdf, token }>`; it creates no registration, completed document, backup, or payment. The authenticated token binds exact identity/content/signatures/signing clock for up to 24 hours. Submitting an unchanged preview with its proof preserves **identical PDF bytes**, not a newly dated render. Preview and first submission each reuse one loaded student/event context for preparation; completed-document retries and event → student → registration locked eligibility/proof/revision rechecks remain.
- Draft signatures live in page memory, not local storage. Changing signer details or the event revision invalidates them; a reload before submission requires re-signing. The waiver language stays Spanish regardless of interface language. Completed steps persist and resume from the server.
- Successful waiver submission atomically stores its snapshot, student information, validated signatures, exact PDF `bytea`, and SHA-256. An optional letter is stored similarly at its completion. No download or payment is required for storage/backup.
- Database-first persistence is followed by an immediate Drive backup attempt; failures remain durably queued. `createBootcampBackup(db, binding)` accepts a validated `{ client, folderId }` with required `upload`, `generateFileId`, and `getFile` capabilities; `null` alone disables backup. Disabled batches still validate arguments and return queued without database work. Reserved IDs, two-minute leases, attempt fences, backoff, and conflict verification protect recovery. A 409 must match metadata/hash/checksum/size/MIME/destination before success. This workflow is separate from the paired, nondurable IST/attendance report archive, although both reuse the same cached Drive client.
- Downloads authorize canonical association/event expiry in SQL **before loading PDF bytes**, then return saved bytes rather than regenerating edited text. Only the owning account can download through the event's current end time, including pending-payment documents and after registration closes or status changes; unrelated/expired student requests load no PDF. Admin document access does not expire with the event.
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

## Local sample

`bun run db:seed:bootcamp` creates a persistent, closed `[DEMO] ASVAB intensive · November` event and started registrations for half the fictional local roster. It requires the guarded local target, seeded local admin, and only `@example.test` students, preserves roster records, skips existing fixture event/registrations, and refuses an opened or renamed demo event. Its real report is `/admin/bootcamps/00000000-0000-4000-8000-00000000bc01/report`.

The seed has no signed waivers, documents, or verified payments. Do not assume its stored schedule is future or activate it for a real charge. Completed comparison routes are retired; the seed still exercises supported persistent report pages.

## Validation

Targeted regression checks:

```sh
bun test tests/bootcamp-validation.test.ts tests/bootcamp-legal.test.ts tests/bootcamp-pdf.test.ts
```

Broader checks and the separately managed disposable database suite:

```sh
bun test
bun run check
bun run build
bun run db:test:up
bun run db:test
bun run db:test:down
```

PostgreSQL suites use the guarded disposable target, never development/production data. Regression contracts include canonical identity/enrollment-to-eligibility, template substitutions and extracted saved legal text, Spanish-only new waivers/historical English rendering, byte/hash preservation after rescheduling, signatures/age/proofs, SQL document authorization, immutable evidence, Drive recovery, and registration/payment concurrency. Provider tests use synthetic transports, not real ATH/Google/email. They are not live certification or production-latency evidence; authorized live merchant/provider checks and browser/device sign-off remain separate.
