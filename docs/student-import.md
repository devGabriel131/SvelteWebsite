# Excel student import and invitations

Admins can import a new student intake at **`/admin?section=invitations`**. The existing admin shell, language controls, and roster remain available. Public Better Auth signup stays disabled: the import creates each account in advance, and the student accepts an invitation using the email and PIN already supplied by the program.

## Configure before importing real students

1. Install dependencies with `bun install` and review the intended `DATABASE_URL`.
2. Apply all versioned migrations with `bun run db:migrate`, including `0010` invitations and the `0011` canonical identity / `0012` status-only cutover. Apply the matching application version atomically; [schema migration safety](database-schema.md#identity-and-lifecycle-cutover) owns conflict/provenance handling.
3. Configure [Better Auth](authentication.md): `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`. The URL must be the canonical HTTPS origin outside loopback development. A real authenticated admin is required; the guarded local admin seed is for local development only.
4. Configure [Gmail](gmail.md): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` authorized for `gmail.send`, and `GMAIL_SENDER_ADDRESS`. Use the Gmail refresh token, not the Drive-only token. Restart the app after configuration changes.
5. Start with fictitious records and **`EMAIL_TEST_MODE=true`**. This sends **real messages through Google**, but redirects every recipient to the configured sender and adds `[TEST]` to the subject. Do not use real student information merely to test configuration. Missing/blank/false test mode means ordinary delivery to students.
6. Verify the sender mailbox and the invitation's canonical domain. Set `EMAIL_TEST_MODE=false` only when ready for actual student sends.

Configuration is checked before an import commits any accounts. Successful configuration validation does not prove a refresh token, Gmail account, or recipient mailbox is operational; sending can still fail.

## Workbook format

Use **`.xlsx`**, one worksheet, a header row, and no more than **100 students / 2 MiB per upload**. Save legacy `.xls` files as `.xlsx` first. A blank [Excel template](../static/student-import-template.xlsx) is also downloadable from the import interface.

Required columns may appear in any order:

| Canonical header | Supported examples | Value |
| --- | --- | --- |
| `first_name` | `firstName`, `First name`, `Name`, `Nombre`, `Nombres` | Nonblank text, at most 100 characters. |
| `last_name` | `lastName`, `Last name`, `Surname`, `Apellido`, `Apellidos` | Nonblank text, at most 100 characters. |
| `email` | `Email address`, `Correo`, `Correo electrónico` | One plain email address, not a display-name mailbox or recipient list. |
| `pin` | `PIN`, `PIN code`, `Código PIN`, `Clave` | Four ASCII digits. Text `0042` remains `0042`; an Excel integer `42` is intentionally padded to `0042`. |

Headers ignore case, accents, spaces, underscores, and hyphens. Do not include duplicate headings for the same required field. Extra columns and fully blank data rows are ignored, within bounded worksheet dimensions. Names retain accents and compound names; first and last names are never inferred by splitting a full name.

PINs are not unique identifiers; students can share a PIN but cannot share an email address. Store PIN cells as **Text** when preparing files. Three-digit text, formulas/cached formula results, errors, dates, booleans, rich text, and hyperlink objects are not accepted as required field values. Numeric PINs must be integers from 0 to 9999. Encrypted/ZIP64 archives and unusually encoded or excessively large spreadsheet structures are unsupported.

## Admin workflow

1. Select the workbook, assign **Basic** or **Regular** class type for the batch, and choose the invitation email language.
   Client-safe `StudentImportOptions` and upload limits live in `src/lib/student-invitations.ts`; `src/lib/student.ts` owns roster status, class, and gender tuples. Raw import options must match supported values exactly; they are not trimmed, defaulted, or resolved from invalid input.
2. Click **Preview students**. Review names, email addresses, and row-specific errors; this performs no account writes or email sends. PINs are never returned to the interface.
3. Correct every invalid/duplicate row before continuing. An address already present in either roster or Better Auth is a conflict—even for inactive profiles or admin identities. Existing records, passwords, roles, and associations are never overwritten or inferred by email. Imports create new students only.
4. Click **Confirm import & send invitations**. A fifteen-minute signed review binds the exact workbook bytes, options, and admin identity. Changing any of them requires another preview. Without JavaScript, reselect the same file after preview; the returned class/language choices are retained. Student authentication itself requires JavaScript, as before.
5. The whole batch's auth identities/credential accounts, student records, canonical `student_accounts` associations, and invitations are created in one PostgreSQL transaction. Each association records the admin actor/time. `students.status` starts as **invited**, not bootcamp-eligible; birth date/gender stay empty until completion, and the assigned class is already populated. No account-completeness CHECK forbids these intentionally incomplete linked profiles.
6. Each student receives an individually addressed, translated email. The existing PIN is hashed through Better Auth's configured password hasher, stored only in `auth_account.password`, and never included in invitation emails. Raw workbooks and PINs are not saved by this workflow.

Saving accounts and sending email are separate operations: email cannot be rolled back with SQL. The persisted invitation pages show **enrollment acceptance** independently of **Gmail send status**. Previous/Next makes older records reachable, including unconfirmed or interrupted sends.

- **Pending:** saved, not yet claimed for sending; for example, a process stopped before reaching it.
- **Sending:** claimed; if a process stopped, this can remain unfinished.
- **Accepted by Gmail:** the API acknowledged the message, not proof of delivery or student acceptance.
- **Send not confirmed:** no acknowledgment was confirmed; Gmail may still have accepted the message before a network/storage error.

There are no automatic send retries. Use **Resend invitation** explicitly after checking status. It invalidates the previous link and issues a new seven-day link without creating another student/account or changing its PIN. Wait at least one minute between attempts. Accepted, inactive, or identity/email-mismatched invitations cannot be resent. Resends use the invitation's original language and current server test-mode setting.

`requireActionViewer` rejects missing sessions (`401`), wrong roles, and foreign/missing Origins (`403`) before reading a body or acquiring import dependencies. Actual streamed multipart bytes are bounded at the workbook limit plus 64 KiB; successful overflow cancellation is a limit failure, missing/invalid form parsing is a file failure, and reader/acquisition/cancellation failures remain storage errors. The parser separately enforces archive integrity, CRC, expansion/dimension/row limits, and workbook policies above.

Invitation runtime obtains admin auth secret/hasher and canonical base URL privately, and lazily preflights `getGmailClient()` before provisioning. Delivery uses that client's construction-time `testMode`/`send`; it does not query a second Gmail config cache or invoke authentication through a dependency receiver. Configuration/mail origin checks remain, without inventing a cross-provider origin comparison.

## Student completion and safety boundaries

The link opens `/enroll?token=…` inside `StudentShell`. A signed-out student uses the existing rate-limited Better Auth HTTP client and returns to the token-bearing link. The link alone is insufficient: the signed-in account must match the student's canonical `student_accounts` pair, role, and invited email. Profile → invitation → auth identity locks preserve single-use acceptance and resend concurrency; no link is inferred or rewritten from email.

Students confirm first/last names and provide a real, nonfuture birth date and one of the table's supported gender values. `src/lib/student.ts` owns the shared exact `YYYY-MM-DD`, `0001-01-01` minimum, finite calendar-roundtrip birth-date policy. Enrollment requires birth date and gender; the roster editor still permits both to be empty and retains its existing trim/nonempty name rules. Email and class type are read-only; submitted IDs, role, activity, timestamps, and credential fields are ignored. Successful acceptance atomically completes the profile, marks the imported login email verified, changes `invited` to `active`, and consumes the invitation. Expired, rotated, already accepted, wrong-account, and deactivated invitations cannot mutate a profile.

Only a SHA-256 digest of the random 256-bit invitation token is stored; prepared delivery passes only student ID/raw token and hashes that validated token once for claim/comparison/result updates. Token-bearing pages are private/no-store with referrer protection. Do not log, share, or archive invitation URLs. The roster editor rejects independent email changes for every canonical-linked student, including legacy bootcamp links; coordinated email correction remains disabled. Unlinked profiles retain email editing.

Successful enrollment activates the same student reached through the same canonical association by bootcamp services—no second link insert. Bootcamp access still requires its existing active-status, 21+ age, open-event, document/proof, ownership, and payment rules. This does not change PIN security, implement recovery, or gate public game/tool pages. General enrollment age policy and coordinated login/email recovery remain pending.

## Validation

```sh
bun test tests/student-import-file.test.ts tests/student-import.test.ts tests/student-invitations.test.ts
bun run check
bun run build
bun run db:test
```

Database tests use the guarded disposable Compose database on port 5434, native Better Auth, scoped fixtures, and stubbed mail delivery. They cover transaction rollback, email/PIN normalization, receipt tampering, expiry/replay, wrong identities, deactivation, email-edit protection, and concurrent import/send/resend/acceptance. They do not send Gmail messages or modify a hosted database.
