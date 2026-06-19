import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import { auditLog } from '$lib/server/audit.js';

const BACKUP_PATH = process.env.BACKUP_PATH ?? path.join(process.cwd(), 'backups');
const FILENAME_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sql\.gz$/;

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) throw error(403, 'Forbidden');

  const { filename } = event.params;

  // Strict allowlist — prevents path traversal
  if (!FILENAME_RE.test(filename)) throw error(400, 'Invalid filename');

  const filepath = path.join(BACKUP_PATH, filename);
  if (!fs.existsSync(filepath)) throw error(404, 'Backup not found');

  const stat = fs.statSync(filepath);
  const stream = fs.createReadStream(filepath);

  await auditLog(event, 'backup_downloaded', { details: { filename } });

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type':        'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(stat.size),
      'Cache-Control':       'no-store',
    },
  });
};
