import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

const PUBLIC_PATHS = ['/login', '/register', '/invite'];

export const load: LayoutServerLoad = async (event) => {
  const isPublic = PUBLIC_PATHS.some(p => event.url.pathname.startsWith(p));

  if (!event.locals.user && !isPublic) {
    throw redirect(303, '/login');
  }

  return { user: event.locals.user };
};
