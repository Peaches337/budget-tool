import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM app_config');
  const config = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return json({ ok: true, data: config });
};

export const PUT: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const body = await event.request.json();

  const allowed = ['instance_name', 'registration_open', 'default_template', 'session_timeout_days'];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      await queryOne(
        `INSERT INTO app_config (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, String(body[key])]
      );
    }
  }

  await auditLog(event, 'config_updated', { details: body });
  return json({ ok: true });
};
