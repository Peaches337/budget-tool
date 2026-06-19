import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { encryptToken, encryptionKeyConfigured } from '$lib/server/bankEncryption.js';
import { UpClient } from '$lib/server/upClient.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const conn = await queryOne<{
    id: string; provider: string; status: string; last_synced_at: string | null; display_name: string | null;
  }>(
    'SELECT id, provider, status, last_synced_at, display_name FROM bank_connections WHERE user_id = $1',
    [user.id]
  );

  if (!conn) return json({ ok: true, data: null });

  const balances = await query<{ display_name: string; account_type: string; balance_cents: number; synced_at: string }>(
    'SELECT display_name, account_type, balance_cents, synced_at FROM bank_account_balances WHERE user_id = $1',
    [user.id]
  );

  return json({ ok: true, data: { ...conn, balances } });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  if (!encryptionKeyConfigured()) {
    return json({ ok: false, error: 'Bank integration not configured on this server (missing encryption key)' }, { status: 503 });
  }

  const { token } = await event.request.json();
  if (!token || typeof token !== 'string') {
    return json({ ok: false, error: 'token is required' }, { status: 400 });
  }

  const client = new UpClient(token);
  const valid = await client.ping();
  if (!valid) {
    return json({ ok: false, error: 'Invalid Up Bank token — check it in the Up app and try again' }, { status: 422 });
  }

  // Fetch account names for display
  let displayName: string | null = null;
  try {
    const accounts = await client.getAccounts();
    const spending = accounts.find(a => a.accountType === 'TRANSACTIONAL') ?? accounts[0];
    displayName = spending?.displayName ?? null;
  } catch { /* non-fatal */ }

  const encrypted = encryptToken(token);

  await query(
    `INSERT INTO bank_connections (user_id, provider, encrypted_token, display_name, status)
     VALUES ($1, 'up', $2, $3, 'active')
     ON CONFLICT (user_id, provider) DO UPDATE SET
       encrypted_token = EXCLUDED.encrypted_token,
       display_name    = EXCLUDED.display_name,
       status          = 'active'`,
    [user.id, encrypted, displayName]
  );

  await auditLog(event, 'bank_connection_created', { entity: 'bank_connection', details: { provider: 'up' } });
  return json({ ok: true });
};

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const url = new URL(event.request.url);
  const deleteAll = url.searchParams.get('deleteAll') === 'true';

  if (deleteAll) {
    await query('DELETE FROM bank_transactions WHERE user_id = $1', [user.id]);
    await query('DELETE FROM bank_merchant_mappings WHERE user_id = $1', [user.id]);
    await query('DELETE FROM bank_account_balances WHERE user_id = $1', [user.id]);
  } else {
    // Keep transactions but mark as disconnected
    await query(`UPDATE bank_transactions SET source = 'disconnected' WHERE user_id = $1`, [user.id]);
  }

  await query('DELETE FROM bank_connections WHERE user_id = $1', [user.id]);
  await auditLog(event, 'bank_connection_deleted', { entity: 'bank_connection', details: { provider: 'up', deleteAll } });
  return json({ ok: true });
};
