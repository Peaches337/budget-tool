import bcrypt from 'bcrypt';
import { query, queryOne } from './db.js';
import type { RequestEvent } from '@sveltejs/kit';

const SALT_ROUNDS = 12;
const SESSION_DAYS = 30;
const COOKIE_NAME = 'skint_session';

export type User = {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
};

export type Session = {
  id: string;
  user_id: string;
  expires_at: string;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<Session> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  const rows = await query<Session>(
    `INSERT INTO sessions (user_id, expires_at)
     VALUES ($1, $2)
     RETURNING id, user_id, expires_at`,
    [userId, expiresAt.toISOString()]
  );
  return rows[0];
}

export async function getSessionUser(sessionId: string): Promise<User | null> {
  return queryOne<User>(
    `SELECT u.id, u.username, u.email, u.is_admin, u.created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId]
  );
}

export async function deleteSession(sessionId: string): Promise<void> {
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

export async function getUserFromEvent(event: RequestEvent): Promise<User | null> {
  const sessionId = event.cookies.get(COOKIE_NAME);
  if (!sessionId) return null;
  return getSessionUser(sessionId);
}

export function setSessionCookie(event: RequestEvent, sessionId: string): void {
  event.cookies.set(COOKIE_NAME, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * SESSION_DAYS
  });
}

export function clearSessionCookie(event: RequestEvent): void {
  event.cookies.delete(COOKIE_NAME, { path: '/' });
}
