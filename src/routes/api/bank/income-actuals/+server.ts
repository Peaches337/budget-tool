import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';

// Australian financial year: 1 Jul – 30 Jun
function currentFYBounds(): { start: string; end: string; label: string } {
  const now = new Date();
  const yr = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based
  const fyStart = month >= 7 ? yr : yr - 1;
  return {
    start: `${fyStart}-07-01`,
    end:   `${fyStart + 1}-06-30`,
    label: `FY${String(fyStart).slice(2)}/${String(fyStart + 1).slice(2)}`
  };
}

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const fy = currentFYBounds();

  // Sum credits (positive amount_cents) per matched income budget item for the current FY
  const rows = await query<{ budget_item_id: string; total_cents: number; tx_count: string }>(
    `SELECT budget_item_id,
            SUM(amount_cents) AS total_cents,
            COUNT(*) AS tx_count
     FROM (
       SELECT budget_item_id, amount_cents FROM bank_transactions
       WHERE user_id = $1
         AND budget_item_id IS NOT NULL
         AND match_confidence IS NOT NULL AND match_confidence != 'unmatched'
         AND amount_cents > 0
         AND status = 'settled'
         AND settled_at::date BETWEEN $2 AND $3
       UNION ALL
       SELECT budget_item_id, amount_cents FROM imported_transactions
       WHERE user_id = $1
         AND budget_item_id IS NOT NULL
         AND match_confidence IS NOT NULL AND match_confidence != 'unmatched'
         AND amount_cents > 0
         AND settled_at BETWEEN $2 AND $3
     ) combined
     GROUP BY budget_item_id`,
    [user.id, fy.start, fy.end]
  );

  const data = rows.map(r => ({
    budget_item_id: r.budget_item_id,
    fy_total: Math.round(r.total_cents) / 100,
    tx_count: parseInt(r.tx_count as unknown as string),
    fy_label: fy.label
  }));

  return json({ ok: true, data, fy_label: fy.label });
};
