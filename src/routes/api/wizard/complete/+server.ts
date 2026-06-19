import { json } from '@sveltejs/kit';
import { query, queryOne } from '$lib/server/db.js';
import type { RequestEvent } from '@sveltejs/kit';

// Wizard completion — seeds budget with pre-filled income + subscription items,
// toggles categories off where requested, marks wizard complete on user.
export async function POST({ locals, request }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const {
    template_id,
    income_items,       // [{ label, amount, frequency, tax_treatment }]
    subscription_items, // [{ budget_item_id, amount, frequency }]  — post-seed patches
    disabled_categories // string[] of canonical_keys to disable
  } = await request.json();

  // 1. Seed from template (reuse existing seed logic)
  const existing = await queryOne(
    'SELECT id FROM budget_categories WHERE user_id = $1 LIMIT 1',
    [locals.user.id]
  );

  if (!existing) {
    const tid = template_id ?? '00000000-0000-0000-0000-000000000001';

    const templateCats = await query<{
      id: string; name: string; color: string; is_income: boolean;
      sort_order: number; canonical_key: string | null;
    }>(
      `SELECT id, name, color, is_income, sort_order, canonical_key
       FROM template_categories WHERE template_id = $1 ORDER BY sort_order`,
      [tid]
    );

    for (const cat of templateCats) {
      const enabled = !disabled_categories?.includes(cat.canonical_key ?? '');
      const newCat = await queryOne<{ id: string }>(
        `INSERT INTO budget_categories (user_id, name, color, is_income, sort_order, visibility, enabled, canonical_key)
         VALUES ($1,$2,$3,$4,$5,'private',$6,$7) RETURNING id`,
        [locals.user.id, cat.name, cat.color, cat.is_income, cat.sort_order, enabled, cat.canonical_key ?? null]
      );

      const items = await query<{
        label: string; frequency: string; taxable: string; service_key: string | null;
      }>(
        'SELECT label, frequency, taxable, service_key FROM template_items WHERE category_id = $1',
        [cat.id]
      );

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await query(
          `INSERT INTO budget_items (category_id, user_id, label, amount, frequency, taxable, sort_order, service_key)
           VALUES ($1,$2,$3,0,$4,$5,$6,$7)`,
          [newCat!.id, locals.user.id, item.label, item.frequency, item.taxable, i, item.service_key ?? null]
        );
      }
    }
  }

  // 2. Apply income items from wizard
  if (income_items?.length) {
    const incCat = await queryOne<{ id: string }>(
      'SELECT id FROM budget_categories WHERE user_id = $1 AND is_income = true LIMIT 1',
      [locals.user.id]
    );

    if (incCat) {
      // Clear existing $0 income items and replace with wizard entries
      await query('DELETE FROM budget_items WHERE category_id = $1 AND amount = 0', [incCat.id]);

      for (let i = 0; i < income_items.length; i++) {
        const inc = income_items[i];
        await query(
          `INSERT INTO budget_items
             (category_id, user_id, label, amount, frequency, taxable, sort_order, tax_treatment)
           VALUES ($1,$2,$3,$4,$5,'taxed',$6,$7)`,
          [incCat.id, locals.user.id, inc.label, inc.amount, inc.frequency, i, inc.tax_treatment ?? 'taxable']
        );
      }
    }
  }

  // 3. Apply subscription tier patches
  if (subscription_items?.length) {
    for (const sub of subscription_items) {
      await query(
        'UPDATE budget_items SET amount=$1, frequency=$2 WHERE id=$3 AND user_id=$4',
        [sub.amount, sub.frequency, sub.budget_item_id, locals.user.id]
      );
    }
  }

  // 4. Mark wizard complete
  await query('UPDATE users SET wizard_completed=true WHERE id=$1', [locals.user.id]);

  return json({ ok: true });
}
