import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import { translations } from '../src/lib/i18n/translations';

// These source/compile checks cover the UI contract without mocking auth or requiring a database.
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const form = source('lib/components/SignInForm.svelte');
const signOut = source('lib/components/SignOutButton.svelte');
const header = source('lib/components/DashboardHeader.svelte');
const sidebar = source('lib/components/DashboardSidebar.svelte');
const admin = source('routes/admin/+page.svelte');
const login = source('routes/login/+page.svelte');

function block(text: string, start: string, end: string): string {
	const startIndex = text.indexOf(start);
	expect(startIndex).toBeGreaterThanOrEqual(0);
	const endIndex = text.indexOf(end, startIndex + start.length);
	expect(endIndex).toBeGreaterThan(startIndex);
	return text.slice(startIndex, endIndex);
}

describe('auth UI compilation', () => {
	for (const [filename, text] of Object.entries({
		'SignInForm.svelte': form,
		'SignOutButton.svelte': signOut,
		'DashboardHeader.svelte': header,
		'DashboardSidebar.svelte': sidebar,
		'admin/+page.svelte': admin,
		'login/+page.svelte': login
	})) {
		test(`${filename} compiles without accessibility or other Svelte warnings`, () => {
			for (const generate of ['server', 'client'] as const) {
				expect(compile(text, { filename, generate, runes: true }).warnings).toEqual([]);
			}
		});
	}
});

