# SvelteWebsite

A bilingual student workspace and administration site using SvelteKit, TypeScript, and Bun. Roster editing, Excel intake/invitations, and bootcamp operations use PostgreSQL; learning games remain public, in-memory tools. `/courses-preview` and the root-admin payment/report demos remain supported.

## Getting started

Install dependencies and start the development server:

```sh
bun install
bun run dev
```

To open the app in your browser automatically:

```sh
bun run dev --open
```

### Language servers

`bun install` also installs project-local language servers as dev dependencies:

- `typescript-language-server` for TypeScript and JavaScript.
- `svelte-language-server` for Svelte components.
- `vscode-langservers-extracted` for HTML, CSS, and JSON.

OMP auto-detects these binaries in `node_modules/.bin`; no global installation or custom LSP configuration is needed. After installing dependencies in an existing OMP session, reload language servers via `xd://lsp` with `{"action":"reload","file":"*"}`.

## Local PostgreSQL

`compose.yaml` runs PostgreSQL 18 for local development. Docker must be running. The admin roster/editor, invitation onboarding, and bootcamp operations use the database; game-history tables/views exist but game routes are not connected yet. Ordinary public development, checks, builds, and non-database tests still work without PostgreSQL or `DATABASE_URL`. See [current schema and pending integrations](docs/database-schema.md), [Excel intake and invitations](docs/student-import.md), and [authentication setup](docs/authentication.md). `/admin` requires an admin session for its console; no login accounts are seeded by default. The opt-in `bun run db:seed:admin` provisions the guarded [local admin login](docs/authentication.md#local-admin-login).

If you do not already have a `.env` file, copy `.env.example` to `.env`. Generate a unique local password, for example:

```sh
bun -e 'import { randomBytes } from "node:crypto"; console.log(randomBytes(32).toString("hex"));'
```

Set `POSTGRES_PASSWORD` to that value in `.env`. Set `DATABASE_URL` using the same password and this connection format: `postgresql://sveltewebsite:PASSWORD@127.0.0.1:5433/sveltewebsite`. Replace `PASSWORD` with your password; URL-encode it if it contains special characters. Hexadecimal passwords generated above do not require encoding. `.env` is ignored by Git; never commit it or expose either value in browser code.

Start the database and wait for its health check:

```sh
bun run db:up
bun run db:status
```

Local connection details:

| Setting | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5433` |
| Database | `sveltewebsite` |
| User | `sveltewebsite` |
| Container | `sveltewebsite-local-postgres` |
| Persistent volume | `sveltewebsite-local_postgres_data` |

`bun run db:shell` opens `psql` inside the container, so a PostgreSQL client does not need to be installed on the host. `bun run db:down` stops and removes this Compose project's container and network, but keeps its database volume. Do not add `-v` unless you deliberately want to delete the database data. PostgreSQL 18 stores its data beneath `/var/lib/postgresql`, which is the named volume's mount point.

The image is pinned to PostgreSQL major version 18, allowing newer 18.x patches when the image is pulled. Changing `POSTGRES_PASSWORD` after the volume is initialized does not update the existing database user's password.

### Migrations and fictitious local roster

After configuring `.env` and starting the development database, apply the committed migrations explicitly:

```sh
bun run db:migrate
```

This reads the server-only `DATABASE_URL` and records applied migrations in `drizzle.__drizzle_migrations`. Rerunning it applies only outstanding migrations. It does not seed fictitious roster data, run during app startup/builds, or require a PostgreSQL extension. Run migrations from one controlled process per database, and review the target before using a hosted connection.

The roster preserves stable IDs, entered names, and unique normalized email comparisons across every lifecycle state. Date of birth/gender may be empty before invitation completion. `student_accounts` is the single account-to-student identity owner; `students.status` is the sole lifecycle field. Excel intake creates invited profiles, Better Auth accounts, canonical associations, and invitations atomically. Migrations `0011`/`0012` preserve legacy identity/provenance and reject conflicting associations or lifecycle projections before removing old representations. Deploy their application cutover together; see [migration safety](docs/database-schema.md#identity-and-lifecycle-cutover). Public signup remains disabled and game-persistence endpoints remain pending.

Optionally insert three fictitious roster profiles into the local database:

```sh
bun run db:seed
```

The seed uses fixed UUIDs and reserved `@example.test` addresses, contains no auth accounts/PINs, and never overwrites existing records. It is not a login bypass. It refuses production/Railway environments, remote hosts, connection-option overrides, and unknown database/user/port combinations; it also verifies the actual connected database and user. Only this development target and the dedicated test target below are allowed. A non-fixture record using a fixture email causes the atomic insert to fail rather than modifying that record. Do not point these local ports at remote databases through tunnels.

For future schema changes, edit the relevant definition in `src/lib/server/db/schema.ts` (roster, canonical associations, invitations), `auth-schema.ts` (Better Auth), `game-schema.ts` (game/catalog tables), `bootcamp-schema.ts` (events/registrations/documents/payments), or `views.ts` (derived progress/rankings), then generate and inspect an additional migration:

```sh
bun run db:generate --name=describe_the_change
bun --no-env-file x --no-install drizzle-kit check
```

Commit the SQL, snapshots, and journal together. Review dependent view creation/drop order: Drizzle Kit does not automatically order these views by dependency, so source views must be created before views that use them (and dropped in reverse order). Integration tests validate the actual SQL against PostgreSQL. Custom PostgreSQL functions/triggers use `bun run db:generate --custom --name=describe_the_change` followed by editing that new SQL file. Already applied migrations are append-only: use a new migration for corrections, not `drizzle-kit push` or edits to old files. The lazy application connection lives in `src/lib/server/db/index.ts`; standalone tools use `connection.ts` without SvelteKit virtual imports. `src/env.ts` declares `DATABASE_URL` as private, runtime-read, and optional until database code is called.

### Game history and vocabulary progress

Game-history tables, immutable vocabulary membership snapshots, and derived progress/ranking views are implemented; game pages still retain progress only in memory. The [implemented game-history contract](docs/database-schema.md#implemented-game-history) owns table/view details, retry identities, verification and retention boundaries. It also distinguishes pending server grading, leaderboard presentation, and unfinished-round resume from existing storage.

### Isolated database tests

Database integration tests use `compose.test.yaml`, not the persistent development database:

```sh
bun run db:test:up
bun run db:test
bun run db:test:down
```

This starts a separate Compose project with PostgreSQL 18 at `127.0.0.1:5434`, database/user `sveltewebsite_test`, and public test-only password `sveltewebsite_test`. Its data is held in a disposable tmpfs mount, not the development volume. Stopping/removing this test container discards its data. No `.env` changes are needed, and `compose.yaml` remains unchanged.

`db:test` selects the disposable test URL and runs `bun test --timeout 15000 tests/database`; Bun's substring discovery includes every database suite without a maintained filename list or literal glob. An unavailable opted-in database fails. Suites cover migration reruns/conflict rollback, canonical identity/provenance, roster/invitation/bootcamp/game constraints, real Better Auth sessions and concurrency, retained history, guarded connections, and seeds. Row checks use rolled-back transactions; cleanup removes only owned fixtures. Ordinary `bun run test` skips PostgreSQL integration without `TEST_DATABASE_URL`. URL guards reject non-test targets before connection; actual database/session-user checks run before writes. Never tunnel local seed/test ports to a hosted database.

### Moving to Railway

Docker Compose is only the local database runner; it is not required for the hosted application. Keep future application queries and versioned migrations compatible with standard PostgreSQL and read the connection from the server-only `DATABASE_URL`. On Railway, configure that variable from the PostgreSQL service's connection URL appropriate to the application's network, rather than copying the local `.env` or using `127.0.0.1`. Match the supported PostgreSQL major version and use the hosted service's TLS requirements; do not disable certificate verification globally. The [auth setup](docs/authentication.md) also requires a private secret, explicit HTTPS origin, and authoritative client IPs. A deployment-specific SvelteKit adapter is not configured by this step.

## Student and admin authentication

Students sign in at `/login` with email + four-digit PIN; admins use `/admin` with email + password. [Authentication](docs/authentication.md) owns exact credential, role, hashing, session, Origin, and shared rate-limit policies. Public signup stays disabled. For local development, [enable and seed the dedicated admin account](docs/authentication.md#local-admin-login) to use `admin`/`admin`; that exception is disabled in production.

The stored server-controlled role determines which entry point can authenticate the account. `/admin` shows a login form anonymously, redirects signed-in students to `/`, and permits the console for admins. Its logo opens the student dashboard using the same admin session, where an admin-only **Back to admin** link returns to the console. Both views have sign-out; labels, errors, and metadata are English/Spanish.

Apply committed migrations explicitly; they do not create a production admin. [Admin intake](docs/student-import.md) now provisions student accounts and completes invitation-only enrollment using the same canonical association that bootcamps authorize. General production-admin provisioning, recovery, coordinated email changes, and game persistence remain pending. Public learning tools have no new global profile/status gate. Only root-admin payment and grade-report panels remain fictional local demos; roster/editing/intake/invitations and bootcamp operations are real.

## Bootcamp registration

`/bootcamps` provides the persistent 21+ student flow: three mandatory Spanish legal sections and a Spanish-only signed waiver PDF, an optional bootcamp employer letter, then a one-time $30 full payment or $15 deposit. The surrounding UI and optional employer letters remain available in English and Spanish. Documents are saved before payment and backed up to Drive, independently of downloads. `/admin/bootcamps` lists real events and controls registration. Setup lives at `/admin/bootcamps/activate`, existing event details and legal review at `/admin/bootcamps/[eventId]/edit`, and registrations/documents/CSV at `/admin/bootcamps/[eventId]/report`—including students who never started and deposit balances. All pages retain the shared admin sidebar and header. Activation shows event details only; the server generates the standard Spanish agreements and opens registration immediately. There is no legal-approval checkbox or custom wording. Only one event may have registration open; a second activation/reopen returns `activeEvent`.

**Registration stays closed until explicitly configured and activated.** Apply the committed migrations, including `0009_bootcamp_single_active_event.sql` (removes legal-approval fields and enforces one open event), configure Drive/ATH/private worker settings, and complete separate live merchant verification before enabling payments. Admins enter one Puerto Rico event date and a same-day 24-hour start/end interval. Check-in opens one hour before the start, and registration closes twelve hours before the start; both are calculated on the server. Standard clauses automatically use the event's date, times, venue and payment amounts; edits regenerate them while preserving the registration state unless the old or new cutoff has passed. Existing signed documents remain unchanged. The new migration closes expired open rows and aborts if multiple future events remain open; resolve that conflict before rerunning migrations. The provided wording and its retained media contradiction/named entities require review, not an assumption of lawyer approval. No live charge or upload is implied by this implementation. See [bootcamp setup and operating guide](docs/bootcamps.md) and [ATH Móvil protocol/recovery notes](docs/ath-bootcamps.md).

## Project structure

```text
src/
  app.html              HTML document template
  env.ts                Optional private runtime database/auth/provider declarations
  app.d.ts              Application-wide type declarations
  app.css               Global styles and color tokens
  hooks.server.ts       Composed language, Better Auth handler, and server session hooks
  lib/                  Shared code and assets, imported through #lib
    assets/             Assets processed by Vite
    components/         Shared dashboard shell, form fields, and IST report components
      ui/               Locally owned, branded shadcn-svelte primitives
    attendance/         Employer-letter types, shared validation, and bilingual presentation
    frequency/          Bundled word list, fuzzy Spanish search, and practice-round logic
    i18n/               English/Spanish translations and reactive language context
    ist/                IST types, shared input validation, pure assessment, and presentation
    admin/              Roster/intake UI, scoped admin styles, local payment/report demos
    auth-client.ts      Same-origin student/admin Better Auth clients
    server/             Server-only auth, PDFKit reports, Google Drive archive, and database connection
    speed-math/         Pure question generation, session timing, scoring, and statistics
    utils.ts            Registry class utility and primitive prop/ref types
  routes/
    +layout.server.ts   Language and minimal verified account identity (no session tokens)
    +layout.svelte      Language context, StudentShell, and admin layout delegation
    +page.svelte        Dashboard home with IST, attendance, and Speed Math entry points
    frequency/          English-first frequency flashcard page
    ist/                IST page and server form action
    attendance/         Attendance certificate page and server PDF form action
    admin/              Separate sign-in, guarded roster/intake, and bootcamp operations
    login/              Student email + PIN sign-in
    enroll/             Invitation-only student profile completion
    bootcamps/          Authenticated registration, documents, and payment flow
    courses-preview/    Supported course preview
    speed-math/         Timed arithmetic practice page
static/                 Files served without processing
tests/                  Bun feature tests and opt-in PostgreSQL integration tests
scripts/db/             Explicit migrations, guarded fictitious seed, local target checks
drizzle/                Versioned SQL migrations and Drizzle snapshots/journal
compose.test.yaml       Disposable PostgreSQL instance for database integration tests
drizzle.config.ts       Database schema and migration-generation configuration
vite.config.ts          Vite, SvelteKit, and deployment adapter configuration
tsconfig.json           Strict TypeScript configuration
tsconfig.tools.json     Strict no-emit check for authored scripts/tests and Drizzle config
```

`StudentShell` owns the responsive sidebar/header and single main/skip target for every non-admin route, including login, enrollment, errors, and unknown routes. Authenticated admin pages inherit `AdminShell`; anonymous admin sign-in stays separate. Home alone highlights Home; known tools highlight their own links, and unknown routes highlight none. The header pairs the Masterminds logo and wordmark, shows verified account identity/sign-out or sign-in, and shares the language selector. An admin visiting the student workspace keeps the same identity and an admin-return link, never impersonates a student. `static/logo.png` preserves the original `static/logo.jpg`; public `static/hero_ist.jpg` remains available. Completed `/design-preview` and `/admin/bootcamps/mockups` studies are retired, not `/courses-preview`.

SvelteKit supports server-side TypeScript in route files such as `+page.server.ts` (page data and form actions) and `+server.ts` (HTTP endpoints). Add these as features need them; a separate backend is not required.

## Initial Strength Test (IST)

Open `/ist` to enter the student's name, sex baseline, age, weight in pounds, waist circumference in inches, push-ups, sit-ups, plank, and one-mile run. Timed exercises use separate whole minutes and seconds. Every exercise requires a recorded result or an explicit unable-to-complete status; zero repetitions are valid, but a recorded zero duration is not.

The shared validator runs in the browser and server. It preserves decimal measurements, rejects blank/malformed/out-of-range inputs and inconsistent exercise states, and blocks raw body-fat estimates outside 0–100% before rounding. Pure assessment functions apply the user-approved Army-based **program baseline**, including the female run thresholds of 585 and 630 seconds. All five categories must pass; there is no combined score or compensation between categories. Reference maxima are not input caps, and the arithmetic midpoint is not a population average.

A successful server submission evaluates the inputs once and creates English and Spanish PDFKit reports from that same result. The on-screen report and downloads share the presentation model. Grades use text as well as color. PDFs feature the Masterminds logo from `static/logo.png`, grouped student details, an upfront readiness summary, and five result cards with textual grade badges, outcomes, and applicable thresholds. Typical reports fit on one Letter page; extended content wraps and paginates with repeated branding and result-column headers. Built-in Helvetica fonts support precomposed Spanish accents. Vite embeds the logo in the server bundle, so generation needs no network requests or deployment-specific filesystem paths. The page works with standard server form submissions when JavaScript is unavailable: exercise choices submit a form update that preserves other entries and clears the exercise’s previous values when inability is chosen, without generating an assessment. Result fields stay disabled until a recorded result is selected. Enhanced submissions add immediate validation and focus handling.

IST names are still entered manually; profile linkage is not implemented. Fitness results are not stored in a database, browser storage, or cookies. With [Google Drive archiving](docs/google-drive.md) configured, a verified sign-in is required and both language PDFs must be saved to the organization's Drive folder before the submission succeeds. Without Drive configuration, the existing public download-only flow remains available. Assessment responses are marked `Cache-Control: no-store`; PDFs are returned with the assessment and downloaded directly from the page. Results are self-reported, not official military clearance or a medical evaluation.

## Employer attendance certificate

Open `/attendance` from the Features sidebar or dashboard to generate an employer letter. The form asks for the student's full name, sex (only for Spanish grammatical agreement), program start date, Basic/Regular cohort, AM/PM class time, and the employer contact's name, position, and workplace. Sex, cohort, and class time use button-style choices rather than dropdowns. **No Social Security number or student email is collected or printed.** Employer positions are free text, so there is no separate “Other” workflow.

This ports the document rules from the legacy Go `internal/cartaasistencia` implementation with the corrected class schedules: Basic classes are Mondays/Wednesdays/Fridays; Regular classes are Mondays/Tuesdays/Thursdays/Fridays. For either cohort, the student chooses AM (10:00–12:00) or PM (20:00–22:00), and that same time applies to every class day. The selected days and times appear in both the preview and bilingual PDFs. The Spanish wording, `aceptado`/`aceptada` agreement, title-cased names, first-two-token repeated names, San Juan issuer, UTC issue dates, and the original signature image and contact details are preserved. The issuer's printed name is Claudine Menéndez. Both interface and letter text live in the shared English/Spanish translations. Program dates are calendar dates with no timezone shift.

Shared browser/server validation requires all eight fields, rejects invalid calendar dates, duplicate form entries, uploaded files, hidden control characters, and overlong text, and normalizes accents and whitespace. The built-in PDF fonts support Spanish accents and WinAnsi punctuation, not every writing system; unsupported characters receive a localized validation error rather than generating a corrupted name. It does not introduce a restriction on future program start dates that the legacy validator did not have. Each server submission creates English and Spanish PDFKit letters from one validated snapshot. The page offers both downloads and a localized text preview; changing the language never reissues a letter. Typical letters fit on one Letter page; longer entries wrap or paginate with repeated branding and an intact signature block positioned near the bottom of the final page. There is no page-number footer. The logo and original signature PNG are embedded in the server build; the signature source is under `src/lib/server/assets`, not publicly served from `static`.

This feature uses the IST-style direct-download flow with optional [Google Drive archiving](docs/google-drive.md), not the legacy certificate worker, Gmail delivery, Postgres report persistence, or email-based monthly quota. Without Drive configuration it needs no service secrets. Entries and generated PDFs are not stored in a database, browser storage, or cookies, and action responses are marked `Cache-Control: no-store`. Standard POST submissions work without JavaScript; enhanced submissions add validation, progress state, and focus handling. The legacy Go files are unchanged.

Student details are still manually entered; enrollment lookup is not implemented. When Drive is enabled, report actions require an existing verified student or admin session. This does not verify the student's enrollment or authority to issue a certificate for someone else.

## Google Drive report archive

Both IST assessments and attendance certificates can automatically save their English and Spanish PDFs in one organization-owned Drive folder. The legacy Go uploader is ported to server-side TypeScript with no new dependencies. Configure private `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `DRIVE_OAUTH_REFRESH_TOKEN`, and `DRIVE_REPORTS_FOLDER_ID` values, plus the existing authentication setup. No secrets or Drive IDs are sent to the browser.

Archiving requires sign-in and waits for both uploads before returning success/downloads. English/Spanish notices disclose the storage change and show success or actionable failure states. Without Drive configuration, reports retain the existing download-only behavior. There is no historical backfill, durable retry queue, or cross-request deduplication; partial/ambiguous upload failures can leave files in Drive. See [Google Drive configuration, permissions, privacy, and retry limits](docs/google-drive.md) before enabling it.

## Gmail backend

The server-only Gmail module supports text/HTML messages and in-memory attachments and delivers the real admin intake's student invitations. Configuration alone sends nothing; IST, attendance, and bootcamp documents are not emailed. See [Gmail configuration, API, privacy, and sending limits](docs/gmail.md); **test mode still sends real email**, redirected only to the configured sender.

## English frequency deck

Open `/frequency` from the sidebar to practice the supplied 1,001 English words with reviewed Spanish translations. The full list is bundled in `src/lib/frequency/words.json`; there is no runtime CSV upload or external vocabulary request. Every original English string, rank, and frequency position is preserved, while the Spanish data has been audited and corrected. Each learning item also has a permanent, randomly assigned UUID stored in the JSON: retain that ID when editing spelling, translations, or rank; never regenerate it from content or list position. Each card has a primary answer and optional individually accepted alternatives, without usage notes. See `src/lib/frequency/AUDIT.md` for the review policy, limitations, and primary-answer change log. To revise the list, edit the JSON and update the relevant regression tests in `tests/frequency.test.ts`.

Select **Start round** before any cards appear; rounds do not begin automatically on page load. Cards always show English first, regardless of the website language. The bilingual interface offers adaptive rounds of **25 recorded answer attempts**, not preselected decks or necessarily 25 distinct words. Type in Spanish to search the entire answer pool, then tap a suggestion, use arrow keys and Enter, or choose “I don’t know” to reveal the translation. Search tolerates accents, case, and small typos and includes every primary and alternative answer. Grading compares the selected option with that card’s accepted answers rather than grading a fuzzy query. Duplicate suggestions are collapsed without removing English cards. Revealed cards show the Spanish translation and accepted alternatives.

The scheduler in `src/lib/frequency/practice.ts` selects only words at the **lowest correct-answer count across the full pool**, treating missing progress as zero. Correct answers increase the item's count; incorrect answers and skips leave that count unchanged and increase separately tracked retry counts. The proposed initial selection weight is `1 + incorrectCount + skippedCount`; this numerical policy remains open for product agreement. Immediate repetition is avoided when another eligible item exists. Eligibility is recalculated for each next card, so a difficult word can repeat and a new pass can begin within the same round. Invalid input and repeated submissions of the same card do not consume attempts; repeated words have separate round/card identities.

Rounds are labeled Round 1, Round 2, and so on, counting each new round started during the current page visit; reloading or leaving resets the numbering. Round scores distinguish correct, incorrect, and skipped attempts. Full-list reporting separately shows practice coverage, words answered correctly at least once, and current-pass completion, always using all 1,001 items as the denominator. A new pass resets only its own progress bar, not first-pass coverage. The end-of-round missed-word list is informational; the next round continues the same adaptive rules rather than restricting the pool to those words. These metrics measure practice completion, not permanent mastery.

Accepted responses update item progress immediately, and starting another round retains those counts. **All progress and response data remain in memory on this page**: reloads and navigation clear them. There is no account/database persistence or unfinished-round resume yet. Future persistence must resolve student identity and grading on the server, save responses idempotently by round/card identity, and update progress transactionally according to `docs/database-schema.md`. No migrations or authentication integration are included here.

JavaScript is required for this interactive feature. The translations were reviewed for sense, grammar, spelling, and register, but isolated words still have context-dependent meanings. The developer-facing audit records limitations around auxiliaries, idioms, and probable subtitle/contraction fragments; per-word notes are not included in the cards or vocabulary data. Informal speech and strong language remain in the deck.

## Speed Math

Open `/speed-math` from the sidebar or dashboard to choose a 5-, 10-, or 15-minute challenge and one operation: addition, subtraction, multiplication, or division. Addition and subtraction use numbers from 0 to 50; subtraction answers are nonnegative. Multiplication uses factors from 1 to 12, and division uses those tables with exact whole-number answers and no zero divisors. Consecutive questions do not repeat.

Type a whole-number answer and press Enter or select Answer. Each valid submission is graded once and immediately advances to the next question, with feedback showing the previous correct answer. Invalid input does not consume a question or affect the score. The practice screen shows time remaining, correct and incorrect counts, and accuracy. When time expires (or the student ends the session early), results also show total questions answered, correct answers per minute, and elapsed practice time. Try again uses the same settings; Change settings returns to setup.

The browser timer reconciles against an absolute deadline, including after switching tabs, and answers at or after the deadline cannot score. All interface text, feedback, accessibility labels, and metadata support English and Spanish. JavaScript is required for this interactive feature. Questions and scores remain in memory only; leaving or reloading the page clears the session. No new dependencies or backend storage are used. The pure game logic lives in `src/lib/speed-math/game.ts` and is covered by Bun tests.

## Administration workspace

Sign in at `/admin` for the bilingual responsive admin workspace. Its connected sections and separate bootcamp routes use server authorization; only two root-console panels remain local demos:

- **Overview:** real student counts/search and optional fictional AR/PC/WK/MK scores, with no overall score/readiness/progress calculation.
- **Students:** real roster search/lifecycle filters and transactional profile/subject-score editing; canonical-linked login emails cannot be edited independently.
- **Invitations:** real Excel preview/review, atomic account/profile provisioning, explicit mail sends/resends, and paginated enrollment/delivery status.
- **Payments:** fictional payment-link creation and refund-review confirmation, never a real charge/refund.
- **Grade reports:** local CSV filename/size staging (up to 5 MB), illustrative download/history; contents are not parsed, transmitted, or applied.
- **Bootcamps:** separate [persistent event, document, registration, and reconciliation routes](docs/bootcamps.md), not a root-console schedule placeholder.

Payment/report demo state survives section switches because the demo owner stays mounted; reload or leaving the route resets it. Reserved `.invalid` links are non-clickable examples. Those demos make no API calls, database writes, billing requests, or browser-storage records. Authentication, roster/editing, and invitations are real; the existing language cookie is unchanged.

`src/lib/admin/roster.ts` defines presentation; `src/lib/server/admin-roster.ts` reads students/optional scores and derives account presence. `server/admin-page.ts` composes one authorized database load with roster and paginated invitations. `AdminOverview.svelte`, `AdminStudents.svelte`, `StudentInvitations.svelte`, and `AdminOperations.svelte` keep their respective UI owners separate. Illustrative grade-report CSV is not a grading contract.

`bun run db:seed:subject-scores` inserts fictional AR/PC/WK/MK values only for the complete 100-student reserved fixture roster, using guarded local URL/identity checks. Reruns preserve existing values and change no student profiles. These are **not validated ASVAB scores, official percentiles, or an exam scoring algorithm**; see [fixture storage](docs/database-schema.md#admin-subject-score-fixtures). `admin.css` scopes console geometry and portalled dialogs while using the shared root theme.

Refund-review dialogs retain translated close labels, trapped focus, and ignored outside clicks. Escape/Cancel/Close return focus to their trigger; confirmation focuses the section title once its action becomes disabled. These controls review only fictional refunds, separate from bootcamp provider reconciliation.

`noindex, nofollow` is not access control. Real reads/actions enforce current server authorization and input validation; any future API must do the same. Root-console payment/report demos do not establish production billing or assessment-import contracts.

## Brand styling

The dark theme uses the original charcoal background (`#11151C`) and surfaces (`#191F28`). Sage (`#B7C690`) is the primary accent; Slate (`#7B949C`) is the secondary accent for icons and subtle borders. Cream (`#FFF5D9`) and its softer variants are typography only: never control fills, backgrounds, borders, focus rings, shadows, or decorative indicators. Filled sage/slate actions use dark text and icons; outline and ghost actions use slate icons with sage hover/selection states. Semantic red/amber/green assessment meanings remain intact.

Color and typography tokens live in `src/app.css`, with one dark root palette mapped to Tailwind 4 semantic utilities. Syncopate 700 remains the display face; Space Grotesk 500 and 700 remain the body/control faces, with no synthetic weights. Admin data retains its monospace role. The Latin font files are served locally from `src/lib/assets/fonts`, without runtime requests to a font provider.

`components.json` configures the official shadcn-svelte registry and existing `#lib` aliases. The vendored Button, Input, Label, Card, Badge, Alert, Dialog, Progress, Table, and NativeSelect sources live in `src/lib/components/ui`; their shared chrome owns hover/focus/disabled/invalid states, wrapping 44px action targets, and reduced-motion styling. Page styles own geometry and custom graphics, not a second control theme. Registry updates must preserve the brand customization, required Dialog `closeLabel`, and Table `containerProps` for its single keyboard-scrollable region.

Native form, fieldset, heading, section, and article semantics remain around the primitives. Radio choices retain native keyboard/submission behavior; IST exercise-choice POSTs and full IST/attendance submissions still work without JavaScript. Game engines, authentication APIs, server validation, and PDF rendering are unchanged.

## Languages

The header's two-option selector switches the interface between 🇺🇸 English and 🇵🇷 Español without reloading or changing the URL. English is the default. A `language` cookie remembers the choice for one year; the server uses it to render the saved language on the first response, including the document's `lang` attribute. This preference cookie is readable by the client and contains only `en` or `es`, not sensitive data.

Translations live in `src/lib/i18n/translations.ts`. Add new interface text to both language dictionaries; TypeScript checks that Spanish matches the English message structure. Components call `useLanguage()` from `#lib/i18n/language.svelte.ts` and read `language.messages` reactively. Avoid destructuring messages into a nonreactive local value. Product names and user-provided content are not translated.

The root layout provides language context per component tree, not through a shared server store. Page titles, descriptions, navigation, accessibility labels, and the skip link use the selected language. The selector uses native radio buttons for keyboard support and respects reduced-motion preferences.

## Validation

```sh
bun run test
bun run check
bun run build
```

`check` runs exactly `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json && tsc -p tsconfig.tools.json`: application code plus Drizzle config and every authored script/test. `check:watch` remains application-only. Migration metadata can be checked separately with `bun --no-env-file x --no-install drizzle-kit check`; PostgreSQL behavior uses the [isolated database commands](#isolated-database-tests), not a second typecheck script.

Preview the production build locally:

```sh
bun run preview
```

## Deployment

The project starts with `@sveltejs/adapter-auto`. Choose a deployment-specific adapter once the hosting target is decided.

## Documentation

- [Current database schema and pending integration](docs/database-schema.md)
- [Authentication and local admin setup](docs/authentication.md)
- [Student intake and invitations](docs/student-import.md)
- [Bootcamp operations](docs/bootcamps.md) and [ATH protocol/recovery](docs/ath-bootcamps.md)
- [Google Drive](docs/google-drive.md) and [Gmail](docs/gmail.md)
- [Svelte](https://svelte.dev/docs/svelte)
- [SvelteKit](https://svelte.dev/docs/kit)
- [Bun](https://bun.sh/docs)
