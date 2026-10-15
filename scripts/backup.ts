import './environment';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dataDirectory, storageMode } from '../src/lib/server/config';
import { backupLocalData } from '../src/lib/server/backup';

async function main() {
  if (storageMode() !== 'local') throw new Error('SQLite backup only. Supabase needs PostgreSQL and separate Storage backups.');
  if (process.env.ARTMASTER_WRITES_PAUSED !== 'true') throw new Error('Stop application writers first, then set ARTMASTER_WRITES_PAUSED=true.');
  await mkdir('backups', { recursive: true, mode: 0o700 });
  const target = resolve('backups', new Date().toISOString().replace(/[:.]/g, '-'));
  await backupLocalData(dataDirectory(), target);
  console.log(`Private backup created: ${target}. Contains personal data and secrets; keep encrypted and outside Git.`);
}
main().catch(() => { console.error('Backup failed. Keep writers paused; verify source, target, permissions and free space. An incomplete backup must not be used.'); process.exitCode = 1; });
