import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queryOne } from '$lib/server/db.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const fy = parseInt(event.url.searchParams.get('fy') ?? '0') || currentFY();
  const record = await queryOne(
    `SELECT * FROM tax_home_office WHERE user_id = $1 AND financial_year = $2`,
    [user.id, fy]
  );
  return json({ ok: true, data: record ?? null });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const body = await event.request.json();
  const { financial_year, method, hours_per_week, weeks_in_fy, office_area_m2, total_area_m2 } = body;

  if (!method) return json({ ok: false, error: 'method is required' }, { status: 400 });

  const record = await queryOne(
    `INSERT INTO tax_home_office (user_id, financial_year, method, hours_per_week, weeks_in_fy, office_area_m2, total_area_m2)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id, financial_year)
     DO UPDATE SET method = EXCLUDED.method, hours_per_week = EXCLUDED.hours_per_week,
       weeks_in_fy = EXCLUDED.weeks_in_fy, office_area_m2 = EXCLUDED.office_area_m2,
       total_area_m2 = EXCLUDED.total_area_m2, updated_at = now()
     RETURNING *`,
    [user.id, financial_year ?? currentFY(), method, hours_per_week ?? null, weeks_in_fy ?? 52, office_area_m2 ?? null, total_area_m2 ?? null]
  );
  return json({ ok: true, data: record });
};

function currentFY(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}
