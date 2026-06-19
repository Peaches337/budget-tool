import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, queryOne } from '$lib/server/db.js';
import { auditLog } from '$lib/server/audit.js';

// GET: transactions for a specific import file
export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = event.params;
  const page = parseInt(event.url.searchParams.get('page') ?? '1');
  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  const file = await queryOne<{ id: string; bank_name: string; filename: string }>(
    `SELECT id, bank_name, filename FROM imported_files WHERE id = $1 AND user_id = $2`,
    [id, user.id]
  );
  if (!file) return json({ ok: false, error: 'Not found' }, { status: 404 });

  const [txRows, countRow] = await Promise.all([
    query<{
      id: string; settled_at: string; description: string; amount_cents: number;
      budget_item_id: string | null; budget_item_label: string | null;
      match_confidence: string | null; match_confirmed: boolean;
    }>(
      `SELECT t.id, t.settled_at, t.description, t.amount_cents,
              t.budget_item_id, bi.label AS budget_item_label,
              t.match_confidence, t.match_confirmed
       FROM imported_transactions t
       LEFT JOIN budget_items bi ON bi.id = t.budget_item_id
       WHERE t.file_id = $1 AND t.user_id = $2
       ORDER BY t.settled_at DESC, t.created_at DESC
       LIMIT $3 OFFSET $4`,
      [id, user.id, PAGE_SIZE, offset]
    ),
    queryOne<{ total: string }>(
      `SELECT COUNT(*) AS total FROM imported_transactions WHERE file_id = $1 AND user_id = $2`,
      [id, user.id]
    )
  ]);

  const total = parseInt(countRow?.total ?? '0');
  return json({
    ok: true,
    data: txRows,
    meta: { page, pageSize: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) },
    file
  });
};

// DELETE: remove an entire import batch
export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ ok: false, error: 'Not authenticated' }, { status: 401 });

  const { id } = event.params;
  const file = await queryOne<{ id: string; filename: string }>(
    `SELECT id, filename FROM imported_files WHERE id = $1 AND user_id = $2`,
    [id, user.id]
  );
  if (!file) return json({ ok: false, error: 'Not found' }, { status: 404 });

  // Transactions cascade via FK; delete the file record
  await query(`DELETE FROM imported_files WHERE id = $1`, [id]);
  await auditLog(event, 'bank.import.delete', { fileId: id, filename: file.filename });
  return json({ ok: true });
};
