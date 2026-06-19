import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { username } = await event.request.json().catch(() => ({}));

  if (!username?.trim()) return json({ ok: false, error: 'Username is required' }, { status: 400 });
  if (username.trim().length < 2) return json({ ok: false, error: 'Username must be at least 2 characters' }, { status: 400 });
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(username.trim())) {
    return json({ ok: false, error: 'Username can only contain letters, numbers, spaces, _ - .' }, { status: 400 });
  }

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE LOWER(username)=LOWER($1) AND id != $2',
    [username.trim(), user.id]
  );
  if (existing) return json({ ok: false, error: 'That username is already taken' }, { status: 409 });

  const old = user.username;
  await query('UPDATE users SET username=$1 WHERE id=$2', [username.trim(), user.id]);

  await auditLog(event, 'username_changed', {
    entity: 'user',
    entity_id: user.id,
    details: { from: old, to: username.trim() }
  });

  return json({ ok: true, data: { username: username.trim() } });
};
