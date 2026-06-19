import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const { id } = event.params;
  const entry = await queryOne(
    `DELETE FROM tax_entries WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, user.id]
  );
  if (!entry) return json({ ok: false, error: 'Not found' }, { status: 404 });

  await auditLog(event, 'tax_entry_deleted', { entity: 'tax_entries', entity_id: id, details: {} });
  return json({ ok: true });
};

export const PATCH: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const { id } = event.params;
  const body = await event.request.json();

  const fields = ['entry_date', 'description', 'supplier', 'amount_cents', 'work_pct', 'receipt_url', 'notes'];
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
  params.push(id, user.id);

  const entry = await queryOne(
    `UPDATE tax_entries SET ${updates.join(', ')} WHERE id = $${i} AND user_id = $${i+1} RETURNING *`,
    params
  );
  if (!entry) return json({ ok: false, error: 'Not found' }, { status: 404 });

  return json({ ok: true, data: entry });
};
