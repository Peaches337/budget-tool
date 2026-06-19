import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const rows = await query(
    'SELECT * FROM subscription_tiers ORDER BY service, sort_order, tier_name'
  );
  return json({ ok: true, data: rows });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { service, tier_name, amount, frequency, sort_order } = await event.request.json();

  if (!service?.trim() || !tier_name?.trim() || amount == null) {
    return json({ ok: false, error: 'service, tier_name and amount are required' }, { status: 400 });
  }

  const row = await queryOne(
    `INSERT INTO subscription_tiers (service, tier_name, amount, frequency, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [service.trim(), tier_name.trim(), amount, frequency ?? 'monthly', sort_order ?? 0]
  );

  return json({ ok: true, data: row }, { status: 201 });
};
