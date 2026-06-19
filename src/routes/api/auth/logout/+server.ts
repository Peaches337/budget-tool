import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteSession, clearSessionCookie } from '$lib/server/auth.js';

export const POST: RequestHandler = async (event) => {
  const sessionId = event.cookies.get('skint_session');
  if (sessionId) {
    await deleteSession(sessionId);
  }
  clearSessionCookie(event);
  return json({ ok: true, data: null });
};
