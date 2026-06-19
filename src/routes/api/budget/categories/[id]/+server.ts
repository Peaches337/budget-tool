import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

async function requireOwnership(userId: string, categoryId: string) {
  return queryOne(
    'SELECT id FROM budget_categories WHERE id = $1 AND user_id = $2',
    [categoryId, userId]
  );
}

export const PATCH: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = event.params;
  if (!await requireOwnership(user.id, id)) {
    return json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  const body = await event.request.json();
  const allowed = ['name', 'color', 'visibility', 'sort_order', 'is_income'];
  const fields = Object.keys(body).filter(k => allowed.includes(k));

  if (fields.length === 0) {
    return json({ ok: false, error: 'No valid fields to update' }, { status: 400 });
  }

  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => body[f]);

  const row = await queryOne<{ id: string; name: string; color: string }>(
    `UPDATE budget_categories SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...values]
  );

  await auditLog(event, 'category_updated', { entity: 'budget_category', entity_id: id, details: { name: body.name, color: body.color } });
  return json({ ok: true, data: row });
};

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = event.params;
  if (!await requireOwnership(user.id, id)) {
    return json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  await query('DELETE FROM budget_categories WHERE id = $1', [id]);
  await auditLog(event, 'category_deleted', { entity: 'budget_category', entity_id: id, details: { category_id: id } });
  return json({ ok: true, data: null });
};
