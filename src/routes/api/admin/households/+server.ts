import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  if (!event.locals.user?.is_admin) {
    return json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const households = await query(
    `SELECT h.id, h.name, h.created_at,
       COUNT(hm.user_id)::int as member_count,
       owner.username as owner_username
     FROM households h
     JOIN household_members hm ON hm.household_id = h.id
     JOIN household_members own ON own.household_id = h.id AND own.role = 'owner'
     JOIN users owner ON owner.id = own.user_id
     GROUP BY h.id, owner.username
     ORDER BY h.created_at`
  );

  return json({ ok: true, data: households });
};
