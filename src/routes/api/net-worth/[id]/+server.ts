import { json } from '@sveltejs/kit';
import { query, queryOne } from '$lib/server/db.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function PATCH({ locals, params, request }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const patch = await request.json();
  const allowed = ['label', 'institution', 'amount', 'category', 'visibility'];
  const sets: string[] = [];
  const vals: unknown[] = [];

  for (const key of allowed) {
    if (key in patch) {
      vals.push(patch[key]);
      sets.push(`${key} = $${vals.length}`);
    }
  }
  if (!sets.length) return json({ ok: false, error: 'Nothing to update' }, { status: 400 });

  vals.push(new Date().toISOString(), params.id, locals.user.id);
  const row = await queryOne(
    `UPDATE net_worth_entries SET ${sets.join(', ')}, last_updated = $${vals.length - 2}
     WHERE id = $${vals.length - 1} AND user_id = $${vals.length}
     RETURNING id, entry_type, category, label, institution, amount, visibility, last_updated`,
    vals
  );
  if (!row) return json({ ok: false, error: 'Not found' }, { status: 404 });
  return json({ ok: true, data: row });
}

export async function DELETE({ locals, params }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  await query(
    'DELETE FROM net_worth_entries WHERE id = $1 AND user_id = $2',
    [params.id, locals.user.id]
  );
  return json({ ok: true });
}
