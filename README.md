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
    i18n/               English/Spanish translations and reactive language context
    ist/                IST types, shared input validation, pure assessment, and presentation
    server/             Server-only PDFKit report generation
  routes/
    +layout.server.ts   Saved language preference for the shared layout
    +layout.svelte      Dashboard shell shared by all pages
    +page.svelte        Dashboard home with an IST entry point
    ist/                IST page and server form action
static/                 Files served without processing
tests/                  Bun translation, IST validation, assessment, and report tests
vite.config.ts          Vite, SvelteKit, and deployment adapter configuration
tsconfig.json           Strict TypeScript configuration
```

The dashboard shell has a full-width header, a left sidebar, and a main content area that renders the active route. Navigation stacks above the content on narrow screens. The header pairs the Masterminds logo with its wordmark in one home link. `static/logo.png` has a transparent outer background and was converted from the preserved original `static/logo.jpg`. Student information in the header remains a placeholder; authentication is not implemented. The IST feature is accessible from the sidebar and dashboard home.

SvelteKit supports server-side TypeScript in route files such as `+page.server.ts` (page data and form actions) and `+server.ts` (HTTP endpoints). Add these as features need them; a separate backend is not required.

## Initial Strength Test (IST)

Open `/ist` to enter the student's name, sex baseline, age, weight in pounds, waist circumference in inches, push-ups, sit-ups, plank, and one-mile run. Timed exercises use separate whole minutes and seconds. Every exercise requires a recorded result or an explicit unable-to-complete status; zero repetitions are valid, but a recorded zero duration is not.

The shared validator runs in the browser and server. It preserves decimal measurements, rejects blank/malformed/out-of-range inputs and inconsistent exercise states, and blocks raw body-fat estimates outside 0–100% before rounding. Pure assessment functions apply the user-approved Army-based **program baseline**, including the female run thresholds of 585 and 630 seconds. All five categories must pass; there is no combined score or compensation between categories. Reference maxima are not input caps, and the arithmetic midpoint is not a population average.

A successful server submission evaluates the inputs once and creates English and Spanish PDFKit reports from that same result. The on-screen report and downloads share the presentation model. Grades use text as well as color. PDFs use built-in Helvetica fonts for Spanish accents, wrap long content, and repeat table headers over multiple pages. The page works with standard server form submissions when JavaScript is unavailable: exercise choices submit a form update that preserves other entries and clears the exercise’s previous values when inability is chosen, without generating an assessment. Result fields stay disabled until a recorded result is selected. Enhanced submissions add immediate validation and focus handling.

Names are entered manually until authentication is added. Fitness results are not stored in a database, browser storage, or cookies. Assessment responses are marked `Cache-Control: no-store`; PDFs are returned with the assessment and downloaded directly from the page. Results are self-reported, not official military clearance or a medical evaluation.

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
