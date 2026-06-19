import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';

export const PUT: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = event.params;
  const { budget_item_id } = await event.request.json();

  // Verify transaction belongs to user
  const tx = await queryOne<{ id: string; merchant_normalised: string }>(
    'SELECT id, merchant_normalised FROM bank_transactions WHERE id = $1 AND user_id = $2',
    [id, user.id]
  );
  if (!tx) return json({ ok: false, error: 'Transaction not found' }, { status: 404 });

  if (budget_item_id === null) {
    // Unmatch
    await query(
      `UPDATE bank_transactions SET budget_item_id = NULL, match_confidence = 'unmatched', match_confirmed = false WHERE id = $1`,
      [id]
    );
    return json({ ok: true });
  }

  // Verify budget item belongs to user
  const item = await queryOne<{ id: string }>(
    `SELECT bi.id FROM budget_items bi
     JOIN budget_categories bc ON bc.id = bi.category_id
     WHERE bi.id = $1 AND bc.user_id = $2`,
    [budget_item_id, user.id]
  );
  if (!item) return json({ ok: false, error: 'Budget item not found' }, { status: 404 });

  // Update transaction with confirmed match
  await query(
    `UPDATE bank_transactions SET budget_item_id = $1, match_confidence = 'high', match_confirmed = true WHERE id = $2`,
    [budget_item_id, id]
  );

  // Upsert confirmed mapping so future transactions from same merchant auto-match
  await query(
    `INSERT INTO bank_merchant_mappings (user_id, merchant_normalised, budget_item_id, confirmed)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (user_id, merchant_normalised) DO UPDATE SET
       budget_item_id = EXCLUDED.budget_item_id,
       confirmed = true`,
    [user.id, tx.merchant_normalised, budget_item_id]
  );

  return json({ ok: true });
};
