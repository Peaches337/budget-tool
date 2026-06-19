import type { Handle } from '@sveltejs/kit';
import { getUserFromEvent } from '$lib/server/auth.js';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = await getUserFromEvent(event);
  return resolve(event);
};
