import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPassword, createSession, setSessionCookie } from '$lib/server/auth.js';
import { queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const POST: RequestHandler = async (event) => {
  const { username, password } = await event.request.json();

  if (!username || !password) {
    return json({ ok: false, error: 'Username and password are required' }, { status: 400 });
  }

  const user = await queryOne<{
    id: string; username: string; email: string;
    password_hash: string; is_admin: boolean; wizard_completed: boolean;
  }>(
    'SELECT id, username, email, password_hash, is_admin, wizard_completed FROM users WHERE username = $1',
    [username.trim().toLowerCase()]
  );

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ ok: false, error: 'Invalid username or password' }, { status: 401 });
  }

  const session = await createSession(user.id);
  setSessionCookie(event, session.id);

  event.locals.user = { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin, created_at: new Date().toISOString(), wizard_completed: user.wizard_completed };
  await auditLog(event, 'login', { entity: 'user', entity_id: user.id, details: { username: user.username } });

  return json({
    ok: true,
    data: { id: user.id, username: user.username, isAdmin: user.is_admin }
  });
};
