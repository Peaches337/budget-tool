import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';

// Seeds a user's budget from a template. Called once after registration.
export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { template_id } = await event.request.json();

  // Prevent double-seeding
  const existing = await queryOne(
    'SELECT id FROM budget_categories WHERE user_id = $1 LIMIT 1',
    [user.id]
  );
  if (existing) {
    return json({ ok: false, error: 'Budget already seeded' }, { status: 409 });
  }

  const tid = template_id ?? '00000000-0000-0000-0000-000000000001';

  const categories = await query<{
    id: string; name: string; color: string; is_income: boolean; sort_order: number; canonical_key: string | null;
  }>(
    `SELECT id, name, color, is_income, sort_order, canonical_key
     FROM template_categories WHERE template_id = $1 ORDER BY sort_order`,
    [tid]
  );

  for (const cat of categories) {
    const newCat = await queryOne<{ id: string }>(
      `INSERT INTO budget_categories (user_id, name, color, is_income, sort_order, visibility, canonical_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [user.id, cat.name, cat.color, cat.is_income, cat.sort_order, 'private', cat.canonical_key ?? null]
    );

    const items = await query<{
      label: string; frequency: string; taxable: string; service_key: string | null;
    }>(
      `SELECT label, frequency, taxable, service_key FROM template_items
       WHERE category_id = $1`,
      [cat.id]
    );

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await query(
        `INSERT INTO budget_items (category_id, user_id, label, amount, frequency, taxable, sort_order, service_key)
         VALUES ($1, $2, $3, 0, $4, $5, $6, $7)`,
        [newCat!.id, user.id, item.label, item.frequency, item.taxable, i, item.service_key ?? null]
      );
    }
  }

  return json({ ok: true, data: { seeded: categories.length } }, { status: 201 });
};
