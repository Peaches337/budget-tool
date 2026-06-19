import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  if (!event.locals.user?.is_admin) {
    return json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const users = await query(
    `SELECT u.id, u.username, u.email, u.is_admin, u.created_at,
       COUNT(DISTINCT hm.household_id)::int as household_count
     FROM users u
     LEFT JOIN household_members hm ON hm.user_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at`
  );

  return json({ ok: true, data: users });
};
