import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queryOne } from '$lib/server/db.js';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { catId } = event.params;
  const { label, frequency, taxable, service_key } = await event.request.json();

  const row = await queryOne(
    `INSERT INTO template_items (category_id, label, frequency, taxable, service_key)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [catId, label ?? 'New item', frequency ?? 'monthly', taxable ?? 'taxfree', service_key ?? null]
  );

  return json({ ok: true, data: row }, { status: 201 });
};
