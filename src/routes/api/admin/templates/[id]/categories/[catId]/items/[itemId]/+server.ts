import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';

export const PUT: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { itemId } = event.params;
  const body = await event.request.json();

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (body.label !== undefined)       { fields.push(`label = $${idx++}`);       values.push(body.label); }
  if (body.frequency !== undefined)   { fields.push(`frequency = $${idx++}`);   values.push(body.frequency); }
  if (body.taxable !== undefined)     { fields.push(`taxable = $${idx++}`);     values.push(body.taxable); }
  if (body.service_key !== undefined) { fields.push(`service_key = $${idx++}`); values.push(body.service_key || null); }

  if (fields.length === 0) return json({ ok: false, error: 'Nothing to update' }, { status: 400 });

  values.push(itemId);
  const row = await queryOne(
    `UPDATE template_items SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (!row) return json({ ok: false, error: 'Not found' }, { status: 404 });
  return json({ ok: true, data: row });
};

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { itemId } = event.params;
  await query('DELETE FROM template_items WHERE id = $1', [itemId]);
  return json({ ok: true });
};
