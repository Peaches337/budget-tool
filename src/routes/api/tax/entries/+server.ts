import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const fy = parseInt(event.url.searchParams.get('fy') ?? '0') || currentFY();
  const moduleType = event.url.searchParams.get('module') ?? '';

  const params: unknown[] = [user.id, fy];
  let extra = '';
  if (moduleType) {
    extra = ' AND module_type = $3';
    params.push(moduleType);
  }

  const entries = await query(
    `SELECT * FROM tax_entries WHERE user_id = $1 AND financial_year = $2${extra} ORDER BY entry_date DESC, created_at DESC`,
    params
  );

  return json({ ok: true, data: entries });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const body = await event.request.json();
  const { financial_year, module_type, entry_date, description, supplier, amount_cents, work_pct, receipt_url, linked_tx_id, notes } = body;

  if (!module_type || !entry_date || !description || amount_cents == null) {
    return json({ ok: false, error: 'module_type, entry_date, description and amount_cents are required' }, { status: 400 });
  }

  const entry = await queryOne(
    `INSERT INTO tax_entries (user_id, financial_year, module_type, entry_date, description, supplier, amount_cents, work_pct, receipt_url, linked_tx_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [user.id, financial_year ?? currentFY(), module_type, entry_date, description, supplier ?? null, amount_cents, work_pct ?? 100, receipt_url ?? null, linked_tx_id ?? null, notes ?? null]
  );

  await auditLog(event, 'tax_entry_created', { entity: 'tax_entries', entity_id: entry?.id ?? '', details: { module_type, amount_cents } });
  return json({ ok: true, data: entry }, { status: 201 });
};

function currentFY(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}
