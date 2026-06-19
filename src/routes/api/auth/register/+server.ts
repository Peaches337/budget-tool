import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashPassword, createSession, setSessionCookie } from '$lib/server/auth.js';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const POST: RequestHandler = async (event) => {
  const { username, email, password, invite_token } = await event.request.json();

  // Check whether open registration is allowed
  const cfg = await queryOne<{ value: string }>(
    `SELECT value FROM admin_config WHERE key = 'allow_registration'`,
    []
  );
  const registrationOpen = (cfg?.value ?? 'true') === 'true';

  // If registration is closed, a valid unused invite token is required
  const userCount = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users');
  const isFirstUser = parseInt(userCount?.count ?? '0') === 0;

  if (!registrationOpen && !isFirstUser) {
    if (!invite_token) {
      return json({ ok: false, error: 'Registration is closed. An invite link is required.' }, { status: 403 });
    }
    const invite = await queryOne<{ id: string; expires_at: string | null }>(
      `SELECT id, expires_at FROM registration_invites WHERE token = $1 AND used_at IS NULL`,
      [invite_token]
    );
    if (!invite) {
      return json({ ok: false, error: 'Invalid or expired invite link.' }, { status: 403 });
    }
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return json({ ok: false, error: 'This invite link has expired.' }, { status: 403 });
    }
  }

  if (!username || !email || !password) {
    return json({ ok: false, error: 'All fields are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return json({ ok: false, error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const existingUsername = await queryOne(
    'SELECT id FROM users WHERE username = $1',
    [username.trim().toLowerCase()]
  );
  if (existingUsername) {
    return json({ ok: false, error: 'That username is already taken — please choose another.' }, { status: 409 });
  }

  const existingEmail = await queryOne(
    'SELECT id FROM users WHERE email = $1',
    [email.trim().toLowerCase()]
  );
  if (existingEmail) {
    return json({ ok: false, error: 'An account with that email already exists. Try signing in instead.' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const isAdmin = isFirstUser;

  const rows = await query<{ id: string }>(
    `INSERT INTO users (username, email, password_hash, is_admin)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [username.trim().toLowerCase(), email.trim().toLowerCase(), passwordHash, isAdmin]
  );
  const user = rows[0];

  // Consume the invite if one was used
  if (invite_token) {
    await queryOne(
      `UPDATE registration_invites SET used_at = now(), used_by = $1 WHERE token = $2`,
      [user.id, invite_token]
    );
  }

  const session = await createSession(user.id);
  setSessionCookie(event, session.id);

  event.locals.user = { id: user.id, username: username.trim().toLowerCase(), email: email.trim().toLowerCase(), is_admin: isAdmin, created_at: new Date().toISOString() };
  await auditLog(event, 'user_registered', { entity: 'user', entity_id: user.id, details: { username, email: email.trim().toLowerCase(), is_admin: isAdmin, via_invite: !!invite_token } });

  return json({ ok: true, data: { id: user.id, username, isAdmin } }, { status: 201 });
};
