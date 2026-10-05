import { createAuthClient } from 'better-auth/svelte';

// Same-origin HTTP calls go through Better Auth's rate limiter; server auth.api calls do not.
export const authClient = createAuthClient();
