import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';

export const PUT: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { id } = event.params;
  const body = await event.request.json();

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (body.tier_name !== undefined) { fields.push(`tier_name = $${idx++}`); values.push(body.tier_name); }
  if (body.amount    !== undefined) { fields.push(`amount = $${idx++}`);    values.push(body.amount); }
  if (body.frequency !== undefined) { fields.push(`frequency = $${idx++}`); values.push(body.frequency); }
  if (body.active    !== undefined) { fields.push(`active = $${idx++}`);    values.push(body.active); }
  if (body.sort_order !== undefined){ fields.push(`sort_order = $${idx++}`);values.push(body.sort_order); }

  if (fields.length === 0) return json({ ok: false, error: 'Nothing to update' }, { status: 400 });

  values.push(id);
  const row = await queryOne(
    `UPDATE subscription_tiers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (!row) return json({ ok: false, error: 'Not found' }, { status: 404 });
  return json({ ok: true, data: row });
};

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { id } = event.params;
  await query('DELETE FROM subscription_tiers WHERE id = $1', [id]);
  return json({ ok: true });
};
