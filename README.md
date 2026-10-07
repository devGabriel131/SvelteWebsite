# SvelteWebsite

A student dashboard using SvelteKit, TypeScript, and Bun.

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

## Local PostgreSQL

`compose.yaml` runs a PostgreSQL 18 database for local development. Docker Desktop must be running. Drizzle provides student-roster and game-history schemas, derived progress/ranking views, and versioned migrations, but the dashboard is not connected to them yet. Ordinary `bun run dev`, checks, builds, and non-database tests still work without PostgreSQL or `DATABASE_URL`. The [database schema document](docs/database-schema.md) distinguishes this implemented foundation from pending profile linkage and game-persistence work. The [Better Auth integration](docs/authentication.md) supports student email + four-digit PIN sign-in and separate admin email + password sign-in. The student dashboard stays a public preview; `/admin` now requires an admin session. No login accounts are seeded by default; the separate `bun run db:seed:admin` command provisions the opt-in [local admin login](docs/authentication.md#local-admin-login).

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

The first migrations create `students` and its database-level `updated_at` trigger. Staff-entered names retain accents and compound names. Emails retain their entered casing, but a unique index compares `lower(btrim(email))` across every student, including inactive profiles. Surrounding/embedded whitespace is rejected by a lightweight email-shape constraint; server-side enrollment must trim and validate inputs. Dots and plus-addresses are not collapsed. Date of birth and gender may be null during roster entry; class type is required. Bootcamp registration now has explicit administrator-controlled account-to-roster links; general signup, invitation records, and authenticated game-persistence endpoints are not implemented yet.

Optionally insert three fictitious roster profiles into the local database:

```sh
bun run db:seed
```

The seed uses fixed UUIDs and reserved `@example.test` addresses, contains no auth accounts/PINs, and never overwrites existing records. It is not a login bypass. It refuses production/Railway environments, remote hosts, connection-option overrides, and unknown database/user/port combinations; it also verifies the actual connected database and user. Only this development target and the dedicated test target below are allowed. A non-fixture record using a fixture email causes the atomic insert to fail rather than modifying that record. Do not point these local ports at remote databases through tunnels.

For future schema changes, edit the relevant definition in `src/lib/server/db/schema.ts` (students), `auth-schema.ts` (Better Auth), `game-schema.ts` (game/catalog tables), `bootcamp-schema.ts` (events/registrations/documents/payments), or `views.ts` (derived progress/rankings), then generate and inspect an additional migration:

```sh
bun run db:generate --name=describe_the_change
bun run db:check
```

Commit the SQL, snapshots, and journal together. Review dependent view creation/drop order: Drizzle Kit does not automatically order these views by dependency, so source views must be created before views that use them (and dropped in reverse order). Integration tests validate the actual SQL against PostgreSQL. Custom PostgreSQL functions/triggers use `bun run db:generate --custom --name=describe_the_change` followed by editing that new SQL file. Already applied migrations are append-only: use a new migration for corrections, not `drizzle-kit push` or edits to old files. The lazy application connection lives in `src/lib/server/db/index.ts`; standalone tools use `connection.ts` without SvelteKit virtual imports. `src/env.ts` declares `DATABASE_URL` as private, runtime-read, and optional until database code is called.

### Game history and vocabulary progress

`drizzle/0002_game_history.sql` adds typed game persistence and five derived views; `0003_frequency_catalog.sql` records the bundled vocabulary's 1,001 permanent UUIDs and ranks as the initial `frequency-v1` membership snapshot. This learning-content migration runs on every migrated database; it contains no student data and is separate from the opt-in fictitious roster seed.

- `game_attempts` links a stable attempt UUID to a student, game type, explicit rules version, and start/end timestamps. `ended_at` may be null for partial vocabulary practice; that is not a promise of resumable rounds. Reuse the same attempt ID for submission retries.
- `speed_math_results` stores operation, selected 5/10/15-minute duration, nonnegative correct/incorrect counts, and optional `verified_at`. Counts and verification have no fabricated defaults. A composite foreign key prevents math results from attaching to vocabulary attempts.
- `vocabulary_items`, `vocabulary_pools`, and `vocabulary_pool_items` identify items and versioned pool membership independently of word spelling or rank. Content/translations stay in the existing JSON; published membership snapshots must not be edited in place. Add a new pool ID/membership migration when its denominator or ordering changes, and retain old snapshots.
- `vocabulary_rounds` binds an attempt to one pool. `vocabulary_responses` retains each accepted card outcome and answer time. `(attempt_id, card_position)` is the retry identity, with positions 1–25; repeated items at different positions are valid. Foreign keys require each response's item to belong to that round's pool. No raw answer text or credentials are stored.

The response history is authoritative. `student_word_progress` derives each student's lifetime item counts and latest outcome; absent rows represent zero practice. Equal answer timestamps use attempt ID and card position as a deterministic tie-break. `vocabulary_round_progress` reports accepted response counts and marks a round complete only at 25, independent of correctness or an end timestamp. `student_vocabulary_completeness` reports the explicit pool denominator, practice coverage, successful coverage, full passes, and current-pass counts, including all unpracticed items. Counts follow stable item IDs across pool versions. Empty pools report zero counts and current pass 1. There are no editable progress counters, percentages, or permanent mastery flags. Views always reflect retained history; a cache can be added later if measured history volume warrants it.

`speed_math_verified_bests` selects one verified full-duration result per student/operation/duration/rules version. Effective `ended_at` must equal the computed deadline, and `verified_at` must be at or after it; early, unfinished, late/unclamped, and unverified attempts remain in history but do not enter competition. Equal personal bests select the earliest end time, then lowest attempt UUID. `speed_math_leaderboard_entries` ranks those bests by most correct answers, then fewest incorrect answers; exact ties share a rank (`1, 1, 3`). The backend views contain student IDs, without names or active-state filtering. That is not a public leaderboard or a decision about audience/inactive visibility.

**Integration boundary:** no game route uses this storage yet. Future authenticated server code must resolve the student, check current active state, grade answers and control timing, set verification itself, and write related records transactionally. Unique keys prevent duplicate records, but an API must also compare retry payloads and reject conflicting submissions rather than silently ignoring them. `verified_at` is not proof of grading by itself; clients must never control it. Foreign keys restrict deletion instead of cascading learning history; a deletion/retention policy remains to be agreed.

### Isolated database tests

Database integration tests use `compose.test.yaml`, not the persistent development database:

```sh
bun run db:test:up
bun run db:test
bun run db:test:down
```

This starts a separate Compose project with PostgreSQL 18 at `127.0.0.1:5434`, database/user `sveltewebsite_test`, and public test-only password `sveltewebsite_test`. Its data is held in a disposable tmpfs mount, not the development volume. Stopping/removing this test container discards its data. No `.env` changes are needed, and `compose.yaml` remains unchanged.

`db:test` explicitly selects that test URL and fails if the database is unavailable. It verifies migrations and reruns, roster/game constraints, catalog membership, retry uniqueness, repeated/partial rounds, completeness/pass boundaries, verified rankings and shared ranks, history retention through deactivation, connection guards, and seed idempotency. Row-level checks run in rolled-back transactions; seed tests remove only fixtures they inserted. The ordinary `bun run test` runs database safety/fixture unit tests but skips PostgreSQL integration tests unless `TEST_DATABASE_URL` is explicitly set. Auth integration tests additionally exercise real hashing, sign-in, cookies, logout/replay, Origin protection, server-session hooks, and persisted/concurrent rate limits. An integration URL must match the dedicated test target; the persistent development database and remote targets are rejected before migrations.

### Moving to Railway

Docker Compose is only the local database runner; it is not required for the hosted application. Keep future application queries and versioned migrations compatible with standard PostgreSQL and read the connection from the server-only `DATABASE_URL`. On Railway, configure that variable from the PostgreSQL service's connection URL appropriate to the application's network, rather than copying the local `.env` or using `127.0.0.1`. Match the supported PostgreSQL major version and use the hosted service's TLS requirements; do not disable certificate verification globally. The [auth setup](docs/authentication.md) also requires a private secret, explicit HTTPS origin, and authoritative client IPs. A deployment-specific SvelteKit adapter is not configured by this step.

## Student and admin authentication

Open-source Better Auth uses `drizzle/0004_better_auth.sql` and the appended `0005_auth_account_roles.sql`. Students sign in at `/login` with email + exactly four ASCII-digit PINs (including leading zeros). Admins sign in at `/admin` with email + passwords of **8–128 characters**, without mandatory case/symbol rules. Better Auth owns salted hashing/verification, public signup remains disabled, and both HTTP entry points share database-backed sign-in rate limits. For local development, [enable and seed the dedicated admin account](docs/authentication.md#local-admin-login) to use username `admin` and password `admin`; that exception is disabled in production.

The stored server-controlled role determines which entry point can authenticate the account. `/admin` shows a login form anonymously, redirects signed-in students to `/`, and permits the console for admins. Its logo opens the student dashboard using the same admin session, where an admin-only **Back to admin** link returns to the console. Both views have sign-out; labels, errors, and metadata are English/Spanish.

See [authentication setup and security boundaries](docs/authentication.md) for private variables, migrations, provisioning prerequisites, and tests. **Apply the new migration explicitly; it defaults existing accounts to student and does not create an admin or password.** Production account provisioning, invitations, recovery, and game persistence remain separate work. Bootcamps have explicit admin-controlled roster linkage and authenticated persistent operations. Student demo pages stay public; the original admin console panels still use fictional in-memory data.

## Bootcamp registration

`/bootcamps` provides the persistent 21+ student flow: three mandatory signed waiver sections, an optional bootcamp employer letter, then a one-time $30 full payment or $15 deposit. Documents are saved before payment and backed up to Drive, independently of downloads. `/admin/bootcamps` manages real events, approved bilingual text, student-account links, document backups, and event-specific reports/CSV—including students who never started and deposit balances.

**Registration stays closed until explicitly configured and activated.** Apply `0006_bootcamp_registration.sql`, provide approved legal wording in both languages, configure Drive/ATH/private worker settings, and complete separate live merchant verification before enabling payments. No live charge or upload is implied by this implementation. See [bootcamp setup and operating guide](docs/bootcamps.md) and [ATH Móvil protocol/recovery notes](docs/ath-bootcamps.md).

## Project structure

```text
src/
  app.html              HTML document template
  env.ts                Private runtime database/auth/Drive declarations (optional until used)
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
    admin/              Isolated admin design components, scoped styles, and fictional fixtures
    auth-client.ts      Same-origin student/admin Better Auth clients
    server/             Server-only auth, PDFKit reports, Google Drive archive, and database connection
    speed-math/         Pure question generation, session timing, scoring, and statistics
    utils.ts            Registry class utility and primitive prop/ref types
  routes/
    +layout.server.ts   Language and minimal verified account identity (no session tokens)
    +layout.svelte      Language context and route-specific student/admin shells
    +page.svelte        Dashboard home with IST, attendance, and Speed Math entry points
    frequency/          English-first frequency flashcard page
    ist/                IST page and server form action
    attendance/         Attendance certificate page and server PDF form action
    admin/              Admin sign-in and server-guarded command-center preview
    login/              Student email + PIN sign-in
    speed-math/         Timed arithmetic practice page
static/                 Files served without processing
tests/                  Bun feature tests and opt-in PostgreSQL integration tests
scripts/db/             Explicit migrations, guarded fictitious seed, local target checks
drizzle/                Versioned SQL migrations and Drizzle snapshots/journal
compose.test.yaml       Disposable PostgreSQL instance for database integration tests
drizzle.config.ts       Database schema and migration-generation configuration
vite.config.ts          Vite, SvelteKit, and deployment adapter configuration
tsconfig.json           Strict TypeScript configuration
```

The dashboard shell has a full-width header, a left sidebar, and a main content area that renders the active route. Navigation stacks above the content on narrow screens. The header pairs the Masterminds logo with its wordmark in one home link. `static/logo.png` has a transparent outer background and was converted from the preserved original `static/logo.jpg`. The header shows the verified account's name/email and sign-out, or a student sign-in link for anonymous visitors. An admin viewing the student dashboard retains their own identity; no student impersonation or roster linkage is involved. The IST, attendance certificate, and Speed Math features are accessible from the sidebar and dashboard home.

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

## Admin design preview

Open `/admin` and sign in with an admin account for the cockpit-inspired administration prototype. It has a dedicated responsive command rail, graphite panels, sage readouts, amber attention signals, sample training telemetry, a readiness gauge, and a student roster. The student dashboard and IST keep their existing layout. Every admin view, dialog, accessibility label, and page metadata is available in English and Spanish through the shared language selector.

The six sections demonstrate:

- **Overview:** demo metrics, a 7/30-day activity chart, a visual score gauge, recent fictional activity, student check-ins, and a sample upcoming session.
- **Students:** search and visible status choices, plus local-only add/edit dialogs for fictional students. Roster metrics reflect those edits. Clearing the optional score preserves “no score”; progress remains required.
- **Payments:** payment-link previews and a confirmation dialog that marks a fictional refund request as reviewed, never refunded.
- **Invitations:** local invitation previews with cohort and expiry selections; no emails or enrollments.
- **Grade reports:** local CSV filename/size staging (up to 5 MB), a downloadable illustrative CSV, and sample report history. File contents are not parsed, transmitted, or applied to students.
- **Events:** explicitly labeled schedule and assignment placeholders; no real events, notifications, or attendance records.

All demo changes are held only in component memory and reset on reload or leaving the admin route. Preview URLs use the reserved `.invalid` domain and are intentionally not clickable checkout/enrollment links. These demo operations make no API calls, database writes, billing integrations, or browser-storage records. Authentication uses real Better Auth API calls/database sessions; the existing language preference cookie is unchanged.

`src/lib/admin/demo.ts` holds fictional fixtures and pure presentation helpers; these types and the CSV columns are **not contracts for the database schema**. `AdminOverview.svelte`, `AdminStudents.svelte`, and `AdminOperations.svelte` separate the overview, roster controls, and future operational workflows. The `/admin` route owns the shared in-memory roster. `admin.css` retains cockpit geometry under `.admin-console` and portalled dialog layout under `.admin-console-dialog`; both use the shared root theme.

Student and refund dialogs use the shared Dialog primitive with translated close labels, trapped keyboard focus, and ignored outside clicks. Escape, Cancel, and Close restore focus to the initiating action; confirming a refund review focuses the section title because that action becomes disabled. Fixed status, expiry, and event choices use pressed-button groups; dynamic student lists remain native selects.

**The page is now guarded by verified admin identity; its operations remain a design prototype.** `noindex, nofollow` metadata is not the access-control boundary—the server page load is. Before connecting real student or financial data, enforce admin authorization on each read/action/API, and add validated import workflows, payment-provider integration, and audit logging. Do not replace fictional fixtures with real data based only on a page guard.

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
bun run db:check
bun run build
```

Preview the production build locally:

```sh
bun run preview
```

## Deployment

The project starts with `@sveltejs/adapter-auto`. Choose a deployment-specific adapter once the hosting target is decided.

## Documentation

- [Svelte](https://svelte.dev/docs/svelte)
- [SvelteKit](https://svelte.dev/docs/kit)
- [Bun](https://bun.sh/docs)
