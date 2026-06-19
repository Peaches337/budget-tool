import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queryOne } from '$lib/server/db.js';

export const PATCH: RequestHandler = async (event) => {
  if (!event.locals.user?.is_admin) {
    return json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { id } = event.params;
  const { is_admin } = await event.request.json();

  // Prevent self-demotion
  if (id === event.locals.user.id && is_admin === false) {
    return json({ ok: false, error: "You can't remove your own admin privileges" }, { status: 400 });
  }

  const row = await queryOne(
    'UPDATE users SET is_admin = $1 WHERE id = $2 RETURNING id, username, is_admin',
    [is_admin, id]
  );

  if (!row) return json({ ok: false, error: 'User not found' }, { status: 404 });
  return json({ ok: true, data: row });
};
