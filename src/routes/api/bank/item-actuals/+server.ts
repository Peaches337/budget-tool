import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  // Find the earliest and latest settled transaction dates across both live and imported
  const span = await query<{ min_date: string | null; max_date: string | null }>(
    `SELECT MIN(d) AS min_date, MAX(d) AS max_date FROM (
       SELECT settled_at::date AS d FROM bank_transactions
       WHERE user_id = $1 AND settled_at IS NOT NULL AND status = 'settled'
       UNION ALL
       SELECT settled_at AS d FROM imported_transactions
       WHERE user_id = $1
     ) sub`,
    [user.id]
  );

  const minDate = span[0]?.min_date;
  const maxDate = span[0]?.max_date;
  if (!minDate || !maxDate) return json({ ok: true, data: [] });

  const msPerMonth = 1000 * 60 * 60 * 24 * 30.44;
  const months = Math.max(
    1,
    (new Date(maxDate).getTime() - new Date(minDate).getTime()) / msPerMonth
  );

  // Sum debits (negative amounts) per matched budget item across both sources
  const rows = await query<{ budget_item_id: string; total_cents: number; tx_count: string }>(
    `SELECT budget_item_id,
            SUM(ABS(amount_cents)) AS total_cents,
            COUNT(*) AS tx_count
     FROM (
       SELECT budget_item_id, amount_cents FROM bank_transactions
       WHERE user_id = $1
         AND budget_item_id IS NOT NULL
         AND match_confidence IS NOT NULL AND match_confidence != 'unmatched'
         AND amount_cents < 0
         AND status = 'settled'
       UNION ALL
       SELECT budget_item_id, amount_cents FROM imported_transactions
       WHERE user_id = $1
         AND budget_item_id IS NOT NULL
         AND match_confidence IS NOT NULL AND match_confidence != 'unmatched'
         AND amount_cents < 0
     ) combined
     GROUP BY budget_item_id`,
    [user.id]
  );

  const data = rows.map(r => ({
    budget_item_id: r.budget_item_id,
    monthly_avg: Math.round((r.total_cents / months) / 100 * 100) / 100,
    months_of_data: Math.round(months * 10) / 10,
    tx_count: parseInt(r.tx_count as unknown as string)
  }));

  return json({ ok: true, data });
};
