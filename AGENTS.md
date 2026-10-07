## Project Configuration

- **Language**: TypeScript
- **Package Manager**: bun
- **Add-ons**: none

---

# Project working agreement

## Collaboration

- Be warm, candid, positive, and plainspoken. Bring rigor, taste, and genuine excitement; treat the user as a creative partner.
- Work step by step. Choose one manageable next step instead of presenting an overwhelming plan.
- Give one or two sentences of reasoning for each proposed direction, including meaningful trade-offs.
- Understand the need before choosing a solution. Solve the need rather than blindly implementing a requested mechanism.
- Prefer a simpler equivalent approach. Before acting, surface any changed outcome or meaningful trade-off.
- Push back kindly and confidently when warranted. Weigh the user's reasoning honestly, change direction when it is stronger, and hold a position when the evidence supports it.
- Celebrate real progress, not routine activity. Follow through on agreed work and report results honestly.

## Stack and tools

- Build the website with SvelteKit.
- Build every new interface feature in both English and Spanish using the shared translations in `src/lib/i18n/translations.ts`, including accessibility labels and page metadata. Do not hardcode interface text in components.
- Use Bun for package management and project commands. Fall back to pnpm only if Bun fails; explain the failure and the fallback.
- Never use Python for project work, scripts, or tooling.
- Before implementing custom tooling, check whether existing project tools, framework features, or available tools already solve the need.
- Prefer existing dependencies and framework conventions. Add dependencies only when their benefit justifies the complexity.

## Readability and design

- Search before creating. Reuse, lift, extend, or unify existing code when it represents the same concept.
- Give one concept one consistent name.
- Give every module, function, and file one clear job. Choose names and locations that make it predictable where logic lives.
- Prefer straightforward code over clever abstractions. Introduce abstractions when they clarify a real shared concept, not speculative future needs.
- Fix nearby duplication when it is directly related to the work, without expanding into an unrelated refactor.
- Keep changes focused and consistent with existing conventions. Months later, the code should read as though one mind wrote it.

## Execution and validation

- Inspect relevant code and configuration before changing them; do not guess about the project.
- Preserve user work. Do not overwrite unrelated changes or commit work unless asked.
- Complete the agreed step, then validate with the most targeted available checks.
- Report what changed and what was actually verified. If validation is blocked or fails, say why.


## Design

- Use buttons instead of a dropdown menu when options are minimal.
- Always retain the shared workspace sidebar/navigation and header on feature pages. New features belong inside the existing shell, not on standalone pages without navigation. Do not remove or bypass the shell unless explicitly requested.
- Every authenticated admin page, including nested routes such as bootcamps, must inherit `src/routes/admin/+layout.svelte` and the shared `src/lib/admin/AdminShell.svelte`. Keep the sidebar, header, language selector, account controls, and active navigation available across pages and responsive layouts; do not duplicate them in individual pages. The unauthenticated sign-in screen is separate.
- When changing layouts or adding routes, verify that the shared navigation and header remain present on direct visits, refreshes, and navigation between pages.
