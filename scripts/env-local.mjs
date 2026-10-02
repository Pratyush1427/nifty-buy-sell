// Write the local Supabase connection details into .env.local, so no keys
// ever need to be committed. Run after `npm run db:start`: `npm run env:local`.
// Other values already in .env.local are kept.
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const FILE = '.env.local';

const existing = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : fs.readFileSync('.env.example', 'utf8');
const values = {
  DATABASE_URL: status.DB_URL,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
};
if (!/^CRON_SECRET=.+/m.test(existing) || /^CRON_SECRET=change-me$/m.test(existing)) values.CRON_SECRET = crypto.randomBytes(24).toString('hex');

let out = existing;
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  out = re.test(out) ? out.replace(re, line) : `${out.trimEnd()}\n${line}\n`;
}
fs.writeFileSync(FILE, out);
console.log(`Wrote ${Object.keys(values).join(', ')} to ${FILE}.`);
