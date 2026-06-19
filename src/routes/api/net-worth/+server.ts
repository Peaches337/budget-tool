import { json } from '@sveltejs/kit';
import { query, queryOne } from '$lib/server/db.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function GET({ locals }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const entries = await query(
    `SELECT id, entry_type, category, label, institution, amount, visibility, last_updated, created_at
     FROM net_worth_entries WHERE user_id = $1 ORDER BY entry_type, category, label`,
    [locals.user.id]
  );
  return json({ ok: true, data: entries });
}

export async function POST({ locals, request }: RequestEvent) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const { entry_type, category, label, institution, amount, visibility } = await request.json();
  if (!entry_type || !category || !label) {
    return json({ ok: false, error: 'entry_type, category, label required' }, { status: 400 });
  }

  const row = await queryOne(
    `INSERT INTO net_worth_entries (user_id, entry_type, category, label, institution, amount, visibility)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, entry_type, category, label, institution, amount, visibility, last_updated, created_at`,
    [locals.user.id, entry_type, category, label, institution ?? null, amount ?? 0, visibility ?? 'private']
  );
  return json({ ok: true, data: row }, { status: 201 });
}
