# Better Auth: student and admin sign-in

This worktree uses the open-source `better-auth` and `@better-auth/drizzle-adapter` packages, pinned to **1.7.7**, with SvelteKit **3.0.0**, Bun, and the existing PostgreSQL connection. No hosted auth service, API key, paid plugin, or external identity provider is required.

## Current boundary

- Students sign in at `/login` using email + PIN through `/api/auth`. Admins sign in only through the `/admin` UI and its `/admin/auth` API, using email + an **8–128-character password**, with no mandatory case/symbol rules. Both entry points use the real Better Auth HTTP handler, not server-API form actions.
- A PIN is **exactly four ASCII digits, sent as a string**. `"0042"` is valid; `42`, `"042"`, whitespace, letters, and non-ASCII numerals are not. The PIN is passed in Better Auth's `password` field, never coerced to a number or trimmed.
- `src/lib/auth-credentials.ts` owns the client-safe `AuthAudience`, `isValidPin`, and `isValidCredential` policy used by sign-in forms, server authentication, invitations, and spreadsheet string-PIN validation. Spreadsheet numeric PIN conversion remains parser-owned; the guarded local-admin exception remains separate.
- Better Auth owns the default salted scrypt hashing and verification. Only its hash goes in `auth_account.password`; there is no PIN field on a student profile or custom hashing implementation.
- Public signup and credential/profile mutation, recovery, email verification, social login, and account-linking endpoints are disabled. The existing roster seed creates **no login accounts**. The separate, opt-in `db:seed:admin` command creates a local-development admin with Better Auth's salted hash; it refuses hosted/production database targets. There is no public account-provisioning endpoint.
- `auth_user.role` is a server-controlled `student`/`admin` value. Both the database and Better Auth default it to `student`; clients cannot set it. Sign-in validates the stored role against the server-selected entry point, not password length, submitted flags, or email naming conventions. Wrong audience, unknown email, and invalid credentials use generic errors.
- `/admin` shows separate sign-in to anonymous visitors, redirects signed-in students to `/`, and renders `AdminShell` for verified admins, including nested bootcamp pages. `StudentShell` wraps every non-admin route, including login/enrollment/errors. Shells are presentation, not authorization: each protected read/action/API checks its caller server-side.
- Clicking the admin logo opens the regular student dashboard at `/` with the **same admin account/session**, not an impersonated student. Only admins see the dedicated **Back to admin** link. Signing out from either view revokes that same database session. English/Spanish forms, errors, labels, and metadata use `src/lib/i18n/translations.ts`; raw library errors are not rendered.
- Public learning tools remain viewable without a new global profile/status gate. When [Google Drive archiving](google-drive.md) is enabled, IST/attendance actions require a verified student or admin session before PDF generation/upload; without it, download-only generation remains public. [Excel intake/invitations](student-import.md), roster editing, and [bootcamp operations](bootcamps.md) are persistent authorized workflows. Only root-console payment/grade-report panels remain fictional in-memory demos. Recovery, coordinated email changes, and game persistence remain pending.

## Server-only configuration

`src/env.ts` declares these values as private and runtime-read. Never use public-prefixed variables or put secrets in browser code.

| Variable | Required for auth | Value |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Existing PostgreSQL URL. |
| `BETTER_AUTH_SECRET` | Yes | A cryptographically random secret of at least 32 characters, unique per environment. |
| `BETTER_AUTH_URL` | Yes | Exact canonical application origin, e.g. `http://localhost:5173` locally or `https://your-domain.example`. No trailing slash, path, credentials, query, or fragment. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | No | Comma-separated exact origins; defaults to `BETTER_AUTH_URL`. No wildcard patterns. Add only origins you control and actually need. |
| `LOCAL_ADMIN_ENABLED` | No | Set `true` to enable the seeded `admin` username and short password only in Vite development on an exact `localhost`, `127.0.0.1`, or `[::1]` origin. Ignored in production and hosted environments. |

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
| `auth_user` | Better Auth identity, email, and server-owned `student`/`admin` role. Text IDs; not roster UUIDs. |
| `auth_account` | Credential-provider record and Better Auth password hash. |
| `auth_session` | Revocable database sessions, expiry, client IP, and user agent. |
| `auth_verification` | Better Auth's standard verification storage; recovery/verification flows are not enabled. |
| `auth_rate_limit` | Shared, atomic request limits with a unique key. |

