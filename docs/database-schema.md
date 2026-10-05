# Database schema proposal

**Status: roster and game-history migrations implemented; authentication and feature integration are pending.** Drizzle tooling, versioned PostgreSQL migrations, a guarded fictitious local seed, and isolated database tests now cover student profiles, game attempts, typed Speed Math results, versioned vocabulary membership, response history, and derived progress/rankings. No dashboard route persists game data yet. Authentication, invitations, and server-controlled game submission/grading remain separate work; the remaining proposals below do not imply approval of those integrations.

## Implemented first migration scope

- `src/lib/server/db/schema.ts` defines the roster table: stable UUID ID, separate nonblank first/last names, required email, nullable date of birth/gender, required `basic`/`regular` class type, active-by-default state, and required creation/update timestamps.
- `drizzle/0000_students.sql` creates the table, constraints, and a unique `lower(btrim(email))` index across all profiles. Email spelling/casing is preserved; input whitespace is rejected, and the enrollment server must trim inputs before storage. No provider-specific dot/plus normalization is applied. The auth handoff must use this same comparison policy rather than enable independently editable addresses.
- PostgreSQL rejects impossible, infinite, or future dates of birth; supported age limits remain undecided. `gender` is either null, `male`, or `female`.
- `drizzle/0001_students_updated_at.sql` installs a `BEFORE UPDATE` trigger using `clock_timestamp()`. Both ORM and raw SQL writes update the timestamp, including multiple writes in the same transaction.
- `auth_user_id` is deliberately **not present yet**. Add its unique relationship and the linked-profile completeness invariant only after agreeing on Better Auth's real identifier type/table and transaction ownership. Do not interpret a populated roster profile or `is_active` as authenticated access.
- Drizzle ORM with postgres.js provides typed server queries; Drizzle Kit generates committed SQL/snapshots/journal, and the standard migrator applies them explicitly through `bun run db:migrate`. No extension or PIN storage is introduced.
- `bun run db:seed` explicitly inserts three fictitious profiles with stable IDs and reserved addresses into known local targets only, without overwriting existing records or creating auth accounts. The seed refuses production/hosted execution and checks both the URL and actual database identity.
- `compose.test.yaml` supplies a separate disposable PostgreSQL 18 test database on port 5434. `bun run db:test` opts into integration tests; normal tests skip them without `TEST_DATABASE_URL`. The persistent local database on port 5433 is not modified by tests.
- No route or browser feature imports the database. `DATABASE_URL` is private, runtime-read, and optional until a database operation is requested, so normal development does not gain a database or mock-identity requirement. Active-state enforcement on protected requests belongs to the later auth integration; this migration does not protect today's preview pages.

