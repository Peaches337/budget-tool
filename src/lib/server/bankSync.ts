import { query, queryOne } from '$lib/server/db.js';
import { decryptToken } from '$lib/server/bankEncryption.js';
import { UpClient } from '$lib/server/upClient.js';
import { normaliseMerchant, matchTransaction } from '$lib/server/transactionMatcher.js';

const INITIAL_DAYS = 90;
const PAGE_SIZE = 100;

export async function syncUserTransactions(userId: string): Promise<{ inserted: number; updated: number }> {
  const conn = await queryOne<{
    id: string; encrypted_token: string; last_synced_at: string | null;
  }>('SELECT id, encrypted_token, last_synced_at FROM bank_connections WHERE user_id = $1 AND status = $2', [userId, 'active']);

  if (!conn) throw new Error('No active bank connection');

  const token = decryptToken(conn.encrypted_token);
  const client = new UpClient(token);

  // Fetch accounts first and refresh balances
  const accounts = await client.getAccounts();
  for (const acc of accounts) {
    await query(
      `INSERT INTO bank_account_balances (user_id, connection_id, external_account_id, display_name, account_type, balance_cents, currency, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (user_id, external_account_id) DO UPDATE SET
         balance_cents = EXCLUDED.balance_cents,
         display_name  = EXCLUDED.display_name,
         synced_at     = now()`,
      [userId, conn.id, acc.id, acc.displayName, acc.accountType, acc.balance.valueInBaseUnits, acc.balance.currencyCode]
    );
  }

  // Determine since date — use last_synced_at or 90 days ago
  // last_synced_at from pg may be a Date object; always convert to ISO string for the Up API
  const since = conn.last_synced_at
    ? new Date(conn.last_synced_at).toISOString()
    : new Date(Date.now() - INITIAL_DAYS * 86400_000).toISOString();

  let inserted = 0;
  let updated = 0;
  let pageAfter: string | null = null;

  do {
    const { data: txs, nextPage } = await client.getTransactions({ since, pageSize: PAGE_SIZE, pageAfter: pageAfter ?? undefined });

    for (const tx of txs) {
      const merchantRaw = tx.rawText ?? tx.description ?? '';
      const merchantNorm = normaliseMerchant(merchantRaw);
      const upCategory = tx.relationships.category?.data?.id ?? null;
      const amountCents = tx.amount.valueInBaseUnits;
      const settledAt = tx.settledAt;
      const status = tx.status === 'HELD' ? 'held' : 'settled';

      const existing = await queryOne<{ id: string }>(
        'SELECT id FROM bank_transactions WHERE user_id = $1 AND external_id = $2',
        [userId, tx.id]
      );

      if (existing) {
        await query(
          `UPDATE bank_transactions SET status = $1, settled_at = $2 WHERE id = $3`,
          [status, settledAt, existing.id]
        );
        updated++;
      } else {
        await query(
          `INSERT INTO bank_transactions
           (user_id, connection_id, external_id, merchant_raw, merchant_normalised, amount_cents, currency, description, up_category, status, settled_at, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pull')`,
          [userId, conn.id, tx.id, merchantRaw, merchantNorm, amountCents, tx.amount.currencyCode, tx.description, upCategory, status, settledAt]
        );
        inserted++;
      }
    }

    pageAfter = nextPage;
  } while (pageAfter);

  // Run matching on newly inserted unmatched transactions
  await runMatchingForUser(userId);

  // Update last_synced_at
  await query('UPDATE bank_connections SET last_synced_at = now() WHERE id = $1', [conn.id]);

  return { inserted, updated };
}

export async function refreshBalances(userId: string): Promise<void> {
  const conn = await queryOne<{ id: string; encrypted_token: string }>(
    'SELECT id, encrypted_token FROM bank_connections WHERE user_id = $1 AND status = $2',
    [userId, 'active']
  );
  if (!conn) return;

  const client = new UpClient(decryptToken(conn.encrypted_token));
  const accounts = await client.getAccounts();

  for (const acc of accounts) {
    await query(
      `INSERT INTO bank_account_balances (user_id, connection_id, external_account_id, display_name, account_type, balance_cents, currency, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (user_id, external_account_id) DO UPDATE SET
         balance_cents = EXCLUDED.balance_cents,
         display_name  = EXCLUDED.display_name,
         synced_at     = now()`,
      [userId, conn.id, acc.id, acc.displayName, acc.accountType, acc.balance.valueInBaseUnits, acc.balance.currencyCode]
    );
  }
}

async function runMatchingForUser(userId: string): Promise<void> {
  const unmatched = await query<{
    id: string; merchant_normalised: string; up_category: string | null;
  }>(
    `SELECT id, merchant_normalised, up_category FROM bank_transactions
     WHERE user_id = $1 AND (match_confidence IS NULL OR match_confidence = 'unmatched')`,
    [userId]
  );

  if (!unmatched.length) return;

  const items = await query<{ id: string; label: string; category_id: string }>(
    `SELECT bi.id, bi.label, bi.category_id
     FROM budget_items bi
     JOIN budget_categories bc ON bc.id = bi.category_id
     WHERE bc.user_id = $1`,
    [userId]
  );

  const mappings = await query<{ merchant_normalised: string; budget_item_id: string; confirmed: boolean }>(
    'SELECT merchant_normalised, budget_item_id, confirmed FROM bank_merchant_mappings WHERE user_id = $1',
    [userId]
  );

  for (const tx of unmatched) {
    const result = matchTransaction(tx.merchant_normalised ?? '', tx.up_category, items, mappings);

    if (result.confidence !== 'unmatched') {
      await query(
        `UPDATE bank_transactions SET budget_item_id = $1, match_confidence = $2, match_confirmed = false
         WHERE id = $3`,
        [result.budget_item_id, result.confidence, tx.id]
      );

      // Save unconfirmed mapping for future reference
      if (result.budget_item_id && result.confidence !== 'high') {
        await query(
          `INSERT INTO bank_merchant_mappings (user_id, merchant_normalised, budget_item_id, confirmed)
           VALUES ($1,$2,$3,false)
           ON CONFLICT (user_id, merchant_normalised) DO NOTHING`,
          [userId, tx.merchant_normalised, result.budget_item_id]
        );
      }
    } else {
      await query(
        `UPDATE bank_transactions SET match_confidence = 'unmatched' WHERE id = $1`,
        [tx.id]
      );
    }
  }
}