`drizzle/0004_better_auth.sql` introduced auth storage; `0005_auth_account_roles.sql` adds the constrained non-null role and defaults existing accounts to student, never admin. Apply all committed migrations explicitly against the intended database:

```sh
bun run db:migrate
```

Do not run Better Auth's standalone migrator or `drizzle-kit push`. Schema corrections use new versioned Drizzle migrations; account/session rows cascade with their auth user. Roster identity is owned by `student_accounts`, not an auth-ID field on `students` or a bootcamp-only link. Imported students gain that association atomically, with no inference from matching email. Its one-to-one restrictions/provenance and `0011`/`0012` conflict-safe cutover belong to [database schema](database-schema.md#canonical-account-association). `students.status` is the sole lifecycle field; invited linked profiles intentionally exist before completion.

**Production admin setup remains separate:** migrations create no admin or credential. A trusted server-side process must create `role: 'admin'` with a compliant Better Auth-hashed password. Do not merely promote a four-digit student account: assign a suitable credential and revoke existing sessions when privileges change. No public provisioning/role-edit endpoint is enabled. Student account provisioning is implemented through the authorized [intake workflow](student-import.md).

### Local admin login

With the local Compose database running and `DATABASE_URL` configured, run:

```sh
bun run db:migrate
bun run db:seed:admin
```

In your git-ignored `.env.local`, configure a generated `BETTER_AUTH_SECRET` (see above), `BETTER_AUTH_URL=http://localhost:5173`, and `LOCAL_ADMIN_ENABLED=true`. Restart `bun run dev` if Vite has not reloaded the configuration, then open `http://localhost:5173/admin`:

- **Username:** `admin`
- **Password:** `admin`

The username maps server-side to the dedicated `admin@local.example.test` identity. Only this account gets the short-password exception, and Better Auth still verifies its stored hash and admin role, rate-limits requests, and issues revocable database sessions. Other admins retain the 8–128-character policy, and student sign-in is unchanged. The bilingual form shows the username field and local-only hint only when the server enables this mode.

Seeding is transactional and repeatable without resetting credentials, changing roles, or revoking existing sessions. An incompatible account using the reserved email causes an error rather than an overwrite. The command accepts only the guarded local development/test Compose targets; do not tunnel those ports to hosted databases. Production builds, non-loopback origins, and hosted environments do not enable this login exception. Never copy the local account or auth secret into a production database/configuration.

## Client and server usage

The same-origin client is exported from `src/lib/auth-client.ts`:

```ts
import { authClient, adminAuthClient } from '#lib/auth-client.ts';

await authClient.signIn.email({ email, password: pin }); // student, four ASCII digits
await adminAuthClient.signIn.email({ email, password }); // admin, 8–128 characters
await authClient.signOut(); // shared session, regardless of the sign-in entry point
```

These call the real HTTP handler and its rate limiter. **Do not implement a form action calling `auth.api.signInEmail` directly:** Better Auth's server API bypasses HTTP rate limiting. A future server-side sign-in flow must preserve that protection.

`src/hooks.server.ts` composes the existing language hook with `src/lib/server/auth/handle.ts`. Better Auth's official `svelteKitHandler` serves the API. Normal server requests with a session cookie verify it against Better Auth and populate nullable `event.locals.user` and `event.locals.session`; invalid/revoked/expired cookies never become an identity. Session-cookie renewal and deletion headers are propagated, and session-aware responses are not publicly cacheable. Database failures do not become successful authentication.

