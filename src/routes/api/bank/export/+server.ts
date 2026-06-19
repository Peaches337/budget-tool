import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return new Response('Not authenticated', { status: 401 });

  const rows = await query<{
    settled_at: string; description: string; merchant_raw: string;
    amount_cents: number; currency: string; budget_item_label: string | null;
    match_confidence: string | null;
  }>(
    `SELECT t.settled_at, t.description, t.merchant_raw, t.amount_cents, t.currency,
            bi.label AS budget_item_label, t.match_confidence
     FROM bank_transactions t
     LEFT JOIN budget_items bi ON bi.id = t.budget_item_id
     WHERE t.user_id = $1 AND t.status = 'settled' AND t.amount_cents < 0
     ORDER BY t.settled_at DESC`,
    [user.id]
  );

  const header = 'Date,Description,Amount,Currency,Budget Category,Match Confidence\n';
  const csvRows = rows.map(r => {
    const date = r.settled_at ? r.settled_at.slice(0, 10) : '';
    const desc = `"${(r.description || r.merchant_raw || '').replace(/"/g, '""')}"`;
    const amount = (Math.abs(r.amount_cents) / 100).toFixed(2);
    const currency = r.currency || 'AUD';
    const cat = `"${(r.budget_item_label || '').replace(/"/g, '""')}"`;
    const conf = r.match_confidence || 'unmatched';
    return `${date},${desc},${amount},${currency},${cat},${conf}`;
  });

  const csv = header + csvRows.join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="skint-transactions.csv"'
    }
  });
};
