import { createHmac } from 'crypto';
import { encryptToken, decryptToken } from './bankEncryption.js';
import { query, queryOne } from './db.js';

const BASE_URL = 'https://www.coinspot.com.au/api/v2/ro';

export { encryptToken, decryptToken };

function sign(secret: string, body: string): string {
  return createHmac('sha512', secret).update(body).digest('hex');
}

async function coinspotPost<T>(apiKey: string, apiSecret: string, path: string): Promise<T> {
  const nonce = Date.now();
  const body = JSON.stringify({ nonce });
  const signature = sign(apiSecret, body);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'key': apiKey,
      'sign': signature,
    },
    body,
  });

  if (!res.ok) throw new Error(`CoinSpot API error: ${res.status} ${res.statusText}`);
  const json = await res.json() as { status: string; message?: string } & T;
  if (json.status !== 'ok') throw new Error(json.message ?? 'CoinSpot API returned non-ok status');
  return json;
}

export async function fetchCoinspotBalances(apiKey: string, apiSecret: string) {
  const data = await coinspotPost<{
    balances: Array<Record<string, { balance: number; audbalance: number; rate: number }>>
  }>(apiKey, apiSecret, '/my/balances');
  return data.balances;
}

export async function getConnection(userId: string) {
  return queryOne<{
    id: string; status: string; last_synced_at: string | null;
    encrypted_api_key: string; encrypted_api_secret: string;
  }>(
    `SELECT id, status, last_synced_at, encrypted_api_key, encrypted_api_secret
     FROM coinspot_connections WHERE user_id = $1`,
    [userId]
  );
}

export async function syncBalances(userId: string): Promise<{ count: number }> {
  const conn = await getConnection(userId);
  if (!conn) throw new Error('No CoinSpot connection found');

  const apiKey = decryptToken(conn.encrypted_api_key);
  const apiSecret = decryptToken(conn.encrypted_api_secret);

  const balances = await fetchCoinspotBalances(apiKey, apiSecret);

  for (const entry of balances) {
    const [coinType, data] = Object.entries(entry)[0];
    // Skip AUD cash balance — not a crypto holding
    if (coinType === 'AUD') continue;
    await query(
      `INSERT INTO coinspot_balances (user_id, coin_type, balance, aud_balance, rate, synced_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id, coin_type) DO UPDATE
         SET balance = EXCLUDED.balance,
             aud_balance = EXCLUDED.aud_balance,
             rate = EXCLUDED.rate,
             synced_at = now()`,
      [userId, coinType, data.balance, data.audbalance, data.rate]
    );
  }

  await query(
    `UPDATE coinspot_connections SET last_synced_at = now(), status = 'active' WHERE user_id = $1`,
    [userId]
  );

  return { count: balances.filter(e => Object.keys(e)[0] !== 'AUD').length };
}
