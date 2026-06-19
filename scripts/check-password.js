import { config } from 'dotenv';
config();
import pg from 'pg';
import bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const res = await pool.query('SELECT password_hash FROM users WHERE username = $1', [process.argv[2]]);
if (!res.rows.length) { console.log('User not found'); process.exit(1); }
const valid = await bcrypt.compare(process.argv[3], res.rows[0].password_hash);
console.log('Password valid:', valid);
await pool.end();
