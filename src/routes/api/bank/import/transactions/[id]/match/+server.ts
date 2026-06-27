import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { normaliseMerchant } from '$lib/server/transactionMatcher.js';

export const PUT: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = event.params;
  const { budget_item_id } = await event.request.json();

  const tx = await queryOne<{ id: string; description: string; merchant_normalised: string | null }>(
    'SELECT id, description, merchant_normalised FROM imported_transactions WHERE id = $1 AND user_id = $2',
    [id, user.id]
  );
  if (!tx) return json({ ok: false, error: 'Transaction not found' }, { status: 404 });

  if (budget_item_id === null) {
    await query(
      `UPDATE imported_transactions SET budget_item_id = NULL, match_confidence = 'unmatched', match_confirmed = false WHERE id = $1`,
      [id]
    );
    return json({ ok: true });
  }

  const item = await queryOne<{ id: string }>(
    `SELECT bi.id FROM budget_items bi
     JOIN budget_categories bc ON bc.id = bi.category_id
     WHERE bi.id = $1 AND bc.user_id = $2`,
    [budget_item_id, user.id]
  );
  if (!item) return json({ ok: false, error: 'Budget item not found' }, { status: 404 });

  const merchantNorm = tx.merchant_normalised ?? normaliseMerchant(tx.description);

  await query(
    `UPDATE imported_transactions SET budget_item_id = $1, match_confidence = 'high', match_confirmed = true,
      merchant_normalised = $2 WHERE id = $3`,
    [budget_item_id, merchantNorm, id]
  );

  // Upsert confirmed mapping so future transactions from same merchant auto-match
  await query(
    `INSERT INTO bank_merchant_mappings (user_id, merchant_normalised, budget_item_id, confirmed)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (user_id, merchant_normalised) DO UPDATE SET
       budget_item_id = EXCLUDED.budget_item_id,
       confirmed = true`,
    [user.id, merchantNorm, budget_item_id]
  );

  return json({ ok: true });
};
