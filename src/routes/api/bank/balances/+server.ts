import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';
import { refreshBalances } from '$lib/server/bankSync.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const rows = await query<{
    id: string; external_account_id: string; display_name: string;
    account_type: string; balance_cents: number; currency: string; synced_at: string;
  }>(
    'SELECT id, external_account_id, display_name, account_type, balance_cents, currency, synced_at FROM bank_account_balances WHERE user_id = $1 ORDER BY account_type',
    [user.id]
  );

  return json({ ok: true, data: rows });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  try {
    await refreshBalances(user.id);
    return json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Refresh failed';
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
