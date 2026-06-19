import { config } from 'dotenv';
config();
import pg from 'pg';
import bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const hash = await bcrypt.hash(process.argv[3], 12);
const res = await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hash, process.argv[2]]);
console.log(`Updated ${res.rowCount} user(s). Username: ${process.argv[2]}`);
await pool.end();
