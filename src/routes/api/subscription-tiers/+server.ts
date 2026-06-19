import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';

// Public endpoint — returns active tiers grouped by service for the budget item editor
export const GET: RequestHandler = async (event) => {
  if (!event.locals.user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const rows = await query<{ service: string; id: string; tier_name: string; amount: number; frequency: string }>(
    'SELECT id, service, tier_name, amount, frequency FROM subscription_tiers WHERE active = true ORDER BY service, sort_order'
  );

  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    if (!grouped[row.service]) grouped[row.service] = [];
    grouped[row.service].push(row);
  }

  return json({ ok: true, data: grouped });
};
