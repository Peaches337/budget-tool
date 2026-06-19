import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { encryptToken, decryptToken, fetchCoinspotBalances } from '$lib/server/coinspot.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const conn = await queryOne<{
    id: string; status: string; last_synced_at: string | null;
  }>(
    `SELECT id, status, last_synced_at FROM coinspot_connections WHERE user_id = $1`,
    [user.id]
  );

  if (!conn) return json({ ok: true, data: null });

  const balances = await query<{
    coin_type: string; balance: string; aud_balance: string; rate: string; synced_at: string;
  }>(
    `SELECT coin_type, balance, aud_balance, rate, synced_at
     FROM coinspot_balances WHERE user_id = $1 ORDER BY aud_balance DESC`,
    [user.id]
  );

  return json({ ok: true, data: { ...conn, balances } });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const body = await event.request.json().catch(() => null);
  const apiKey = body?.api_key?.trim();
  const apiSecret = body?.api_secret?.trim();
  if (!apiKey || !apiSecret) return json({ ok: false, error: 'API key and secret are required.' }, { status: 400 });

  // Validate credentials by fetching balances
  try {
    await fetchCoinspotBalances(apiKey, apiSecret);
  } catch {
    return json({ ok: false, error: 'Invalid API credentials — could not connect to CoinSpot.' }, { status: 400 });
  }

  const encryptedKey = encryptToken(apiKey);
  const encryptedSecret = encryptToken(apiSecret);

  await query(
    `INSERT INTO coinspot_connections (user_id, encrypted_api_key, encrypted_api_secret)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET encrypted_api_key = EXCLUDED.encrypted_api_key,
           encrypted_api_secret = EXCLUDED.encrypted_api_secret,
           status = 'active',
           last_synced_at = NULL`,
    [user.id, encryptedKey, encryptedSecret]
  );

  await auditLog(event, 'coinspot.connect', { user_id: user.id });
  return json({ ok: true });
};

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  await query(`DELETE FROM coinspot_connections WHERE user_id = $1`, [user.id]);
  // Balances cascade via FK but we have no FK — delete explicitly
  await query(`DELETE FROM coinspot_balances WHERE user_id = $1`, [user.id]);

  await auditLog(event, 'coinspot.disconnect', { user_id: user.id });
  return json({ ok: true });
};
