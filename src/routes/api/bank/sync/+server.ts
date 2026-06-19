import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncUserTransactions } from '$lib/server/bankSync.js';
import { auditLog } from '$lib/server/audit.js';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  try {
    const result = await syncUserTransactions(user.id);
    await auditLog(event, 'bank_sync_triggered', { entity: 'bank_connection', details: result });
    return json({ ok: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
