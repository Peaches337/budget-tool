import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';

export const POST: RequestHandler = async (event) => {
  if (!event.locals.user?.is_admin) {
    return json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { user_id, household_id } = await event.request.json();

  if (!user_id || !household_id) {
    return json({ ok: false, error: 'user_id and household_id required' }, { status: 400 });
  }

  const existing = await queryOne(
    'SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2',
    [household_id, user_id]
  );
  if (existing) {
    return json({ ok: false, error: 'User is already a member of this household' }, { status: 409 });
  }

  await query(
    `INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'member')`,
    [household_id, user_id]
  );

  return json({ ok: true, data: null }, { status: 201 });
};
