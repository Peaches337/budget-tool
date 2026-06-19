import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const fy = parseInt(event.url.searchParams.get('fy') ?? '0') || currentFY();

  const settings = await queryOne(
    `SELECT * FROM tax_user_settings WHERE user_id = $1 AND financial_year = $2`,
    [user.id, fy]
  );

  return json({ ok: true, data: settings ?? null });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const body = await event.request.json();
  const fy = body.financial_year ?? currentFY();

  const existing = await queryOne(
    `SELECT id FROM tax_user_settings WHERE user_id = $1 AND financial_year = $2`,
    [user.id, fy]
  );

  let result;
  if (existing) {
    const fields = [
      'tax_role', 'home_office_method', 'travel_method',
      'mod_work_expenses', 'mod_vehicle', 'mod_home_office',
      'mod_internet', 'mod_mobile', 'mod_electricity', 'mod_gas',
      'mod_water', 'mod_fuel', 'mod_interest', 'mod_professional',
      'mod_vehicle_service', 'wizard_complete'
    ];
    const updates: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const f of fields) {
      if (body[f] !== undefined) {
        updates.push(`${f} = $${i++}`);
        params.push(body[f]);
      }
    }
    if (updates.length === 0) return json({ ok: false, error: 'Nothing to update' }, { status: 400 });
    updates.push(`updated_at = now()`);
    params.push(user.id, fy);
    result = await queryOne(
      `UPDATE tax_user_settings SET ${updates.join(', ')} WHERE user_id = $${i} AND financial_year = $${i+1} RETURNING *`,
      params
    );
  } else {
    result = await queryOne(
      `INSERT INTO tax_user_settings (
        user_id, financial_year, tax_role, home_office_method, travel_method,
        mod_work_expenses, mod_vehicle, mod_home_office,
        mod_internet, mod_mobile, mod_electricity, mod_gas,
        mod_water, mod_fuel, mod_interest, mod_professional,
        mod_vehicle_service, wizard_complete
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [
        user.id, fy,
        body.tax_role ?? 'payg',
        body.home_office_method ?? null,
        body.travel_method ?? 'cents_per_km',
        body.mod_work_expenses ?? true,
        body.mod_vehicle ?? false,
        body.mod_home_office ?? false,
        body.mod_internet ?? false,
        body.mod_mobile ?? false,
        body.mod_electricity ?? false,
        body.mod_gas ?? false,
        body.mod_water ?? false,
        body.mod_fuel ?? false,
        body.mod_interest ?? false,
        body.mod_professional ?? false,
        body.mod_vehicle_service ?? false,
        body.wizard_complete ?? false,
      ]
    );
  }

  await auditLog(event, 'tax_settings_saved', { entity: 'tax_user_settings', entity_id: result?.id ?? '', details: { financial_year: fy } });
  return json({ ok: true, data: result });
};

function currentFY(): number {
  const now = new Date();
  // FY runs Jul-Jun; FY2025 = Jul 2024 - Jun 2025
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}
