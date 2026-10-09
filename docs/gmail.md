# Gmail backend

The server-only TypeScript Gmail port sends messages through the Gmail API using the shared Google OAuth transport. It supports plain text, HTML, and in-memory attachments. The admin [student import and invitation workflow](student-import.md) now uses this port for individually addressed invitation emails. There is no automatic sending from configuration alone, and this does not change the existing Drive archive or add Gmail sending to IST reports, attendance certificates, or bootcamps.

## Private configuration

`src/env.ts` declares these variables as private, dynamic, optional environment values. Store credentials in server secret configuration or an uncommitted local `.env`, never in browser code, source control, logs, or chat.

All four variables below are required **when Gmail is used**:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID, shared with the Drive integration when both use the same OAuth app. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Secret for that same OAuth client, also shared with Drive. |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Gmail refresh token for the sending Google account, authorized for `https://www.googleapis.com/auth/gmail.send`. This preserves the legacy Gmail variable name; it is **not** `DRIVE_OAUTH_REFRESH_TOKEN`. |
| `GMAIL_SENDER_ADDRESS` | One sender mailbox: the authenticated Google user's address or a verified Gmail send-as address for that account. An optional display name is supported. |

`EMAIL_TEST_MODE` is optional. After trimming and case normalization, `1`, `true`, `yes`, and `on` enable it; `0`, `false`, `no`, `off`, blank, and missing disable it. **All other values are configuration errors.** This is deliberately stricter than the legacy behavior so a misspelling cannot silently select normal sending.

Credential values are trimmed; sender controls are rejected before surrounding whitespace is trimmed. Missing/blank requirements are named together, never echoed. Public development/builds need no Gmail config: first `getGmailClient()` call lazily constructs/caches the client. Bad/missing config throws `GmailError`, never a null/no-op client. Constructor validates nonnull config, boolean test mode, sender, credentials, and timeout before invitation provisioning writes; every send still validates configuration for MIME composition plus original recipients/content. Restart after config changes to replace the snapshot.

### Google prerequisites and refresh token provision

1. Enable the **Gmail API** in the Google Cloud project that owns the OAuth client, and configure its consent screen and allowed users according to your organization's policy.
2. Use an existing valid Gmail refresh token tied to that client and sender account, or run an authorized OAuth consent flow outside this website. Request `https://www.googleapis.com/auth/gmail.send` with `access_type=offline`; use `prompt=consent` when new consent is needed to obtain a refresh token. Exchange the resulting authorization code using the same OAuth client and redirect URI, then store the returned refresh token privately as `GOOGLE_OAUTH_REFRESH_TOKEN`. The backend exchanges that refresh token for short-lived access tokens; it does not provide a setup/consent endpoint or obtain consent itself.
3. Do not substitute the Drive-only refresh token. Shared client ID/secret values do not grant Gmail scopes. Review OAuth app publishing and Workspace policy: external apps in Testing can have short-lived refresh tokens, and consent or administrator approval may be required.
4. Set `GMAIL_SENDER_ADDRESS` to that account's own mailbox or an address already configured and verified in Gmail's **Send mail as** settings. Merely putting an arbitrary address in this variable does not authorize it. This module does not create or verify aliases.
5. Before importing real students, perform an authorized controlled send with fictitious content and an account you control. Test mode still contacts Google and delivers a real message. Check sender mailbox/Sent mail, permissions, canonical invitation domain, and attachment contents. Offline tests do not perform this operational check.

## Server API

Import the application wrapper only from server-side code:

```ts
import { getGmailClient } from '$lib/server/gmail';
import type { Email } from '$lib/server/gmail/message';

// Run only after the server has authenticated the caller and authorized these recipients and contents.
const email: Email = {
  to: ['María Example <recipient@example.com>'],
  subject: 'Sample report / Informe de ejemplo',
  body: 'Attached is a fictitious sample report.',
  htmlBody: '<p>Attached is a <strong>fictitious</strong> sample report.</p>',
  attachments: [{
    filename: 'sample.txt',
    bytes: new TextEncoder().encode('Fictitious sample data only.\n'),
    mimeType: 'text/plain'
  }]
};

const gmailId: string = await getGmailClient().send(email);
```

`getGmailClient()` is the composition entry point's only export. It returns the same lazily cached client using the private environment above. `client.send(email, signal?)` returns the Gmail message ID, not a MIME `Message-ID` header or proof of delivery. Its copied `send` method closes over construction-time configuration and needs no receiver.

For explicit server configuration or isolated tests, import `readGmailConfig` and its configuration types from `config.ts`, `createGmailClient` and `GmailClient` from `client.ts`, `GmailError` from `error.ts`, and `Email`/`EmailAttachment` from `message.ts`. Shared `GoogleClientOptions` and `GoogleErrorKind` belong to `../google/client.ts`. These pure modules do not load SvelteKit's private-env entry point.

