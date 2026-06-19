import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = event.params;

  // Verify requester is a member of this household
  const membership = await queryOne(
    'SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2',
    [id, user.id]
  );
  if (!membership) return json({ ok: false, error: 'Not a member' }, { status: 403 });

  // Get all members
  const members = await query<{ user_id: string; username: string; role: string }>(
    `SELECT hm.user_id, u.username, hm.role
     FROM household_members hm
     JOIN users u ON u.id = hm.user_id
     WHERE hm.household_id = $1`,
    [id]
  );

  // For each member, get their categories + items based on visibility
  const memberBudgets = await Promise.all(members.map(async (member) => {
    const isSelf = member.user_id === user.id;

    const categories = await query(
      `SELECT c.id, c.name, c.color, c.is_income, c.sort_order, c.visibility,
         COALESCE(
           json_agg(
             json_build_object(
               'id', i.id,
               'label', i.label,
               'amount', i.amount,
               'frequency', i.frequency,
               'taxable', i.taxable
             ) ORDER BY i.sort_order
           ) FILTER (WHERE i.id IS NOT NULL AND ($2 OR c.visibility = 'full')),
           '[]'
         ) as items
       FROM budget_categories c
       LEFT JOIN budget_items i ON i.category_id = c.id
       WHERE c.user_id = $1
         AND ($2 OR c.visibility != 'private')
       GROUP BY c.id
       ORDER BY c.sort_order`,
      [member.user_id, isSelf]
    );

    return {
      user_id: member.user_id,
      username: member.username,
      role: member.role,
      is_self: isSelf,
      categories
    };
  }));

  return json({ ok: true, data: memberBudgets });
};
