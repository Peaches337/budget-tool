import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const profile = await queryOne(
    `SELECT * FROM business_profiles WHERE user_id = $1`,
    [user.id]
  );
  return json({ ok: true, data: profile ?? null });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const body = await event.request.json();
  const { abn, gst_registered, gst_number, usi } = body;

  const profile = await queryOne(
    `INSERT INTO business_profiles (user_id, abn, gst_registered, gst_number, usi)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET
       abn = EXCLUDED.abn,
       gst_registered = EXCLUDED.gst_registered,
       gst_number = EXCLUDED.gst_number,
       usi = EXCLUDED.usi,
       updated_at = now()
     RETURNING *`,
    [user.id, abn ?? null, gst_registered ?? false, gst_number ?? null, usi ?? null]
  );

  await auditLog(event, 'business_profile_updated', { entity: 'business_profiles', entity_id: profile?.id ?? '', details: {} });
  return json({ ok: true, data: profile });
};
