import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import crypto from 'crypto';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { household_id, expires_in_days } = await event.request.json();

  // Must be owner to create invite
  const membership = await queryOne(
    `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
    [household_id, user.id]
  );
  if (!membership || (membership as { role: string }).role !== 'owner') {
    return json({ ok: false, error: 'Only household owners can create invites' }, { status: 403 });
  }

  const code = crypto.randomBytes(6).toString('hex').toUpperCase(); // e.g. A3F9C2
  const expiresAt = expires_in_days
    ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
    : null;

  const invite = await queryOne(
    `INSERT INTO household_invites (household_id, code, created_by, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING id, code, expires_at`,
    [household_id, code, user.id, expiresAt]
  );

  return json({ ok: true, data: invite }, { status: 201 });
};

// Accept an invite
export const PUT: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { code } = await event.request.json();

  const invite = await queryOne<{
    id: string; household_id: string; used_at: string | null; expires_at: string | null;
  }>(
    `SELECT id, household_id, used_at, expires_at FROM household_invites WHERE code = $1`,
    [code?.toUpperCase()]
  );

  if (!invite) return json({ ok: false, error: 'Invalid invite code' }, { status: 404 });
  if (invite.used_at) return json({ ok: false, error: 'Invite already used' }, { status: 409 });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return json({ ok: false, error: 'Invite has expired' }, { status: 410 });
  }

  // Already a member?
  const existing = await queryOne(
    `SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2`,
    [invite.household_id, user.id]
  );
  if (existing) {
    return json({ ok: false, error: 'You are already a member of this household' }, { status: 409 });
  }

  await query(
    `INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'member')`,
    [invite.household_id, user.id]
  );
  await query(
    `UPDATE household_invites SET used_at = now(), used_by = $1 WHERE id = $2`,
    [user.id, invite.id]
  );

  return json({ ok: true, data: { household_id: invite.household_id } });
};
