import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queryOne, query } from '$lib/server/db.js';

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

export const DELETE: RequestHandler = async (event) => {
  if (!event.locals.user?.is_admin) {
    return json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { id } = event.params;

  if (id === event.locals.user.id) {
    return json({ ok: false, error: "You can't delete your own account" }, { status: 400 });
  }

  try {
    await query('DELETE FROM users WHERE id = $1', [id]);
  } catch {
    return json({ ok: false, error: 'Failed to delete user' }, { status: 500 });
  }
  return json({ ok: true });
};
