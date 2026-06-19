import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';
import { matchTransaction } from '$lib/server/transactionMatcher.js';
import { normaliseMerchant } from '$lib/server/transactionMatcher.js';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  // Reset all non-confirmed matches so we re-run with the new logic
  await query(
    `UPDATE bank_transactions SET match_confidence = NULL, budget_item_id = NULL
     WHERE user_id = $1 AND (match_confirmed IS NULL OR match_confirmed = false)`,
    [user.id]
  );

  const unmatched = await query<{ id: string; merchant_normalised: string; up_category: string | null }>(
    `SELECT id, merchant_normalised, up_category FROM bank_transactions
     WHERE user_id = $1 AND match_confidence IS NULL`,
    [user.id]
  );

  const items = await query<{ id: string; label: string; category_id: string }>(
    `SELECT bi.id, bi.label, bi.category_id FROM budget_items bi
     JOIN budget_categories bc ON bc.id = bi.category_id WHERE bc.user_id = $1`,
    [user.id]
  );

  const mappings = await query<{ merchant_normalised: string; budget_item_id: string; confirmed: boolean }>(
    'SELECT merchant_normalised, budget_item_id, confirmed FROM bank_merchant_mappings WHERE user_id = $1',
    [user.id]
  );

  let matched = 0;
  for (const tx of unmatched) {
    const result = matchTransaction(tx.merchant_normalised ?? '', tx.up_category, items, mappings);
    if (result.confidence !== 'unmatched') {
      await query(
        `UPDATE bank_transactions SET budget_item_id = $1, match_confidence = $2, match_confirmed = false WHERE id = $3`,
        [result.budget_item_id, result.confidence, tx.id]
      );
      matched++;
    } else {
      await query(`UPDATE bank_transactions SET match_confidence = 'unmatched' WHERE id = $1`, [tx.id]);
    }
  }

  return json({ ok: true, data: { total: unmatched.length, matched } });
};
