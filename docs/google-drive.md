# Google Drive report archive

The server-side TypeScript integration ports the upload and folder-creation primitives from the legacy Go `masterminds/packages/drive-upload` package. The Go source is unchanged. There is no Go process, Google SDK dependency, Google sign-in button, or per-student Drive connection.

## What is saved

When configured, every successfully completed **IST assessment** and **attendance certificate** submission uploads **both English and Spanish PDFs** into one server-configured folder. These are the exact bytes returned for download, generated from the same validated snapshot. Changing the display language or downloading an existing result does not upload again. Validation errors and native IST exercise-choice updates do not upload.

Archive names add language suffixes and a shared random pair ID to the presentation-owned filename stem; browser download names stay unchanged. Each submission creates a new pair without overwriting files. There is no historical backfill or website recovery of earlier downloads. The root-admin grade-report CSV panel remains a local demo; real bootcamp CSV/document reporting is separate.

## Private configuration

`src/env.ts` declares all four variables as private runtime values. Set them through your server's secret configuration or an uncommitted local `.env`; never paste credentials into components, source control, logs, or chat.

| Variable | Purpose |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Existing Google OAuth client ID. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Secret for that same OAuth client. |
| `DRIVE_OAUTH_REFRESH_TOKEN` | Offline refresh token authorized by the archive owner's Google account for `https://www.googleapis.com/auth/drive.file`. |
| `DRIVE_REPORTS_FOLDER_ID` | ID of the destination folder that this OAuth app/account can access and write to. This is an ID, not a full URL. |

The three credential names match the Go package, so its valid Drive credentials can be reused with the same OAuth client. The target folder is new website configuration. Shared Google client credentials alone do not enable archiving. A nonblank Drive refresh token **or** folder ID enables it; partial configuration fails report generation instead of silently skipping the archive. Remove both Drive-specific variables to return to the original download-only behavior. Restart the application after changing configuration.

### Google prerequisites

1. Enable the Google Drive API in the OAuth client's Google Cloud project.
2. Use an existing valid Drive refresh token, or authorize the archive owner's account with the same OAuth client, offline access, and the `drive.file` scope. A Gmail-only refresh token is not sufficient. New consent may be necessary to obtain a refresh token. Check the OAuth app's publishing/Workspace status: external apps in Testing can have short-lived refresh tokens.
3. Choose a writable destination folder accessible to that app. **Knowing a folder ID or owning it in the Drive UI does not by itself grant `drive.file` access.** Reuse a folder already authorized for the existing Go integration, select it through an appropriate Google Picker authorization flow, or create an app-owned folder with the ported `createFolder` primitive under an accessible parent. This website does not add a Picker/setup UI or broaden access to all Drive files.
4. Set `DRIVE_REPORTS_FOLDER_ID` to that folder's ID and configure all three credentials privately.
5. Configure the existing [Better Auth integration](authentication.md), its database/migrations, and a provisioned account. Report generation requires a verified student or admin session whenever Drive archiving is enabled. Existing roster seeds do not provision sign-in accounts.
6. Sign in and generate a report using fictitious details. Verify that both language PDFs appear in the expected folder and match the downloaded versions. Test both `/ist` and `/attendance` before using real student data.

Shared-drive API support is enabled (`supportsAllDrives=true`), but the OAuth account must still have the necessary membership and permissions. The client does not alter file permissions, add public links, or expose Drive IDs to students. Files inherit applicable folder/shared-drive access, so **review the destination's sharing settings**, including inherited public or domain-wide access.

## Privacy and access

Enabling this feature changes storage behavior: student names, fitness measurements/results, and student/employer details in the PDFs are sent to Google and retained in the configured Drive folder. Both pages disclose this before submission in English and Spanish. No PDF is added to browser storage, cookies, or the application database; responses remain `Cache-Control: no-store`.

The archive is organization-owned, not the signed-in student's personal Drive. Only the server chooses the destination. Authentication prevents anonymous uploads; it does not verify manually entered names, enrollment, or authority to issue a certificate for another student. Report-specific quotas and roster authorization are not implemented. Google API limits and the owner's storage quota apply; each submission creates two files. Establish retention/deletion and least-privilege folder access policies before collecting real data.

## Failure and retry contract

- Ordering is archive/config acquisition → optional verified-session gate → PDF generation → both-language archive completion. Disabled Drive preserves public download-only success. Enabled anonymous submissions return `401` / `failure: 'signIn'` before generation; bad config/upload returns `503` / `'unavailable'`; PDF failure returns `503` / `'generation'`. Editable values remain, and reports are released only on success with `archived` and both language downloads.
- Safe logs name failed phase/category/status, never report contents, credentials, submitted details, or Google bodies. `ReportArchiveStatus` owns disclosure and saved/download-only/sign-in/unavailable messages. Download-only success explicitly says PDFs are ready but Drive archiving is not configured; it is not an archive failure. Generation uses its separate form alert, not independent padded error flags.
- **This is not a durable queue or an exactly-once archive.** There is no automatic retry, persistent upload-status table, or cross-request deduplication. Drive creates are non-idempotent: a timeout may occur after Google saves a file, and one language may succeed while the other fails. Both requests are settled before returning, but successful partial uploads are not deleted. A resubmission creates a new pair and may leave duplicates; an administrator must reconcile partial/ambiguous uploads in Drive. For unattended retries and delivery through outages, add a durable report/outbox workflow rather than fire-and-forget requests.

