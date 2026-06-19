import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';
import bcrypt from 'bcrypt';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const body = await event.request.json().catch(() => ({}));
  const { current_password, new_password } = body;

  if (!current_password || !new_password) {
    return json({ ok: false, error: 'current_password and new_password are required' }, { status: 400 });
  }

  if (new_password.length < 8) {
    return json({ ok: false, error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  const row = await queryOne<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id=$1',
    [user.id]
  );

  if (!row) return json({ ok: false, error: 'User not found' }, { status: 404 });

  const valid = await bcrypt.compare(current_password, row.password_hash);
  if (!valid) return json({ ok: false, error: 'Current password is incorrect' }, { status: 400 });

  const hash = await bcrypt.hash(new_password, 12);
  await queryOne('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, user.id]);

  await auditLog(event, 'password_changed', {
    entity: 'user',
    entity_id: user.id,
    details: { username: user.username }
  });

  return json({ ok: true });
};
