import { json } from '@sveltejs/kit';
import { query, queryOne } from '$lib/server/db.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function GET({ locals }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const rows = await query(
    `SELECT id, snapped_at, total_assets, total_liab, net_worth
     FROM net_worth_snapshots WHERE user_id = $1
     ORDER BY snapped_at DESC LIMIT 24`,
    [locals.user.id]
  );
  return json({ ok: true, data: rows });
}

export async function POST({ locals }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const totals = await queryOne<{ assets: string; liab: string }>(
    `SELECT
       COALESCE(SUM(CASE WHEN entry_type='asset' THEN amount ELSE 0 END), 0) AS assets,
       COALESCE(SUM(CASE WHEN entry_type='liability' THEN amount ELSE 0 END), 0) AS liab
     FROM net_worth_entries WHERE user_id = $1`,
    [locals.user.id]
  );

  const assets = parseFloat(totals?.assets ?? '0');
  const liab   = parseFloat(totals?.liab ?? '0');

  const row = await queryOne(
    `INSERT INTO net_worth_snapshots (user_id, total_assets, total_liab, net_worth)
     VALUES ($1, $2, $3, $4)
     RETURNING id, snapped_at, total_assets, total_liab, net_worth`,
    [locals.user.id, assets, liab, assets - liab]
  );
  return json({ ok: true, data: row }, { status: 201 });
}
