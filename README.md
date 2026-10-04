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

## Project structure

```text
src/
  app.html              HTML document template
  app.d.ts              Application-wide type declarations
  app.css               Global styles and color tokens
  hooks.server.ts       Request-scoped language and HTML document language
  lib/                  Shared code and assets, imported through #lib
    assets/             Assets processed by Vite
    components/         Shared dashboard shell and IST form/report components
    frequency/          Bundled word list, fuzzy Spanish search, and practice-round logic
    i18n/               English/Spanish translations and reactive language context
    ist/                IST types, shared input validation, pure assessment, and presentation
    server/             Server-only PDFKit report generation
    speed-math/         Pure question generation, session timing, scoring, and statistics
  routes/
    +layout.server.ts   Saved language preference for the shared layout
    +layout.svelte      Dashboard shell shared by all pages
    +page.svelte        Dashboard home with IST and Speed Math entry points
    frequency/          English-first frequency flashcard page
    ist/                IST page and server form action
    speed-math/         Timed arithmetic practice page
static/                 Files served without processing
tests/                  Bun translation, vocabulary/practice, IST, and Speed Math tests
vite.config.ts          Vite, SvelteKit, and deployment adapter configuration
tsconfig.json           Strict TypeScript configuration
```

The dashboard shell has a full-width header, a left sidebar, and a main content area that renders the active route. Navigation stacks above the content on narrow screens. The header pairs the Masterminds logo with its wordmark in one home link. `static/logo.png` has a transparent outer background and was converted from the preserved original `static/logo.jpg`. Student information in the header remains a placeholder; authentication is not implemented. The IST and Speed Math features are accessible from the sidebar and dashboard home.

SvelteKit supports server-side TypeScript in route files such as `+page.server.ts` (page data and form actions) and `+server.ts` (HTTP endpoints). Add these as features need them; a separate backend is not required.

## Initial Strength Test (IST)

Open `/ist` to enter the student's name, sex baseline, age, weight in pounds, waist circumference in inches, push-ups, sit-ups, plank, and one-mile run. Timed exercises use separate whole minutes and seconds. Every exercise requires a recorded result or an explicit unable-to-complete status; zero repetitions are valid, but a recorded zero duration is not.

The shared validator runs in the browser and server. It preserves decimal measurements, rejects blank/malformed/out-of-range inputs and inconsistent exercise states, and blocks raw body-fat estimates outside 0–100% before rounding. Pure assessment functions apply the user-approved Army-based **program baseline**, including the female run thresholds of 585 and 630 seconds. All five categories must pass; there is no combined score or compensation between categories. Reference maxima are not input caps, and the arithmetic midpoint is not a population average.

A successful server submission evaluates the inputs once and creates English and Spanish PDFKit reports from that same result. The on-screen report and downloads share the presentation model. Grades use text as well as color. PDFs feature the Masterminds logo from `static/logo.png`, grouped student details, an upfront readiness summary, and five result cards with textual grade badges, outcomes, and applicable thresholds. Typical reports fit on one Letter page; extended content wraps and paginates with repeated branding and result-column headers. Built-in Helvetica fonts support precomposed Spanish accents. Vite embeds the logo in the server bundle, so generation needs no network requests or deployment-specific filesystem paths. The page works with standard server form submissions when JavaScript is unavailable: exercise choices submit a form update that preserves other entries and clears the exercise’s previous values when inability is chosen, without generating an assessment. Result fields stay disabled until a recorded result is selected. Enhanced submissions add immediate validation and focus handling.

Names are entered manually until authentication is added. Fitness results are not stored in a database, browser storage, or cookies. Assessment responses are marked `Cache-Control: no-store`; PDFs are returned with the assessment and downloaded directly from the page. Results are self-reported, not official military clearance or a medical evaluation.

## English frequency deck

Open `/frequency` from the sidebar to practice the supplied 1,001 English–Spanish pairs. The full list is bundled in `src/lib/frequency/words.json`; there is no runtime CSV upload or external vocabulary request. Every source row, spelling, translation, and frequency position is preserved. To revise the list, edit the JSON and update the source-integrity tests in `tests/frequency.test.ts`.

Cards always show English first, regardless of the website language. The translated interface offers 25-card decks in frequency order (the last deck has one card). Type in Spanish to search the entire answer pool, then tap a suggestion, use arrow keys and Enter, or choose “I don’t know” to reveal the translation. Search tolerates accents, case, and small typos; grading compares the selected option with the stored translation rather than grading a fuzzy query. Duplicate answer suggestions are collapsed without removing English cards.

Each round shows progress and correct/review counts. At the end, students can review missed or skipped cards, repeat the deck, or move to the next one. Round state is kept only in memory for the current visit; reloading, navigating away, or changing decks starts fresh. JavaScript is required for this interactive feature. The supplied list includes questionable/context-dependent translations and strong language; it should be reviewed before treating it as authoritative teaching material.

## Speed Math

Open `/speed-math` from the sidebar or dashboard to choose a 5-, 10-, or 15-minute challenge and one operation: addition, subtraction, multiplication, or division. Addition and subtraction use numbers from 0 to 50; subtraction answers are nonnegative. Multiplication uses factors from 1 to 12, and division uses those tables with exact whole-number answers and no zero divisors. Consecutive questions do not repeat.

Type a whole-number answer and press Enter or select Answer. Each valid submission is graded once and immediately advances to the next question, with feedback showing the previous correct answer. Invalid input does not consume a question or affect the score. The practice screen shows time remaining, correct and incorrect counts, and accuracy. When time expires (or the student ends the session early), results also show total questions answered, correct answers per minute, and elapsed practice time. Try again uses the same settings; Change settings returns to setup.

The browser timer reconciles against an absolute deadline, including after switching tabs, and answers at or after the deadline cannot score. All interface text, feedback, accessibility labels, and metadata support English and Spanish. JavaScript is required for this interactive feature. Questions and scores remain in memory only; leaving or reloading the page clears the session. No new dependencies or backend storage are used. The pure game logic lives in `src/lib/speed-math/game.ts` and is covered by Bun tests.

## Brand styling

The dark theme uses the original charcoal background (`#11151C`) and surfaces (`#191F28`). Sage (`#B7C690`) is the primary accent; Slate (`#7B949C`) is the secondary accent for supporting labels, icons, and subtle borders. Cream (`#FFF5D9`) is reserved for text, with a softer variant for secondary copy. Navy, Deep Slate, and Deep Ink are not used.

Color and typography tokens live in `src/app.css`. Syncopate 700 is used for display text; Space Grotesk 500 and 700 are used for body text and UI. The Latin font files from the supplied reference are served locally from `src/lib/assets/fonts`, without runtime requests to a font provider.

## Languages

The header's sliding selector switches the interface between 🇺🇸 English and 🇵🇷 Español without reloading or changing the URL. English is the default. A `language` cookie remembers the choice for one year; the server uses it to render the saved language on the first response, including the document's `lang` attribute. This preference cookie is readable by the client and contains only `en` or `es`, not sensitive data.

Translations live in `src/lib/i18n/translations.ts`. Add new interface text to both language dictionaries; TypeScript checks that Spanish matches the English message structure. Components call `useLanguage()` from `#lib/i18n/language.svelte.ts` and read `language.messages` reactively. Avoid destructuring messages into a nonreactive local value. Product names and user-provided content are not translated.

The root layout provides language context per component tree, not through a shared server store. Page titles, descriptions, navigation, accessibility labels, and the skip link use the selected language. The selector uses native radio buttons for keyboard support and respects reduced-motion preferences.

## Validation

```sh
bun run test
bun run check
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
