import { config } from 'dotenv';
import { pathToFileURL } from 'url';
import { join } from 'path';

config();

const entry = pathToFileURL(join(process.cwd(), 'build', 'index.js')).href;
await import(entry);
