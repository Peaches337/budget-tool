import { json } from '@sveltejs/kit';
import { queryOne } from '$lib/server/db.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function DELETE({ locals, params }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const row = await queryOne(
    `DELETE FROM net_worth_snapshots WHERE id = $1 AND user_id = $2 RETURNING id`,
    [params.id, locals.user.id]
  );
  if (!row) return json({ ok: false, error: 'Not found' }, { status: 404 });

  return json({ ok: true });
}
