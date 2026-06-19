import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';

const PAGE_SIZE = 50;

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const url = new URL(event.request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const offset = (page - 1) * PAGE_SIZE;
  const confidence = url.searchParams.get('confidence'); // 'high'|'medium'|'low'|'unmatched'|null
  const budgetItemId = url.searchParams.get('budget_item_id');

  let where = 'WHERE bt.user_id = $1';
  const params: unknown[] = [user.id];
  let paramIdx = 2;

  if (confidence) {
    where += ` AND bt.match_confidence = $${paramIdx++}`;
    params.push(confidence);
  }
  if (budgetItemId) {
    where += ` AND bt.budget_item_id = $${paramIdx++}`;
    params.push(budgetItemId);
  }

  const [rows, countRows] = await Promise.all([
    query<{
      id: string; external_id: string; merchant_raw: string; merchant_normalised: string;
      amount_cents: number; currency: string; description: string | null;
      up_category: string | null; status: string; settled_at: string | null;
      source: string; match_confidence: string | null; match_confirmed: boolean | null;
      budget_item_id: string | null; budget_item_label: string | null;
      created_at: string;
    }>(
      `SELECT bt.id, bt.external_id, bt.merchant_raw, bt.merchant_normalised,
              bt.amount_cents, bt.currency, bt.description, bt.up_category,
              bt.status, bt.settled_at, bt.source,
              bt.match_confidence, bt.match_confirmed, bt.budget_item_id,
              bi.label AS budget_item_label,
              bt.created_at
       FROM bank_transactions bt
       LEFT JOIN budget_items bi ON bi.id = bt.budget_item_id
       ${where}
       ORDER BY COALESCE(bt.settled_at, bt.created_at) DESC
       LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM bank_transactions bt ${where}`,
      params
    )
  ]);

  const total = parseInt(countRows[0]?.count ?? '0');

  return json({
    ok: true,
    data: rows,
    meta: { page, pageSize: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) }
  });
};
