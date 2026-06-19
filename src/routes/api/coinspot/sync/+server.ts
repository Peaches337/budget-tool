import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncBalances } from '$lib/server/coinspot.js';
import { auditLog } from '$lib/server/audit.js';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  try {
    const result = await syncBalances(user.id);
    await auditLog(event, 'coinspot.sync', { count: result.count });
    return json({ ok: true, data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed';
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
