import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  if (!event.locals.user) {
    return json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  return json({ ok: true, data: event.locals.user });
};
