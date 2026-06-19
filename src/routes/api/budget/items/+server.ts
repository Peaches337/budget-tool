import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { category_id, label, amount, frequency, taxable } = await event.request.json();

  // Verify category belongs to user
  const cat = await queryOne(
    'SELECT id FROM budget_categories WHERE id = $1 AND user_id = $2',
    [category_id, user.id]
  );
  if (!cat) return json({ ok: false, error: 'Category not found' }, { status: 404 });

  const maxOrder = await queryOne<{ max: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) as max FROM budget_items WHERE category_id = $1',
    [category_id]
  );

  const row = await queryOne(
    `INSERT INTO budget_items (category_id, user_id, label, amount, frequency, taxable, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      category_id, user.id,
      label ?? 'New item',
      amount ?? 0,
      frequency ?? 'monthly',
      taxable ?? 'taxfree',
      (maxOrder?.max ?? -1) + 1
    ]
  );

  await auditLog(event, 'item_created', { entity: 'budget_item', entity_id: (row as any)?.id, details: { label: label ?? 'New item', amount: amount ?? 0, frequency: frequency ?? 'monthly', category_id } });
  return json({ ok: true, data: row }, { status: 201 });
};
