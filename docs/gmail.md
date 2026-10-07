# Gmail backend

The server-only TypeScript Gmail port sends messages through the Gmail API using the shared Google OAuth transport. It supports plain text, HTML, and in-memory attachments. It is a backend primitive only: **there is no new endpoint, UI, queue, or integration with IST reports, attendance certificates, bootcamps, or other workflows.** Configuring Gmail does not send anything by itself or change the existing Drive archive.

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

Credential values are trimmed. Sender control characters are rejected before trimming surrounding whitespace. Missing/blank required values are reported together by variable name, never by value. Imports and ordinary development/builds do not require Gmail credentials: the application client is initialized and cached only on the first `getGmailClient()` or `sendEmail()` call. Missing configuration throws `GmailError`; there is no disabled/null client or silent no-op. Restart the application after changing configuration so the cached client is replaced.

### Google prerequisites and refresh token provision

1. Enable the **Gmail API** in the Google Cloud project that owns the OAuth client, and configure its consent screen and allowed users according to your organization's policy.
2. Use an existing valid Gmail refresh token tied to that client and sender account, or run an authorized OAuth consent flow outside this website. Request `https://www.googleapis.com/auth/gmail.send` with `access_type=offline`; use `prompt=consent` when new consent is needed to obtain a refresh token. Exchange the resulting authorization code using the same OAuth client and redirect URI, then store the returned refresh token privately as `GOOGLE_OAUTH_REFRESH_TOKEN`. The backend exchanges that refresh token for short-lived access tokens; it does not provide a setup/consent endpoint or obtain consent itself.
3. Do not substitute the Drive-only refresh token. Shared client ID/secret values do not grant Gmail scopes. Review OAuth app publishing and Workspace policy: external apps in Testing can have short-lived refresh tokens, and consent or administrator approval may be required.
4. Set `GMAIL_SENDER_ADDRESS` to that account's own mailbox or an address already configured and verified in Gmail's **Send mail as** settings. Merely putting an arbitrary address in this variable does not authorize it. This module does not create or verify aliases.
5. Before enabling any future workflow, perform a controlled send using fictitious content and an account you control. Test mode is suitable for this check, but it still contacts Google and delivers a real message. Check the configured sender's mailbox and Sent mail, and verify permissions and expected attachment contents.

## Server API

Import the application wrapper only from server-side code:

```ts
import { sendEmail, type Email } from '$lib/server/gmail';

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

const gmailId: string = await sendEmail(email);
```

`sendEmail(email, signal?)` returns the Gmail message ID, not a MIME `Message-ID` header or proof of delivery. `getGmailClient()` returns the same lazily cached client. Both use the private environment above.

The entry point also exports `createGmailClient`, `readGmailConfig`, `GmailError`, and the `GmailClient`, `GmailConfig`, `GmailEnvironment`, `Email`, `EmailAttachment`, `GoogleClientOptions`, and `GoogleErrorKind` types. For explicit server configuration or isolated tests, use `readGmailConfig(env)` and `createGmailClient(config, { fetch, timeoutMs })`; the pure modules can be imported directly from `config.ts` and `client.ts` without SvelteKit's private-env entry point.

- `GmailConfig` contains `clientId`, `clientSecret`, `refreshToken`, `senderAddress`, and `testMode`.
- `GmailClient.send(email, signal?)` has the same `Promise<string>` result as the wrapper. An optional `AbortSignal` bounds a caller's wait; cancellation is not a recall operation.
- `Email` requires `to: string[]` and `subject: string`; `cc`, `bcc`, `body`, `htmlBody`, and `attachments` are optional. Supply each recipient as its own array element, not a comma-separated string. Text and HTML can be supplied together.
- `EmailAttachment` is `{ filename: string; bytes: Uint8Array; mimeType?: string }`. Attachment contents stay in memory: there are no filesystem path or remote-URL attachment inputs. `filename` must be a basename without paths or control characters; it is message metadata, not a path to read. `mimeType` accepts a `type/subtype` without parameters and defaults to `application/octet-stream`. Callers must obtain/authorize bytes themselves and enforce suitable size limits for their runtime and Google's sending limits.

### Mailbox subset and caller authorization

Sender and recipient parsing intentionally accepts a **subset** of email mailbox syntax: ASCII dot-atom addresses with DNS domains, optionally accompanied by Unicode display names, including quoted names such as `"Menéndez, María" <recipient@example.com>`. Lists inside a single string, groups, comments, quoted local parts, address literals, non-ASCII addr-specs, and controls are rejected. Some addresses valid under broader email standards are therefore unsupported; validation does not prove a mailbox exists or is deliverable.

**Being server-only is not authorization.** Any caller that exposes sending through a future action, endpoint, or job must authenticate and authorize the operation, recipients, sender use, content, and attachments. Never forward arbitrary browser-supplied recipient lists directly to this primitive. Add workflow-specific consent, quotas, abuse protection, and safe localized UI errors at that boundary; none are provided by this port. The sender is chosen from trusted server configuration, not from `Email`.

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

The shared transport caches access tokens in memory, coalesces concurrent refreshes, and supports bounded requests and cancellation. The default timeout is 30 seconds **per HTTP request**; refreshing a token and sending are separate requests, not one 30-second overall transaction.

**There are no automatic retries, idempotence guarantees, durable outbox, cross-request deduplication, or delivery guarantees.** A timeout, cancellation, or lost response can occur after Google has accepted the message. Retrying may send duplicates. A returned Gmail ID confirms an API result, not inbox placement, successful downstream delivery, or recipient receipt; Gmail/recipient policy can still reject, filter, or bounce mail. Reconcile ambiguous outcomes before manually resending, and design a separate authorized workflow if durable sending or status tracking is needed.

## Validation

```sh
bun test tests/gmail-config.test.ts tests/gmail-message.test.ts tests/gmail-client.test.ts tests/google-client.test.ts
```

The config tests use explicit fictitious environment objects and pure validation: they do not read or mutate `process.env`, need live credentials, or send email. Client tests use injected fetch mocks; message tests compose MIME in memory. Neither performs network requests or live sends.

**No manual live send has been performed as part of this port.** Passing offline tests does not verify your token, Gmail API enablement, send-as permissions, delivery, or account quotas; perform the controlled check described above before relying on a live integration.
