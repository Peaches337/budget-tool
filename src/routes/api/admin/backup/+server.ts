import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { spawn } from 'child_process';
import { createGzip, createGunzip } from 'zlib';
import fs from 'fs';
import path from 'path';
import { auditLog } from '$lib/server/audit.js';

const BACKUP_PATH  = process.env.BACKUP_PATH  ?? path.join(process.cwd(), 'backups');
const MAX_BACKUPS  = 10;
const FILENAME_RE  = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sql\.gz$/;

// ── Tool resolution ──────────────────────────────────────────────────────────

const WIN_PG_ROOTS = [
  'C:\\Program Files\\PostgreSQL',
  'C:\\Program Files (x86)\\PostgreSQL',
];

function findPgTool(name: 'pg_dump' | 'psql', envKey: 'PG_DUMP_PATH' | 'PSQL_PATH'): string {
  const explicit = process.env[envKey];
  if (explicit) return explicit;

  // On Linux/Mac — just use the name directly (should be in PATH after apt install postgresql-client)
  if (process.platform !== 'win32') return name;

  // Windows: scan common PostgreSQL installation directories newest version first
  try {
    for (const root of WIN_PG_ROOTS) {
      if (!fs.existsSync(root)) continue;
      const versions = fs.readdirSync(root)
        .filter(d => /^\d+(\.\d+)?$/.test(d))
        .sort((a, b) => parseFloat(b) - parseFloat(a));
      for (const v of versions) {
        const candidate = path.join(root, v, 'bin', `${name}.exe`);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch { /* ignore */ }

  return name; // last resort — let it fail with a clear ENOENT
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_PATH)) fs.mkdirSync(BACKUP_PATH, { recursive: true });
}

function parseDbUrl(url: string) {
  const u = new URL(url);
  return {
    host:     u.hostname,
    port:     u.port || '5432',
    user:     u.username,
    password: u.password,
    database: u.pathname.replace(/^\//, ''),
  };
}

function listBackups(): { filename: string; size: number; created_at: string }[] {
  ensureBackupDir();
  return fs.readdirSync(BACKUP_PATH)
    .filter(f => FILENAME_RE.test(f))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_PATH, f));
      return { filename: f, size: stat.size, created_at: stat.birthtime.toISOString() };
    })
    .sort((a, b) => b.filename.localeCompare(a.filename));
}

function pruneOldBackups() {
  const all = listBackups();
  if (all.length > MAX_BACKUPS) {
    all.slice(MAX_BACKUPS).forEach(b => {
      try { fs.unlinkSync(path.join(BACKUP_PATH, b.filename)); } catch { /* ignore */ }
    });
  }
}

// ── GET — list backups ───────────────────────────────────────────────────────

export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  return json({ ok: true, data: listBackups(), backup_path: BACKUP_PATH });
};

// ── POST — create backup ─────────────────────────────────────────────────────

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return json({ ok: false, error: 'DATABASE_URL not set' }, { status: 500 });

  ensureBackupDir();

  const db       = parseDbUrl(dbUrl);
  const pgDump   = findPgTool('pg_dump', 'PG_DUMP_PATH');
  const now      = new Date();
  const pad      = (n: number) => String(n).padStart(2, '0');
  const filename = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.sql.gz`;
  const filepath = path.join(BACKUP_PATH, filename);

  try {
    await new Promise<void>((resolve, reject) => {
      const dump = spawn(pgDump, [
        '-h', db.host,
        '-p', db.port,
        '-U', db.user,
        '-F', 'p',
        '--no-password',
        db.database,
      ], { env: { ...process.env, PGPASSWORD: db.password } });

      const gzip = createGzip();
      const out  = fs.createWriteStream(filepath);

      dump.stdout.pipe(gzip).pipe(out);

      const dumpErrs: string[] = [];
      dump.stderr.on('data', (d: Buffer) => {
        const msg = d.toString().trim();
        if (msg && !msg.toLowerCase().includes('warning')) dumpErrs.push(msg);
      });

      dump.on('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') {
          reject(new Error(`pg_dump not found at "${pgDump}". Install postgresql-client or set PG_DUMP_PATH in .env`));
        } else {
          reject(e);
        }
      });
      gzip.on('error', reject);
      out.on('error',  reject);
      out.on('finish', resolve);

      dump.on('close', (code: number) => {
        if (code !== 0) {
          gzip.destroy();
          reject(new Error(dumpErrs.join(' ') || `pg_dump exited with code ${code}`));
        }
        // pipe handles ending gzip when dump.stdout closes
      });
    });
  } catch (err: unknown) {
    try { fs.unlinkSync(filepath); } catch { /* ignore */ }
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  pruneOldBackups();

  const stat = fs.statSync(filepath);
  await auditLog(event, 'backup_created', { details: { filename, size: stat.size } });

  return json({ ok: true, data: { filename, size: stat.size, created_at: now.toISOString() } });
};

// ── PUT — restore uploaded backup ────────────────────────────────────────────

export const PUT: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return json({ ok: false, error: 'DATABASE_URL not set' }, { status: 500 });

  const form = await event.request.formData();
  const file = form.get('backup') as File | null;

  if (!file) return json({ ok: false, error: 'No file uploaded' }, { status: 400 });
  if (!file.name.endsWith('.sql.gz') && !file.name.endsWith('.sql')) {
    return json({ ok: false, error: 'File must be a .sql.gz or .sql backup' }, { status: 400 });
  }

  const db   = parseDbUrl(dbUrl);
  const psql = findPgTool('psql', 'PSQL_PATH');

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await new Promise<void>((resolve, reject) => {
      const psqlProc = spawn(psql, [
        '-h', db.host,
        '-p', db.port,
        '-U', db.user,
        '-d', db.database,
        '--no-password',
        '-v', 'ON_ERROR_STOP=1',
      ], { env: { ...process.env, PGPASSWORD: db.password } });

      const errors: string[] = [];
      psqlProc.stderr.on('data', (d: Buffer) => errors.push(d.toString()));
      psqlProc.on('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') {
          reject(new Error(`psql not found at "${psql}". Install postgresql-client or set PSQL_PATH in .env`));
        } else {
          reject(e);
        }
      });
      psqlProc.on('close', (code: number) => {
        if (code !== 0) reject(new Error(errors.join(' ').trim() || `psql exited with code ${code}`));
        else resolve();
      });

      if (file.name.endsWith('.sql.gz')) {
        const gunzip = createGunzip();
        gunzip.on('error', reject);
        gunzip.pipe(psqlProc.stdin);
        gunzip.end(buffer);
      } else {
        psqlProc.stdin.end(buffer);
      }
    });
  } catch (err: unknown) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  await auditLog(event, 'backup_restored', { details: { filename: file.name, size: file.size } });

  return json({ ok: true });
};

// ── DELETE — remove a backup file ────────────────────────────────────────────

export const DELETE: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user?.is_admin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const { filename } = await event.request.json();
  if (!FILENAME_RE.test(filename)) return json({ ok: false, error: 'Invalid filename' }, { status: 400 });

  const filepath = path.join(BACKUP_PATH, filename);
  if (!fs.existsSync(filepath)) return json({ ok: false, error: 'Not found' }, { status: 404 });

  fs.unlinkSync(filepath);
  await auditLog(event, 'backup_deleted', { details: { filename } });

  return json({ ok: true });
};
