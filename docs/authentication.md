# Initial Better Auth integration

This worktree uses the open-source `better-auth` and `@better-auth/drizzle-adapter` packages, pinned to **1.7.7**, with SvelteKit **3.0.0**, Bun, and the existing PostgreSQL connection. No hosted auth service, API key, paid plugin, or external identity provider is required.

## Current boundary

- Email + PIN sign-in, sign-out, and database-backed sessions are available through `/api/auth`.
- A PIN is **exactly four ASCII digits, sent as a string**. `"0042"` is valid; `42`, `"042"`, whitespace, letters, and non-ASCII numerals are not. The PIN is passed in Better Auth's `password` field, never coerced to a number or trimmed.
- Better Auth owns the default salted scrypt hashing and verification. Only its hash goes in `auth_account.password`; there is no PIN field on a student profile or custom hashing implementation.
- Public signup and credential/profile mutation, recovery, email verification, social login, and account-linking endpoints are disabled. There is no account-provisioning UI/script in this step. The existing roster seed creates **no login accounts**. Tests privately create disposable fixtures with Better Auth's own hashing and adapter; that is not an application login bypass.
- No invitation flow, student-profile linkage/onboarding, active-state enforcement, admin authorization, or game persistence endpoints have been added. Existing dashboard/admin preview routes remain public. An auth user is not yet a linked student or an authorized admin.
- No new UI has been added. Future login UI, errors, accessibility labels, and metadata must use both dictionaries in `src/lib/i18n/translations.ts`, not display raw library messages.

## Server-only configuration

`src/env.ts` declares these values as private and runtime-read. Never use public-prefixed variables or put secrets in browser code.

| Variable | Required for auth | Value |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Existing PostgreSQL URL. |
| `BETTER_AUTH_SECRET` | Yes | A cryptographically random secret of at least 32 characters, unique per environment. |
| `BETTER_AUTH_URL` | Yes | Exact canonical application origin, e.g. `http://localhost:5173` locally or `https://your-domain.example`. No trailing slash, path, credentials, query, or fragment. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | No | Comma-separated exact origins; defaults to `BETTER_AUTH_URL`. No wildcard patterns. Add only origins you control and actually need. |

Generate the secret locally (do not commit it):

```sh
bun -e 'import { randomBytes } from "node:crypto"; console.log(randomBytes(32).toString("hex"));'
```

Use HTTPS outside loopback development. HTTP origins are accepted only for `localhost`, `127.0.0.0/8`, and `[::1]`. Serve local requests at the exact configured host and port; `localhost` and `127.0.0.1` are distinct origins. Trusted origins do not mount the API at additional hosts; the SvelteKit handler serves only `BETTER_AUTH_URL`. Cross-origin browser clients/CORS are not implemented by this step.

When all auth variables are absent, public pages still work and auth requests return an uncached `503` with `AUTH_NOT_CONFIGURED`. Partial/invalid auth configuration fails rather than falling back to a default secret or inferred origin. PostgreSQL and configuration are initialized lazily, only for auth API requests or requests carrying a session cookie. Prerendering bypasses auth initialization. Ordinary builds and tests need no database, auth secret, or mock identity.

## Migrations

`src/lib/server/db/auth-schema.ts` adds these independent tables:

| Table | Purpose |
| --- | --- |
| `auth_user` | Better Auth identity and email. Text IDs; not roster UUIDs. |
| `auth_account` | Credential-provider record and Better Auth password hash. |
| `auth_session` | Revocable database sessions, expiry, client IP, and user agent. |
| `auth_verification` | Better Auth's standard verification storage; recovery/verification flows are not enabled. |
| `auth_rate_limit` | Shared, atomic request limits with a unique key. |

`drizzle/0004_better_auth.sql`, its snapshot, and the journal append use the existing migration pipeline. Migrations `0000`–`0003` are unchanged. Apply explicitly against your intended database:

```sh
bun run db:migrate
```

