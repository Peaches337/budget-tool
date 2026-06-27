import { json } from '@sveltejs/kit';
import { query, queryOne } from '$lib/server/db.js';
import crypto from 'crypto';
import type { RequestEvent } from '@sveltejs/kit';

// List active (unused, not expired) invites
export async function GET({ locals }: RequestEvent) {
  if (!locals.user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const rows = await query(
    `SELECT ri.id, ri.token, ri.expires_at, ri.created_at, ri.used_at,
            u.username AS created_by,
            uu.username AS used_by
     FROM registration_invites ri
     JOIN users u ON u.id = ri.created_by
     LEFT JOIN users uu ON uu.id = ri.used_by
     ORDER BY ri.created_at DESC`,
    []
  );
  return json({ ok: true, data: rows });
}

// Generate a new invite token
export async function POST({ locals, request }: RequestEvent) {
  if (!locals.user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { expires_in_days } = await request.json().catch(() => ({ expires_in_days: 7 }));
  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = expires_in_days
    ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
    : null;

  const row = await queryOne(
    `INSERT INTO registration_invites (token, created_by, expires_at)
     VALUES ($1, $2, $3) RETURNING id, token, expires_at, created_at`,
    [token, locals.user.id, expiresAt]
  );
  return json({ ok: true, data: row }, { status: 201 });
}
