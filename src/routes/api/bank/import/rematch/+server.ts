import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';
import { matchTransaction, normaliseMerchant } from '$lib/server/transactionMatcher.js';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { file_id } = await event.request.json().catch(() => ({}));

  // Reset non-confirmed matches for imported transactions
  if (file_id) {
    await query(
      `UPDATE imported_transactions SET match_confidence = NULL, budget_item_id = NULL
       WHERE user_id = $1 AND file_id = $2 AND (match_confirmed IS NULL OR match_confirmed = false)`,
      [user.id, file_id]
    );
  } else {
    await query(
      `UPDATE imported_transactions SET match_confidence = NULL, budget_item_id = NULL
       WHERE user_id = $1 AND (match_confirmed IS NULL OR match_confirmed = false)`,
      [user.id]
    );
  }

  const unmatched = await query<{ id: string; description: string }>(
    `SELECT id, description FROM imported_transactions
     WHERE user_id = $1 AND match_confidence IS NULL
     ${file_id ? 'AND file_id = $2' : ''}`,
    file_id ? [user.id, file_id] : [user.id]
  );

  const items = await query<{ id: string; label: string; category_id: string }>(
    `SELECT bi.id, bi.label, bi.category_id FROM budget_items bi
     JOIN budget_categories bc ON bc.id = bi.category_id
     WHERE bc.user_id = $1 AND bc.is_income = false`,
    [user.id]
  );
  const mappings = await query<{ merchant_normalised: string; budget_item_id: string; confirmed: boolean }>(
    `SELECT merchant_normalised, budget_item_id, confirmed FROM bank_merchant_mappings WHERE user_id = $1`,
    [user.id]
  );

  let matched = 0;
  for (const tx of unmatched) {
    const norm = normaliseMerchant(tx.description);
    const result = matchTransaction(norm, null, items, mappings);
    await query(
      `UPDATE imported_transactions SET budget_item_id = $1, match_confidence = $2 WHERE id = $3`,
      [result.budget_item_id, result.confidence, tx.id]
    );
    if (result.confidence !== 'unmatched') matched++;
  }

  return json({ ok: true, data: { total: unmatched.length, matched } });
};
