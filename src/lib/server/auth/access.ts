import { redirect } from '@sveltejs/kit';

type AuthLocals = Pick<App.Locals, 'user' | 'session'>;

// Expose identity, not Better Auth's session token or account/credential records.
export function getViewer({ user, session }: AuthLocals) {
	if (!user || !session || session.userId !== user.id) return null;
	return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function getAdminPageState(locals: AuthLocals) {
	const viewer = getViewer(locals);
	if (viewer && viewer.role !== 'admin') redirect(303, '/');
	return { isAdmin: viewer?.role === 'admin' };
}
