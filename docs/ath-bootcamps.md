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

## Raw adapter API

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
}>

client.verify({
  reference,
  authorizationToken,
  attemptId,
  registrationId,
  amountCents,
  authorize?: boolean, // default true; false disables the debit POST for reconciliation
  beforeAuthorize?: () => Promise<void> // awaited immediately before an actual debit POST
}): Promise<
  | { status: 'completed' | 'refunded'; transactionId: string }
  | { status: 'pending' | 'cancelled' }
>
```

Persist `authorizationToken` alongside `reference` and supply it to `verify`. The REST transaction capability must survive restarts/workers; a process-local map loses it and a public reference leaks it. Store it encrypted server-side, never in page data, logs, analytics, URLs, browser storage, or webhook replies. The token is opaque; do not decode an unverified JWT or infer expiry. `AthPayment` has no expiry field; only completed/refunded verification outputs carry the required nonblank, control-free provider transaction ID. Pending/cancelled outputs carry none; unknown statuses are rejected.

Raw `verify` defaults `authorize` to **true** and can debit a confirmed ticket. `authorize: false` disables that POST for read-only reconciliation. `beforeAuthorize` runs only after matching `CONFIRM`, immediately before `/authorization`; rejection prevents debit. It does not run for `OPEN`, recovered Search receipts, or read-only verification. The durable service commits its authorization intent there. Load every input from the stored server attempt, never browser/webhook data. The adapter is stateless; an injected fetch must not retry POSTs. One create invocation makes one request, not one request per UUID globally—calling it again can create another ticket.

`AthError` exposes sanitized `kind`, optional `operation`, optional numeric HTTP `status`, and `outcomeUnknown`. Kinds are `configuration`, `bad_input`, `transport`, `provider`, `protocol`, `mismatch`, and `ambiguous`. Creation/authorization failures, and search failure after debit in that call, conservatively mark the outcome unknown. **False is not proof that no earlier call debited.** Never log original fetch errors, response bodies, tokens, or payer phone; no raw `cause` is attached and no retry policy is hidden.

### Metadata and payer identity

- `metadata1 = attemptId`, an immutable UUID, fits ATH's 40-character limit.
- `metadata2 = registrationId`, an immutable association of at most 40 characters. The registration must have an immutable foreign key to the bootcamp event; thus this value binds both registration and event without concatenating two 36-character UUIDs beyond the limit. The adapter cannot inspect that database relation. Do not truncate IDs or substitute mutable student names/event titles.
- Keep each attempted charge's expected amount immutable. A $15 attempt cannot later be interpreted as a $30 attempt, or vice versa. The database/application decides deposit versus balance/full payment and prevents overpayment; the adapter enforces only the two permitted amounts.
- The ATH payer may be a parent, friend or another person. No name/email/phone matching is performed during verification. The supplied phone routes the request to the ATH account; it is not the student's identity or proof of payment.
- Refund and amount checks use exact cents, never rounded floating-point comparisons. Malformed, missing, fractional-cent or unexpected amounts fail closed. Any positive verified refund, even partial, returns `refunded`, not paid; its financial accounting needs a separate reconciliation process because this interface does not return the refunded amount.

## Wire protocol

All requests use HTTPS POST, JSON Accept/Content-Type, disabled redirects, and no caching. Fixed adapter URLs cannot be selected by request/webhook input. Merchant private token appears only in Search's JSON body. Each request/body read has a 15-second timeout and no automatic retry; verification can make four requests, roughly **60 seconds plus database work**, so it is not a browser-lifetime fulfillment guarantee.

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
service.reconcileLatest(registrationId): Promise<void>
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

- `start` validates amount, UUID, and normalized phone **before database work**; discovers immutable associations, then locks **event → student → registration**. After waiting, database-clock checks revalidate association, `students.status='active'`, 21+ age, open registration, and deadlines. Waiver must identify this event but may preserve an older revision; `letterChoice` must be boolean (declining is valid). Routes authenticate and resolve canonical owned registrations before service calls; the service does not accept a student identity or authenticate callers.
- Pass the root `Database`, not an enclosing transaction: attempt/authorization-intent commits must precede network effects. Other event/registration writers use the same lock order. Edits preserve open/closed state unless either old/new cutoff has passed, never reopen implicitly, and never overwrite signed evidence. Once created, an attempt's amount/association stays immutable; later closure does not stop reconciliation.
- An existing non-cancelled attempt is returned unchanged; a $15 deposit never permits a $15 balance or $30 replacement checkout. The balance is collected outside this website checkout. The schema's partial unique index is the cross-worker backstop. A genuinely verified cancellation before any authorization can free the slot; an ambiguous/paid/refunded attempt cannot.
- Commit `creating` attempt/creation lease **before** its single remote create. Ambiguous request/token-save outcome becomes uncertain and blocks replacement; a crash is handled after lease expiry. No path retries creation. Losing response/token requires operator/Evertec investigation: metadata Search may locate eventual settlement but cannot prove a pending ticket never existed, and no documented ticket-recovery API exists. Database failure returns sanitized storage failure while the durable attempt still blocks checkout.
- Reconciliation claims a two-minute lease using one conditional UPDATE. Lease timestamps use database-generated millisecond precision, so the returned timestamp is an exact CAS fence. Every result/intent write requires that same lease and an unexpired database-clock deadline. A stale worker cannot overwrite a newer worker's result; no extra lease-token schema column is needed.
- The async `beforeAuthorize` hook commits `authorizationStarted = true` and `status = 'uncertain'` before the debit request. A losing CAS or failed persistence rejects the hook. An `OPEN` poll never marks this flag. Future workers always use `authorize: false` once marked, including crashes between the commit and the provider call. **This is deliberately at-most-once authorization intent, not exactly-once payment:** a crash before the request may leave an unpaid confirmed ticket requiring operator intervention. Do not clear the marker or automatically retry authorization.
- Completed/refunded receipts set the provider `transactionId` on that ledger row; global uniqueness prevents cross-registration/attempt double credit and leaves conflicts uncertain. `dailyTransactionId` resets and is **not** a uniqueness key; `ecommerceId` is the ticket, not settlement. Credit is derived only from completed amounts, never a mutable paid counter. Any verified positive refund removes the whole attempt from credit, including partial refunds; exact refund accounting is separate.
- Lookup failures and stale pending/cancelled responses preserve completed/refunded state with a safe error flag. `PaymentState.uncertain` includes either uncertain status or retained error. Refunded never becomes completed again. After authorization intent, pending/cancelled is uncertain, not permission to charge again. Already-cancelled attempts are terminal even after unsigned notifications; exceptionally late settlement requires merchant/operator review. Pending/errors/cancelled/refunded never fulfill registration.

### Notification and worker contract

- `notify` never calls ATH, creates an attempt, changes credentials, or credits payment. Valid hints only set `reconcileRequested = true` on an existing non-cancelled row. If both hints are supplied, **both must match the same row**. Empty/malformed/unknown hints are no-ops. `reference` here means the checkout `ecommerceId`, not a refund or settled transaction ID. The response does not disclose whether an attempt exists.
- Notification writes coalesce and never move `nextCheckAt` forward or steal a lease. A request arriving during verification survives its result write. The application listener bounds actual request bytes, applies a database-backed ingress rate limit, and awaits durable enqueue before acknowledgement.
- `reconcile(id)` attempts a due claim, otherwise returns safe current state (or null for a missing attempt). It cannot bypass a cooldown. Paid/refunded rows use read-only verification. Invalid IDs throw `PaymentError('invalid_input')`.
- `reconcileLatest(registrationId)` validates the ID, selects the latest attempt by `createdAt DESC`, and calls `reconcile` if one exists. The student route first resolves `ownedRegistration(userId, eventId, false)`. Raw selector failure becomes fixed native `Error('Payment lookup failed.')` with no cause, so HTTP maps it to storage; actual reconcile `PaymentError` retains its existing payment/feature classification.
- `drain()` processes due creating/pending attempts, recoverable uncertain attempts with saved credentials, and explicitly requested completed/refunded attempts. A lost-creation attempt without credentials is not repeatedly polled after its one failed reconciliation unless explicitly requested again.
- **`drain(eventId, limit)` is an authenticated-admin refund sweep:** it queues completed/refunded rows for that event as well as ordinary unfinished work, without bypassing due dates or active leases. Do not expose this to unsigned webhooks or invoke it as the normal background polling path.
- Checks have a 30-second cooldown following an ordinary result; uncertainty/errors use five minutes. These are application limits, **not provider-published allowances**. Each call acquires a durable lease, so browser polling and webhook jobs cannot each start another verification inside the interval. In-progress provider work is not assumed cancelled merely because a lease expires; stale results are fenced and durable intent prevents a second debit.
- `drain` defaults to 10, accepts integer limits 1–50, and processes sequentially. It is durable worker work, not webhook-request authorization. The application `/api/bootcamps/work` runs smaller bounded batches; [bootcamp background setup](bootcamps.md#background-processing) owns scheduler/header/execution-budget instructions. Configure database statement/lock timeouts and monitor queue age, unresolved attempts, duplicate receipts, and capability errors. No provider polling allowance or scheduler is inferred.
- `PaymentError` has fixed, non-sensitive messages and a `code` (`configuration`, `invalid_input`, `not_found`, `unavailable`, `prerequisites`, `ineligible`, `storage`, `token`, `lease_lost`). Provider failures normally return an uncertain state after recording a whitelisted error code. Neither raw SQL/provider errors nor their causes are logged, returned or stored.

### Encryption and launch constraints

`createPaymentTokenVault(key)` exposes `seal(token, context)` and `open(ciphertext, context)`; `context` is `{ id, registrationId, amountCents, reference }`. The service uses AES-256-GCM, a fresh 12-byte nonce, a 16-byte authentication tag and versioned base64url encoding in the existing `authorizationToken` text column. Authenticated additional data binds every ciphertext to that exact attempt, amount, registration and ticket. Swapped/tampered tokens or wrong keys fail closed before contacting ATH. The phone is never stored by this service.

Set **`BOOTCAMP_PAYMENT_KEY`** to a private random 32-byte key encoded as 64 hex characters, separate from the database/ATH credentials and identical across workers. Back it up securely: loss/replacement makes existing capabilities unreadable. No automatic rotation/plaintext fallback exists; controlled re-encryption needs old/new keys while workers are stopped. Keep schema constraints/migrations applied before launch.

**Launch requires separate approval:** resolve official protocol gaps, configure private runtime values, apply migrations, schedule the authenticated worker, and obtain merchant/provider certification through an authorized real-money check. Application routes/tests are implemented, but synthetic transports and isolated PostgreSQL are not live ATH verification.


## Private operational configuration

`src/env.ts` declares private runtime values; bootcamp runtime supplies them to validated constructors:

| Variable | Purpose |
| --- | --- |
| `ATH_PUBLIC_TOKEN` | Public identifier of the receiving ATH Business merchant. |
| `ATH_PRIVATE_TOKEN` | Private API credential for that same merchant, used by transaction Search and operational webhook subscription. |
| `BOOTCAMP_PAYMENT_KEY` | Encryption key for `createPaymentService`; encoding/loss/rotation policy is owned by the encryption section above. |
| `BOOTCAMP_PAYMENTS_ENABLED` | Exact `true` expresses operator launch intent; absence/other values keep checkout disabled. |
| `BOOTCAMP_WORKER_SECRET` | Private worker bearer secret, at least 32 characters; scheduler instructions belong to [bootcamp setup](bootcamps.md#background-processing). |

Both ATH tokens must belong to the intended active merchant. Payment assembly is gated by exact enable flag plus worker-secret length ≥32; only inside that gate are ATH client/vault/payment constructors attempted in a payment-only try/catch. Missing inputs are passed as empty strings for constructor validation, not weaker duplicate prechecks. Invalid credentials/key disable **payments only**, not admin pages or Drive backup; `paymentEnabled` derives from a nonnull service. This is configuration isolation, not an upstream health check or simulated payment success. Keep every value server-private, never committed/`PUBLIC_`. Checkout sends payer phone, amount, and opaque registration/attempt IDs to ATH, not student name/email.

## Webhooks: untrusted asynchronous wakeups only

The official documentation specifies a listener accepting JSON HTTP POST with a valid, non-self-signed HTTPS certificate. It **does not document a cryptographic signature or shared-secret authentication scheme**. HTTPS authenticates the listener to the sender, not the sender to the listener. Do not add a fictional `ATH_WEBHOOK_SECRET`, trust a `status` field, or treat an obscure URL as signed payment proof.

### Setup (not performed by this change)

Use ATH Móvil Business → Settings → Development → Webhooks, authenticate in the app, enter the listener's HTTPS URL, select events and save. Alternatively the official subscription service is:

- POST `https://www.athmovil.com/transactions/webhook/post`
- Header `Content-Type: application/json`
- JSON fields: `publicToken`, `privateToken`, `listenerURL`, plus boolean `paymentReceivedEvent`, `refundSentEvent`, `donationReceivedEvent`, `ecommercePaymentReceivedEvent`, `ecommercePaymentCancelledEvent`, `ecommercePaymentExpiredEvent`.

