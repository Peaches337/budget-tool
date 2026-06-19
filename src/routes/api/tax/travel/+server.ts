import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const fy = parseInt(event.url.searchParams.get('fy') ?? '0') || currentFY();

  const [entries, rate] = await Promise.all([
    query(
      `SELECT * FROM tax_travel_log WHERE user_id = $1 AND financial_year = $2 ORDER BY travel_date DESC`,
      [user.id, fy]
    ),
    queryOne<{ rate_cents: number }>(
      `SELECT rate_cents FROM tax_travel_rates WHERE financial_year = $1`,
      [fy]
    )
  ]);

  const totalKm = entries.reduce((s: number, e: any) => s + parseFloat(e.kilometres), 0);
  const CAP = 5000;

  return json({ ok: true, data: { entries, rate_cents: rate?.rate_cents ?? 88, total_km: totalKm, cap_km: CAP, remaining_km: Math.max(0, CAP - totalKm) } });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const body = await event.request.json();
  const { financial_year, travel_date, origin, destination, purpose, kilometres } = body;

  if (!travel_date || !destination || !purpose || kilometres == null) {
    return json({ ok: false, error: 'travel_date, destination, purpose and kilometres are required' }, { status: 400 });
  }

  const fy = financial_year ?? currentFY();
  const rate = await queryOne<{ rate_cents: number }>(
    `SELECT rate_cents FROM tax_travel_rates WHERE financial_year = $1`,
    [fy]
  );

  const entry = await queryOne(
    `INSERT INTO tax_travel_log (user_id, financial_year, travel_date, origin, destination, purpose, kilometres, rate_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [user.id, fy, travel_date, origin ?? null, destination, purpose, kilometres, rate?.rate_cents ?? 88]
  );

  await auditLog(event, 'tax_travel_logged', { entity: 'tax_travel_log', entity_id: entry?.id ?? '', details: { kilometres } });
  return json({ ok: true, data: entry }, { status: 201 });
};

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const id = event.url.searchParams.get('id');
  if (!id) return json({ ok: false, error: 'id required' }, { status: 400 });

  await queryOne(`DELETE FROM tax_travel_log WHERE id = $1 AND user_id = $2`, [id, user.id]);
  return json({ ok: true });
};

function currentFY(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}
