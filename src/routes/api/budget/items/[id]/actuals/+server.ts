import { json } from '@sveltejs/kit';
import { query, queryOne } from '$lib/server/db.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function GET({ locals, params }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const rows = await query(
    `SELECT id, budget_item_id, paid_on, amount, notes, created_at
     FROM income_actuals
     WHERE budget_item_id = $1 AND user_id = $2
     ORDER BY paid_on DESC`,
    [params.id, locals.user.id]
  );
  return json({ ok: true, data: rows });
}

export async function POST({ locals, params, request }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const { paid_on, amount, notes } = await request.json();
  if (!paid_on || amount == null) return json({ ok: false, error: 'paid_on and amount required' }, { status: 400 });

  const row = await queryOne(
    `INSERT INTO income_actuals (budget_item_id, user_id, paid_on, amount, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, budget_item_id, paid_on, amount, notes, created_at`,
    [params.id, locals.user.id, paid_on, amount, notes ?? null]
  );
  return json({ ok: true, data: row }, { status: 201 });
}