For this integration subscribe to the three e-commerce events and `refundSentEvent`; ordinary payment/donation events are not bootcamp checkout receipts. Supply credentials privately and do not log the subscription body. This adapter neither registers a listener nor validates subscription delivery.

### Listener evidence and delivery limits

The installed `/api/bootcamps/ath/webhook` bounds/rate-limits JSON and only coalesces existing attempt hints through `notify`; [notification/service contract](#notification-and-worker-contract) owns durable writes and worker reconciliation. Browser callbacks and every reported status/amount/payer identity remain untrusted. Replay/out-of-order wakeups cannot create attempts, replace trusted expectations/capabilities, or grant credit.

- Completed/cancelled examples include `ecommerceId`; the older expired example does not. Cancellation/expiry notifications are documented for **web** payments, not iOS/Android. Server polling/reconciliation must remain independent of delivery.
- Refund events identify a **refund's** reference and may have empty metadata, not a guaranteed original payment ID. Never credit/map that reference blindly; reconcile known original attempts or investigate manually.
- Official sources provide no signature, delivery/retry/order guarantee, or replay identifier. Confirm operational limits with Evertec. Webhook subscription and delivery have not been established merely by implementing a listener.

## Validation

```sh
bun test tests/bootcamp-ath.test.ts tests/bootcamp-payments.test.ts
```

Tests inject HTTP implementations and cover wire/auth shapes, amount/metadata/ID binding, private-token receipts, third-party payers/refunds, malformed/duplicate results, cancelled/expiry ambiguity, safe diagnostics, timeouts, no replay, and durable intent/lease/credit recovery. They use no real merchant credentials/endpoints. Raw adapter debit default is intentional; mock conformance does not certify a merchant account or resolve protocol assumptions.