## Shared Google transport

`src/lib/server/google/client.ts` is the policy owner for Drive and Gmail OAuth/API requests. `GoogleClientOptions` supplies optional fetch/timeout; `GoogleErrorKind` and sanitized `GoogleApiError` are shared, with provider-specific subclasses. Constructors validate credentials/timeout and snapshot configuration; provider modules retain their own payload, MIME, file-ID, and result checks.

- Access tokens are private per client, reused before buffered expiry, with one coalesced refresh. Failed refresh is not cached; independent clients do not share tokens. One cancelled refresh waiter cannot abort a survivor; when every waiter cancels the refresh is aborted, and stale work cannot overwrite a replacement token.
- Default timeout is **30 seconds per HTTP request**, including body reads, even for injected work ignoring signals. Token refresh followed by an API request may take roughly 60 seconds; this is a configured bound, not a measured production latency. Pre-aborted requests make no network call. Cancellation cannot recall a provider-side mutation.
- Redirects are rejected; bearer/credential-bearing requests are never implicitly replayed. API 401/403 invalidates only the token used by that request for the next explicit call. OAuth `invalid_grant`/`invalid_client` is auth failure; other errors are sanitized into configuration/auth/bad-input/upstream categories, with bounded OAuth error-body reads.
- Unknown service labels are redacted to the fixed Google fallback. Logs/errors retain no provider response/body/raw cause/secrets. Drive/Gmail tests own provider contracts; `tests/google-client.test.ts` owns transport status, token, timeout, and cancellation matrices once.

## Code and tests

- `src/lib/server/drive/config.ts`: optional configuration and enablement rules.
- `src/lib/server/google/client.ts`: shared OAuth refresh, token lifetime, bounded requests, and sanitized errors.
- `src/lib/server/drive/client.ts`: credentials-only construction; required binary upload, folder creation, reserved file-ID generation, and metadata lookup capabilities.
- `src/lib/server/drive/archive.ts`: paired PDF naming and upload completion, requiring only the client's upload capability.
- `src/lib/server/drive/index.ts`: private SvelteKit configuration and one cached `{ client, folderId, archive }` binding shared by report archiving and bootcamp backup.
- `src/lib/server/report-downloads.ts`: shared authentication, generation, and archive-before-success boundary.
- `src/lib/server/ist-action.ts` and `attendance-action.ts`: validated report actions; route files supply the real archive dependency.
- `src/lib/components/ReportArchiveStatus.svelte`: shared bilingual disclosure and status messages.

`getDrive()` caches exactly one `{ client, folderId, archive }` binding; disabled configuration caches `null`, while a thrown configuration error leaves initialization retryable. `getReportArchive()` returns that same binding's archive. `getReportArchivePageState()` checks enablement intent without loading config, so partial configuration still shows archive intent/unavailability rather than silently disabling reports. Bootcamp runtime catches only Drive assembly failure and disables backup without swallowing database/payment/operation failures; its memoized services reuse this binding.

Direct server code/tests import `createDriveClient`/`DriveClient`/`DriveError` from `drive/client.ts`, config readers/types from `drive/config.ts`, archive types from `drive/archive.ts`, and transport types from `google/client.ts`. `createDriveClient(credentials: GoogleCredentials, options?: GoogleClientOptions): DriveClient` takes **no folder setting**; each upload/folder operation supplies its parent ID. `DriveClient` requires `upload`, `createFolder`, `generateFileId`, and `getFile`; report archive needs only `Pick<DriveClient, 'upload'>`, while durable bootcamp backup requires its upload/ID/metadata capabilities and validated destination.

The primitives return Drive file/folder IDs for server callers. `createFolder` always creates a new folder; callers that use it must persist/reuse IDs themselves. The website archive intentionally uses an already configured folder instead of creating folders on each submission. Report archive and durable bootcamp backup remain separate workflows; they share a client and token cache, not retry or completion policy.

```sh
bun --no-env-file test tests/google-client.test.ts tests/drive.test.ts tests/report-archive.test.ts tests/ist-action.test.ts tests/attendance-action.test.ts tests/i18n.test.ts
bun --no-env-file run check
bun --no-env-file run build
```

Unit tests inject network/upload implementations and require no Google credentials or external requests. A successful test run is not verification that your live token or folder permissions are valid; perform the fictitious-data smoke test after private configuration.
