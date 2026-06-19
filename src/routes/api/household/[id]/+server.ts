import { json } from '@sveltejs/kit';
import { queryOne } from '$lib/server/db.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function PATCH({ locals, params, request }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  // Must be owner
  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
    [params.id, locals.user.id]
  );
  if (!membership || membership.role !== 'owner') {
    return json({ ok: false, error: 'Only owners can update household settings' }, { status: 403 });
  }

  const body = await request.json();
  const allowed = ['name', 'include_net_worth'];
  const fields = Object.keys(body).filter(k => allowed.includes(k));
  if (fields.length === 0) return json({ ok: false, error: 'Nothing to update' }, { status: 400 });

  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const row = await queryOne(
    `UPDATE households SET ${sets} WHERE id = $1 RETURNING *`,
    [params.id, ...fields.map(f => body[f])]
  );

  return json({ ok: true, data: row });
}
