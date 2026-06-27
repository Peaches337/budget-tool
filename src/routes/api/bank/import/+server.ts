import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { importFile } from '$lib/server/bankImport.js';
import { auditLog } from '$lib/server/audit.js';

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const files = await query<{
    id: string; filename: string; bank_name: string; row_count: number; imported_at: string;
    net_worth_entry_id: string | null; net_worth_label: string | null;
  }>(
    `SELECT f.id, f.filename, f.bank_name, f.row_count, f.imported_at,
            f.net_worth_entry_id, n.label AS net_worth_label
     FROM imported_files f
     LEFT JOIN net_worth_entries n ON n.id = f.net_worth_entry_id
     WHERE f.user_id = $1 ORDER BY f.imported_at DESC`,
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

  // Optional: link to existing net worth entry or create a new one
  let netWorthEntryId: string | null = formData?.get('net_worth_entry_id') as string | null || null;
  const createAccount = formData?.get('create_account');
  if (createAccount) {
    try {
      const acc = JSON.parse(createAccount as string);
      const row = await queryOne<{ id: string }>(
        `INSERT INTO net_worth_entries (user_id, entry_type, category, label, institution, amount, visibility)
         VALUES ($1, 'asset', $2, $3, $4, 0, 'private') RETURNING id`,
        [user.id, acc.category ?? 'Cash & Savings', acc.label, acc.institution ?? null]
      );
      if (row) netWorthEntryId = row.id;
    } catch { /* ignore malformed create_account */ }
  }

  try {
    const result = await importFile(user.id, file.name, csvText, netWorthEntryId);
    await auditLog(event, 'bank.import', { fileId: result.fileId, bank: result.bank, imported: result.imported });
    return json({ ok: true, data: { ...result, net_worth_entry_id: netWorthEntryId } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Import failed';
    return json({ ok: false, error: msg }, { status: 400 });
  }
};
