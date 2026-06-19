import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const templates = await query(
    `SELECT t.*,
       COALESCE(
         json_agg(tc ORDER BY tc.sort_order) FILTER (WHERE tc.id IS NOT NULL),
         '[]'
       ) as categories
     FROM templates t
     LEFT JOIN template_categories tc ON tc.template_id = t.id
     GROUP BY t.id
     ORDER BY t.is_default DESC, t.name`
  );

  return json({ ok: true, data: templates });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { name, description, visibility } = await event.request.json();
  if (!name?.trim()) return json({ ok: false, error: 'Name is required' }, { status: 400 });

  const row = await queryOne(
    `INSERT INTO templates (name, description, visibility, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name.trim(), description ?? null, visibility ?? 'public', user.id]
  );

  await auditLog(event, 'template_created', { entity: 'template', entity_id: (row as { id: string }).id, details: { name } });

  return json({ ok: true, data: row }, { status: 201 });
};
