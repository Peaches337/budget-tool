import { json } from '@sveltejs/kit';
import { queryOne } from '$lib/server/db.js';
import type { RequestEvent } from '@sveltejs/kit';

// Revoke (delete) an invite
export async function DELETE({ locals, params }: RequestEvent) {
  if (!locals.user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const row = await queryOne(
    `DELETE FROM registration_invites WHERE id = $1 AND used_at IS NULL RETURNING id`,
    [params.id]
  );
  if (!row) return json({ ok: false, error: 'Not found or already used' }, { status: 404 });

  return json({ ok: true });
}
