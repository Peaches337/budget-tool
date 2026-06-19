import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const url = new URL(event.request.url);
  // Default: current calendar month
  const now = new Date();
  const fromDefault = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const toDefault = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const from = url.searchParams.get('from') ?? fromDefault;
  const to = url.searchParams.get('to') ?? toDefault;

  // Sum settled debits (negative amounts) per budget item for the period
  const rows = await query<{ budget_item_id: string; total_cents: number; tx_count: number }>(
    `SELECT budget_item_id,
            SUM(ABS(amount_cents)) AS total_cents,
            COUNT(*) AS tx_count
     FROM bank_transactions
     WHERE user_id = $1
       AND budget_item_id IS NOT NULL
       AND match_confidence IS NOT NULL AND match_confidence != 'unmatched'
       AND amount_cents < 0
       AND status = 'settled'
       AND COALESCE(settled_at, created_at) BETWEEN $2 AND $3
     GROUP BY budget_item_id`,
    [user.id, from, to]
  );

  return json({ ok: true, data: rows, meta: { from, to } });
};
