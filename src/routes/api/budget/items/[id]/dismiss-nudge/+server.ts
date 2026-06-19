import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function POST({ locals, params }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const until = new Date();
  until.setDate(until.getDate() + 30);

  await query(
    `UPDATE budget_items SET nudge_dismissed_until = $1
     WHERE id = $2 AND user_id = $3`,
    [until.toISOString(), params.id, locals.user.id]
  );
  return json({ ok: true });
}
