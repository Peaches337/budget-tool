import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db.js';
import { importFile } from '$lib/server/bankImport.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const files = await query<{
    id: string; filename: string; bank_name: string; row_count: number; imported_at: string;
  }>(
    `SELECT id, filename, bank_name, row_count, imported_at
     FROM imported_files WHERE user_id = $1 ORDER BY imported_at DESC`,
    [user.id]
  );

  return json({ ok: true, data: files });
};

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const formData = await event.request.formData().catch(() => null);
  const file = formData?.get('file') as File | null;
  if (!file) return json({ ok: false, error: 'No file uploaded.' }, { status: 400 });

  const maxBytes = 5 * 1024 * 1024; // 5 MB
  if (file.size > maxBytes) return json({ ok: false, error: 'File too large (max 5 MB).' }, { status: 400 });

  const csvText = await file.text();

  try {
    const result = await importFile(user.id, file.name, csvText);
    await auditLog(event, 'bank.import', { fileId: result.fileId, bank: result.bank, imported: result.imported });
    return json({ ok: true, data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Import failed';
    return json({ ok: false, error: msg }, { status: 400 });
  }
};
