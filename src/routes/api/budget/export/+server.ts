import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const categories = await query(
    `SELECT c.*, COALESCE(json_agg(i ORDER BY i.sort_order) FILTER (WHERE i.id IS NOT NULL), '[]') as items
     FROM budget_categories c
     LEFT JOIN budget_items i ON i.category_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY c.sort_order`,
    [user.id]
  );

  const payload = JSON.stringify({
    version: 2,
    exported: new Date().toISOString(),
    user: { username: user.username, email: user.email },
    categories
  }, null, 2);

  return new Response(payload, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="skint-budget-${user.username}-${new Date().toISOString().slice(0,10)}.json"`
    }
  });
};
