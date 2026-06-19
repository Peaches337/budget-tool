import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { id } = event.params;
  const { name, color, is_income, sort_order } = await event.request.json();

  if (!name?.trim() || !color) return json({ ok: false, error: 'name and color required' }, { status: 400 });

  const row = await queryOne(
    `INSERT INTO template_categories (template_id, name, color, is_income, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, name.trim(), color, is_income ?? false, sort_order ?? 0]
  );

  return json({ ok: true, data: row }, { status: 201 });
};
