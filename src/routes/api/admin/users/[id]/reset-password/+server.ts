import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';
import bcrypt from 'bcrypt';

export const POST: RequestHandler = async (event) => {
  if (!event.locals.user?.is_admin) return json({ ok: false }, { status: 403 });

  const { id } = event.params;
  const body = await event.request.json().catch(() => ({}));

  // Accept a supplied password or generate a random one
  const newPassword: string = body.password?.trim()
    || Array.from({ length: 3 }, () =>
        ['correct','horse','battery','staple','cloud','flame','river','stone','spark','lunar'][Math.floor(Math.random()*10)]
      ).join('-') + '-' + Math.floor(Math.random() * 100);

  const hash = await bcrypt.hash(newPassword, 12);

  const user = await queryOne<{ id: string; username: string }>(
    'UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id, username',
    [hash, id]
  );

  if (!user) return json({ ok: false, error: 'User not found' }, { status: 404 });

  await auditLog(event, 'password_reset', {
    entity: 'user',
    entity_id: id,
    details: { username: user.username, reset_by: event.locals.user.username }
  });

  return json({ ok: true, data: { password: newPassword, username: user.username } });
};