- `GmailConfig` contains `clientId`, `clientSecret`, `refreshToken`, `senderAddress`, and `testMode`.
- `GmailClient` exposes readonly `testMode`, the same construction-time snapshot used for MIME rewriting, plus `send(email, signal?): Promise<string>`. An optional `AbortSignal` bounds a caller's wait; cancellation is not a recall operation.
- Invitation runtime adapts the cached client to `{ baseURL, testMode: client.testMode, send: client.send }` after private auth-origin validation. Preflight happens before account writes; persisted invitation claim/send/result state and explicit resend belong to [student intake](student-import.md), not a generic Gmail outbox.
- `Email` requires `to: string[]` and `subject: string`; `cc`, `bcc`, `body`, `htmlBody`, and `attachments` are optional. Supply each recipient as its own array element, not a comma-separated string. Text and HTML can be supplied together.
- `EmailAttachment` is `{ filename: string; bytes: Uint8Array; mimeType?: string }`. Attachment contents stay in memory: there are no filesystem path or remote-URL attachment inputs. `filename` must be a basename without paths or control characters; it is message metadata, not a path to read. `mimeType` accepts a `type/subtype` without parameters and defaults to `application/octet-stream`. Callers must obtain/authorize bytes themselves and enforce suitable size limits for their runtime and Google's sending limits.

### Mailbox subset and caller authorization

Sender and recipient parsing intentionally accepts a **subset** of email mailbox syntax: ASCII dot-atom addresses with DNS domains, optionally accompanied by Unicode display names, including quoted names such as `"Menéndez, María" <recipient@example.com>`. Lists inside a single string, groups, comments, quoted local parts, address literals, non-ASCII addr-specs, and controls are rejected. Some addresses valid under broader email standards are therefore unsupported; validation does not prove a mailbox exists or is deliverable.

**Being server-only is not authorization.** Intake already authenticates admins, authorizes reviewed new-student recipients, and bounds its workbook before calling Gmail. Any other action/endpoint/job must authorize caller, recipients, sender use, content, and attachments itself. Never forward arbitrary browser recipient lists. This primitive supplies no general consent/quota/abuse/UI policy; sender comes only from trusted configuration, not `Email`.

## Test mode is a real send

With `EMAIL_TEST_MODE` enabled, the client still refreshes OAuth credentials and calls Gmail. It rewrites the outgoing message so that:

- **Only the configured sender receives it.** Original To recipients are replaced and Cc/Bcc are cleared.
- The subject is prefixed with a test marker.
- A summary of the intended To/Cc/Bcc recipients is included in the body; values in the HTML summary are escaped instead of interpreted as markup.
- The original content and attachments are still sent. Intended Bcc addresses are visible to the sender in this summary.

This is not a dry run, mock transport, or privacy sandbox. Original recipient metadata still reaches Google in the summary, even though those recipients are not delivery targets. Use fictitious data for development. Test mode does not authorize a send, and a missing/blank flag defaults to **normal sending to the supplied recipients**.

## Privacy, errors, and retry limits

Sending transfers sender and recipient addresses/display names, subject, body, attachment filenames/types, and attachment bytes to Google and, during normal sending, to the recipients' mail systems. Gmail may retain Sent mail and associated metadata under the account's policies. Review the sender account's access, retention/deletion rules, organizational consent, API limits, and sending quotas before processing real student data. In-memory composition does not mean the sent message disappears after the request.

The backend does not log raw message content, attachments, recipient lists, credentials, or Google response bodies. `GmailError` extends the shared `GoogleApiError`, with safe generic messages, a `kind` of `configuration`, `auth`, `bad_input`, or `upstream`, and an optional numeric HTTP `status`. Configuration errors may name offending variables but do not echo their values; mailbox errors contain no input details. Callers should report only safe categories/statuses operationally, not log the `Email` object, private configuration, or raw provider responses.

OAuth/token lifetime, single-flight/cancellation, timeouts, redirects, no implicit replay, and safe transport classification are owned by `src/lib/server/google/client.ts` and documented once under [shared Google transport](google-drive.md#shared-google-transport). Gmail retains its MIME/test-mode/config/result boundaries; cancellation is not message recall.

Gmail has no generic durable outbox, idempotence, cross-request deduplication, automatic retry, or delivery guarantee. Google may accept a message before timeout/cancellation/response loss; replay can duplicate mail. A returned ID is API acknowledgment, not inbox placement/receipt. Intake separately persists claim/result states and offers **explicit token-rotating resend**, not automatic retry; it still cannot prove delivery or eliminate ambiguous acceptance. Reconcile uncertainty before resending.

## Validation

```sh
bun --no-env-file test tests/gmail-config.test.ts tests/gmail-message.test.ts tests/gmail-client.test.ts tests/google-client.test.ts
```

The config tests use explicit fictitious environment objects and pure validation: they do not read or mutate `process.env`, need live credentials, or send email. Client tests use injected fetch mocks; message tests compose MIME in memory. Neither performs network requests or live sends.

**No manual live send has been performed as part of this port.** Passing offline tests does not verify your token, Gmail API enablement, send-as permissions, delivery, or account quotas; perform the controlled check described above before relying on a live integration.
