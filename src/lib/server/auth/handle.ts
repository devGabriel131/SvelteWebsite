import type { Handle } from '@sveltejs/kit/hooks';
import { getSessionCookie } from 'better-auth/cookies';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { AUTH_IP_HEADER, type Auth } from './core';
import type { AuthAudience } from './credentials';

export function createAuthHandle(getAuth: (audience: AuthAudience) => Auth | null, building: boolean): Handle {
	return async ({ event, resolve }) => {
		event.locals.user = null;
		event.locals.session = null;

		const isAdminAuthRequest = event.url.pathname === '/admin/auth' || event.url.pathname.startsWith('/admin/auth/');
		const isAuthRequest = isAdminAuthRequest || event.url.pathname === '/api/auth' || event.url.pathname.startsWith('/api/auth/');
		// Public pages and prerendering must not initialize auth or require PostgreSQL.
		if (building || (!isAuthRequest && !getSessionCookie(event.request))) return resolve(event);

		const auth = getAuth(isAdminAuthRequest ? 'admin' : 'student');
		if (!auth) {
			if (!isAuthRequest) return resolve(event);
			return Response.json({ code: 'AUTH_NOT_CONFIGURED' }, {
				status: 503,
				headers: { 'cache-control': 'no-store' }
			});
		}

		if (isAuthRequest) {
			// The official handler only mounts on its configured origin. Reject mismatches explicitly.
			if (event.url.origin !== auth.options.baseURL) return new Response(null, { status: 404 });
			const headers = new Headers(event.request.headers);
			// Never let a browser choose its limiter bucket via forwarded IP headers.
			headers.set(AUTH_IP_HEADER, event.getClientAddress());
			return svelteKitHandler({
				event: { ...event, request: new Request(event.request, { headers }) },
				resolve,
				auth,
				building
			});
		}

		const { response: currentSession, headers: sessionHeaders } = await auth.api.getSession({
			headers: event.request.headers,
			returnHeaders: true
		});
		event.locals.user = currentSession?.user ?? null;
		event.locals.session = currentSession?.session ?? null;

		const response = await resolve(event);
		const headers = new Headers(response.headers);
		// Preserve Better Auth's rolling expiry and invalid-cookie cleanup on server-rendered pages.
		for (const cookie of sessionHeaders.getSetCookie()) headers.append('set-cookie', cookie);
		headers.set('cache-control', 'private, no-store');
		return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
	};
}
