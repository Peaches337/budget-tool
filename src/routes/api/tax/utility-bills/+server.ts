import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const fy = parseInt(event.url.searchParams.get('fy') ?? '0') || currentFY();
  const utilityType = event.url.searchParams.get('type') ?? '';

  const params: unknown[] = [user.id, fy];
  let extra = '';
  if (utilityType) { extra = ' AND utility_type = $3'; params.push(utilityType); }

  const bills = await query(
    `SELECT * FROM tax_utility_bills WHERE user_id = $1 AND financial_year = $2${extra} ORDER BY bill_year, bill_month`,
    params
  );
  return json({ ok: true, data: bills });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const body = await event.request.json();
  const { financial_year, utility_type, bill_month, bill_year, amount_cents, work_pct } = body;

  if (!utility_type || !bill_month || !bill_year || amount_cents == null) {
    return json({ ok: false, error: 'utility_type, bill_month, bill_year and amount_cents are required' }, { status: 400 });
  }

  const bill = await queryOne(
    `INSERT INTO tax_utility_bills (user_id, financial_year, utility_type, bill_month, bill_year, amount_cents, work_pct)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id, financial_year, utility_type, bill_month, bill_year)
     DO UPDATE SET amount_cents = EXCLUDED.amount_cents, work_pct = EXCLUDED.work_pct
     RETURNING *`,
    [user.id, financial_year ?? currentFY(), utility_type, bill_month, bill_year, amount_cents, work_pct ?? 50]
  );
  return json({ ok: true, data: bill }, { status: 201 });
};

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const id = event.url.searchParams.get('id');
  if (!id) return json({ ok: false, error: 'id required' }, { status: 400 });

  await queryOne(`DELETE FROM tax_utility_bills WHERE id = $1 AND user_id = $2`, [id, user.id]);
  return json({ ok: true });
};

function currentFY(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}
