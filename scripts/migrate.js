import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS _migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

const migrationsDir = join(__dirname, '../migrations');
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

for (const file of files) {
  const already = await client.query(
    'SELECT 1 FROM _migrations WHERE filename = $1', [file]
  );
  if (already.rowCount) {
    console.log(`  skip  ${file}`);
    continue;
  }

  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  console.log(` apply  ${file}`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Failed on ${file}:`, err);
    process.exit(1);
  }
}

await client.end();
console.log('Migrations complete.');
