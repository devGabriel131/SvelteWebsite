# ATH Móvil bootcamp server adapter

## Scope and readiness

`src/lib/server/bootcamp/ath.ts` implements dependency-injected REST primitives for one-time **$15 / 1,500 cents** or **$30 / 3,000 cents** payments. The full application wiring, migration, authenticated routes, webhook listener, and worker endpoint are described in [bootcamp setup](bootcamps.md). `src/lib/server/bootcamp/payments.ts` adds durable attempts, encrypted capabilities, leased reconciliation and enqueue-only notifications using the existing bootcamp schema. Its unit tests use mocked HTTP/database boundaries; separate application integration tests use isolated PostgreSQL with fake providers. No browser SDK or recurring payment is used, and live checkout is disabled by default.

**This is not a live-certified or enabled checkout.** No live payment, authorization, merchant search, refund, or webhook subscription was performed. Evertec says there is **no testing environment**; real verification requires an active ATH Business account/card and a different active ATH Móvil payer/card, and may move real money. Resolve the documentation gaps below with Evertec and separately approve an operational smoke test before enabling checkout. Do not infer readiness merely from passing mock tests or the presence of credentials.

## Official sources reviewed

Reviewed on 2026-10-06, using the official Evertec repositories. Pinned HEADs at research time:

1. [ATHM-Payment-Button-API](https://github.com/evertec/ATHM-Payment-Button-API/blob/6f0f229c47e37fdc2dd58888450841be264dd42b/README.md) — Payment, Find Payment, Authorization, cancellation, refund, status examples and errors. README changelog version 1.2.2, 2025-01-16.
2. [athmovil-javascript-api](https://github.com/evertec/athmovil-javascript-api/blob/45b849c8971aa6d04248e2789c3f7b5a23095c4b/README.md) — current button flow plus **Services → Search**, the private-token-authenticated merchant transaction query. README changelog version 1.2.3, 2025-02-27. Only its documented server services are used; no browser script is loaded.
3. [athmovil-webhooks](https://github.com/evertec/athmovil-webhooks/blob/e01a6c58b0660665abde12a0bba2ebfdc0f94a2a/README.md) — subscription, event bodies, listener requirements and web/mobile delivery limitations.

These sources distinguish customer **confirmation** from the merchant's subsequent **authorization**, which debits the payer. `CONFIRM` is not a paid transaction. The current REST documentation specifies `/authorization`, **not a guessed `/completePayment` endpoint**.

### Documentation gaps and conservative behavior

- Find Payment's examples require `Authorization: Bearer ...`, but do not explicitly identify that bearer beyond the per-payment `auth_token` issued in the documented flow. The adapter supplies the persisted `auth_token`; **Evertec must confirm its validity/scope for Find Payment and its lifetime**. It never substitutes the merchant private token as a bearer, requests an invented token endpoint, or falls back to unauthenticated confirmation.
- Search documents a bare transaction object, or a list for multiple matches. It does **not show a zero-match response**. The adapter recognizes only an empty list as no match. An error envelope, null, missing fields, or undocumented wrapper throws; it is not silently treated as no payment. Confirm the actual zero-match shape with Evertec. In particular, the first merchant search failing stops the flow before any authorization.
- Search's response example has no `ecommerceId`. A receipt is bound through exact, immutable `metadata1` / `metadata2`, expected cents and the merchant credential pair. If `ecommerceId` is present it must also match. The caller's durable attempt/reference association is essential; metadata is not provider idempotency.
- The creation example has conflicting timeout values/types (`"5000"` in an example versus **120–600 seconds** in the field table). The adapter follows the field table: numeric `600`. It uses the documented JSON string phone representation, normalized to ten digits, and `items: []` because line-item display is optional. Confirm these payload choices with Evertec; no undocumented fallback is attempted.
- REST combines expired and cancelled payments into `ecommerceStatus: "CANCEL"`. This adapter returns `cancelled` for both, never an inferred `expired`. No authoritative expiry timestamp is documented, so `expiresAt` is omitted. A local countdown cannot establish settlement or safely permit a replacement charge.
- No webhook signature/header, verification key, replay defense, delivery ordering, retry schedule, query consistency guarantee, rate limit, creation idempotency key, or authorization idempotency guarantee is documented in these sources. Do not invent them. Ask Evertec about production limits and retry/reconciliation procedures.

## Exact parent-facing interface

```ts
createAthClient(
  { publicToken, privateToken }: AthConfig,
  fetch?: typeof globalThis.fetch
): AthClient

client.create({
  attemptId,       // stable paymentAttempt UUID generated and committed by the server
  registrationId, // immutable registration association, at most 40 characters
  amountCents,    // exactly 1500 or 3000, derived from server-side business rules
  phone          // ATH payer phone, not an identity check
}): Promise<{
  reference: string;          // provider ecommerceId (ticket UUID), NOT referenceNumber
  authorizationToken: string; // secret auth_token returned by /payment
  expiresAt?: Date;          // currently omitted: not documented in the response
}>

client.verify({
  reference,
  authorizationToken,
  attemptId,
  registrationId,
  amountCents,
  authorize?: boolean, // default true; false disables the debit POST for reconciliation
  beforeAuthorize?: () => Promise<void> // awaited immediately before an actual debit POST
}): Promise<{
  status: 'pending' | 'completed' | 'cancelled' | 'expired' | 'refunded';
  transactionId?: string; // provider referenceNumber; always present for completed/refunded
}>
```

**Required change from the proposed interface:** persist the returned `authorizationToken` alongside `reference`, and pass it to `verify`. Current REST requires this transaction capability to authorize the ticket. Hiding it in a process-local map would break across restarts/workers; packing it into a public reference would leak a debit capability. Store it as a protected/encrypted server secret, never in page data, logs, analytics, URLs, browser storage or webhook replies. The token is opaque; the adapter does not decode an unverified JWT or derive expiry from it.

`authorize: false` is an optional extension for read-only reconciliation. `beforeAuthorize` is invoked only after a matching `CONFIRM` and immediately before `/authorization`; its rejection prevents the debit POST. It is not invoked for `OPEN`, a receipt recovered by Search, or read-only reconciliation. The durable service supplies it to commit authorization intent exactly once. `verify` is otherwise **not read-only**: it may debit a confirmed payment. All inputs to `verify` must be loaded from the durable server attempt, not copied from a browser or webhook. Callers may construct a new client on every request; there is no required in-memory state. Do not pass an injected fetch implementation that automatically retries POSTs.

### Metadata and payer identity

- `metadata1 = attemptId`, an immutable UUID, fits ATH's 40-character limit.
- `metadata2 = registrationId`, an immutable association of at most 40 characters. The registration must have an immutable foreign key to the bootcamp event; thus this value binds both registration and event without concatenating two 36-character UUIDs beyond the limit. The adapter cannot inspect that database relation. Do not truncate IDs or substitute mutable student names/event titles.
- Keep each attempted charge's expected amount immutable. A $15 attempt cannot later be interpreted as a $30 attempt, or vice versa. The database/application decides deposit versus balance/full payment and prevents overpayment; the adapter enforces only the two permitted amounts.
- The ATH payer may be a parent, friend or another person. No name/email/phone matching is performed during verification. The supplied phone routes the request to the ATH account; it is not the student's identity or proof of payment.
- Refund and amount checks use exact cents, never rounded floating-point comparisons. Malformed, missing, fractional-cent or unexpected amounts fail closed. Any positive verified refund, even partial, returns `refunded`, not paid; its financial accounting needs a separate reconciliation process because this interface does not return the refunded amount.

## Wire protocol

All requests use HTTPS, POST, `Accept: application/json`, `Content-Type: application/json`, disabled redirects and no caching. Endpoints are fixed in the adapter; no request or webhook controls a URL. The merchant private token is sent only in Search's JSON body. Each HTTP request, including its body read, has a 15-second timeout and no automatic retries.

| Step | Endpoint | Authentication and body | Accepted evidence |
| --- | --- | --- | --- |
| Create | `https://payments.athmovil.com/api/business-transaction/ecommerce/payment` | `{ env: 'production', publicToken, timeout: 600, total: amountCents / 100, subtotal: amountCents / 100, tax: 0, metadata1: attemptId, metadata2: registrationId, items: [], phoneNumber }` | `status: 'success'`, `data.ecommerceId`, `data.auth_token`. This creates a ticket, not paid fulfillment. |
| Merchant search | `https://www.athmovil.com/api/v4/searchTransaction` | `{ publicToken, privateToken, metadata1: attemptId, metadata2: registrationId }`; after settlement also `referenceNumber` | A bare object or exactly one list element. Must be `transactionType: 'ECOMMERCE'`, `status: 'COMPLETED'`, exact metadata/amount, a nonblank `referenceNumber`, and valid `totalRefundedAmount`. Multiple matches throw, including duplicates of the same ID. |
| Find ticket | `https://payments.athmovil.com/api/business-transaction/ecommerce/business/findPayment` | `Authorization: Bearer <saved auth_token>`; `{ ecommerceId: reference, publicToken }` | Success envelope; exact `ecommerceId`, metadata, amount and refunded amount. `OPEN` is pending; `CANCEL` is cancelled; `CONFIRM` allows authorization only; `COMPLETED` allows merchant search. Unknown statuses throw. |
| Authorize | `https://payments.athmovil.com/api/business-transaction/ecommerce/authorization` | `Authorization: Bearer <saved auth_token>`; **empty body**, as documented. The token carries the ticket capability; do not send a transaction reference in place of it. | Success envelope with matching ticket/metadata/amount, `ecommerceStatus: 'COMPLETED'` and nonblank `referenceNumber`, followed by a separate merchant search of that exact reference. |

Each `verify` first searches the merchant's transactions by metadata. This permits settlement/refund reconciliation even after the saved ticket JWT expires, without attempting another debit. If no receipt exists, it finds the ticket and only authorizes `CONFIRM` (unless `authorize: false`). After a successful authorization or a completed ticket response it performs a fresh merchant search using the **provider `referenceNumber`**, in addition to metadata. If the search is an empty list it returns `pending` to allow for visibility delay, not completed on the strength of the authorization response alone.

The authenticated search scopes the receipt to the configured merchant. An HTTP success, webhook, browser callback, payer identity, public token, `businessName`, `dailyTransactionId`, ticket UUID, `CONFIRM`, or `COMPLETED` ticket response **alone** is not sufficient to credit the registration. The adapter checks the complete expected tuple and returns the provider transaction ID for durable uniqueness enforcement. If the private-token search rejects credentials or returns an unexpected response, verification throws rather than falling back to weaker evidence.

## Durable payment service

```ts
const service = createPaymentService(db, athClient, encryptionKey);
// encryptionKey is the server-only BOOTCAMP_PAYMENT_KEY: exactly 64 hexadecimal characters.

service.start(registrationId, amountCents, phone): Promise<PaymentState>
service.reconcile(attemptId): Promise<PaymentState | null>
service.drain(eventId?, limit?): Promise<PaymentState[]>
service.notify({ attemptId?, reference? }): Promise<void>

// No token, provider reference, raw error, transaction ID or payer phone is returned.
type PaymentState = {
  attemptId: string;
  amountCents: number;
  status: 'creating' | 'pending' | 'uncertain' | 'completed' | 'cancelled' | 'refunded';
  uncertain: boolean;
};
```

### Checkout and authorization guarantees

- `start` validates the amount, UUID and normalized ATH phone **before any database work**. It looks up the association, then locks **event → student → registration**, revalidating the association, active state, 21+ eligibility, approved/open registration, and deadlines using the database clock after locking. The saved waiver must identify the event, but may retain an older immutable revision; `letterChoice` must be a boolean (declining a letter is valid). The parent owns validated document creation and authenticated, active-student/registration ownership checks; the service does not accept a student identity or authenticate callers.
- Pass the root `Database` connection, not an enclosing transaction: the attempt and authorization-intent commits must be durable before network side effects. Other registration/event writers should use the same lock order. Event edits close registration until reopened; they do not invalidate or overwrite previously submitted waivers. Once an attempt exists, its amount and association are immutable; later event closure does not stop settlement reconciliation.
- An existing non-cancelled attempt is returned unchanged; a $15 deposit never permits a $15 balance or $30 replacement checkout. The balance is collected outside this website checkout. The schema's partial unique index is the cross-worker backstop. A genuinely verified cancellation before any authorization can free the slot; an ambiguous/paid/refunded attempt cannot.
- The `creating` attempt and creation lease are committed **before** the remote request. A failed request/token save becomes `uncertain`; a process crash leaves a durable `creating` attempt which reconciliation marks uncertain after its lease expires. No code path retries creation. Losing both the provider response and token requires manual provider reconciliation, not another ticket. If the database is unavailable, the service throws a sanitized storage error and the existing durable attempt still blocks a replacement.
- Reconciliation claims a two-minute lease using one conditional UPDATE. Lease timestamps use database-generated millisecond precision, so the returned timestamp is an exact CAS fence. Every result/intent write requires that same lease and an unexpired database-clock deadline. A stale worker cannot overwrite a newer worker's result; no extra lease-token schema column is needed.
- The async `beforeAuthorize` hook commits `authorizationStarted = true` and `status = 'uncertain'` before the debit request. A losing CAS or failed persistence rejects the hook. An `OPEN` poll never marks this flag. Future workers always use `authorize: false` once marked, including crashes between the commit and the provider call. **This is deliberately at-most-once authorization intent, not exactly-once payment:** a crash before the request may leave an unpaid confirmed ticket requiring operator intervention. Do not clear the marker or automatically retry authorization.
- Validated `completed`/`refunded` receipts set the provider `transactionId` on that same ledger row. Its global unique constraint prevents crediting the receipt twice; unique conflicts leave the uncredited attempt uncertain. No mutable paid total is incremented. The parent derives credit using `SUM(amount_cents) WHERE status = 'completed'`. Any verified positive refund removes that entire attempt from credit, including partial refunds; reconcile the exact financial amounts separately.
- Lookup outages or stale pending/cancellation responses **preserve** existing completed/refunded status and set a safe error code. `PaymentState.uncertain` reports either uncertain status or a retained error flag. A refunded row never becomes completed again. After authorization intent, pending/cancel/expiry is uncertain rather than permission to start over. The service treats already-cancelled attempts as terminal and does not reopen them from unsigned notifications; exceptional late settlement of such a ticket requires manual review.

### Notification and worker contract

- `notify` never calls ATH, creates an attempt, changes credentials, or credits payment. Valid hints only set `reconcileRequested = true` on an existing non-cancelled row. If both hints are supplied, **both must match the same row**. Empty/malformed/unknown hints are no-ops. `reference` here means the checkout `ecommerceId`, not a refund or settled transaction ID. The response does not disclose whether an attempt exists.
- Notification writes coalesce and never move `nextCheckAt` forward or steal a lease. A request arriving during verification survives its result write. The application listener bounds actual request bytes, applies a database-backed ingress rate limit, and awaits durable enqueue before acknowledgement.
- `reconcile(id)` attempts a due claim, otherwise returns safe current state (or null for a missing attempt). It cannot bypass a cooldown. Paid/refunded rows use read-only verification. Invalid IDs throw `PaymentError('invalid_input')`.
- `drain()` processes due creating/pending attempts, recoverable uncertain attempts with saved credentials, and explicitly requested completed/refunded attempts. A lost-creation attempt without credentials is not repeatedly polled after its one failed reconciliation unless explicitly requested again.
- **`drain(eventId, limit)` is an authenticated-admin refund sweep:** it queues completed/refunded rows for that event as well as ordinary unfinished work, without bypassing due dates or active leases. Do not expose this to unsigned webhooks or invoke it as the normal background polling path.
- Checks have a 30-second cooldown following an ordinary result; uncertainty/errors use five minutes. These are application limits, **not provider-published allowances**. Each call acquires a durable lease, so browser polling and webhook jobs cannot each start another verification inside the interval. In-progress provider work is not assumed cancelled merely because a lease expires; stale results are fenced and durable intent prevents a second debit.
- `drain` defaults to 10 attempts and accepts integer limits from 1 through 50, processing sequentially. Run it in a durable scheduled worker, **not inside the webhook request**. A verification can use about 60 seconds plus database time, so a batch may exceed a web-request budget; choose a smaller limit appropriate to the worker. Configure database statement/lock timeouts and monitor queue age, unresolved attempts, duplicate-transaction conflicts and capability errors. No timer, scheduler, route or retry daemon is installed by this module.
- `PaymentError` has fixed, non-sensitive messages and a `code` (`configuration`, `invalid_input`, `not_found`, `unavailable`, `prerequisites`, `ineligible`, `storage`, `token`, `lease_lost`). Provider failures normally return an uncertain state after recording a whitelisted error code. Neither raw SQL/provider errors nor their causes are logged, returned or stored.

### Encryption and launch constraints

`createPaymentTokenVault(key)` exposes `seal(token, context)` and `open(ciphertext, context)`; `context` is `{ id, registrationId, amountCents, reference }`. The service uses AES-256-GCM, a fresh 12-byte nonce, a 16-byte authentication tag and versioned base64url encoding in the existing `authorizationToken` text column. Authenticated additional data binds every ciphertext to that exact attempt, amount, registration and ticket. Swapped/tampered tokens or wrong keys fail closed before contacting ATH. The phone is never stored by this service.

Set **`BOOTCAMP_PAYMENT_KEY`** to a securely generated, private 32-byte key encoded as 64 hex characters; keep it separate from the database and ATH credentials and identical across workers. Back it up securely. Losing/replacing it makes existing capabilities unreadable. There is no automatic key rotation or plaintext-token fallback: an intentional rotation needs a controlled old-key/new-key re-encryption migration while workers are stopped. Keep schema constraints/migrations in place before enabling the service; no schema changes were needed or made here.

**Launch gates remain:** resolve the official API documentation gaps above; apply the migration to the intended application database; configure the private environment and schedule the authenticated worker endpoint described in `bootcamps.md`. The application now includes those routes and guards, and `tests/database-bootcamp.test.ts` also validates real isolated PostgreSQL concurrency/rollback behavior. Adapter/service unit tests continue to use mocked providers. No live ATH request was made. Separately approved real-money provider certification is still required.

## Durable attempts and duplicate-charge safety (integration responsibilities)

The service implements the persistence/lease/credit rules below. Parent routes, workers, schema migrations, operational reconciliation and authentication remain responsible for using it consistently rather than calling the raw adapter for checkout.

1. Authorize the signed-in user for the registration/event, compute the payable amount server-side, acquire a durable lock, and commit one attempt UUID plus expected amount/registration **before** calling `create`. Serialize creation across browser retries, tabs, workers and webhook jobs. Enforce one unresolved attempt per payable obligation.
2. Call `create` once and durably store both returned values with the attempt. Do not let response loss or a database write failure create a fresh attempt automatically. ATH documents **no creation idempotency key**; `metadata1` is correlation only. The adapter makes exactly one creation request per invocation, **not one per UUID globally**. Calling `create` again can create a second ticket.
3. If creation has an ambiguous outcome (timeout, connection loss, malformed response, provider error, or persistence failure), mark it for reconciliation and block new checkout for that obligation. If the reference/token was lost there is no documented ticket-recovery API in these sources. Escalate to an operator/Evertec; do not guess that a timeout means no charge or no ticket. Merchant search by metadata can help an operator locate an eventual settled payment, but cannot prove a pending ticket never existed.
4. Serialize `verify` per attempt; do not overlap polling and webhook authorization. A verification may make four requests (up to roughly 60 seconds total). Keep polling bounded, rate-limited and durable rather than tying fulfillment to an open browser. No provider polling interval is documented. Do not automatically restart `verify` as a debit-capable operation after an uncertain authorization; use `authorize: false` for reconciliation. Escalate a persistently confirmed/ambiguous ticket rather than assuming the authorization POST is idempotent.
5. Credit only `completed` with its `transactionId`. In one database transaction, enforce **UNIQUE(provider, transactionId)** across all registrations/attempts, bind it to the matching attempt/event/registration/expected amount, and apply the credit once. Repeated `completed` results/webhook replays are normal and must be no-ops, not repeat credits. `dailyTransactionId` resets and is not a uniqueness key; `ecommerceId` identifies a ticket, not the settled transaction. The stateless adapter rejects multiple search matches but cannot enforce global database uniqueness.
6. `pending`, all exceptions, `cancelled`, `expired`, and `refunded` do not fulfill a registration. Once credited, a stale pending/cancellation event must not overwrite a settled ledger entry. Reconcile refunds and late settlement under the same lock with a separately defined accounting policy. Never reinterpret a network error as cancelled or automatically offer another charge.

`AthError` exposes sanitized `kind`, `operation`, optional numeric HTTP `status`, and `outcomeUnknown`. Categories are `configuration`, `bad_input`, `transport`, `provider`, `protocol`, `mismatch`, and `ambiguous`. Errors from creation/authorization, and search errors after an authorization in the same call, are conservatively marked `outcomeUnknown: true`. **False is not a global guarantee that no previous debit occurred**: an earlier verification call may already have authorized the ticket. Never log the original fetch error, provider body, token or payer phone. Upstream errors have no attached raw `cause`. No retry policy is hidden in this adapter.

## Private operational configuration

The parent integration must declare/read these as private server runtime variables and pass them explicitly:

| Variable | Purpose |
| --- | --- |
| `ATH_PUBLIC_TOKEN` | Public identifier of the receiving ATH Business merchant. |
| `ATH_PRIVATE_TOKEN` | Private API credential for that same merchant, used by transaction Search and operational webhook subscription. |
| `BOOTCAMP_PAYMENT_KEY` | Private 32-byte AES key encoded as 64 hex characters, supplied as the third `createPaymentService` argument. |

Both must belong to the intended active merchant. Partial/blank configuration must disable checkout or fail configuration, never enable a simulated success. Keep credentials in private runtime secret configuration, not committed files or `PUBLIC_` variables. This change deliberately does not modify environment declarations or routes. Sending a payment request shares the payer phone, amount and opaque registration/attempt IDs with ATH Móvil; no student name/email is sent by this adapter.

## Webhooks: untrusted asynchronous wakeups only

The official documentation specifies a listener accepting JSON HTTP POST with a valid, non-self-signed HTTPS certificate. It **does not document a cryptographic signature or shared-secret authentication scheme**. HTTPS authenticates the listener to the sender, not the sender to the listener. Do not add a fictional `ATH_WEBHOOK_SECRET`, trust a `status` field, or treat an obscure URL as signed payment proof.

### Setup (not performed by this change)

Use ATH Móvil Business → Settings → Development → Webhooks, authenticate in the app, enter the listener's HTTPS URL, select events and save. Alternatively the official subscription service is:

- POST `https://www.athmovil.com/transactions/webhook/post`
- Header `Content-Type: application/json`
- JSON fields: `publicToken`, `privateToken`, `listenerURL`, plus boolean `paymentReceivedEvent`, `refundSentEvent`, `donationReceivedEvent`, `ecommercePaymentReceivedEvent`, `ecommercePaymentCancelledEvent`, `ecommercePaymentExpiredEvent`.

For this integration subscribe to the three e-commerce events and `refundSentEvent`; ordinary payment/donation events are not bootcamp checkout receipts. Supply credentials privately and do not log the subscription body. This adapter neither registers a listener nor validates subscription delivery.

### Listener/worker contract

- Bound JSON body size, validate shape, rate-limit, and durably enqueue/coalesce reconciliation for an **existing server attempt** before acknowledging receipt. Unknown/malformed notifications must never create attempts, change expected prices, replace saved references/tokens or cause fulfillment.
- Treat metadata/ecommerce IDs only as lookup hints. Load the trusted reference, authorization token, immutable amount, event/registration and attempt ID from storage, then run `verify`. Do not pass webhook-reported totals, status or reference numbers through as verified state. A webhook claiming `COMPLETED`, `expired`, `REFUND` or `simulated` proves nothing.
- Replayed/out-of-order notifications must converge on the same locked, idempotent ledger operation. The adapter has no webhook parser or payload-to-paid path.
- Completed/cancelled examples include `ecommerceId`; the older expired example does not. Cancellation and expiry events are documented for **web** payments, not iOS/Android integration flows. Do not rely on notifications alone: retain bounded server-side polling and an operational reconciliation process.
- The documented refund event identifies a **refund's** reference and may have empty metadata; it does not guarantee the original payment's ID. Never credit that reference or blindly map it to an original attempt. Recheck known original payments or use manual reconciliation when no safe association is available.
- No signature, retry schedule, replay ID or ordering guarantee is documented. Confirm delivery/retention/rate limits with Evertec. Client/browser redirects and callbacks have the same lack of settlement authority.

## Validation

```sh
bun test tests/bootcamp-ath.test.ts tests/bootcamp-payments.test.ts
```

The suite injects every HTTP implementation and covers exact request/authentication shapes, amount/metadata/ID binding, resumable authorization, private-token verification, third-party payers, refunds, unsupported responses, duplicate matches, cancellation/expiry ambiguity, secret-safe errors, timeouts and lack of automatic retries. Tests do not access credentials or payment endpoints. Mock conformance is not evidence that a live merchant account accepts the protocol assumptions identified above.
