import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function DELETE({ locals, params }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  await query(
    'DELETE FROM income_actuals WHERE id = $1 AND user_id = $2',
    [params.actualId, locals.user.id]
  );
  return json({ ok: true });
}
