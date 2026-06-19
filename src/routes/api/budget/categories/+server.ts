import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const profile = event.url.searchParams.get('profile') ?? 'personal';

  const categories = await query(
    `SELECT c.*, COALESCE(json_agg(i ORDER BY i.sort_order) FILTER (WHERE i.id IS NOT NULL), '[]') as items
     FROM budget_categories c
     LEFT JOIN budget_items i ON i.category_id = c.id
     WHERE c.user_id = $1 AND COALESCE(c.profile_type, 'personal') = $2
     GROUP BY c.id
     ORDER BY c.sort_order`,
    [user.id, profile]
  );

  return json({ ok: true, data: categories });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { name, color, is_income, visibility, profile_type } = await event.request.json();

  if (!name || !color) {
    return json({ ok: false, error: 'name and color are required' }, { status: 400 });
  }

  const profileType = profile_type ?? 'personal';

  const maxOrder = await queryOne<{ max: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) as max FROM budget_categories WHERE user_id = $1 AND COALESCE(profile_type, 'personal') = $2`,
    [user.id, profileType]
  );

  const row = await queryOne(
    `INSERT INTO budget_categories (user_id, name, color, is_income, visibility, sort_order, profile_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [user.id, name, color, is_income ?? false, visibility ?? 'private', (maxOrder?.max ?? -1) + 1, profileType]
  );

  await auditLog(event, 'category_created', { entity: 'budget_category', entity_id: (row as any)?.id, details: { name, color } });
  return json({ ok: true, data: row }, { status: 201 });
};
