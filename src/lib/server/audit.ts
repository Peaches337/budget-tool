import { query } from './db.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function auditLog(
  event: RequestEvent,
  action: string,
  opts: { entity?: string; entity_id?: string; details?: Record<string, unknown> } = {}
) {
  const user = event.locals.user;
  const ip = event.request.headers.get('x-forwarded-for')
    ?? event.getClientAddress?.()
    ?? null;

  try {
    await query(
      `INSERT INTO audit_log (user_id, username, action, entity, entity_id, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        user?.id ?? null,
        user?.username ?? null,
        action,
        opts.entity ?? null,
        opts.entity_id ?? null,
        opts.details ? JSON.stringify(opts.details) : null,
        ip,
      ]
    );
  } catch {
    // Audit failures must never break the main request
  }
}