Do not run Better Auth's standalone migrator or `drizzle-kit push`. Future schema changes must generate an additional versioned Drizzle migration. Account/session rows cascade only with their auth user; no relationship to roster/game data exists yet.

## Client and server usage

The same-origin client is exported from `src/lib/auth-client.ts`:

```ts
import { authClient } from '#lib/auth-client.ts';

await authClient.signIn.email({ email, password: pin }); // pin is a four-character string
await authClient.signOut();
```

These call the real HTTP handler and its rate limiter. **Do not implement a form action calling `auth.api.signInEmail` directly:** Better Auth's server API bypasses HTTP rate limiting. A future server-side sign-in flow must preserve that protection.

`src/hooks.server.ts` composes the existing language hook with `src/lib/server/auth/handle.ts`. Better Auth's official `svelteKitHandler` serves the API. Normal server requests with a session cookie verify it against Better Auth and populate nullable `event.locals.user` and `event.locals.session`; invalid/revoked/expired cookies never become an identity. Session-cookie renewal and deletion headers are propagated, and session-aware responses are not publicly cacheable. Database failures do not become successful authentication.

Locals are server-only. The root layout still sends only language data to the browser, not raw session tokens. No authorization guard is implied by populating locals. The cookie cache is disabled so revocations are checked against PostgreSQL. Cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS; CSRF and Origin checks remain enabled in every environment, including tests.

## Rate limiting and PIN risk

The built-in database limiter is explicitly enabled, including during development/tests:

- Email sign-in: **5 requests per 60 seconds per client-IP/path bucket**, including failed or malformed credentials.
- Default: **100 requests per 60 seconds per client-IP/path bucket** (not an application-wide aggregate quota).
- Limits are shared across auth instances and survive application restarts. Exceeding a limit returns `429` with `X-Retry-After`.

The hook overwrites `x-auth-client-ip` using SvelteKit's `event.getClientAddress()`; browser-supplied `x-auth-client-ip`, `x-forwarded-for`, or `x-real-ip` must not select the limiter bucket. The selected production adapter and trusted proxy configuration must make `getClientAddress()` authoritative. Do not trust arbitrary forwarded headers or expose an origin that bypasses your trusted proxy. If the adapter cannot supply an address, auth requests fail rather than accept a client-selected address. Better Auth groups IPv6 addresses by `/64` by default.

**A four-digit PIN has only 10,000 possible values.** Slow salted hashing does not make it resistant to an offline exhaustive search after a credential-database leak. IP-based limits also cannot stop distributed guessing across many source addresses, and can affect students sharing a network. This initial integration follows the requested credential format; review stronger credentials/MFA, per-account abuse controls, and network policies before exposing student data. No claim of production-ready authorization is made here.

## Compatibility and validation

Better Auth 1.7.7's optional SvelteKit peer range still advertises `^2.0.0`. Its installed official handler uses standard Request/Response objects and a compatible `RequestEvent` type; this integration uses SvelteKit 3's `$app/env`, `@sveltejs/kit/hooks`, and private environment declarations. No dependency overrides, framework downgrade, or copied handler are used. Recheck the integration on upgrades rather than assuming the upstream peer range promises SvelteKit 3 support.

```sh
bun test tests/auth.test.ts tests/auth-hook.test.ts
bun run check
bun run db:check
bun run build
bun run db:test:up
bun run db:test
bun run db:test:down
```

Unit tests validate configuration, exact PIN format, Better Auth's default crypto, lazy hook behavior, and security options without database I/O. Opt-in tests use the guarded disposable PostgreSQL target and real Better Auth instances for sign-in, cookie verification, logout/replay, expiry/renewal, disabled signup, Origin/callback protection, shared/concurrent limits, spoof-resistant hook IP handling, and schema constraints. They never substitute an in-memory auth adapter or fake session verifier, and remove only their own fixtures. See the README for database target safety and test commands.
