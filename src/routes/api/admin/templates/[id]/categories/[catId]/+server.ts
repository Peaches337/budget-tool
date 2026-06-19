import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';

export const PUT: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { catId } = event.params;
  const body = await event.request.json();

  const row = await queryOne(
    `UPDATE template_categories
     SET name       = COALESCE($1, name),
         color      = COALESCE($2, color),
         is_income  = COALESCE($3, is_income),
         sort_order = COALESCE($4, sort_order)
     WHERE id = $5
     RETURNING *`,
    [body.name ?? null, body.color ?? null, body.is_income ?? null, body.sort_order ?? null, catId]
  );

  if (!row) return json({ ok: false, error: 'Not found' }, { status: 404 });
  return json({ ok: true, data: row });
};

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { catId } = event.params;
  await query('DELETE FROM template_categories WHERE id = $1', [catId]);
  return json({ ok: true });
};
