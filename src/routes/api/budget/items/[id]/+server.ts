import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

async function requireOwnership(userId: string, itemId: string) {
  return queryOne(
    'SELECT id FROM budget_items WHERE id = $1 AND user_id = $2',
    [itemId, userId]
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
  const allowed = ['label', 'amount', 'frequency', 'taxable', 'tax_treatment', 'sort_order'];
  const fields = Object.keys(body).filter(k => allowed.includes(k));

  if (fields.length === 0) {
    return json({ ok: false, error: 'No valid fields to update' }, { status: 400 });
  }

  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => body[f]);

  const row = await queryOne(
    `UPDATE budget_items SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...values]
  );

  await auditLog(event, 'item_updated', { entity: 'budget_item', entity_id: id, details: { label: body.label, amount: body.amount, frequency: body.frequency } });
  return json({ ok: true, data: row });
};

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = event.params;
  if (!await requireOwnership(user.id, id)) {
    return json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  await query('DELETE FROM budget_items WHERE id = $1', [id]);
  await auditLog(event, 'item_deleted', { entity: 'budget_item', entity_id: id, details: { item_id: id } });
  return json({ ok: true, data: null });
};
