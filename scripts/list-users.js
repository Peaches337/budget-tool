import { config } from 'dotenv';
config();
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const res = await pool.query('SELECT id, username, email FROM users');
console.table(res.rows);
await pool.end();