describe('credential form contract', () => {
	test('uses distinct same-origin clients and sends only email and the unchanged credential', () => {
		const clients = source('lib/auth-client.ts');
		expect(clients).toContain('export const authClient = createAuthClient();');
		expect(clients).toMatch(/export const adminAuthClient = createAuthClient\(\{ basePath: '\/admin\/auth' \}\)/);
		expect(form).toContain("audience === 'admin' ? adminAuthClient : authClient");
		expect(form).toContain('client.signIn.email({ email: email.trim(), password })');
		expect(form).not.toMatch(/\brole\s*:|auth\.api|#lib\/server|localStorage|sessionStorage|document\.cookie/);
	});

	test('preserves leading zeros and constrains student PINs to exactly four ASCII digits', () => {
		const input = block(form, '<input id={`${id}-password`}', '/>');
		expect(input).toContain('type="password"');
		expect(input).toContain('bind:value={password}');
		expect(input).toContain("inputmode={audience === 'student' ? 'numeric' : undefined}");
		expect(input).toContain("pattern={audience === 'student' ? '[0-9]{4}' : undefined}");
		expect(input).toContain("minlength={audience === 'student' ? 4 : 8}");
		expect(input).toContain("maxlength={audience === 'student' ? 4 : 128}");
		expect(form).toContain("let password = $state('')");
		expect(form).not.toMatch(/Number\(password\)|parseInt\(password|password\.trim\(/);
		const pattern = form.match(/!\/(.*?)\/\.test\(password\)/)?.[1];
		expect(pattern).toBeDefined();
		const pin = new RegExp(pattern!);
		for (const value of ['0000', '0007', '1234', '9999']) expect(pin.test(value)).toBe(true);
		for (const value of ['123', '12345', '12a4', '１２３４', '١٢٣٤', ' 1234', '1234 ', '1e03']) {
			expect(pin.test(value)).toBe(false);
		}
	});

	test('uses current-password autocomplete and no admin composition rule', () => {
		expect(form).toContain('autocomplete="current-password"');
		expect(form).toContain('password.length < 8 || password.length > 128');
		expect(form).toContain("pattern={audience === 'student' ? '[0-9]{4}' : undefined}");
	});

	test('clears credentials before full navigation and does not retain tokens', () => {
		const success = block(form, "password = '';", '} catch');
		expect(success).toContain("email = '';");
		expect(success).toContain("window.location.assign(resolve(audience === 'admin' ? '/admin' : '/'))");
		expect(form + signOut).not.toMatch(/\bgoto\(|localStorage|sessionStorage|\.token\b/);
		expect(signOut).toContain('await authClient.signOut()');
		expect(signOut).toContain('window.location.assign(resolve(redirectTo))');
	});

	test('maps errors to translated copy instead of rendering raw library messages', () => {
		expect(form).toContain("status === 429 ? 'rateLimited'");
		expect(form).toContain("status >= 500 ? 'unavailable'");
		expect(form).toContain("code === 'INVALID_EMAIL_OR_PASSWORD'");
		expect(block(form, '} catch {', '\n\t}')).toContain("error = 'unavailable'");
		expect(form + signOut).not.toMatch(/result\.error\.message|\{@html/);
		expect(form).toContain('role="alert">{errorMessage}');
	});

	test('labels fields, announces errors, and prevents duplicate or pre-hydration submission', () => {
		expect(form).toContain('label for={`${id}-email`}');
		expect(form).toContain('label for={`${id}-password`}');
		expect(form).toContain('aria-describedby=');
		expect(form).toContain('aria-invalid={credentialError}');
		expect(form).toContain('method="POST"');
		expect(form).toContain('event.preventDefault()');
		expect(form).toContain('if (!ready || pending) return');
		expect(form).toContain('disabled={!ready || pending}');
		expect(form).toContain('<noscript>');
		expect(signOut).toContain('if (pending) return');
		expect(signOut).toContain('disabled={pending}');
	});
});

describe('account navigation contract', () => {
	test('renders the admin sign-in only when the server says the viewer is not an admin', () => {
		const anonymous = block(admin, '{#if !data.isAdmin}', '{:else}');
		expect(anonymous).toContain('<SignInForm audience="admin" />');
		expect(anonymous).toContain('<LanguageSelector />');
		expect(anonymous).toContain("asset('logo.png')");
		expect(anonymous).not.toContain('<AdminOverview');
		expect(header + sidebar + login).not.toContain('audience="admin"');
	});

	test('uses the real admin identity, a student-workspace logo, and sign-out in the mobile-visible header', () => {
		const consoleHeader = block(admin, '<header class="console-header">', '</header>');
		expect(consoleHeader).toContain('{data.viewer.name}');
		expect(consoleHeader).toContain('{data.viewer.email}');
		expect(consoleHeader).toContain('<SignOutButton redirectTo="/admin" />');
		expect(admin).not.toContain('{messages.operator}');
		const rail = block(admin, '<aside class="command-rail">', '</aside>');
		expect(rail).toContain('class="console-brand" href={resolve(\'/\')} aria-label={language.messages.auth.studentWorkspace}');
		expect(admin).not.toMatch(/\.console-header\s*\{[^}]*display:\s*none/);
		expect(signOut).not.toContain('display: none');
	});

	test('shows identity and sign-out for a viewer and only student sign-in for anonymous visitors', () => {
		expect(header).toContain('$derived(page.data.viewer)');
		const authenticated = block(header, '{#if viewer}', '{:else}');
		expect(authenticated).toContain('{viewer.name}');
		expect(authenticated).toContain('{viewer.email}');
		expect(authenticated).toContain('<SignOutButton />');
		expect(block(header, '{:else}', '{/if}')).toContain("href={resolve('/login')}");
		expect(header).not.toContain("resolve('/admin')");
	});

	test('guards the dedicated Back to admin link by role without hiding it on mobile', () => {
		const guarded = block(sidebar, "{#if page.data.viewer?.role === 'admin'}", '{/if}');
		expect(guarded).toContain("href={resolve('/admin')}");
		expect(guarded).toContain('{language.messages.auth.backToAdmin}');
		expect(sidebar.match(/href=\{resolve\('\/admin'\)\}/g)).toHaveLength(1);
		expect(sidebar).not.toContain('display: none');
	});

	test('offers the dashboard instead of another login for either authenticated role', () => {
		const authenticated = block(login, '{#if data.viewer}', '{:else}');
		expect(authenticated).toContain("href={resolve('/')}");
		expect(authenticated).not.toContain('<SignInForm');
		expect(block(login, '{:else}', '{/if}')).toContain('<SignInForm audience="student" />');
		expect(login).not.toContain('.role');
	});

	test('localizes both audiences, metadata, account controls, validation and error copy', () => {
		for (const messages of [translations.en.auth, translations.es.auth]) {
			for (const audience of ['student', 'admin'] as const) {
				for (const text of Object.values(messages[audience])) expect(text.trim()).not.toBe('');
			}
			for (const text of Object.values(messages.errors)) expect(text.trim()).not.toBe('');
			expect(messages.backToAdmin).not.toBe('');
			expect(messages.accountLabel).not.toBe('');
			expect(messages.studentWorkspace).not.toBe('');
			expect(messages.admin.credentialHint).toContain('8–128');
		}
		expect(admin).toContain('language.messages.auth.admin.pageTitle');
		expect(admin).toContain('language.messages.auth.admin.description');
		expect(login).toContain('<title>{messages.student.pageTitle}</title>');
		expect(login).toContain('content={messages.student.description}');
	});
});
