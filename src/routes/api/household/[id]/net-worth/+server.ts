import { json } from '@sveltejs/kit';
import { query, queryOne } from '$lib/server/db.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function GET({ locals, params }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  // Must be a member
  const membership = await queryOne(
    `SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2`,
    [params.id, locals.user.id]
  );
  if (!membership) return json({ ok: false, error: 'Not a member' }, { status: 403 });

  // Check feature is enabled
  const hh = await queryOne<{ include_net_worth: boolean }>(
    `SELECT include_net_worth FROM households WHERE id = $1`,
    [params.id]
  );
  if (!hh?.include_net_worth) return json({ ok: true, data: null });

  // Aggregate shared net worth entries across all members
  const rows = await query<{
    user_id: string; username: string;
    total_assets: string; total_liab: string; net_worth: string;
  }>(
    `SELECT u.id AS user_id, u.username,
       COALESCE(SUM(CASE WHEN e.entry_type = 'asset' THEN e.amount ELSE 0 END), 0) AS total_assets,
       COALESCE(SUM(CASE WHEN e.entry_type = 'liability' THEN e.amount ELSE 0 END), 0) AS total_liab,
       COALESCE(SUM(CASE WHEN e.entry_type = 'asset' THEN e.amount ELSE -e.amount END), 0) AS net_worth
     FROM household_members hm
     JOIN users u ON u.id = hm.user_id
     LEFT JOIN net_worth_entries e ON e.user_id = u.id AND e.visibility = 'shared'
     WHERE hm.household_id = $1
     GROUP BY u.id, u.username
     ORDER BY u.username`,
    [params.id]
  );

  return json({ ok: true, data: rows });
}
