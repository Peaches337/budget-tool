import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const households = await query(
    `SELECT h.*,
       json_agg(json_build_object(
         'user_id', hm.user_id,
         'username', u.username,
         'role', hm.role,
         'joined_at', hm.joined_at
       ) ORDER BY hm.joined_at) as members
     FROM households h
     JOIN household_members hm ON hm.household_id = h.id
     JOIN users u ON u.id = hm.user_id
     WHERE h.id IN (
       SELECT household_id FROM household_members WHERE user_id = $1
     )
     GROUP BY h.id
     ORDER BY h.created_at`,
    [user.id]
  );

  return json({ ok: true, data: households });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { name } = await event.request.json();
  if (!name?.trim()) {
    return json({ ok: false, error: 'Household name is required' }, { status: 400 });
  }

  const household = await queryOne<{ id: string }>(
    `INSERT INTO households (name, created_by) VALUES ($1, $2) RETURNING id`,
    [name.trim(), user.id]
  );

  // Creator is automatically the owner
  await query(
    `INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [household!.id, user.id]
  );

  return json({ ok: true, data: { id: household!.id, name: name.trim() } }, { status: 201 });
};
