import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { id } = event.params;

  const template = await queryOne('SELECT * FROM templates WHERE id = $1', [id]);
  if (!template) return json({ ok: false, error: 'Not found' }, { status: 404 });

  const categories = await query(
    `SELECT tc.*,
       COALESCE(
         json_agg(ti ORDER BY ti.label) FILTER (WHERE ti.id IS NOT NULL),
         '[]'
       ) as items
     FROM template_categories tc
     LEFT JOIN template_items ti ON ti.category_id = tc.id
     WHERE tc.template_id = $1
     GROUP BY tc.id
     ORDER BY tc.sort_order`,
    [id]
  );

  return json({ ok: true, data: { ...template, categories } });
};

export const PUT: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { id } = event.params;
  const body = await event.request.json();
  const { name, description, visibility, is_default } = body;

  if (is_default === true) {
    await query('UPDATE templates SET is_default = false');
    await queryOne('UPDATE templates SET is_default = true WHERE id = $1 RETURNING id', [id]);
    return json({ ok: true });
  }

  const row = await queryOne(
    `UPDATE templates
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         visibility = COALESCE($3, visibility)
     WHERE id = $4
     RETURNING *`,
    [name ?? null, description ?? null, visibility ?? null, id]
  );

  if (!row) return json({ ok: false, error: 'Not found' }, { status: 404 });
  return json({ ok: true, data: row });
};

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { id } = event.params;
  const tpl = await queryOne<{ is_default: boolean }>('SELECT is_default FROM templates WHERE id = $1', [id]);
  if (!tpl) return json({ ok: false, error: 'Not found' }, { status: 404 });
  if (tpl.is_default) return json({ ok: false, error: 'Cannot delete the default template' }, { status: 400 });

  await query('DELETE FROM templates WHERE id = $1', [id]);
  await auditLog(event, 'template_deleted', { entity: 'template', entity_id: id });

  return json({ ok: true });
};
