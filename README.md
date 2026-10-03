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
  lib/                  Shared code and assets, imported through #lib
    assets/             Assets processed by Vite
    components/         Shared dashboard header and sidebar
  routes/
    +layout.svelte      Dashboard shell shared by all pages
    +page.svelte        Dashboard home placeholder
static/                 Files served without processing
vite.config.ts          Vite, SvelteKit, and deployment adapter configuration
tsconfig.json           Strict TypeScript configuration
```

The dashboard shell has a full-width header, a left sidebar, and a main content area that renders the active route. Navigation stacks above the content on narrow screens. Company branding and student information are placeholders; no feature pages or data integrations are implemented yet.

SvelteKit supports server-side TypeScript in route files such as `+page.server.ts` (page data and form actions) and `+server.ts` (HTTP endpoints). Add these as features need them; a separate backend is not required.

## Validation

```sh
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