See [README database commands](../README.md#local-postgresql) for setup, generation, migrations, seeds, and test teardown.

## Implemented game-history migration scope

`src/lib/server/db/game-schema.ts` defines the additional tables in `drizzle/0002_game_history.sql`. `src/lib/server/db/views.ts` defines derived PostgreSQL views; they are not independently editable counters or caches.

| Table | Implemented contract |
| --- | --- |
| `game_attempts` | Stable UUID, student FK, `speed_math`/`frequency` discriminator, required nonblank rules version, finite start time, nullable finite end time not before the start, creation time. |
| `speed_math_results` | One result per attempt; operation and 5/10/15-minute duration constraints; explicit nonnegative correct/incorrect counts; nullable finite `verified_at`. Composite FK requires a Speed Math attempt. |
| `vocabulary_items` | Identity catalog using the permanent UUIDs already bundled in `words.json`; no default/generated IDs or duplicate translation store. |
| `vocabulary_pools` / `vocabulary_pool_items` | Versioned pool IDs and membership/rank snapshots. Item identity is not rank; membership and rank are unique within a pool. |
| `vocabulary_rounds` | One frequency-game attempt bound to one pool; wrong-game attempts are rejected by a composite FK. |
| `vocabulary_responses` | Attempt/card position (1–25) primary key, pool/member FKs, `correct`/`incorrect`/`skipped`, finite answer time, and creation time. Student identity is resolved through the attempt, not copied into responses. No raw answers are retained. |

`drizzle/0003_frequency_catalog.sql` is the initial `frequency-v1` content-identity/membership snapshot for all 1,001 bundled items. It is applied with normal migrations and contains no student data. Published membership is treated as immutable: changing the pool/order uses a new pool ID and migration, preserving older denominators. Content translations stay in JSON; future grading must associate meaningful content/scoring changes with its rules version rather than reinterpret old recorded outcomes.

Derived contracts:

- `student_word_progress` aggregates lifetime frequency responses by student/stable item into correct, incorrect, and skipped counts, latest practice time, and latest outcome. Missing rows mean zero counts. Equal answer times use descending attempt ID/card position for a deterministic last outcome. Progress follows stable items across pool versions; it is not shared with an unrelated future vocabulary game.
- `vocabulary_round_progress` reports response and outcome counts for every persisted round, including zero-response and ended partial rounds. Exactly 25 accepted responses completes a round; ending it does not fabricate completion.
- `student_vocabulary_completeness` uses each explicit pool's complete membership, including missing progress as zero. It reports counts for total/practiced/successful items, full passes (minimum correct count), current pass, and current-pass completion. Empty pools have zero counts and current pass 1; pool changes preserve item history while showing an explicit changed denominator.
- `speed_math_verified_bests` chooses one verified full-duration result per student/operation/duration/rules version, ordered by correct descending and incorrect ascending. Effective end time must equal start plus selected duration; verification must be populated and not earlier than the end. Equivalent best attempts choose earliest end then ascending UUID, without adding a competitive score criterion.
- `speed_math_leaderboard_entries` applies shared `RANK()` by correct/incorrect counts within each operation/duration/rules category (`1, 1, 3` for a top tie). These are all-time backend ID records, not a public leaderboard. Names, audience, and inactive visibility are still undecided; raw views do not filter active state.

**Implementation trade-off:** derive progress directly from authoritative response history instead of storing a second mutable summary. That removes summary synchronization/rebuild races; large histories may later justify a transactionally maintained cache. No percentages, mastery booleans, or editable pass counters are stored.

**Server handoff:** persist accepted responses individually and reuse stable attempt/card identities. Database keys enforce uniqueness, but the future API must distinguish identical retries from conflicting payloads, resolve the authenticated student, validate the expected card/answer/time, and enforce current active state. Write attempt/typed result or attempt/round/response consistently in transactions. Never accept client-selected student identity, grading outcome, counters, rules, or `verified_at` as trusted inputs. A verification timestamp is a server-owned record marker, not an implemented grading engine. Storage of partial rounds does not implement resume behavior. All history relationships use restricted deletion, not cascading student data; retention/deletion policies remain pending.

See [README game storage](../README.md#game-history-and-vocabulary-progress) for the command workflow and boundaries.

## Agreed requirements and direction

- Student information includes first name, last name, email, date of birth, gender, class type, and active/inactive state.
- Staff creates student profiles manually, one by one, using the existing Excel rosters as the source. An Excel import is not requested.
- Profiles exist before student auth accounts. Staff may leave date of birth and gender blank when entering roster students; students must provide both during invitation-based signup. Gender selections are `male` and `female` only; no 'prefer not to say' or other signup options. After entering the students, staff sends each one an email invitation to register.
- Registration is invitation-only. There is no public self-registration or uninvited access.
- Each student has their own unique email, across active/inactive and registered/unregistered profiles. Different students may use the same PIN; PINs are not unique identifiers.
- The website is currently a student information/tools dashboard, not an online classroom or course-delivery system.
- The initial program class types are `basic` and `regular`, with no different feature behavior yet.
- An admin interface will manage enrollment and access; its implementation belongs to a separate parallel thread.
- Newly created roster students are active by default (`is_active = true`), but still need invitation-based registration before dashboard access.
- Deactivation blocks all student dashboard access, including access through existing sessions. It preserves the profile and learning history; reactivation restores access to those same records.
- Normal student sign-in uses email + PIN. Better Auth owns credential hashing and verification; the PIN must never be stored in plaintext.
- Better Auth will be implemented separately. Our schema links to its user identity, without `pin`/`pin_hash` profile fields, a parallel PIN credential table, or a `pgcrypto` dependency for credentials.
- Retain game attempts so personal bests and improvement can be calculated. Speed Math needs separate leaderboards for each operation and each 5-, 10-, or 15-minute duration. Each student appears once per category with their best full-duration result, ranked by most correct answers, then fewest incorrect answers; equal results share a rank. Vocabulary also needs lasting item-level progress, with completeness tracking a top priority.
- Vocabulary uses adaptive 25-answer-attempt rounds, including repeats when needed, rather than fixed decks. Correctly answered words wait until the rest of the pool catches up in correct-answer count.
- Use standard PostgreSQL, versioned migrations, and a server-only `DATABASE_URL` for both local development and eventual Railway hosting.
- Initial database development and testing use fictitious students, not real roster data. Schema and game-persistence tests do not need to wait for Better Auth; real authentication and invitation flows still require later integration testing.
- Keep the normal localhost development workflow unaffected by database experiments. Use an isolated test setup; do not automatically introduce a database requirement or mock student identity into ordinary development.

Database query/migration tooling is Drizzle ORM with postgres.js and Drizzle Kit. Roster and typed game-history migrations are implemented; auth-linkage and invitation storage are still pending.

## Student identity and profile

Recommended ownership: Better Auth owns login identity and authentication records; the application owns the student profile, enrollment address, and dashboard history. Because staff-created profiles exist before auth accounts, the proposed `students` table now includes `email` for enrollment and invitations.

At invitation acceptance, use the invited address to initialize the Better Auth user's login email and link the existing student profile. Do not let the registration form replace it with an arbitrary address. This deliberately introduces an enrollment address and an auth login address with coordinated ownership, rather than two independently editable copies. Recommended initial policy: students cannot change email themselves; staff corrections before registration revoke existing invitations. Post-registration email changes need a coordinated policy before being enabled.

Confirmed: each student has their own unique email and links to one auth user; an auth user links to at most one student profile. Enforce student email uniqueness in PostgreSQL as well as the admin flow, using the same normalization/comparison policy as the auth integration. Apply uniqueness to all student records, not just active or registered ones. Changing an email does not change the stable student ID or move its progress. Post-registration email-change handling remains to be agreed.

### Proposed `students` fields

| Field | Proposed representation | Notes |
| --- | --- | --- |
| `id` | UUID primary key | Stable application ID; game history references this ID, not email. |
| `auth_user_id` | Nullable, unique foreign key | Null during staff enrollment; link it on successful registration. Match the identifier type selected for Better Auth. Do not create a reference to a table that does not exist yet. |
| `first_name` | Text | Preserve entered names, including accents and compound names; reject blank values. |
| `last_name` | Text | Do not infer it by splitting a full name. |
| `email` | Required text with unique normalized comparison | Staff-entered enrollment/invitation address. Unique across all student records, including inactive/unregistered profiles. Bind registration to it and coordinate future changes with auth. |
| `date_of_birth` | Nullable date | May be missing during staff enrollment; required and validated during student signup. Calculate age for the relevant date rather than storing current age. Supported enrollment ages remain to be agreed. |
| `gender` | Nullable text constrained to `male` or `female` | `NULL` is allowed before signup, not as a selectable signup answer. One of the two values is required during student signup. Do not infer the IST sex baseline from it. |
| `class_type` | Text constrained to `basic` or `regular` | Program classification, not an online course enrollment. Separate student tables or a class-feature system are unnecessary. |
| `is_active` | Required boolean, default `true` | Admin-controlled. False blocks all student dashboard access, including existing sessions, without deleting data. Being active does not bypass invitation-based registration. |
| `created_at` | Timestamp with time zone | Record creation time. |
| `updated_at` | Timestamp with time zone | Record changes; implementation must actually update it, not only set an insertion default. |

A student changing class type does not require deleting or replacing their profile. No course, lesson, teacher, or live-class schema is needed for the current dashboard. Program-enrollment history or class-specific dashboard features can get related tables if later requested.

Profile gender is not interchangeable with the IST's `male`/`female` sex baseline. Do not silently derive assessment thresholds from it.

### Profile completion at signup

Date of birth and gender are nullable in PostgreSQL because a staff-entered roster profile exists before signup. Represent missing values as `NULL`, not empty strings or fabricated defaults. This does not make those fields optional during student registration.

The invitation signup flow must collect and validate both fields before granting dashboard access. Complete the profile and link the auth user consistently with invitation acceptance; do not let another signup path create a linked student with missing required information. A valid date must be a real calendar date and not be in the future. Gender must be `male` or `female`, enforced by server validation and a database constraint; do not substitute a default selection for missing input. Supported enrollment ages still need agreement.

Proposed database invariant for the approved migration: a student linked to an auth user has a populated date of birth and gender set to `male` or `female`. Coordinate write ordering and transaction handling with the auth thread; avoid introducing a separate editable profile-complete flag for information already represented by these fields.

## Active/inactive access

**Confirmed: inactive students cannot access the dashboard or their past results.** Their student record, linked auth identity, game attempts, and word progress are retained. Reactivation restores access to the same records rather than creating a new profile.

Protected server requests, including data reads and actions/API writes, must check the current student state; a valid session alone is not sufficient. Do not rely exclusively on hiding navigation, denying only new logins, or trusting an active-state snapshot captured when the session was issued. Session revocation may be an additional safeguard, but it must not replace the current-state access check.

Newly entered roster students default to active. Activity and registration are independent: an active roster profile does not grant access until invitation-based registration is completed. An invitation or registration action must not reactivate an inactive student or bypass this restriction.

## Invitation-only registration

The agreed lifecycle is:

1. An authorized admin creates a student profile from the roster, including the enrollment email. `is_active` defaults to true; `auth_user_id` is null, and date of birth and gender may also be null.
2. The admin requests an invitation email for that student.
3. The student opens a valid invitation, provides the required date of birth and gender, and completes the registration flow owned by the auth implementation.
4. Successful registration links the existing student to the Better Auth user and consumes the invitation. It does not create a second student profile.
5. Subsequent sign-in uses email + PIN through Better Auth; a registration invitation is not a reusable login credential.

Registration state and active state are separate. A profile without a linked auth user is unregistered, not necessarily inactive. Invitation state can be derived from its timestamps; do not add a second editable `is_registered` flag to the profile.

### Proposed invitation records

The logical invitation contract requires these fields; final storage must be coordinated with the auth thread. If an appropriate existing Better Auth capability supplies the records and flow, reuse it rather than building two invitation systems.

| Field | Purpose |
| --- | --- |
| `id` | Stable invitation identity. |
| `student_id` | Foreign key to the existing student. |
| `invited_email` | Snapshot of the delivery address, binding acceptance to the address that was invited. |
| `token_hash` | Unique hash of a cryptographically random, high-entropy invitation token; never store the raw token. |
| `expires_at` | Expiration checked on the server; validity period still to be chosen. |
| `accepted_at` | Nullable timestamp; a consumed invitation cannot be reused. |
| `revoked_at` | Nullable timestamp; an admin can invalidate an invitation. |
| `created_at` | Issuance time. |

Unlike a short PIN, a sufficiently random high-entropy invitation token can be stored as a SHA-256 hash. Keep the raw token out of database records, logs, and analytics; it is delivered in the registration link. These links grant registration authority and must be treated as secrets.

Recommended resend behavior: issue a new token and revoke the previous outstanding invitation for that student. Acceptance must be race-safe and single-use, with consistent student/account linkage and invitation consumption. Email correction before acceptance must revoke the old links. Invitation expiration, resend, and account-already-linked behavior need explicit handling.

### Contract for the admin/auth threads

- Admin mutations and invitation issuance require server-side authorization. Admin identity is separate from student classification; `basic` and `regular` are not security roles.
- The student identity comes from the validated invitation or authenticated account, not a freely supplied profile ID.
- Validate the invitation and bind the invited address before allowing account creation. Enforce the invitation-only policy on every enabled auth signup path, not merely by hiding a public signup page.
- Allow date of birth and gender to be null during staff enrollment, but require and validate both during student signup before dashboard access. Coordinate profile completion, auth linkage, and invitation consumption; students still cannot set class type, active state, or admin privileges.
- Define handling of existing auth users with the invited email; do not silently replace an existing student/account link.
- Link at most one auth user to a student and at most one student to an auth user. Enforce the confirmed one-student-per-email policy, including before account registration.
- Never accept student-controlled class type, active state, or admin privileges during signup.
- Enforce current `students.is_active` on protected student dashboard reads and writes, including requests using an existing session. Deactivation must not delete profile or progress records; registration must not change active state.
- Implement email + PIN through the auth-owned credential flow. Better Auth owns hashing and verification; no student-profile endpoint reads, returns, or persists a PIN or its hash.
- The admin and auth threads must agree on record ownership, ID types, registration transaction handling, and the selected invitation implementation before auth-linkage and invitation migrations are approved. The roster-only migration does not choose those contracts.

The admin UI, email provider, sending implementation, and Better Auth integration remain outside this schema-planning task. No code in those scopes is changed by this document.

## PIN and authentication boundary

**Confirmed: students sign in with email + PIN, and Better Auth owns credential hashing and verification.** The PIN is the reusable authentication secret, not an educational-profile field or a separate classroom code.

- Do not add `pin` or `pin_hash` to `students`, create a parallel PIN credential table, or install `pgcrypto` for PIN hashing.
- The auth implementation must configure its credential validation deliberately for the chosen PIN format. Do not assume that labeling a password input 'PIN' makes default length/format validation compatible.
- Entered PINs are strings, preserving leading zeros. Different students may have identical PIN values; do not impose PIN uniqueness. Select the account by its unique email, then verify that account's credential through Better Auth. Never expose PINs or their hashes through profile responses, logs, or development seeds.
- PIN length, allowed format, and whether students choose it during registration or staff issues it are not settled. Reset/recovery behavior also belongs to the auth integration.
- Short reusable PINs remain low-entropy secrets after hashing. Rate limiting, abuse protection, and a safe recovery process are required; auth-managed hashing alone does not solve guessing risk.

Better Auth owns its configured user/session/account/verification schema and credential storage. Exact table names, ID types, plugins, hashing configuration, and migrations belong to that integration, not this proposal.

## Game attempts and personal bests

Recommended model: a `game_attempts` record links a student to a game and captures the attempt's identity, timestamps, termination/completion information, and rules version. Typed game-specific result records hold metrics that do not mean the same thing across games. Avoid adding a score column to `students` for each new game.

The exact lifecycle is still open: saving only finished attempts is simpler than supporting resumable, in-progress attempts. A browser reload should not be claimed to resume a round unless that behavior is explicitly implemented.

### Speed Math

Existing code in `src/lib/speed-math/game.ts` records operation, selected duration, start/deadline/end times, and correct/incorrect counts. Operations are addition, subtraction, multiplication, and division; durations are 5, 10, and 15 minutes.

Proposed Speed Math results retain operation, selected duration, and correct/incorrect counts alongside the attempt's timing and completion information. Calculate total answers, accuracy, and correct answers per minute from those values rather than storing redundant metrics without a reason.

- Personal bests must be grouped by operation, selected duration, and scoring/rules version.
- Confirmed eligibility: compare full-duration completed attempts, not rounds ended early.
- Calculate personal bests from attempt history initially; a cached high-score table is not required yet.
- Persisted results must be tied to the server-resolved student and validated. Client-reported scores are not automatically trustworthy leaderboard results.
- Retries must not create duplicate attempts. Establish a stable attempt/submission identity and enforce idempotency during implementation.

#### Leaderboard (ranking and eligibility agreed)

Agreed competition rules:

- Separate rankings by operation and selected duration, matching personal-best comparisons. Addition, subtraction, multiplication, and division each have independent 5-, 10-, and 15-minute rankings: 12 categories under the current rules. Never compare totals across durations. Keep different scoring/rules versions separate as well.
- Use all-time rankings initially, without a weekly or monthly date filter. Keep attempt history if time-window views are added later.
- Include only full-duration completed attempts. Keep early-ended attempts in personal history, but exclude them from competitive rankings.
- Show one entry per student in each category, using their best eligible attempt rather than letting repeated attempts occupy multiple places.
- Rank by most correct answers, then fewest incorrect answers. Students tied on both share a rank; accuracy and correct answers per minute are supporting statistics, not additional independent scores.

Recommended implementation: derive rankings from retained Speed Math attempts rather than adding a score or rank to the student profile. A separate leaderboard table or cache is not necessary yet.

The initial leaderboard time window is all-time. Leaderboard audience, displayed student names, and whether inactive students remain visible still need agreement. Competitive eligibility also requires server-controlled timing and grading; trusting browser-submitted totals alone is insufficient. The current browser-only game does not yet provide that verification, and this document does not implement it.

## Vocabulary item identity and progress

At the initial schema review, `src/lib/frequency/vocabulary.ts` identified English/Spanish learning items by frequency rank and included optional alternative answers. That implementation used fixed frequency decks, and practice records distinguished `correct`, `incorrect`, and `skipped` outcomes. The adaptive design below is the agreed replacement; this schema-planning task does not implement or change the practice UI.

Learning items now have permanent UUIDs in the bundled vocabulary and database identity catalog, independent of rank, deck position, English spelling, or Spanish spelling. An ID identifies the learning item, not merely a unique English string. Reordering the list must not move student progress to another item; rank is versioned membership metadata, not the progress identifier.

### Adaptive 25-attempt practice (agreed)

Replace fixed decks with randomized practice from the full vocabulary pool. A correctly answered word should not reappear until the other words catch up in correct-answer count; missed words should be repeated more often. A round consists of 25 answer attempts, not necessarily 25 distinct words.

A precise interpretation of that rule is:

1. Keep each student's correct-answer count for every item in the vocabulary pool. Unpracticed items have a count of zero, even if no progress row exists yet.
2. Find the lowest correct-answer count in that pool. Only items at that count are eligible for the next card.
3. Randomize within the eligible group, giving missed words greater selection priority. Do not draw uniformly from the full list or prefer mistakes by bypassing the lowest-count rule.
4. A correct answer increments that item's count. It is held back until the minimum count catches up to its new count.
5. An incorrect answer does not increase or erase previous correct answers. The item remains eligible and receives greater retry priority. 'I don't know' receives the same retry priority as an incorrect answer, but remains separately recorded as `skipped` and does not increment the correct count.
6. Recalculate eligibility after each submitted answer. A round completes after 25 recorded answer attempts; repeated words, incorrect answers, and skips count toward that round length, but only correct answers advance the word's correct count. Invalid input and duplicate submission retries do not count as additional attempts. A permanently preselected list can become incompatible with the updated counts near a pass boundary.

For example, a word moving from zero to one correct answer is held back while any pool item still has zero. Once every item has at least one correct answer, items at one become eligible again. A successful answer completes the word for that pass, not permanently; do not use a single terminal `completed` boolean as the scheduler's source of truth. The pass level is derived from the minimum count, so a separate editable cycle counter is unnecessary.

**Trade-off:** strict balance means a few difficult words can temporarily hold the rest of the pool back. Near the end of a pass there may be fewer than 25 distinct eligible items. The user confirmed that those items may repeat and the pass can advance within the same round once they catch up. Recommended: avoid immediate repetition when alternatives exist. Exact numerical retry weighting still needs agreement. Skipped/'I don't know' answers have the same retry priority as incorrect answers, remain separately recorded, and do not count as correct answers.

### Completeness tracking (priority)

Completeness reporting must distinguish finishing a short round from making progress across the full vocabulary pool. Recommended metrics, derived from response history and per-item counts:

| Metric | Meaning |
| --- | --- |
| Round completion | Recorded answer attempts out of 25. A round with fewer than 25 is partial, not complete; repeated words are separate card attempts. |
| Practice coverage | Distinct items with at least one recorded response, including wrong/skipped responses, out of the full pool. |
| First-pass successful coverage | Distinct items with at least one correct answer out of the full pool. Seeing or skipping a word does not count as successful completion. |
| Full passes completed | For a nonempty pool, the minimum correct-answer count across every pool item. Missing progress rows count as zero. |
| Current-pass completion | If `p` is the number of full passes completed, count items with `correct_count > p`, out of the full pool. The current pass is `p + 1`. |

Use the complete vocabulary pool as the denominator, not just items that have progress rows. Provide counts alongside any percentage. When a full pass completes, the next pass starts at zero progress; preserve the completed-pass total and first-pass successful coverage so this does not appear to erase the student's achievement. These are practice-completion measures, not a claim of permanent mastery.

Do not add independently editable percentages or a permanent per-word `completed` boolean. Response timestamps can support reporting when successful coverage was achieved. If the vocabulary pool changes later, make its identity/version and changed denominator explicit in reports rather than silently presenting a changed pool as lost historical progress.

Recommended persistence behavior: save each accepted response and its word progress as it happens, not only after all 25 attempts. Leaving a round early should preserve accepted word progress and leave that round partial. This does not promise that the unfinished round can be resumed; round-resume behavior remains a separate decision.

### Proposed persistence contract

| Concept | Purpose |
| --- | --- |
| Vocabulary items | Implemented identity catalog and versioned membership in PostgreSQL for foreign keys; content stays bundled in JSON. No content-editor feature is added. |
| Vocabulary responses | Student/attempt, card position, item, outcome, and answer time. A word may appear more than once in a round, so deduplicate a retried card submission by attempt/card identity, not by word ID alone. |
| Student word progress | Implemented derived frequency-game view keyed by student/stable item, not a deck number: `correct_count`, `incorrect_count`, `skipped_count`, `last_practiced_at`, and `last_outcome`. Missing rows mean zero counts and null last-practice fields before practice. |

Response history should be authoritative if a stored progress summary is introduced. Save responses idempotently; update any summary consistently with them, and keep the summary rebuildable. Persisted identity and grading must be server-controlled once database integration is added. Whether other vocabulary games share these counters is a separate future decision; fixed deck IDs must not define lasting progress.

The practice-flow implementation can be developed separately against these item/progress inputs, including an in-memory model initially. Schema migrations, the selector implementation, and the UI change remain separate work. No permanent mastery threshold or round-resume behavior is approved yet.

## Future IST history

Saving IST assessments is a separate, unapproved feature. The current feature does not retain fitness data. If approved later, use assessment records linked to the student, with inputs, assessment date, age at assessment, explicit sex baseline, and a rules version. Preserve historical assessment meaning even if the profile or thresholds change. Decide data access and retention before storing these sensitive records.

## Decisions to resolve before remaining migrations and integration

Staff-led enrollment, pre-account profiles, date of birth/gender left blank until required student signup, `male`/`female` as the only gender selections, invitation-only registration, unique student emails, repeatable PIN values with auth-owned hashing/verification, active-by-default roster profiles, admin-managed access, and reversible full dashboard blocking for inactive students are confirmed. Remaining identity/access decisions:

1. **Email changes:** Agree on any post-registration correction/change policy that keeps the enrollment address and auth login address consistent.
2. **Invitations:** Choose validity period and handling of existing auth users; agree on the invitation implementation with the admin/auth threads.
3. **Auth handoff:** Agree on PIN format/length, who selects it, and reset/recovery behavior with the auth implementer. These do not add PIN columns to the student profile.

Adaptive 25-attempt rounds, repeats near pass boundaries, equal retry priority for skipped and incorrect answers with distinct recorded outcomes, and completeness tracking as a priority are confirmed. Speed Math leaderboards are also confirmed: all-time rankings, separate operation/duration categories, full-duration eligibility, one best result per student per category, most correct answers followed by fewest incorrect answers, and shared ranks for equal results. Next, resolve supported enrollment ages, exact vocabulary retry weighting, leaderboard visibility, round-resume behavior, and data deletion/retention policy. Student-owned information and server-controlled fields such as active state must have explicit editing permissions.

The roster and game-history migrations, derived progress/ranking views, and development-only fictitious seed are implemented as the limited database steps described above. After the remaining decisions, approve the next concrete fields, constraints, relationships, and migration scope; add and validate those migrations against the isolated test database, then connect the website one feature at a time. Auth linkage must add the unique auth-user relationship and require date of birth/gender for linked profiles in coordination with invitation acceptance. Do not create login-capable mock credentials or seed production automatically.