Locals are server-only. The root layout sends language plus a minimal `viewer` projection (`id`, `name`, `email`, `role`), **never raw session tokens or credential records**; its responses are private/no-store. `src/lib/server/auth/access.ts` provides the projection and the `/admin` page check. Its `requireActionViewer` gate checks a matching user/session first (`401` when absent), then the required role and exact request Origin (`403` on mismatch), before enrollment, import, or roster-edit actions read a body or acquire dependencies. Bootcamp and report operations retain their own feature-specific gates. The cookie cache is disabled, so revocations and current roles are checked against PostgreSQL on server requests. Cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS; CSRF and Origin checks remain enabled in every environment, including tests.

Two lazily created instances of the same configuration share the secret, database, cookie name/path, and session policy. Only the API base path and accepted credential audience differ. Browser forms make same-origin HTTP requests and perform full navigation after sign-in/out, refreshing the server-owned viewer rather than inventing a client identity. JavaScript is required for the auth controls; it is not a prerequisite for rendering public pages or building the project.

`src/lib/server/auth/config.ts` owns exact-origin validation and guarded local-admin enablement; invitation URLs reuse that same origin predicate. General HTTP loopback allowance includes 127/8, while the short-password exception remains limited to the exact local-admin hosts above and development/non-Railway execution. `getAuth(audience)` explicitly selects one of the two cached audience instances; no default audience or alternate local-admin policy module is exposed.

## Rate limiting and PIN risk

The built-in database limiter is explicitly enabled, including during development/tests:

- Email sign-in: **5 requests per 60 seconds per client-IP/path bucket**, including failed or malformed credentials. Student and admin entry points share the normalized `/sign-in/email` bucket, so switching between them does not reset the limit.
- Default: **100 requests per 60 seconds per client-IP/path bucket** (not an application-wide aggregate quota).
- Limits are shared across auth instances and survive application restarts. Exceeding a limit returns `429` with `X-Retry-After`.

The hook overwrites `x-auth-client-ip` using SvelteKit's `event.getClientAddress()`; browser-supplied `x-auth-client-ip`, `x-forwarded-for`, or `x-real-ip` must not select the limiter bucket. The selected production adapter and trusted proxy configuration must make `getClientAddress()` authoritative. Do not trust arbitrary forwarded headers or expose an origin that bypasses your trusted proxy. If the adapter cannot supply an address, auth requests fail rather than accept a client-selected address. Better Auth groups IPv6 addresses by `/64` by default.

**A four-digit PIN has only 10,000 possible values.** Slow salted hashing does not prevent offline exhaustive guessing after a credential leak. IP limits cannot stop distributed guesses and can affect shared networks. Review stronger credentials/MFA, per-account abuse controls, and network policy before exposing sensitive student data. Implemented roster/intake/bootcamp gates do not resolve those risks or approve future game/profile APIs; recovery remains undecided.

## Compatibility and validation

Better Auth 1.7.7's optional SvelteKit peer range still advertises `^2.0.0`. Its installed official handler uses standard Request/Response objects and a compatible `RequestEvent` type; this integration uses SvelteKit 3's `$app/env`, `@sveltejs/kit/hooks`, and private environment declarations. No dependency overrides, framework downgrade, or copied handler are used. Recheck the integration on upgrades rather than assuming the upstream peer range promises SvelteKit 3 support.

```sh
bun test tests/auth.test.ts tests/auth-hook.test.ts tests/database-local-admin.test.ts
bun run check
bun run build
bun run db:test:up
bun run db:test
bun run db:test:down
```

Unit tests validate configuration, exact PIN/admin-password formats, Better Auth's default crypto, lazy hook behavior, server-owned roles, and security options without database I/O. UI source/compilation tests check bilingual labels, navigation visibility, form constraints, and HTTP-client wiring (not browser interaction). Opt-in tests use the guarded disposable PostgreSQL target and real Better Auth instances for both sign-in audiences, role spoofing, minimal viewer data, admin page loads/redirects, shared cookie verification, demotion, logout/replay, expiry/renewal, disabled signup/mutation, Origin/callback protection, shared/concurrent limits, spoof-resistant hook IP handling, and schema constraints. They never substitute an in-memory auth adapter or fake session verifier, and remove only their own fixtures. See the README for database target safety and test commands.
