import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const balances = await query<{
    coin_type: string; balance: string; aud_balance: string; rate: string; synced_at: string;
  }>(
    `SELECT coin_type, balance, aud_balance, rate, synced_at
     FROM coinspot_balances WHERE user_id = $1 ORDER BY aud_balance DESC`,
    [user.id]
  );

  return json({ ok: true, data: balances });
};
