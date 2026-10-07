# Bootcamp registration

## Implemented scope

- `/bootcamps`: authenticated, explicitly linked active students, **21 or older at signing** using the Puerto Rico calendar. Missing DOB is collected once and saved to the roster on successful waiver submission. A known DOB cannot be overridden in the form.
- `/admin/bootcamps`: real, persistent event management, student-account linking, event reports/CSV, private saved documents, backup retries, and payment reconciliation. This is separate from the existing fictional admin console panels.
- Flow: begin registration → three mandatory read-and-sign sections → optional bootcamp employer letter → one ATH Móvil purchase of **$30 full payment** or **$15 deposit**.
- A verified deposit confirms registration and flags **$15 remaining**. The remainder is collected outside this checkout. There is no recurring charge, subsequent balance checkout, offline payment editor, or carryover to another event.
- English and Spanish UI, document labels, and errors use the shared translations. Each document is saved in the language the student chose. Do not translate an already-signed agreement into a second signed document.

## Required setup before opening an event

1. Review the intended `DATABASE_URL`, then run `bun run db:migrate` through the existing controlled migration process. `0006_bootcamp_registration.sql` adds bootcamp tables, restrictive foreign keys, immutable evidence/association triggers, and unique registration/payment constraints. Builds do **not** migrate application databases.
2. Provision real student/admin Better Auth accounts and roster records using the existing authorized provisioning process. This feature does not create credentials or convert the demo roster into real students.
3. As an administrator, use **Link a student account** to associate each existing account with its roster record. Email values locate the two records for an explicit admin action; matching email alone never grants access. Links are one-to-one and cannot be reassigned through this screen.
4. Configure the existing private [Google Drive variables](google-drive.md): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `DRIVE_OAUTH_REFRESH_TOKEN`, `DRIVE_REPORTS_FOLDER_ID`. The configured app/account must be allowed to create and inspect its private files.
5. Resolve the protocol questions in [ATH Móvil integration notes](ath-bootcamps.md). Configure private `ATH_PUBLIC_TOKEN`, `ATH_PRIVATE_TOKEN`, and a **64-hex-character** `BOOTCAMP_PAYMENT_KEY` generated from 32 cryptographically random bytes. Retain that key securely: losing/changing it prevents decryption of outstanding payment capabilities.
6. Configure a private `BOOTCAMP_WORKER_SECRET` of at least 32 random characters and the recurring worker invocation below. Set `BOOTCAMP_PAYMENTS_ENABLED=true` **only after separately approved live merchant verification**. Merely having credentials or passing mock tests is not production certification.
7. Enter the event title, venue, arrival, start/end, registration deadline, and **all three approved legal sections in both languages**. Dates entered in the admin form are Puerto Rico local time (`America/Puerto_Rico`, UTC−04:00). Review and approve both languages, then open registration.

Registration activation requires configured backup, explicitly enabled/configured payments, and approved legal text. Configuration readiness is not an upstream health check. Outages still leave completed documents safe in PostgreSQL.

### Legal text and event edits

No sample agreement is published as approved legal advice. The legacy media revocation contradiction, refund/no-show language, and remaining screen/PDF differences still require organizational/legal approval. Under-21 handling remains deferred; there is no guardian bypass.

All three sections—including promotional media authorization—are mandatory. The same event text is displayed and printed without template-only additions. Event information is printed separately from the approved legal text; do not embed stale fixed dates or unsupported template placeholders in the agreement.

The PDF fonts support precomposed English/Spanish Latin and WinAnsi punctuation. Event validation rejects unsupported pasted characters (including internal tabs and nonbreaking hyphens) before an event can be approved/published; it does not silently rewrite legal wording.

Saving an event edit increments its revision and **closes registration** until an admin reopens it. Unsaved signatures cannot be attached to a changed revision or roster identity. Existing submitted waivers/letters are never replaced. Newly requested letters use the current schedule and check its revision again after database locking. Existing letters retain their original schedule; reissuing an already-completed letter is not supported in this release. Communicate rescheduling separately rather than treating an old PDF as newly issued.

## Documents, previews, and access

- The student scrolls each section to its end, acknowledges reading, and draws each signature. Pointer and keyboard drawing are supported. Server validation decodes bounded PNGs and checks visible ink; this is not proof of comprehension or legal identity.
- Preview/download before submission is **optional** and does not create a registration, completed document, backup, or payment. A server-authenticated preview proof binds the exact identity, content, signatures, and signing timestamp for up to 24 hours. An unchanged preview submitted with that proof becomes the **same PDF bytes**, not a newly dated rendering.
- Draft signatures live in page memory, not local storage. Changing signer details or language invalidates them; a reload before submission requires re-signing. Completed steps persist and resume from the server.
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

## Validation

```sh
bun test
bun run check
bun run db:check
bun run build
bun run db:test:up
bun run db:test
bun run db:test:down
```

The PostgreSQL suite uses only the guarded disposable loopback test target, never the development/production database. Tests cover exact PDFs, signature decoding, age boundaries, linkage/ownership, immutable evidence, optional letters, Drive recovery, provider mocks, and real PostgreSQL registration/payment concurrency. Live ATH charges, live Drive uploads, and browser/device sign-off remain separate verification steps.
