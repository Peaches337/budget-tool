import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { id } = event.params;

  const src = await queryOne<{ name: string; description: string | null; visibility: string }>(
    'SELECT name, description, visibility FROM templates WHERE id = $1', [id]
  );
  if (!src) return json({ ok: false, error: 'Not found' }, { status: 404 });

  const newTpl = await queryOne<{ id: string }>(
    `INSERT INTO templates (name, description, visibility, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [`${src.name} (copy)`, src.description, src.visibility, user.id]
  );

  const cats = await query<{ id: string; name: string; color: string; is_income: boolean; sort_order: number }>(
    'SELECT id, name, color, is_income, sort_order FROM template_categories WHERE template_id = $1 ORDER BY sort_order',
    [id]
  );

  for (const cat of cats) {
    const newCat = await queryOne<{ id: string }>(
      `INSERT INTO template_categories (template_id, name, color, is_income, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [newTpl!.id, cat.name, cat.color, cat.is_income, cat.sort_order]
    );

    const items = await query<{ label: string; frequency: string; taxable: string; service_key: string | null }>(
      'SELECT label, frequency, taxable, service_key FROM template_items WHERE category_id = $1',
      [cat.id]
    );

    for (const item of items) {
      await query(
        'INSERT INTO template_items (category_id, label, frequency, taxable, service_key) VALUES ($1, $2, $3, $4, $5)',
        [newCat!.id, item.label, item.frequency, item.taxable, item.service_key]
      );
    }
  }

  await auditLog(event, 'template_duplicated', { entity: 'template', entity_id: newTpl!.id, details: { source_id: id } });

  return json({ ok: true, data: { id: newTpl!.id } }, { status: 201 });
};
