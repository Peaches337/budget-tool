import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { queryOne } from '$lib/server/db.js';

const PUBLIC_PATHS = ['/login', '/register', '/invite'];

export const load: LayoutServerLoad = async (event) => {
  const isPublic = PUBLIC_PATHS.some(p => event.url.pathname.startsWith(p));

  if (!event.locals.user && !isPublic) {
    throw redirect(303, '/login');
  }

  if (event.locals.user && event.locals.user.wizard_completed === false && !isPublic && event.url.pathname !== '/wizard') {
    throw redirect(303, '/wizard');
  }

  const logoCfg = await queryOne<{ value: string }>(
    `SELECT value FROM app_config WHERE key = 'instance_logo'`,
    []
  ).catch(() => null);

  return { user: event.locals.user, instanceLogo: logoCfg?.value ?? '' };
};
